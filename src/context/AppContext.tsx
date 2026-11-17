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
    onStepUpdate: (step: OperationStep) => void
  ) => Promise<boolean>;
  executeRestore: (
    instanceName: string,
    snapshotName: string,
    zone: string,
    bundleId: string,
    cfConfig: { enabled: boolean; domain: string; zoneId: string; proxied: boolean },
    onStepUpdate: (index: number, step: OperationStep) => void
  ) => Promise<boolean>;
  executeManualSyncDns: (domain: string, ip: string, zoneId: string, proxied: boolean) => Promise<void>;
  executeStopInstance: (instance: LightsailInstance) => Promise<void>;
  executeStartInstance: (instance: LightsailInstance) => Promise<void>;
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
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          mode: explicitMode === 'floci_simulation' ? 'floci_simulation' : 'real_cloud',
        };
      }
      return DEFAULT_CONFIG;
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

  const refreshData = useCallback(async () => {
    setLoading(true);
    if (config.mode === 'real_cloud') {
      flociSimulator.clearSimulationStorage();
      const scheduleOverrides = schedulerService.getInstanceScheduleOverrides();

      const [instResult, snapResult] = await Promise.allSettled([
        ApiBridge.getInstances(config),
        ApiBridge.getSnapshots(config),
      ]);

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
      const insts = await ApiBridge.getInstances(config);
      const snaps = await ApiBridge.getSnapshots(config);
      setInstances(insts);
      setSnapshots(snaps);
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
      if (
        status.awsAccessKeyId.configured &&
        status.awsSecretAccessKey.configured &&
        explicitMode !== 'floci_simulation'
      ) {
        purgeSimulationState();
        setConfig((prev) => {
          const updated: CloudConfig = {
            ...prev,
            mode: 'real_cloud',
            awsRegion: status.awsRegion || prev.awsRegion,
            defaultDnsRecordName: status.cloudflareRecordName || prev.defaultDnsRecordName,
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

  // Execute Hibernate (Save snapshot -> Delete instance)
  const executeHibernate = async (
    instanceName: string,
    snapshotName: string,
    onStepUpdate: (step: OperationStep) => void
  ): Promise<boolean> => {
    try {
      await ApiBridge.hibernateInstance(instanceName, snapshotName, config, onStepUpdate);
      await refreshData();
      showToast(`实例 ${instanceName} 已成功休眠，快照保存在 AWS`, 'success');
      return true;
    } catch (e: any) {
      showToast(`休眠失败: ${e.message}`, 'error');
      throw e;
    }
  };

  // Execute Restore from Snapshot + Cloudflare DNS auto update
  const executeRestore = async (
    instanceName: string,
    snapshotName: string,
    zone: string,
    bundleId: string,
    cfConfig: { enabled: boolean; domain: string; zoneId: string; proxied: boolean },
    onStepUpdate: (index: number, step: OperationStep) => void
  ): Promise<boolean> => {
    try {
      const res = await ApiBridge.restoreInstanceWithDns(
        instanceName,
        snapshotName,
        zone,
        bundleId,
        cfConfig,
        config,
        onStepUpdate
      );
      await refreshData();
      showToast(
        `实例 ${res.instance.name} 已成功启动！新 IP: ${res.instance.publicIpAddress || '分配中'} 已同步至 Cloudflare`,
        'success'
      );
      return true;
    } catch (e: any) {
      showToast(`恢复失败: ${e.message}`, 'error');
      throw e;
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
    showToast(`正在测试执行 ${inst.name} 的定时自动休眠任务...`, 'info');
    await schedulerService.executeAutoHibernate(inst, config);
    await refreshData();
    showToast(`定时休眠测试执行完成，请查看任务历史与快照列表`, 'success');
  };

  const triggerTestStartSchedule = async (inst: LightsailInstance) => {
    showToast(`正在测试执行 ${inst.name} 的定时自动唤醒任务...`, 'info');
    await schedulerService.executeAutoStart(inst, config);
    await refreshData();
    showToast(`定时唤醒测试执行完成，实例已恢复并更新 Cloudflare DNS`, 'success');
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
        executeStopInstance,
        executeStartInstance,
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
