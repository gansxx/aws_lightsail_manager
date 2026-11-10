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
  deleteSnapshot: (snapshotName: string) => Promise<void>;
  runDiagnostics: () => Promise<DiagnosticResult[]>;
  triggerTestHibernateSchedule: (inst: LightsailInstance) => Promise<void>;
  triggerTestStartSchedule: (inst: LightsailInstance) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

const DEFAULT_CONFIG: CloudConfig = {
  mode: 'floci_simulation',
  flociSimulationSpeed: 'normal',
  simulateFaults: {
    awsThrottle: false,
    cloudflareError: false,
    snapshotTimeout: false,
  },
  awsAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  awsRegion: 'ap-northeast-1',
  cloudflareApiToken: 'cf_tok_live_839a9b1837f81a7b',
  cloudflareZoneId: 'cf-zone-983b8a1e2f',
  defaultDnsRecordName: 'vpn.mydomain.dev',
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
      return stored ? { ...DEFAULT_CONFIG, ...JSON.parse(stored) } : DEFAULT_CONFIG;
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

  const updateConfig = (newConfig: Partial<CloudConfig>) => {
    setConfig((prev) => {
      const updated = { ...prev, ...newConfig };
      try {
        localStorage.setItem('lightsail_cloud_config', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showToast('配置已更新', 'info');
  };

  const refreshData = useCallback(async () => {
    setLoading(true);
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

  // Hook up simulator logs & scheduler history
  useEffect(() => {
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
  }, [refreshData]);

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
