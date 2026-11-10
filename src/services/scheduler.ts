/**
 * Scheduled Automation Service
 * Handles periodic auto-hibernate (snapshot & delete) and auto-start (restore & sync DNS)
 */

import { LightsailInstance, CloudConfig } from '../types/lightsail';
import { ApiBridge } from './apiBridge';
import { flociSimulator } from './flociSimulator';

export interface ScheduleExecutionRecord {
  id: string;
  timestamp: string;
  instanceName: string;
  type: 'AUTO_HIBERNATE' | 'AUTO_START';
  status: 'success' | 'failed' | 'running';
  message: string;
  snapshotName?: string;
  newIp?: string;
}

export class SchedulerService {
  private timer: any = null;
  private executionHistory: ScheduleExecutionRecord[] = [];
  private historyListeners: ((history: ScheduleExecutionRecord[]) => void)[] = [];

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

  /**
   * Check if any instance's scheduled time has arrived
   */
  public async checkScheduledJobs() {
    const configStr = localStorage.getItem('lightsail_cloud_config');
    const config: CloudConfig = configStr
      ? JSON.parse(configStr)
      : {
          mode: 'floci_simulation',
          flociSimulationSpeed: 'normal',
          simulateFaults: { awsThrottle: false, cloudflareError: false, snapshotTimeout: false },
          awsAccessKeyId: '',
          awsSecretAccessKey: '',
          awsRegion: 'ap-northeast-1',
          cloudflareApiToken: '',
          cloudflareZoneId: '',
          defaultDnsRecordName: '',
        };

    const instances = await flociSimulator.getInstances(config);
    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMinutes}`;
    const currentDay = now.getDay(); // 0 is Sunday

    for (const inst of instances) {
      // 1. Check Auto-Hibernate
      if (
        inst.autoHibernateSchedule?.enabled &&
        inst.autoHibernateSchedule.time === currentTimeStr &&
        inst.autoHibernateSchedule.daysOfWeek.includes(currentDay) &&
        inst.state === 'running'
      ) {
        // Prevent duplicate trigger in the same minute
        const todayDateStr = now.toISOString().split('T')[0];
        if (inst.autoHibernateSchedule.lastExecuted?.startsWith(todayDateStr)) {
          continue;
        }
        await this.executeAutoHibernate(inst, config);
      }

      // 2. Check Auto-Start
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
      message: `执行定时自动休眠: 创建快照 ${snapName} 并暂时删除计算实例...`,
      snapshotName: snapName,
    };

    this.executionHistory.unshift(record);
    this.saveHistory();

    try {
      await ApiBridge.hibernateInstance(inst.name, snapName, config);
      record.status = 'success';
      record.message = `自动休眠成功！已安全生成快照 ${snapName}，实例计算资源已释放。`;
      
      // Update schedule record on instance
      if (inst.autoHibernateSchedule) {
        inst.autoHibernateSchedule.lastExecuted = new Date().toISOString();
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
      message: `执行定时自动启动: 从快照 ${snapName} 恢复并同步 Cloudflare DNS...`,
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
        config
      );

      record.status = 'success';
      record.newIp = res.instance.publicIpAddress || undefined;
      record.message = `自动启动成功！新分配 IP: ${record.newIp}，Cloudflare 记录已更新。`;

      if (inst.autoStartSchedule) {
        inst.autoStartSchedule.lastExecuted = new Date().toISOString();
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
