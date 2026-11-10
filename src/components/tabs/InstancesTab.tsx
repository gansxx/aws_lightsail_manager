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
    loading,
    refreshData,
  } = useApp();

  const [filter, setFilter] = useState<'all' | 'running' | 'hibernated'>('all');
  const [syncingDomain, setSyncingDomain] = useState<string | null>(null);

  const filteredInstances = instances.filter((inst) => {
    if (filter === 'running') return inst.state === 'running';
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
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
          <span className="text-slate-400 block text-[11px]">总实例数</span>
          <span className="text-base font-bold text-white font-mono">{instances.length}</span>
        </div>
        <div className="bg-emerald-950/20 border border-emerald-900/40 p-2.5 rounded-xl">
          <span className="text-emerald-400 block text-[11px]">在线运行</span>
          <span className="text-base font-bold text-emerald-300 font-mono">
            {instances.filter((i) => i.state === 'running').length}
          </span>
        </div>
        <div className="bg-indigo-950/20 border border-indigo-900/40 p-2.5 rounded-xl">
          <span className="text-indigo-400 block text-[11px]">休眠省钱中</span>
          <span className="text-base font-bold text-indigo-300 font-mono">
            {instances.filter((i) => i.state === 'hibernated').length}
          </span>
        </div>
      </div>

      {/* Filter Chips (Button Segmented Control) */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
            filter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          全部 ({instances.length})
        </button>
        <button
          onClick={() => setFilter('running')}
          className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
            filter === 'running'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          运行中 ({instances.filter((i) => i.state === 'running').length})
        </button>
        <button
          onClick={() => setFilter('hibernated')}
          className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
            filter === 'hibernated'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          已休眠 ({instances.filter((i) => i.state === 'hibernated').length})
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
            const isHibernated = inst.state === 'hibernated';

            return (
              <div
                key={inst.name}
                className={`p-4 rounded-2xl border transition-all ${
                  isRunning
                    ? 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
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
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Running
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
                    <button
                      onClick={() => openHibernateModal(inst)}
                      className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm shadow-indigo-600/30"
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>保存快照并休眠</span>
                    </button>
                  ) : isHibernated ? (
                    <button
                      onClick={() => openRestoreModal(undefined, inst)}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm shadow-emerald-600/30"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>一键唤醒并更新 DNS</span>
                    </button>
                  ) : null}

                  {/* Schedule config button */}
                  <button
                    onClick={() => openScheduleModal(inst)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition-colors"
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
