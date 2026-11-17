/**
 * Instances Tab: Core management for active and hibernated Lightsail instances
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
  ShieldCheck,
  CheckCircle2,
  Zap,
  Tag,
  Key,
  Power,
  Square,
  Play,
  Loader2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LightsailInstance } from '../../types/lightsail';

export const InstancesTab: React.FC = () => {
  const {
    instances,
    openHibernateModal,
    openRestoreModal,
    openScheduleModal,
    executeManualSyncDns,
    executeStopInstance,
    executeStartInstance,
    instanceActionLoading,
    loading,
    refreshData,
  } = useApp();

  const [filter, setFilter] = useState<'all' | 'running' | 'stopped' | 'hibernated'>('all');
  const [syncingDomain, setSyncingDomain] = useState<string | null>(null);

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

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Top App Bar inside screen */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">实例控制台</h2>
          <p className="text-xs text-slate-400">AWS Lightsail 云实例生命周期与省钱休眠</p>
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

                {/* Network & Cloudflare DNS section */}
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

                  {inst.cloudflareBinding?.enabled && (
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                      <div className="flex items-center gap-1.5 text-amber-300">
                        <Globe className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-mono text-[11px] truncate max-w-[170px]">
                          {inst.cloudflareBinding.domain}
                        </span>
                      </div>

                      {isRunning && inst.publicIpAddress && (
                        <button
                          onClick={() => handleManualDnsSync(inst)}
                          disabled={syncingDomain === inst.name}
                          className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1"
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${syncingDomain === inst.name ? 'animate-spin' : ''}`}
                          />
                          <span>同步 DNS</span>
                        </button>
                      )}
                    </div>
                  )}

                  {isHibernated && inst.lastSnapshotName && (
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px]">
                      <span className="text-slate-400">已存入快照:</span>
                      <span className="font-mono text-indigo-300 truncate max-w-[180px]">
                        {inst.lastSnapshotName}
                      </span>
                    </div>
                  )}
                </div>

                {/* Lifecycle Action Buttons */}
                <div className="flex items-center gap-2">
                  {isRunning ? (
                    <>
                      <button
                        onClick={() => executeStopInstance(inst)}
                        disabled={isBusy}
                        className="py-2 px-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
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
                        className="py-2 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                      >
                        <Moon className="w-3.5 h-3.5" />
                        <span>休眠</span>
                      </button>
                    </>
                  ) : isHibernated ? (
                    <button
                      onClick={() => openRestoreModal(undefined, inst)}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm shadow-emerald-600/30 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>一键唤醒并更新 DNS</span>
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
