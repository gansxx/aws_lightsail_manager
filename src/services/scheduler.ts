/**
 * Scheduled Automation Service
 * Handles periodic auto-hibernate (Save Firewall -> Snapshot -> Delete Instance),
 * auto-start (Restore Instance -> Restore Firewall -> Sync Cloudflare DNS),
 * and snapshot lifecycle expiration cleanup
 */

import { LightsailInstance, CloudConfig } from '../types/lightsail';
import { ApiBridge } from './apiBridge';
import { flociSimulator } from './flociSimulator';

export interface ScheduleExecutionRecord {
  id: string;
  timestamp: string;
  instanceName: string;
  type: 'AUTO_HIBERNATE' | 'AUTO_START' | 'SNAPSHOT_CLEANUP';
  status: 'success' | 'failed' | 'running';
  message: string;
  snapshotName?: string;
  newIp?: string;
  firewallRulesCount?: number;
}

export class SchedulerService {
  private timer: any = null;
  private executionHistory: ScheduleExecutionRecord[] = [];
  private historyListeners: ((history: ScheduleExecutionRecord[]) => void)[] = [];
  private lastCleanupCheckMs = 0;

  constructor() {
    this.loadHistory();
    this.startLoop();
  }

  private loadHistory() {
    try {
      const stored = localStorage.getItem('lightsail_schedule_history');
      if (stored) {
        this.executionHistory = JSON.parse(stored);
      }
    } catch {
      this.executionHistory = [];
    }
  }

  private saveHistory() {
    try {
      localStorage.setItem('lightsail_schedule_history', JSON.stringify(this.executionHistory.slice(0, 50)));
      this.historyListeners.forEach((l) => l([...this.executionHistory]));
    } catch {}
  }

  public onHistoryChange(listener: (history: ScheduleExecutionRecord[]) => void) {
    this.historyListeners.push(listener);
    return () => {
      this.historyListeners = this.historyListeners.filter((l) => l !== listener);
    };
  }

  public getHistory(): ScheduleExecutionRecord[] {
    return [...this.executionHistory];
  }

  public clearHistory() {
    this.executionHistory = [];
    this.saveHistory();
  }

  private startLoop() {
    if (this.timer) clearInterval(this.timer);
    // Check every 30 seconds
    this.timer = setInterval(() => {
      this.checkScheduledJobs();
    }, 30000);
  }

  public saveInstanceScheduleOverride(
    instanceName: string,
    autoHibernateSchedule?: LightsailInstance['autoHibernateSchedule'],
    autoStartSchedule?: LightsailInstance['autoStartSchedule']
  ) {
    try {
      const raw = localStorage.getItem('lightsail_instance_schedules');
      const map = raw ? JSON.parse(raw) : {};
      map[instanceName] = { autoHibernateSchedule, autoStartSchedule };
      localStorage.setItem('lightsail_instance_schedules', JSON.stringify(map));
    } catch {}
  }

  public getInstanceScheduleOverrides(): Record<
    string,
    {
      autoHibernateSchedule?: LightsailInstance['autoHibernateSchedule'];
      autoStartSchedule?: LightsailInstance['autoStartSchedule'];
    }
  > {
    try {
      const raw = localStorage.getItem('lightsail_instance_schedules');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  /**
   * Check if any instance's scheduled time has arrived & run periodic snapshot lifecycle cleanup
   */
  public async checkScheduledJobs() {
    const configStr = localStorage.getItem('lightsail_cloud_config');
    const config: CloudConfig = configStr
      ? JSON.parse(configStr)
      : {
          mode: 'real_cloud',
          flociSimulationSpeed: 'normal',
          simulateFaults: { awsThrottle: false, cloudflareError: false, snapshotTimeout: false },
          awsAccessKeyId: '',
          awsSecretAccessKey: '',
          awsRegion: 'ap-northeast-1',
          cloudflareApiToken: '',
          cloudflareZoneId: '',
          defaultDnsRecordName: '',
        };

    // Periodically check expired snapshots (every 2 minutes)
    if (Date.now() - this.lastCleanupCheckMs >= 120_000) {
      this.lastCleanupCheckMs = Date.now();
      try {
        const policy = await ApiBridge.getSnapshotLifecyclePolicy();
        if (policy.enabled) {
          const cleanupRes = await ApiBridge.cleanupExpiredSnapshots(policy, config);
          if (cleanupRes.deletedSnapshots.length > 0) {
            const rec: ScheduleExecutionRecord = {
              id: 'rec-clean-' + Date.now(),
              timestamp: new Date().toISOString(),
              instanceName: 'SnapshotLifecycle',
              type: 'SNAPSHOT_CLEANUP',
              status: 'success',
              message: `快照生命周期自动清理: 已删除 ${cleanupRes.deletedSnapshots.length} 个过期快照 (${cleanupRes.deletedSnapshots
                .map((d) => d.name)
                .join(', ')})`,
            };
            this.executionHistory.unshift(rec);
            this.saveHistory();
          }
        }
      } catch {}
    }

    let instances: LightsailInstance[] = [];
    if (config.mode === 'floci_simulation') {
      instances = await flociSimulator.getInstances(config);
    } else {
      const overrides = this.getInstanceScheduleOverrides();
      const hasAnyEnabled = Object.values(overrides).some(
        (o) => o?.autoHibernateSchedule?.enabled || o?.autoStartSchedule?.enabled
      );
      if (!hasAnyEnabled) return;
      try {
        const realInsts = await ApiBridge.getInstances(config);
        instances = realInsts.map((inst) => ({
          ...inst,
          autoHibernateSchedule: overrides[inst.name]?.autoHibernateSchedule || inst.autoHibernateSchedule,
          autoStartSchedule: overrides[inst.name]?.autoStartSchedule || inst.autoStartSchedule,
        }));
      } catch {
        return;
      }
    }

    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMinutes}`;
    const currentDay = now.getDay(); // 0 is Sunday

    for (const inst of instances) {
      // 1. Check Auto-Hibernate (Step 1: Save Firewall -> Step 2: Snapshot -> Step 3: Delete Instance)
      if (
        inst.autoHibernateSchedule?.enabled &&
        inst.autoHibernateSchedule.time === currentTimeStr &&
        inst.autoHibernateSchedule.daysOfWeek.includes(currentDay) &&
        inst.state === 'running'
      ) {
        const todayDateStr = now.toISOString().split('T')[0];
        if (inst.autoHibernateSchedule.lastExecuted?.startsWith(todayDateStr)) {
          continue;
        }
        await this.executeAutoHibernate(inst, config);
      }

      // 2. Check Auto-Start (Step 1: Restore Snapshot -> Step 2: Wait IP -> Step 3: Restore Firewall -> Step 4: Sync DNS)
      if (
        inst.autoStartSchedule?.enabled &&
        inst.autoStartSchedule.time === currentTimeStr &&
        inst.autoStartSchedule.daysOfWeek.includes(currentDay) &&
        inst.state === 'hibernated'
      ) {
        const todayDateStr = now.toISOString().split('T')[0];
        if (inst.autoStartSchedule.lastExecuted?.startsWith(todayDateStr)) {
          continue;
        }
        await this.executeAutoStart(inst, config);
      }
    }
  }

  /**
   * Execute Auto Hibernate immediately (or triggered by scheduler)
   * Strictly follows: 1. 保存防火墙配置 -> 2. 创建系统快照并等待就绪 -> 3. 删除计算实例
   */
  public async executeAutoHibernate(
    inst: LightsailInstance,
    config: CloudConfig
  ): Promise<ScheduleExecutionRecord> {
    const recordId = 'rec-' + Date.now();
    const snapName = `snap-auto-${inst.name}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;

    const record: ScheduleExecutionRecord = {
      id: recordId,
      timestamp: new Date().toISOString(),
      instanceName: inst.name,
      type: 'AUTO_HIBERNATE',
      status: 'running',
      message: `执行定时自动休眠 [1/3 保存防火墙配置 -> 2/3 创建快照 ${snapName} -> 3/3 删除实例]...`,
      snapshotName: snapName,
    };

    this.executionHistory.unshift(record);
    this.saveHistory();

    try {
      const res = await ApiBridge.hibernateInstance(
        inst.name,
        snapName,
        config,
        (step) => {
          record.message = `${step.title}: ${step.description}`;
          this.saveHistory();
        },
        {
          customFirewallRules: inst.firewallRules,
        }
      );

      record.status = 'success';
      record.firewallRulesCount = res.firewallRules.length;
      record.message = `自动休眠完成！已依次完成: ① 提取并保存 ${res.firewallRules.length} 条防火墙规则 -> ② 生成快照 ${snapName} -> ③ 删除实例停止计费。`;

      // Update schedule record on instance
      if (inst.autoHibernateSchedule) {
        inst.autoHibernateSchedule.lastExecuted = new Date().toISOString();
        this.saveInstanceScheduleOverride(
          inst.name,
          inst.autoHibernateSchedule,
          inst.autoStartSchedule
        );
        flociSimulator.saveState();
      }
    } catch (e: any) {
      record.status = 'failed';
      record.message = `自动休眠失败: ${e.message}`;
    }

    this.saveHistory();
    return record;
  }

  /**
   * Execute Auto Start immediately (or triggered by scheduler)
   * Strictly follows: 1. 从快照重建实例 -> 2. 等待分配公网 IP -> 3. 恢复防火墙配置 -> 4. 同步 Cloudflare DNS
   */
  public async executeAutoStart(
    inst: LightsailInstance,
    config: CloudConfig
  ): Promise<ScheduleExecutionRecord> {
    const recordId = 'rec-' + Date.now();
    const snapName = inst.lastSnapshotName;

    if (!snapName) {
      const failedRecord: ScheduleExecutionRecord = {
        id: recordId,
        timestamp: new Date().toISOString(),
        instanceName: inst.name,
        type: 'AUTO_START',
        status: 'failed',
        message: '未找到关联的历史快照，无法执行自动恢复！',
      };
      this.executionHistory.unshift(failedRecord);
      this.saveHistory();
      return failedRecord;
    }

    const record: ScheduleExecutionRecord = {
      id: recordId,
      timestamp: new Date().toISOString(),
      instanceName: inst.name,
      type: 'AUTO_START',
      status: 'running',
      message: `执行定时自动唤醒: 从快照 ${snapName} 重建 -> 复原防火墙端口 -> 同步 Cloudflare DNS...`,
      snapshotName: snapName,
    };

    this.executionHistory.unshift(record);
    this.saveHistory();

    try {
      const res = await ApiBridge.restoreInstanceWithDns(
        inst.name,
        snapName,
        inst.location.availabilityZone,
        inst.bundleId,
        {
          enabled: !!inst.cloudflareBinding?.enabled,
          domain: inst.cloudflareBinding?.domain || '',
          zoneId: inst.cloudflareBinding?.zoneId || 'cf-zone-983b8a1e2f',
          proxied: !!inst.cloudflareBinding?.proxied,
        },
        config,
        (_idx, step) => {
          record.message = `${step.title}: ${step.description}`;
          this.saveHistory();
        },
        {
          enabled: true,
          rules: inst.firewallRules,
        }
      );

      const fwCount = res.restoredFirewallRules?.length || res.instance.firewallRules?.length || 0;
      record.status = 'success';
      record.newIp = res.instance.publicIpAddress || undefined;
      record.firewallRulesCount = fwCount;
      record.message = `自动唤醒成功！新公网 IP: ${record.newIp}，已自动复原 ${fwCount} 条防火墙端口规则并同步 Cloudflare DNS。`;

      if (inst.autoStartSchedule) {
        inst.autoStartSchedule.lastExecuted = new Date().toISOString();
        this.saveInstanceScheduleOverride(
          inst.name,
          inst.autoHibernateSchedule,
          inst.autoStartSchedule
        );
        flociSimulator.saveState();
      }
    } catch (e: any) {
      record.status = 'failed';
      record.message = `自动启动恢复失败: ${e.message}`;
    }

    this.saveHistory();
    return record;
  }
}

export const schedulerService = new SchedulerService();

