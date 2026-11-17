/**
 * Instances Tab: Core management for active and hibernated Lightsail instances + Firewall Extraction/Restoration
 */

import React, { useState } from 'react';
import {
  Server,
  Moon,
  RotateCcw,
  Globe,
  Clock,
  HardDrive,
  Cpu,
  RefreshCw,
  Plus,
  CheckCircle2,
  Square,
  Play,
  Loader2,
  Shield,
  X,
  Download,
  Save,
  Trash2,
  Edit3,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LightsailInstance, FirewallPortRule } from '../../types/lightsail';

export const InstancesTab: React.FC = () => {
  const {
    instances,
    snapshots,
    config,
    backgroundTasks,
    openHibernateModal,
    openRestoreModal,
    openScheduleModal,
    executeManualSyncDns,
    updateInstanceDomain,
    executeStopInstance,
    executeStartInstance,
    executeManualReleaseInstance,
    extractInstanceFirewallRules,
    saveInstanceFirewallRules,
    instanceActionLoading,
    loading,
    refreshData,
    showToast,
  } = useApp();

  const [filter, setFilter] = useState<'all' | 'running' | 'stopped' | 'hibernated'>('all');
  const [syncingDomain, setSyncingDomain] = useState<string | null>(null);
  const [editingFwInstance, setEditingFwInstance] = useState<string | null>(null);
  const [draftRules, setDraftRules] = useState<FirewallPortRule[]>([]);
  const [newPort, setNewPort] = useState<string>('');
  const [newProto, setNewProto] = useState<'tcp' | 'udp'>('tcp');
  const [fwBusy, setFwBusy] = useState<boolean>(false);
  const [editingDomainInst, setEditingDomainInst] = useState<string | null>(null);
  const [draftDomain, setDraftDomain] = useState<string>('');
  const [confirmReleaseInst, setConfirmReleaseInst] = useState<string | null>(null);

  const filteredInstances = instances.filter((inst) => {
    if (filter === 'running') return inst.state === 'running';
    if (filter === 'stopped') return inst.state === 'stopped';
    if (filter === 'hibernated') return inst.state === 'hibernated';
    return true;
  });

  const handleManualDnsSync = async (inst: LightsailInstance) => {
    if (!inst.cloudflareBinding?.domain || !inst.publicIpAddress) return;
    setSyncingDomain(inst.name);
    await executeManualSyncDns(
      inst.cloudflareBinding.domain,
      inst.publicIpAddress,
      inst.cloudflareBinding.zoneId,
      inst.cloudflareBinding.proxied
    );
    setSyncingDomain(null);
  };

  const toggleFirewallDrawer = (inst: LightsailInstance) => {
    if (editingFwInstance === inst.name) {
      setEditingFwInstance(null);
      return;
    }
    setEditingFwInstance(inst.name);
    setDraftRules(
      inst.firewallRules && inst.firewallRules.length > 0
        ? [...inst.firewallRules]
        : [
            { fromPort: 22, toPort: 22, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'SSH' },
            { fromPort: 80, toPort: 80, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'HTTP' },
            { fromPort: 443, toPort: 443, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'HTTPS' },
          ]
    );
    setNewPort('');
  };

  const handleAddDraftPort = () => {
    const p = parseInt(newPort.trim(), 10);
    if (!p || p < 1 || p > 65535) {
      showToast('请输入有效端口号 (1 - 65535)', 'warning');
      return;
    }
    if (draftRules.some((r) => r.fromPort === p && r.toPort === p && r.protocol === newProto)) {
      showToast(`端口 ${newProto.toUpperCase()}:${p} 已存在`, 'info');
      return;
    }
    setDraftRules((prev) => [
      ...prev,
      {
        fromPort: p,
        toPort: p,
        protocol: newProto,
        cidrs: ['0.0.0.0/0'],
        commonName: `Custom ${newProto.toUpperCase()}`,
      },
    ]);
    setNewPort('');
  };

  const handleRemoveDraftPort = (idx: number) => {
    setDraftRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleExtractLive = async (inst: LightsailInstance) => {
    setFwBusy(true);
    try {
      const rules = await extractInstanceFirewallRules(inst.name, inst.lastSnapshotName);
      setDraftRules(rules);
    } finally {
      setFwBusy(false);
    }
  };

  const handleSaveFirewall = async (inst: LightsailInstance) => {
    setFwBusy(true);
    try {
      const saved = await saveInstanceFirewallRules(
        inst.name,
        inst.lastSnapshotName,
        draftRules,
        inst.state === 'running'
      );
      setDraftRules(saved);
      setEditingFwInstance(null);
    } finally {
      setFwBusy(false);
    }
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Top App Bar inside screen */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">实例控制台</h2>
          <p className="text-xs text-slate-400">AWS Lightsail 实例生命周期、防火墙备份与省钱休眠</p>
        </div>
        <button
          onClick={() => refreshData()}
          disabled={loading}
          className="p-2 rounded-xl bg-slate-800/80 text-slate-300 hover:text-white border border-slate-700/80 transition-colors"
          title="刷新实例状态"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
        </button>
      </div>

      {/* Overview Stat Strip */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
          <span className="text-slate-400 block text-[11px]">全部</span>
          <span className="text-base font-bold text-white font-mono tabular-nums">{instances.length}</span>
        </div>
        <div className="bg-emerald-950/20 border border-emerald-900/40 p-2.5 rounded-xl">
          <span className="text-emerald-400 block text-[11px]">运行中</span>
          <span className="text-base font-bold text-emerald-300 font-mono tabular-nums">
            {instances.filter((i) => i.state === 'running').length}
          </span>
        </div>
        <div className="bg-amber-950/20 border border-amber-900/40 p-2.5 rounded-xl">
          <span className="text-amber-400 block text-[11px]">已停止</span>
          <span className="text-base font-bold text-amber-300 font-mono tabular-nums">
            {instances.filter((i) => i.state === 'stopped').length}
          </span>
        </div>
        <div className="bg-indigo-950/20 border border-indigo-900/40 p-2.5 rounded-xl">
          <span className="text-indigo-400 block text-[11px]">已休眠</span>
          <span className="text-base font-bold text-indigo-300 font-mono tabular-nums">
            {instances.filter((i) => i.state === 'hibernated').length}
          </span>
        </div>
      </div>

      {/* Filter Chips (Button Segmented Control) */}
      <div className="flex items-center gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px]">
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
            filter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          全部 ({instances.length})
        </button>
        <button
          onClick={() => setFilter('running')}
          className={`flex-1 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
            filter === 'running'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          运行 ({instances.filter((i) => i.state === 'running').length})
        </button>
        <button
          onClick={() => setFilter('stopped')}
          className={`flex-1 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
            filter === 'stopped'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          停止 ({instances.filter((i) => i.state === 'stopped').length})
        </button>
        <button
          onClick={() => setFilter('hibernated')}
          className={`flex-1 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
            filter === 'hibernated'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          休眠 ({instances.filter((i) => i.state === 'hibernated').length})
        </button>
      </div>

      {/* Instance Cards Feed */}
      <div className="space-y-3.5">
        {filteredInstances.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40">
            <Server className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-400">暂无符合条件的实例</p>
          </div>
        ) : (
          filteredInstances.map((inst) => {
            const isRunning = inst.state === 'running';
            const isStopped = inst.state === 'stopped';
            const isHibernated = inst.state === 'hibernated';
            const isBusy = instanceActionLoading === inst.name;
            const fwRules = inst.firewallRules || [];
            const isFwOpen = editingFwInstance === inst.name;

            return (
              <div
                key={inst.name}
                className={`p-4 rounded-2xl border transition-all ${
                  isRunning
                    ? 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    : isStopped
                    ? 'bg-amber-950/15 border-amber-900/40 hover:border-amber-800/60'
                    : 'bg-indigo-950/20 border-indigo-900/50 hover:border-indigo-800/60'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
                        isRunning
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : isStopped
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                      }`}
                    >
                      <Server className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white font-mono">{inst.name}</h3>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{inst.location.availabilityZone}</span>
                        <span>·</span>
                        <span>{inst.blueprintName}</span>
                      </div>
                    </div>
                  </div>

                  {/* State badge */}
                  <div className="shrink-0">
                    {isRunning ? (
                      <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Running
                      </span>
                    ) : isStopped ? (
                      <span className="text-[11px] font-semibold text-amber-300 bg-amber-950/80 border border-amber-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Square className="w-2.5 h-2.5 text-amber-400" />
                        已关机 (Stopped)
                      </span>
                    ) : isHibernated ? (
                      <span className="text-[11px] font-semibold text-indigo-300 bg-indigo-950/80 border border-indigo-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Moon className="w-3 h-3 text-indigo-400" />
                        已休眠省钱
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                        {inst.state}
                      </span>
                    )}
                  </div>
                </div>

                {/* Hardware Spec Info */}
                <div className="flex items-center gap-3 text-xs text-slate-400 py-1 border-t border-b border-slate-900 mb-2.5">
                  <div className="flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-slate-500" />
                    <span>{inst.cpuCount} vCPU / {inst.ramGb}GB</span>
                  </div>
                  <span>·</span>
                  <div className="flex items-center gap-1">
                    <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                    <span>{inst.diskSizeGb}GB SSD</span>
                  </div>
                  <span>·</span>
                  <span className="font-mono text-slate-300">${inst.monthlyCostUsd}/月</span>
                </div>

                {/* 3 Initialization & Lifecycle Status Strip (实例初始化与生命周期三状态) */}
                {(() => {
                  const activeTask = backgroundTasks.find(
                    (t) => t.instanceName === inst.name && t.status === 'running'
                  );
                  const boundDomain =
                    inst.cloudflareBinding?.domain || config.defaultDnsRecordName || 'test.selfgo.asia';
                  const isDnsMatched =
                    Boolean(inst.publicIpAddress) &&
                    inst.cloudflareBinding?.lastUpdatedIp === inst.publicIpAddress;

                  const initStates = [
                    {
                      step: '① 实例与网络',
                      label: activeTask
                        ? activeTask.type === 'hibernate'
                          ? '待释放算力'
                          : '重建分配中'
                        : isRunning && inst.publicIpAddress
                        ? '已就绪 (IP正常)'
                        : isHibernated
                        ? '已休眠 ($0/月)'
                        : isStopped
                        ? '已关机停止'
                        : '初始化中...',
                      done: (isRunning && Boolean(inst.publicIpAddress)) || isHibernated,
                      running: Boolean(activeTask) || inst.state === 'pending',
                    },
                    {
                      step: '② 防火墙配置',
                      label:
                        fwRules.length > 0
                          ? isHibernated
                            ? `已备份 (${fwRules.length}端口)`
                            : `已加载 (${fwRules.length}端口)`
                          : '待提取规则',
                      done: fwRules.length > 0,
                      running:
                        activeTask?.steps.some(
                          (s) => s.id.includes('firewall') && s.status === 'running'
                        ) || false,
                    },
                    {
                      step: '③ 快照 / DNS',
                      label: isHibernated
                        ? `快照就绪 (${inst.lastSnapshotName ? '已归档' : '已保存'})`
                        : isDnsMatched
                        ? 'DNS 已同步'
                        : `域名已绑定`,
                      done: isHibernated || isDnsMatched || Boolean(boundDomain),
                      running:
                        activeTask?.steps.some(
                          (s) =>
                            (s.id.includes('snap') || s.id.includes('dns')) &&
                            s.status === 'running'
                        ) || false,
                    },
                  ];

                  return (
                    <div className="mb-2.5 space-y-2">
                      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                        {initStates.map((st, idx) => (
                          <div
                            key={idx}
                            className={`p-2 rounded-xl border flex flex-col gap-0.5 ${
                              st.running
                                ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-200'
                                : st.done
                                ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                                : 'bg-slate-900/70 border-slate-800 text-slate-400'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold text-[10px] text-slate-300 truncate">
                                {st.step}
                              </span>
                              {st.running ? (
                                <Loader2 className="w-3 h-3 text-indigo-400 animate-spin shrink-0" />
                              ) : st.done ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                              ) : (
                                <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                              )}
                            </div>
                            <span className="font-mono text-[10px] truncate">{st.label}</span>
                          </div>
                        ))}
                      </div>

                      {/* If a background task is currently running for this instance, show live 3-step progress */}
                      {activeTask && (
                        <div className="p-2.5 rounded-xl bg-indigo-950/35 border border-indigo-700/50 space-y-1.5 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-indigo-200 flex items-center gap-1.5">
                              <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                              <span>{activeTask.currentStepTitle}</span>
                            </span>
                            <span className="font-mono text-[10px] text-indigo-300">
                              {activeTask.progressPercent}%
                            </span>
                          </div>
                          <div className="grid grid-cols-1 gap-1 pt-0.5">
                            {activeTask.steps.map((s) => (
                              <div key={s.id} className="flex items-center gap-1.5 text-[10px]">
                                {s.status === 'completed' ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                ) : s.status === 'running' ? (
                                  <Loader2 className="w-3 h-3 text-indigo-400 animate-spin shrink-0" />
                                ) : (
                                  <span className="w-3 h-3 rounded-full border border-slate-700 shrink-0" />
                                )}
                                <span
                                  className={
                                    s.status === 'completed'
                                      ? 'text-emerald-300'
                                      : s.status === 'running'
                                      ? 'text-indigo-200 font-medium'
                                      : 'text-slate-500'
                                  }
                                >
                                  {s.title}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Network, Firewall & Cloudflare DNS section */}
                <div className="space-y-1.5 text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/70 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">公网 IP 地址:</span>
                    <span className="font-mono font-medium text-slate-200">
                      {inst.publicIpAddress ? (
                        <span className="text-emerald-400">{inst.publicIpAddress}</span>
                      ) : (
                        <span className="text-slate-500 italic">已释放算力 (无公网 IP)</span>
                      )}
                    </span>
                  </div>

                  {/* Firewall Summary Row */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                    <div className="flex items-center gap-1.5 text-cyan-300">
                      <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="text-[11px]">
                        防火墙配置 ({fwRules.length} 端口):
                      </span>
                    </div>
                    <button
                      onClick={() => toggleFirewallDrawer(inst)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-medium"
                    >
                      {isFwOpen ? '收起防火墙' : '提取/编辑规则'}
                    </button>
                  </div>

                  {fwRules.length > 0 && !isFwOpen && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {fwRules.map((r, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-800/50 text-cyan-200 font-mono text-[10px]"
                        >
                          {r.protocol.toUpperCase()}:{r.fromPort}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Cloudflare DNS Domain Row (with inline edit support) */}
                  <div className="pt-1 border-t border-slate-800/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-amber-300 min-w-0">
                        <Globe className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="font-mono text-[11px] truncate max-w-[165px]">
                          {inst.cloudflareBinding?.domain || config.defaultDnsRecordName || 'test.selfgo.asia'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (editingDomainInst === inst.name) {
                              setEditingDomainInst(null);
                            } else {
                              setEditingDomainInst(inst.name);
                              setDraftDomain(
                                inst.cloudflareBinding?.domain ||
                                  config.defaultDnsRecordName ||
                                  'test.selfgo.asia'
                              );
                            }
                          }}
                          className="text-[10px] text-slate-400 hover:text-amber-300 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/80 shrink-0"
                          title="修改解析域名"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                          <span>修改域名</span>
                        </button>
                      </div>

                      {isRunning && inst.publicIpAddress && (
                        <button
                          onClick={() => handleManualDnsSync(inst)}
                          disabled={syncingDomain === inst.name}
                          className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 shrink-0"
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${syncingDomain === inst.name ? 'animate-spin' : ''}`}
                          />
                          <span>同步 DNS</span>
                        </button>
                      )}
                    </div>

                    {editingDomainInst === inst.name && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <input
                          type="text"
                          value={draftDomain}
                          onChange={(e) => setDraftDomain(e.target.value)}
                          placeholder="输入新解析域名 (如 vpn.selfgo.asia)"
                          className="flex-1 bg-slate-950 border border-amber-700/60 rounded-lg px-2.5 py-1 text-[11px] text-white font-mono focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (draftDomain.trim()) {
                              await updateInstanceDomain(draftDomain.trim(), inst.name);
                              setEditingDomainInst(null);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-medium whitespace-nowrap"
                        >
                          保存域名
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDomainInst(null)}
                          className="px-2 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-[11px]"
                        >
                          取消
                        </button>
                      </div>
                    )}
                  </div>

                  {isHibernated && inst.lastSnapshotName && (
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px]">
                      <span className="text-slate-400">已存入快照:</span>
                      <span className="font-mono text-indigo-300 truncate max-w-[180px]">
                        {inst.lastSnapshotName}
                      </span>
                    </div>
                  )}
                </div>

                {/* Expandable Firewall Configuration Drawer */}
                {isFwOpen && (
                  <div className="mb-3 p-3 rounded-xl bg-slate-950 border border-cyan-900/50 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5" />
                        <span>
                          {isHibernated
                            ? '休眠已备份防火墙规则 (唤醒时自动复原)'
                            : '当前实例防火墙开放端口规则'}
                        </span>
                      </span>
                      <button
                        onClick={() => handleExtractLive(inst)}
                        disabled={fwBusy}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[10px] flex items-center gap-1 whitespace-nowrap"
                      >
                        <Download className="w-3 h-3" />
                        <span>提取最新规则</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {draftRules.map((rule, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-950/70 border border-cyan-800/60 text-cyan-200 font-mono text-[10px]"
                        >
                          <span>
                            {rule.protocol.toUpperCase()}{' '}
                            {rule.fromPort === rule.toPort
                              ? rule.fromPort
                              : `${rule.fromPort}-${rule.toPort}`}
                          </span>
                          {draftRules.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveDraftPort(idx)}
                              className="text-cyan-400 hover:text-rose-400"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <select
                        value={newProto}
                        onChange={(e) => setNewProto(e.target.value as 'tcp' | 'udp')}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white font-mono"
                      >
                        <option value="tcp">TCP</option>
                        <option value="udp">UDP</option>
                      </select>
                      <input
                        type="number"
                        value={newPort}
                        onChange={(e) => setNewPort(e.target.value)}
                        placeholder="端口号 (如 2080)"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleAddDraftPort}
                        disabled={!newPort.trim()}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] whitespace-nowrap disabled:opacity-40"
                      >
                        + 添加
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSaveFirewall(inst)}
                      disabled={fwBusy}
                      className="w-full py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {fwBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isRunning
                          ? '保存并同步应用至云端防火墙'
                          : '保存防火墙规则（恢复实例时自动复原）'}
                      </span>
                    </button>
                  </div>
                )}

                {/* Inline Manual Release Confirmation Drawer */}
                {confirmReleaseInst === inst.name && !isHibernated && (
                  <div className="mb-3 p-3 rounded-xl bg-rose-950/30 border border-rose-800/60 space-y-2 text-xs">
                    <div className="flex items-start gap-2 text-rose-200">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">确认手动释放（直接删除）实例 {inst.name}？</span>
                        <span className="text-[11px] text-slate-300 block mt-0.5">
                          {snapshots.some((s) => s.fromInstanceName === inst.name && s.state === 'available')
                            ? `已检测到该实例存在可用快照 (${
                                snapshots.find((s) => s.fromInstanceName === inst.name && s.state === 'available')
                                  ?.name
                              })，释放后将先保存防火墙规则再立即调用 DeleteInstance 停止计费。`
                            : '注意：该操作不会等待新快照创建，将提取当前防火墙规则后直接删除计算实例以停止计费。'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setConfirmReleaseInst(null)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={async () => {
                          await executeManualReleaseInstance(inst.name, true);
                          setConfirmReleaseInst(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] flex items-center gap-1 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        <span>确认立即手动释放</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Lifecycle Action Buttons */}
                <div className="flex items-center gap-1.5">
                  {isRunning ? (
                    <>
                      <button
                        onClick={() => executeStopInstance(inst)}
                        disabled={isBusy}
                        className="py-2 px-2.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 font-medium text-xs flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                        title="仅停止实例（不删除实例也不创建快照）"
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                        <span>停止</span>
                      </button>

                      <button
                        onClick={() => openHibernateModal(inst)}
                        disabled={isBusy}
                        className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm shadow-indigo-600/30 whitespace-nowrap disabled:opacity-50"
                      >
                        <Moon className="w-3.5 h-3.5" />
                        <span>快照并休眠</span>
                      </button>

                      <button
                        onClick={() =>
                          setConfirmReleaseInst(confirmReleaseInst === inst.name ? null : inst.name)
                        }
                        disabled={isBusy}
                        className="py-2 px-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 border border-rose-500/40 font-medium text-xs flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                        title="手动释放实例（不等待新快照，避免应用提前退出导致未删除实例）"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>手动释放</span>
                      </button>
                    </>
                  ) : isStopped ? (
                    <>
                      <button
                        onClick={() => executeStartInstance(inst)}
                        disabled={isBusy}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm shadow-emerald-600/30 whitespace-nowrap disabled:opacity-50"
                        title="直接启动实例（不经过快照恢复）"
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        <span>直接启动</span>
                      </button>

                      <button
                        onClick={() => openHibernateModal(inst)}
                        disabled={isBusy}
                        className="py-2 px-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 font-medium text-xs flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                      >
                        <Moon className="w-3.5 h-3.5" />
                        <span>休眠</span>
                      </button>

                      <button
                        onClick={() =>
                          setConfirmReleaseInst(confirmReleaseInst === inst.name ? null : inst.name)
                        }
                        disabled={isBusy}
                        className="py-2 px-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 border border-rose-500/40 font-medium text-xs flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                        title="手动释放实例（直接调用 DeleteInstance 删除实例）"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>手动释放</span>
                      </button>
                    </>
                  ) : isHibernated ? (
                    <button
                      onClick={() => openRestoreModal(undefined, inst)}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm shadow-emerald-600/30 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>一键唤醒 + 复原防火墙 + DNS</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => refreshData()}
                      className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>刷新状态</span>
                    </button>
                  )}

                  {/* Schedule config button */}
                  <button
                    onClick={() => openScheduleModal(inst)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition-colors shrink-0"
                    title="配置定时自动休眠/唤醒"
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => openRestoreModal()}
        className="fixed bottom-20 right-5 z-20 w-12 h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/40 flex items-center justify-center transition-all hover:scale-105 active:scale-95 focus:outline-none"
        title="从快照恢复新实例"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
};

