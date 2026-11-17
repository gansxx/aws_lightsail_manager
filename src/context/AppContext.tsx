/**
 * Global Application Context for Android Lightsail Manager
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  LightsailInstance,
  LightsailSnapshot,
  CloudConfig,
  ApiLogEntry,
  DiagnosticResult,
  OperationStep,
  EnvSecretStatus,
  CredentialTestReport,
  GitHubUpdateInfo,
  FirewallPortRule,
  SnapshotLifecyclePolicy,
  BackgroundTask,
} from '../types/lightsail';
import { ApiBridge } from '../services/apiBridge';
import { flociSimulator } from '../services/flociSimulator';
import { schedulerService, ScheduleExecutionRecord } from '../services/scheduler';

interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface AppContextType {
  // State
  instances: LightsailInstance[];
  snapshots: LightsailSnapshot[];
  loading: boolean;
  activeTab: 'instances' | 'snapshots' | 'automation' | 'debug';
  viewMode: 'android_frame' | 'responsive';
  config: CloudConfig;
  apiLogs: ApiLogEntry[];
  scheduleHistory: ScheduleExecutionRecord[];
  diagnostics: DiagnosticResult[];
  toasts: Toast[];
  envSecretStatus: EnvSecretStatus | null;
  credentialTestResult: CredentialTestReport | null;
  testingCredentials: boolean;
  instanceActionLoading: string | null;
  githubUpdateInfo: GitHubUpdateInfo | null;
  checkingGitHubUpdate: boolean;
  snapshotLifecycle: SnapshotLifecyclePolicy;
  cleaningSnapshots: boolean;
  backgroundTasks: BackgroundTask[];
  taskDrawerOpen: boolean;
  setTaskDrawerOpen: (open: boolean) => void;

  // Modal controls
  hibernateModal: {
    isOpen: boolean;
    instance: LightsailInstance | null;
  };
  restoreModal: {
    isOpen: boolean;
    snapshot: LightsailSnapshot | null;
    instance: LightsailInstance | null;
  };
  scheduleModal: {
    isOpen: boolean;
    instance: LightsailInstance | null;
  };
  configModalOpen: boolean;

  // Actions
  setActiveTab: (tab: 'instances' | 'snapshots' | 'automation' | 'debug') => void;
  setViewMode: (mode: 'android_frame' | 'responsive') => void;
  updateConfig: (newConfig: Partial<CloudConfig>) => void;
  refreshData: () => Promise<void>;
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  clearApiLogs: () => void;
  resetSimulator: () => void;

  // Modal Openers
  openHibernateModal: (instance: LightsailInstance) => void;
  closeHibernateModal: () => void;
  openRestoreModal: (snapshot?: LightsailSnapshot, instance?: LightsailInstance) => void;
  closeRestoreModal: () => void;
  openScheduleModal: (instance: LightsailInstance) => void;
  closeScheduleModal: () => void;
  setConfigModalOpen: (open: boolean) => void;

  // High-level Operations
  executeHibernate: (
    instanceName: string,
    snapshotName: string,
    onStepUpdate: (step: OperationStep) => void,
    options?: { retentionHours?: number | null; customFirewallRules?: FirewallPortRule[] }
  ) => Promise<boolean>;
  executeRestore: (
    instanceName: string,
    snapshotName: string,
    zone: string,
    bundleId: string,
    cfConfig: { enabled: boolean; domain: string; zoneId: string; proxied: boolean },
    onStepUpdate: (index: number, step: OperationStep) => void,
    firewallConfig?: { enabled: boolean; rules?: FirewallPortRule[] }
  ) => Promise<boolean>;
  executeManualSyncDns: (domain: string, ip: string, zoneId: string, proxied: boolean) => Promise<void>;
  updateInstanceDomain: (domain: string, instanceName?: string) => Promise<void>;
  executeStopInstance: (instance: LightsailInstance) => Promise<void>;
  executeStartInstance: (instance: LightsailInstance) => Promise<void>;
  executeManualReleaseInstance: (instanceName: string, backupFirewall?: boolean) => Promise<void>;
  enqueueBackgroundHibernate: (
    instanceName: string,
    snapshotName: string,
    options?: { retentionHours?: number | null; customFirewallRules?: FirewallPortRule[] }
  ) => Promise<BackgroundTask>;
  enqueueBackgroundRestore: (
    instanceName: string,
    snapshotName: string,
    zone: string,
    bundleId: string,
    cfConfig: { enabled: boolean; domain: string; zoneId: string; proxied: boolean },
    firewallConfig?: { enabled: boolean; rules?: FirewallPortRule[] }
  ) => Promise<BackgroundTask>;
  clearCompletedBackgroundTasks: () => Promise<void>;
  extractInstanceFirewallRules: (instanceName: string, snapshotName?: string) => Promise<FirewallPortRule[]>;
  saveInstanceFirewallRules: (
    instanceName: string,
    snapshotName: string | undefined,
    rules: FirewallPortRule[],
    applyToRunningInstance?: boolean
  ) => Promise<FirewallPortRule[]>;
  updateSnapshotLifecycle: (
    policy: Partial<SnapshotLifecyclePolicy>,
    applyToExistingSnapshots?: boolean
  ) => Promise<void>;
  setSnapshotRetention: (
    snapshotName: string,
    retentionHours?: number | null,
    autoDeleteAt?: string | null
  ) => Promise<void>;
  runSnapshotCleanup: () => Promise<void>;
  testCurrentCredentials: (overrideConfig?: CloudConfig) => Promise<CredentialTestReport | null>;
  refreshSecretStatus: () => Promise<void>;
  checkGitHubUpdate: (overrideRepo?: string, silent?: boolean) => Promise<GitHubUpdateInfo | null>;
  syncGitHubVersion: () => Promise<void>;
  deleteSnapshot: (snapshotName: string) => Promise<void>;
  runDiagnostics: () => Promise<DiagnosticResult[]>;
  triggerTestHibernateSchedule: (inst: LightsailInstance) => Promise<void>;
  triggerTestStartSchedule: (inst: LightsailInstance) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

const DEFAULT_CONFIG: CloudConfig = {
  mode: 'real_cloud',
  flociSimulationSpeed: 'normal',
  simulateFaults: {
    awsThrottle: false,
    cloudflareError: false,
    snapshotTimeout: false,
  },
  awsAccessKeyId: '',
  awsSecretAccessKey: '',
  awsRegion: 'ap-northeast-1',
  cloudflareApiToken: '',
  cloudflareZoneId: '',
  defaultDnsRecordName: 'test.selfgo.asia',
  githubRepo: 'gansxx/aws_lightsail_manager',
};

const DEFAULT_LIFECYCLE: SnapshotLifecyclePolicy = {
  enabled: true,
  defaultRetentionHours: 168,
  maxSnapshotsPerInstance: 3,
  protectLatestHibernatedSnapshot: true,
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [instances, setInstances] = useState<LightsailInstance[]>([]);
  const [snapshots, setSnapshots] = useState<LightsailSnapshot[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'instances' | 'snapshots' | 'automation' | 'debug'>('instances');
  const [viewMode, setViewMode] = useState<'android_frame' | 'responsive'>('android_frame');
  const [apiLogs, setApiLogs] = useState<ApiLogEntry[]>([]);
  const [scheduleHistory, setScheduleHistory] = useState<ScheduleExecutionRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [envSecretStatus, setEnvSecretStatus] = useState<EnvSecretStatus | null>(null);
  const [credentialTestResult, setCredentialTestResult] = useState<CredentialTestReport | null>(null);
  const [testingCredentials, setTestingCredentials] = useState<boolean>(false);
  const [instanceActionLoading, setInstanceActionLoading] = useState<string | null>(null);
  const [githubUpdateInfo, setGithubUpdateInfo] = useState<GitHubUpdateInfo | null>(null);
  const [checkingGitHubUpdate, setCheckingGitHubUpdate] = useState<boolean>(false);
  const [secretCheckDone, setSecretCheckDone] = useState<boolean>(false);
  const [snapshotLifecycle, setSnapshotLifecycle] = useState<SnapshotLifecyclePolicy>(DEFAULT_LIFECYCLE);
  const [cleaningSnapshots, setCleaningSnapshots] = useState<boolean>(false);
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState<boolean>(false);
  const prevRunningTaskIdsRef = React.useRef<Set<string>>(new Set());

  // Modals
  const [hibernateModal, setHibernateModal] = useState<{ isOpen: boolean; instance: LightsailInstance | null }>({
    isOpen: false,
    instance: null,
  });
  const [restoreModal, setRestoreModal] = useState<{
    isOpen: boolean;
    snapshot: LightsailSnapshot | null;
    instance: LightsailInstance | null;
  }>({
    isOpen: false,
    snapshot: null,
    instance: null,
  });
  const [scheduleModal, setScheduleModal] = useState<{ isOpen: boolean; instance: LightsailInstance | null }>({
    isOpen: false,
    instance: null,
  });
  const [configModalOpen, setConfigModalOpen] = useState<boolean>(false);

  // Cloud Config
  const [config, setConfig] = useState<CloudConfig>(() => {
    try {
      const stored = localStorage.getItem('lightsail_cloud_config');
      const explicitMode = localStorage.getItem('lightsail_mode_explicit');
      const customDomain = localStorage.getItem('lightsail_custom_domain');
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          defaultDnsRecordName: customDomain || parsed.defaultDnsRecordName || DEFAULT_CONFIG.defaultDnsRecordName,
          mode: explicitMode === 'floci_simulation' ? 'floci_simulation' : 'real_cloud',
        };
      }
      return {
        ...DEFAULT_CONFIG,
        defaultDnsRecordName: customDomain || DEFAULT_CONFIG.defaultDnsRecordName,
      };
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const id = 'toast-' + Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const purgeSimulationState = useCallback(() => {
    setInstances([]);
    setSnapshots([]);
    setApiLogs([]);
    setDiagnostics([]);
    schedulerService.clearHistory();
    flociSimulator.clearSimulationStorage();
  }, []);

  const updateConfig = (newConfig: Partial<CloudConfig>) => {
    const cleanDomain =
      newConfig.defaultDnsRecordName !== undefined
        ? newConfig.defaultDnsRecordName.trim()
        : undefined;

    if (cleanDomain) {
      try {
        localStorage.setItem('lightsail_custom_domain', cleanDomain);
      } catch {}
      ApiBridge.saveDefaultDomain(cleanDomain);
    }

    setConfig((prev) => {
      const hasCustomRealKey = Boolean(
        (newConfig.awsAccessKeyId && newConfig.awsAccessKeyId.trim()) ||
          (newConfig.awsSecretAccessKey && newConfig.awsSecretAccessKey.trim()) ||
          (newConfig.cloudflareApiToken && newConfig.cloudflareApiToken.trim())
      );

      const nextMode =
        newConfig.mode || (hasCustomRealKey ? 'real_cloud' : prev.mode);

      const updated: CloudConfig = {
        ...prev,
        ...newConfig,
        defaultDnsRecordName: cleanDomain || prev.defaultDnsRecordName,
        mode: nextMode,
      };

      if (updated.mode === 'real_cloud') {
        purgeSimulationState();
      }

      try {
        localStorage.setItem('lightsail_cloud_config', JSON.stringify(updated));
        if (newConfig.mode) {
          localStorage.setItem('lightsail_mode_explicit', newConfig.mode);
        }
      } catch {}
      return updated;
    });
    showToast('配置已更新', 'info');
  };

  const updateInstanceDomain = async (domain: string, instanceName?: string) => {
    const clean = domain.trim();
    if (!clean) {
      showToast('请输入有效的域名', 'warning');
      return;
    }
    try {
      localStorage.setItem('lightsail_custom_domain', clean);
    } catch {}
    await ApiBridge.saveDefaultDomain(clean, instanceName);
    setConfig((prev) => {
      const updated = { ...prev, defaultDnsRecordName: clean };
      try {
        localStorage.setItem('lightsail_cloud_config', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    await refreshData();
    showToast(`解析域名已更新为 ${clean}`, 'success');
  };

  const refreshData = useCallback(async () => {
    setLoading(true);
    if (config.mode === 'real_cloud') {
      flociSimulator.clearSimulationStorage();
      const scheduleOverrides = schedulerService.getInstanceScheduleOverrides();

      const [instResult, snapResult, lifecycleResult] = await Promise.allSettled([
        ApiBridge.getInstances(config),
        ApiBridge.getSnapshots(config),
        ApiBridge.getSnapshotLifecyclePolicy(),
      ]);

      if (lifecycleResult.status === 'fulfilled' && lifecycleResult.value) {
        setSnapshotLifecycle(lifecycleResult.value);
      }

      if (instResult.status === 'fulfilled') {
        const merged = instResult.value.map((inst) => ({
          ...inst,
          autoHibernateSchedule:
            scheduleOverrides[inst.name]?.autoHibernateSchedule || inst.autoHibernateSchedule,
          autoStartSchedule:
            scheduleOverrides[inst.name]?.autoStartSchedule || inst.autoStartSchedule,
        }));
        setInstances(merged);
      } else {
        setInstances([]);
        showToast(instResult.reason?.message || '获取真实实例数据失败', 'error');
      }

      if (snapResult.status === 'fulfilled') {
        setSnapshots(snapResult.value);
      } else {
        setSnapshots([]);
        if (instResult.status === 'fulfilled') {
          showToast(snapResult.reason?.message || '获取真实快照数据失败', 'error');
        }
      }

      setLoading(false);
      return;
    }

    try {
      const [insts, snaps, policy] = await Promise.all([
        ApiBridge.getInstances(config),
        ApiBridge.getSnapshots(config),
        ApiBridge.getSnapshotLifecyclePolicy(),
      ]);
      setInstances(insts);
      setSnapshots(snaps);
      setSnapshotLifecycle(policy);
    } catch (e: any) {
      showToast(e.message || '获取数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [config, showToast]);

  const refreshSecretStatus = useCallback(async () => {
    try {
      const status = await ApiBridge.getCredentialStatus();
      setEnvSecretStatus(status);

      const explicitMode = localStorage.getItem('lightsail_mode_explicit');
      const customSavedDomain = localStorage.getItem('lightsail_custom_domain');
      if (
        status.awsAccessKeyId.configured &&
        status.awsSecretAccessKey.configured &&
        explicitMode !== 'floci_simulation'
      ) {
        purgeSimulationState();
        setConfig((prev) => {
          const resolvedDomain =
            customSavedDomain ||
            prev.defaultDnsRecordName ||
            status.cloudflareRecordName ||
            'test.selfgo.asia';
          const updated: CloudConfig = {
            ...prev,
            mode: 'real_cloud',
            awsRegion: status.awsRegion || prev.awsRegion,
            defaultDnsRecordName: resolvedDomain,
          };
          try {
            localStorage.setItem('lightsail_cloud_config', JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }
    } catch {
      // Ignore if backend unavailable in static mode
    } finally {
      setSecretCheckDone(true);
    }
  }, [purgeSimulationState]);

  useEffect(() => {
    refreshSecretStatus();
  }, [refreshSecretStatus]);

  // Hook up simulator logs & scheduler history once secret check completes
  useEffect(() => {
    if (!secretCheckDone) return;

    const unsubLogs = flociSimulator.onLog((log) => {
      setApiLogs((prev) => [log, ...prev].slice(0, 100));
    });

    const unsubHistory = schedulerService.onHistoryChange((hist) => {
      setScheduleHistory(hist);
    });

    setScheduleHistory(schedulerService.getHistory());
    refreshData();

    return () => {
      unsubLogs();
      unsubHistory();
    };
  }, [secretCheckDone, refreshData]);

  // Execute Hibernate (Step 1: Save Firewall -> Step 2: Create Snapshot -> Step 3: Delete Instance)
  const executeHibernate = async (
    instanceName: string,
    snapshotName: string,
    onStepUpdate: (step: OperationStep) => void,
    options?: { retentionHours?: number | null; customFirewallRules?: FirewallPortRule[] }
  ): Promise<boolean> => {
    try {
      const res = await ApiBridge.hibernateInstance(
        instanceName,
        snapshotName,
        config,
        onStepUpdate,
        options
      );
      await refreshData();
      showToast(
        `实例 ${instanceName} 已安全休眠！已备份 ${res.firewallRules.length} 条防火墙规则并生成快照 ${snapshotName}`,
        'success'
      );
      return true;
    } catch (e: any) {
      showToast(`休眠失败: ${e.message}`, 'error');
      throw e;
    }
  };

  // Execute Restore from Snapshot + Firewall Restore + Cloudflare DNS auto update
  const executeRestore = async (
    instanceName: string,
    snapshotName: string,
    zone: string,
    bundleId: string,
    cfConfig: { enabled: boolean; domain: string; zoneId: string; proxied: boolean },
    onStepUpdate: (index: number, step: OperationStep) => void,
    firewallConfig?: { enabled: boolean; rules?: FirewallPortRule[] }
  ): Promise<boolean> => {
    try {
      const res = await ApiBridge.restoreInstanceWithDns(
        instanceName,
        snapshotName,
        zone,
        bundleId,
        cfConfig,
        config,
        onStepUpdate,
        firewallConfig
      );
      await refreshData();
      const fwCount = res.restoredFirewallRules?.length || res.instance.firewallRules?.length || 0;
      showToast(
        `实例 ${res.instance.name} 已恢复启动！新 IP ${res.instance.publicIpAddress || '已分配'}，已复原 ${fwCount} 条防火墙规则并同步 DNS`,
        'success'
      );
      return true;
    } catch (e: any) {
      showToast(`恢复失败: ${e.message}`, 'error');
      throw e;
    }
  };

  // Poll server-side background tasks and refresh data when any running task finishes
  const syncServerTasks = useCallback(async () => {
    if (config.mode !== 'real_cloud') return;
    const serverTasks = await ApiBridge.getBackgroundTasks();
    setBackgroundTasks(serverTasks);

    const prevRunning = prevRunningTaskIdsRef.current;
    const currentRunning = new Set<string>();
    let anyFinished = false;

    for (const t of serverTasks) {
      if (t.status === 'running') {
        currentRunning.add(t.id);
      } else if (prevRunning.has(t.id)) {
        anyFinished = true;
        if (t.status === 'completed') {
          showToast(`后台任务已完成: ${t.title} (${t.currentStepTitle})`, 'success');
        } else if (t.status === 'failed') {
          showToast(`后台任务失败: ${t.title} - ${t.error || '未知错误'}`, 'error');
        }
      }
    }

    prevRunningTaskIdsRef.current = currentRunning;
    if (anyFinished) {
      refreshData();
    }
  }, [config.mode, refreshData, showToast]);

  useEffect(() => {
    if (!secretCheckDone) return;
    syncServerTasks();
    const hasRunning = backgroundTasks.some((t) => t.status === 'running');
    const intervalMs = hasRunning ? 2500 : 8000;
    const timer = setInterval(syncServerTasks, intervalMs);
    return () => clearInterval(timer);
  }, [secretCheckDone, backgroundTasks, syncServerTasks]);

  // Enqueue Non-Blocking Background Hibernate
  const enqueueBackgroundHibernate = async (
    instanceName: string,
    snapshotName: string,
    options?: { retentionHours?: number | null; customFirewallRules?: FirewallPortRule[] }
  ): Promise<BackgroundTask> => {
    if (config.mode === 'floci_simulation') {
      const nowIso = new Date().toISOString();
      const simTask: BackgroundTask = {
        id: `sim-hib-${Date.now()}`,
        type: 'hibernate',
        title: `后台休眠实例 ${instanceName}`,
        instanceName,
        snapshotName,
        status: 'running',
        progressPercent: 25,
        currentStepTitle: '正在后台执行模拟休眠...',
        steps: [
          { id: '1', title: '1/3 提取并备份防火墙配置', description: '正在保存端口规则...', status: 'running' },
          { id: '2', title: '2/3 创建系统快照', description: `快照 ${snapshotName}`, status: 'pending' },
          { id: '3', title: '3/3 释放计算实例', description: '停止计算计费', status: 'pending' },
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setBackgroundTasks((prev) => [simTask, ...prev]);
      setTaskDrawerOpen(true);

      (async () => {
        try {
          await ApiBridge.hibernateInstance(instanceName, snapshotName, config, undefined, options);
          setBackgroundTasks((prev) =>
            prev.map((t) =>
              t.id === simTask.id
                ? {
                    ...t,
                    status: 'completed',
                    progressPercent: 100,
                    currentStepTitle: `休眠完成 (${snapshotName})`,
                    completedAt: new Date().toISOString(),
                    steps: t.steps.map((s) => ({ ...s, status: 'completed' })),
                  }
                : t
            )
          );
          await refreshData();
          showToast(`后台休眠完成: ${instanceName}`, 'success');
        } catch (err: any) {
          setBackgroundTasks((prev) =>
            prev.map((t) =>
              t.id === simTask.id
                ? { ...t, status: 'failed', error: err.message, currentStepTitle: `失败: ${err.message}` }
                : t
            )
          );
        }
      })();

      return simTask;
    }

    const { task } = await ApiBridge.enqueueHibernateTask(instanceName, snapshotName, config, options);
    prevRunningTaskIdsRef.current.add(task.id);
    setBackgroundTasks((prev) => [task, ...prev.filter((t) => t.id !== task.id)]);
    setTaskDrawerOpen(true);
    showToast(`已加入后台队列: 正在为 ${instanceName} 备份防火墙与快照，完成后将自动删除实例`, 'info');
    return task;
  };

  // Enqueue Non-Blocking Background Restore
  const enqueueBackgroundRestore = async (
    instanceName: string,
    snapshotName: string,
    zone: string,
    bundleId: string,
    cfConfig: { enabled: boolean; domain: string; zoneId: string; proxied: boolean },
    firewallConfig?: { enabled: boolean; rules?: FirewallPortRule[] }
  ): Promise<BackgroundTask> => {
    if (cfConfig.domain) {
      try {
        localStorage.setItem('lightsail_custom_domain', cfConfig.domain.trim());
      } catch {}
    }

    if (config.mode === 'floci_simulation') {
      const nowIso = new Date().toISOString();
      const simTask: BackgroundTask = {
        id: `sim-res-${Date.now()}`,
        type: 'restore',
        title: `后台恢复实例 ${instanceName}`,
        instanceName,
        snapshotName,
        status: 'running',
        progressPercent: 25,
        currentStepTitle: '正在后台恢复实例与防火墙...',
        steps: [
          { id: '1', title: '1/4 从快照重建实例', description: snapshotName, status: 'running' },
          { id: '2', title: '2/4 等待分配公网 IP', description: '等待网络栈就绪', status: 'pending' },
          { id: '3', title: '3/4 复原防火墙端口规则', description: 'PutInstancePublicPorts', status: 'pending' },
          { id: '4', title: '4/4 同步 Cloudflare DNS', description: cfConfig.domain, status: 'pending' },
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setBackgroundTasks((prev) => [simTask, ...prev]);
      setTaskDrawerOpen(true);

      (async () => {
        try {
          const res = await ApiBridge.restoreInstanceWithDns(
            instanceName,
            snapshotName,
            zone,
            bundleId,
            cfConfig,
            config,
            undefined,
            firewallConfig
          );
          setBackgroundTasks((prev) =>
            prev.map((t) =>
              t.id === simTask.id
                ? {
                    ...t,
                    status: 'completed',
                    progressPercent: 100,
                    currentStepTitle: `恢复完成 (${res.instance.publicIpAddress})`,
                    completedAt: new Date().toISOString(),
                    steps: t.steps.map((s) => ({ ...s, status: 'completed' })),
                  }
                : t
            )
          );
          await refreshData();
          showToast(`后台恢复完成: ${instanceName} (${res.instance.publicIpAddress})`, 'success');
        } catch (err: any) {
          setBackgroundTasks((prev) =>
            prev.map((t) =>
              t.id === simTask.id
                ? { ...t, status: 'failed', error: err.message, currentStepTitle: `失败: ${err.message}` }
                : t
            )
          );
        }
      })();

      return simTask;
    }

    const { task } = await ApiBridge.enqueueRestoreTask(
      instanceName,
      snapshotName,
      zone,
      bundleId,
      cfConfig,
      config,
      firewallConfig
    );
    prevRunningTaskIdsRef.current.add(task.id);
    setBackgroundTasks((prev) => [task, ...prev.filter((t) => t.id !== task.id)]);
    setTaskDrawerOpen(true);
    showToast(`已加入后台队列: 正在从快照 ${snapshotName} 重建 ${instanceName}`, 'info');
    return task;
  };

  // Manual Release Instance (DeleteInstance immediately without waiting for snapshot creation)
  const executeManualReleaseInstance = async (instanceName: string, backupFirewall = true) => {
    setInstanceActionLoading(instanceName);
    try {
      await ApiBridge.manualReleaseInstance(instanceName, backupFirewall, config);
      await syncServerTasks();
      await refreshData();
      showToast(`实例 ${instanceName} 已手动释放（已从 AWS 删除停止计费）`, 'success');
    } catch (e: any) {
      showToast(`手动释放实例失败: ${e.message}`, 'error');
      throw e;
    } finally {
      setInstanceActionLoading(null);
    }
  };

  const clearCompletedBackgroundTasks = async () => {
    if (config.mode === 'floci_simulation') {
      setBackgroundTasks((prev) => prev.filter((t) => t.status === 'running'));
      return;
    }
    const remaining = await ApiBridge.clearCompletedTasks();
    setBackgroundTasks(remaining);
  };

  const extractInstanceFirewallRules = async (
    instanceName: string,
    snapshotName?: string
  ): Promise<FirewallPortRule[]> => {
    try {
      const res = await ApiBridge.extractFirewallRules(instanceName, snapshotName, config);
      await refreshData();
      showToast(`已成功提取并保存 ${instanceName} 的 ${res.rules.length} 条防火墙规则`, 'success');
      return res.rules;
    } catch (e: any) {
      showToast(`提取防火墙配置失败: ${e.message}`, 'error');
      throw e;
    }
  };

  const saveInstanceFirewallRules = async (
    instanceName: string,
    snapshotName: string | undefined,
    rules: FirewallPortRule[],
    applyToRunningInstance = false
  ): Promise<FirewallPortRule[]> => {
    try {
      const saved = await ApiBridge.saveFirewallRules(
        instanceName,
        snapshotName,
        rules,
        applyToRunningInstance,
        config
      );
      await refreshData();
      showToast(
        applyToRunningInstance
          ? `已保存并应用 ${saved.length} 条防火墙规则至云端实例 ${instanceName}`
          : `已保存 ${saved.length} 条防火墙预设规则（将在实例恢复时自动应用）`,
        'success'
      );
      return saved;
    } catch (e: any) {
      showToast(`保存防火墙规则失败: ${e.message}`, 'error');
      throw e;
    }
  };

  const updateSnapshotLifecycle = async (
    policyUpdate: Partial<SnapshotLifecyclePolicy>,
    applyToExistingSnapshots = false
  ) => {
    try {
      const updated = await ApiBridge.updateSnapshotLifecyclePolicy(
        policyUpdate,
        applyToExistingSnapshots,
        config
      );
      setSnapshotLifecycle(updated);
      await refreshData();
      showToast(
        applyToExistingSnapshots
          ? '快照生命周期策略已保存并同步至现有快照'
          : '快照生命周期策略已更新',
        'success'
      );
    } catch (e: any) {
      showToast(`更新快照生命周期策略失败: ${e.message}`, 'error');
    }
  };

  const setSnapshotRetention = async (
    snapshotName: string,
    retentionHours?: number | null,
    autoDeleteAt?: string | null
  ) => {
    try {
      const resolved = await ApiBridge.setSnapshotRetention(
        snapshotName,
        retentionHours,
        autoDeleteAt,
        config
      );
      await refreshData();
      showToast(
        resolved
          ? `已设置快照 ${snapshotName} 自动删除时间: ${new Date(resolved).toLocaleString('zh-CN')}`
          : `快照 ${snapshotName} 已设置为永久保留`,
        'info'
      );
    } catch (e: any) {
      showToast(`设置快照保留时间失败: ${e.message}`, 'error');
    }
  };

  const runSnapshotCleanup = async () => {
    setCleaningSnapshots(true);
    try {
      const res = await ApiBridge.cleanupExpiredSnapshots(snapshotLifecycle, config);
      await refreshData();
      if (res.deletedSnapshots.length > 0) {
        showToast(
          `生命周期清理完成: 已删除 ${res.deletedSnapshots.length} 个过期快照`,
          'success'
        );
      } else if (res.skippedProtected.length > 0) {
        showToast(
          `检查完成 (共 ${res.checkedCount} 个): ${res.skippedProtected.length} 个快照因属于休眠实例唯一基础镜像而受保护保留`,
          'info'
        );
      } else {
        showToast(`生命周期检查完成 (共 ${res.checkedCount} 个快照)，当前暂无需要删除的过期快照`, 'info');
      }
    } catch (e: any) {
      showToast(`执行过期快照清理失败: ${e.message}`, 'error');
    } finally {
      setCleaningSnapshots(false);
    }
  };

  const executeManualSyncDns = async (domain: string, ip: string, zoneId: string, proxied: boolean) => {
    try {
      await ApiBridge.syncCloudflareDns(domain, ip, zoneId, proxied, config);
      await refreshData();
      showToast(`Cloudflare DNS 记录 ${domain} -> ${ip} 已更新成功`, 'success');
    } catch (e: any) {
      showToast(`DNS 同步失败: ${e.message}`, 'error');
    }
  };

  const executeStopInstance = async (instance: LightsailInstance) => {
    setInstanceActionLoading(instance.name);
    try {
      await ApiBridge.stopInstance(instance.name, config);
      await refreshData();
      showToast(`实例 ${instance.name} 已停止运行（未删除实例且未创建快照）`, 'info');
    } catch (e: any) {
      showToast(`停止实例失败: ${e.message}`, 'error');
    } finally {
      setInstanceActionLoading(null);
    }
  };

  const executeStartInstance = async (instance: LightsailInstance) => {
    setInstanceActionLoading(instance.name);
    try {
      const res = await ApiBridge.startInstance(instance, config);
      await refreshData();
      if (res.publicIpAddress && res.dnsUpdated) {
        showToast(`实例 ${instance.name} 已启动！新 IP ${res.publicIpAddress} 已同步至 Cloudflare DNS`, 'success');
      } else if (res.publicIpAddress) {
        showToast(`实例 ${instance.name} 已启动！公网 IP: ${res.publicIpAddress}`, 'success');
      } else {
        showToast(`实例 ${instance.name} 启动指令已发送，请稍后刷新查看新 IP`, 'success');
      }
    } catch (e: any) {
      showToast(`启动实例失败: ${e.message}`, 'error');
    } finally {
      setInstanceActionLoading(null);
    }
  };

  const testCurrentCredentials = async (overrideConfig?: CloudConfig): Promise<CredentialTestReport | null> => {
    setTestingCredentials(true);
    try {
      const targetConfig = overrideConfig || config;
      const report = await ApiBridge.testCredentials(targetConfig);
      setCredentialTestResult(report);
      await refreshSecretStatus();

      if (report.aws.configured || report.cloudflare.configured) {
        purgeSimulationState();
        setConfig((prev) => {
          const updated: CloudConfig = { ...prev, ...(overrideConfig || {}), mode: 'real_cloud' };
          try {
            localStorage.setItem('lightsail_cloud_config', JSON.stringify(updated));
            localStorage.setItem('lightsail_mode_explicit', 'real_cloud');
          } catch {}
          return updated;
        });
      }

      if (report.aws.success && report.cloudflare.success) {
        showToast('AWS 与 Cloudflare 密钥均验证通过，已切换为真实云端数据！', 'success');
      } else if (report.aws.success || report.cloudflare.success) {
        showToast('部分密钥验证通过，已清理模拟数据并拉取真实数据', 'warning');
      } else {
        showToast('密钥验证未通过，请检查详情', 'error');
      }
      return report;
    } catch (e: any) {
      showToast(`密钥测试失败: ${e.message}`, 'error');
      return null;
    } finally {
      setTestingCredentials(false);
    }
  };

  const checkGitHubUpdate = useCallback(
    async (overrideRepo?: string, silent?: boolean): Promise<GitHubUpdateInfo | null> => {
      setCheckingGitHubUpdate(true);
      try {
        const repoToCheck = overrideRepo || config.githubRepo || 'gansxx/aws_lightsail_manager';
        const info = await ApiBridge.checkGitHubUpdate(repoToCheck);
        setGithubUpdateInfo(info);
        if (!silent) {
          if (info.hasUpdate) {
            showToast(`发现 GitHub 新版本 v${info.latestVersion}（当前 v${info.currentVersion}）`, 'info');
          } else {
            showToast(`当前已是最新版本 v${info.currentVersion}`, 'success');
          }
        }
        return info;
      } catch (e: any) {
        if (!silent) {
          showToast(`检查 GitHub 更新失败: ${e.message}`, 'error');
        }
        return null;
      } finally {
        setCheckingGitHubUpdate(false);
      }
    },
    [config.githubRepo, showToast]
  );

  const syncGitHubVersion = async () => {
    if (!githubUpdateInfo?.latestVersion) return;
    setCheckingGitHubUpdate(true);
    try {
      await ApiBridge.syncGitHubVersion(githubUpdateInfo.latestVersion);
      await checkGitHubUpdate(githubUpdateInfo.repo, true);
      showToast(`已同步本地版本标识至 v${githubUpdateInfo.latestVersion}`, 'success');
    } catch (e: any) {
      showToast(`版本同步失败: ${e.message}`, 'error');
    } finally {
      setCheckingGitHubUpdate(false);
    }
  };

  useEffect(() => {
    checkGitHubUpdate(undefined, true);
  }, [checkGitHubUpdate]);

  const deleteSnapshot = async (snapshotName: string) => {
    try {
      await ApiBridge.deleteSnapshot(snapshotName, config);
      await refreshData();
      showToast(`快照 ${snapshotName} 已删除`, 'info');
    } catch (e: any) {
      showToast(`删除快照失败: ${e.message}`, 'error');
    }
  };

  const runDiagnostics = async () => {
    try {
      const results = await ApiBridge.runDiagnostics(config);
      setDiagnostics(results);
      showToast('健康诊断完成', 'info');
      return results;
    } catch (e: any) {
      showToast(`诊断出错: ${e.message}`, 'error');
      return [];
    }
  };

  const triggerTestHibernateSchedule = async (inst: LightsailInstance) => {
    showToast(`正在测试执行 ${inst.name} 的定时自动休眠任务（保存防火墙 -> 创建快照 -> 删除实例）...`, 'info');
    await schedulerService.executeAutoHibernate(inst, config);
    await refreshData();
    showToast(`定时休眠测试执行完成，请查看任务历史与快照列表`, 'success');
  };

  const triggerTestStartSchedule = async (inst: LightsailInstance) => {
    showToast(`正在测试执行 ${inst.name} 的定时自动唤醒任务（恢复快照 -> 复原防火墙 -> 同步 DNS）...`, 'info');
    await schedulerService.executeAutoStart(inst, config);
    await refreshData();
    showToast(`定时唤醒测试执行完成，实例已恢复并更新防火墙与 Cloudflare DNS`, 'success');
  };

  const clearApiLogs = () => {
    setApiLogs([]);
    showToast('API 调试日志已清空', 'info');
  };

  const resetSimulator = () => {
    flociSimulator.resetToDefault();
    refreshData();
    showToast('Floci 模拟器状态已重置为初始演示状态', 'info');
  };

  return (
    <AppContext.Provider
      value={{
        instances,
        snapshots,
        loading,
        activeTab,
        viewMode,
        config,
        apiLogs,
        scheduleHistory,
        diagnostics,
        toasts,
        envSecretStatus,
        credentialTestResult,
        testingCredentials,
        instanceActionLoading,
        githubUpdateInfo,
        checkingGitHubUpdate,
        snapshotLifecycle,
        cleaningSnapshots,
        backgroundTasks,
        taskDrawerOpen,
        setTaskDrawerOpen,
        hibernateModal,
        restoreModal,
        scheduleModal,
        configModalOpen,
        setActiveTab,
        setViewMode,
        updateConfig,
        refreshData,
        showToast,
        clearApiLogs,
        resetSimulator,
        openHibernateModal: (instance) => setHibernateModal({ isOpen: true, instance }),
        closeHibernateModal: () => setHibernateModal({ isOpen: false, instance: null }),
        openRestoreModal: (snapshot, instance) =>
          setRestoreModal({ isOpen: true, snapshot: snapshot || null, instance: instance || null }),
        closeRestoreModal: () => setRestoreModal({ isOpen: false, snapshot: null, instance: null }),
        openScheduleModal: (instance) => setScheduleModal({ isOpen: true, instance }),
        closeScheduleModal: () => setScheduleModal({ isOpen: false, instance: null }),
        setConfigModalOpen,
        executeHibernate,
        executeRestore,
        executeManualSyncDns,
        updateInstanceDomain,
        executeStopInstance,
        executeStartInstance,
        executeManualReleaseInstance,
        enqueueBackgroundHibernate,
        enqueueBackgroundRestore,
        clearCompletedBackgroundTasks,
        extractInstanceFirewallRules,
        saveInstanceFirewallRules,
        updateSnapshotLifecycle,
        setSnapshotRetention,
        runSnapshotCleanup,
        testCurrentCredentials,
        refreshSecretStatus,
        checkGitHubUpdate,
        syncGitHubVersion,
        deleteSnapshot,
        runDiagnostics,
        triggerTestHibernateSchedule,
        triggerTestStartSchedule,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
