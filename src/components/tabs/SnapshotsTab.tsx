/**
 * Snapshots Tab: View, restore and manage AWS Lightsail instance snapshots with Lifecycle Policy & Firewall Backup
 */

import React, { useState } from 'react';
import {
  Camera,
  RotateCcw,
  Trash2,
  HardDrive,
  Calendar,
  Server,
  Globe,
  ShieldCheck,
  Clock,
  Shield,
  Sliders,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LightsailSnapshot } from '../../types/lightsail';

export const SnapshotsTab: React.FC = () => {
  const {
    snapshots,
    openRestoreModal,
    deleteSnapshot,
    snapshotLifecycle,
    updateSnapshotLifecycle,
    setSnapshotRetention,
    runSnapshotCleanup,
    cleaningSnapshots,
  } = useApp();

  const [showLifecycleConfig, setShowLifecycleConfig] = useState<boolean>(true);
  const [updatingRetentionSnap, setUpdatingRetentionSnap] = useState<string | null>(null);

  const totalGb = snapshots.reduce((acc, s) => acc + s.sizeInGb, 0);
  const monthlyCost = (totalGb * 0.05).toFixed(2);

  const handleDelete = (snap: LightsailSnapshot) => {
    deleteSnapshot(snap.name);
  };

  const handleRetentionSelect = async (snapName: string, value: string) => {
    setUpdatingRetentionSnap(snapName);
    try {
      if (value === 'permanent') {
        await setSnapshotRetention(snapName, null, null);
      } else if (value === 'expire_now_test') {
        // Set autoDeleteAt to 5 seconds ago so user can immediately test lifecycle cleanup
        const pastIso = new Date(Date.now() - 5000).toISOString();
        await setSnapshotRetention(snapName, undefined, pastIso);
      } else {
        const hours = Number(value);
        if (hours > 0) {
          await setSnapshotRetention(snapName, hours, undefined);
        }
      }
    } finally {
      setUpdatingRetentionSnap(null);
    }
  };

  const formatAutoDeleteRemaining = (iso?: string | null) => {
    if (!iso) return { text: '永久保留', expired: false };
    const targetMs = new Date(iso).getTime();
    if (Number.isNaN(targetMs)) return { text: '永久保留', expired: false };
    const diffMs = targetMs - Date.now();
    if (diffMs <= 0) {
      return {
        text: `已到期 (${new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })})`,
        expired: true,
      };
    }
    const diffHours = Math.round(diffMs / 3600_000);
    if (diffHours < 24) {
      const mins = Math.max(1, Math.round(diffMs / 60_000));
      return {
        text: diffHours >= 1 ? `${diffHours} 小时后自动删除` : `${mins} 分钟后自动删除`,
        expired: false,
      };
    }
    const days = (diffHours / 24).toFixed(1).replace(/\.0$/, '');
    return {
      text: `${days} 天后自动删除 (${new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })})`,
      expired: false,
    };
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">休眠快照与生命周期</h2>
          <p className="text-xs text-slate-400">
            含防火墙备份的完整系统快照，支持配置自动删除时间与过期清理
          </p>
        </div>
        <button
          onClick={() => setShowLifecycleConfig(!showLifecycleConfig)}
          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs flex items-center gap-1.5 whitespace-nowrap transition-colors"
        >
          <Sliders className="w-3.5 h-3.5 text-indigo-400" />
          <span>{showLifecycleConfig ? '收起策略' : '生命周期策略'}</span>
        </button>
      </div>

      {/* Storage Cost Card */}
      <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-900/50 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <span className="font-semibold text-white block">快照存储占用</span>
            <span className="text-slate-400 text-[11px]">
              {snapshots.length} 个快照 · 合计 <strong className="text-indigo-300 font-mono">{totalGb} GB</strong>
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-slate-400 text-[10px] block">预计月度存储费</span>
          <span className="text-sm font-bold text-emerald-400 font-mono">${monthlyCost}/月</span>
        </div>
      </div>

      {/* Snapshot Lifecycle Policy Management Card */}
      {showLifecycleConfig && (
        <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <div>
                <h3 className="font-bold text-white text-xs">快照生命周期管理 (自动删除策略)</h3>
                <p className="text-[11px] text-slate-400">自动清理过期历史快照，防止存储费用堆积</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={snapshotLifecycle.enabled}
                onChange={(e) => updateSnapshotLifecycle({ enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">默认自动删除时间:</label>
              <select
                value={
                  !snapshotLifecycle.defaultRetentionHours || snapshotLifecycle.defaultRetentionHours <= 0
                    ? '0'
                    : String(snapshotLifecycle.defaultRetentionHours)
                }
                onChange={(e) => {
                  const val = Number(e.target.value);
                  updateSnapshotLifecycle({
                    defaultRetentionHours: val,
                  });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="24">24 小时 (1 天) 后自动删除</option>
                <option value="72">72 小时 (3 天) 后自动删除</option>
                <option value="168">168 小时 (7 天) 后自动删除</option>
                <option value="336">336 小时 (14 天) 后自动删除</option>
                <option value="720">720 小时 (30 天) 后自动删除</option>
                <option value="0">不自动过期 (永久保留)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">单实例最多保留数:</label>
              <select
                value={
                  !snapshotLifecycle.maxSnapshotsPerInstance || snapshotLifecycle.maxSnapshotsPerInstance <= 0
                    ? '0'
                    : String(snapshotLifecycle.maxSnapshotsPerInstance)
                }
                onChange={(e) => {
                  const val = Number(e.target.value);
                  updateSnapshotLifecycle({
                    maxSnapshotsPerInstance: val,
                  });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="1">仅保留最新 1 个快照</option>
                <option value="2">最多保留 2 个快照</option>
                <option value="3">最多保留 3 个快照</option>
                <option value="5">最多保留 5 个快照</option>
                <option value="10">最多保留 10 个快照</option>
                <option value="0">不限制数量</option>
              </select>
            </div>
          </div>

          {/* Protect hibernated base snapshot toggle */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-900/40">
            <div className="flex items-center gap-2 text-emerald-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-[11px]">
                自动保护休眠实例的最新基础镜像（避免误删唯一唤醒源）
              </span>
            </div>
            <input
              type="checkbox"
              checked={snapshotLifecycle.protectLatestHibernatedSnapshot}
              onChange={(e) =>
                updateSnapshotLifecycle({ protectLatestHibernatedSnapshot: e.target.checked })
              }
              className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
            />
          </div>

          {/* Lifecycle Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => runSnapshotCleanup()}
              disabled={cleaningSnapshots}
              className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              {cleaningSnapshots ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在扫描并清理过期快照...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>立即执行过期清理检查</span>
                </>
              )}
            </button>

            <button
              onClick={() => updateSnapshotLifecycle(snapshotLifecycle, true)}
              className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs whitespace-nowrap transition-colors"
              title="将当前默认自动删除时间应用到下方所有现有快照"
            >
              套用默认时长至全部
            </button>
          </div>
        </div>
      )}

      {/* Snapshots List */}
      <div className="space-y-3">
        {snapshots.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40">
            <Camera className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-400">快照库为空</p>
            <p className="text-xs text-slate-500 mt-1">
              在「实例管理」中休眠实例时，系统将自动提取防火墙配置并在此创建安全快照
            </p>
          </div>
        ) : (
          snapshots.map((snap) => {
            const formattedDate = new Date(snap.createdAt).toLocaleString('zh-CN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
            const retentionInfo = formatAutoDeleteRemaining(snap.autoDeleteAt);
            const fwRules = snap.preservedConfig?.firewallRules || [];

            return (
              <div
                key={snap.name}
                className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all space-y-2.5 text-xs"
              >
                {/* Title & Badges */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-white font-mono text-xs break-all">{snap.name}</h3>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Server className="w-3 h-3 text-slate-500" />
                        源实例: {snap.fromInstanceName}
                      </span>
                      {snap.isProtectedHibernatedBase && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 text-[10px] font-medium">
                          休眠唤醒基座·受保护
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="shrink-0 text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                    {snap.state}
                  </span>
                </div>

                {/* Specs */}
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded-xl">
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                    <span>大小: {snap.sizeInGb} GB</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>{formattedDate}</span>
                  </div>
                </div>

                {/* Preserved Firewall Rules & Cloudflare Domain */}
                <div className="space-y-1.5 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/70">
                  {fwRules.length > 0 && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] text-cyan-300 flex items-center gap-1 shrink-0">
                        <Shield className="w-3.5 h-3.5 text-cyan-400" />
                        <span>已绑防火墙 ({fwRules.length}条):</span>
                      </span>
                      <div className="flex flex-wrap justify-end gap-1">
                        {fwRules.map((r, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.2 rounded bg-cyan-950/70 border border-cyan-800/50 text-cyan-200 font-mono text-[10px]"
                          >
                            {r.protocol.toUpperCase()}:{r.fromPort}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {snap.preservedConfig?.cloudflareDomain && (
                    <div className="flex items-center justify-between text-[11px] text-amber-300 pt-1 border-t border-slate-800/60">
                      <span className="flex items-center gap-1">
                        <Globe className="w-3.5 h-3.5 text-amber-400" />
                        <span>绑定域名:</span>
                      </span>
                      <span className="font-mono">{snap.preservedConfig.cloudflareDomain}</span>
                    </div>
                  )}

                  {/* Per-snapshot Auto-Delete Time Config */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 gap-2">
                    <div className="flex items-center gap-1 text-[11px]">
                      <Clock
                        className={`w-3.5 h-3.5 ${
                          retentionInfo.expired
                            ? 'text-rose-400'
                            : snap.autoDeleteAt
                            ? 'text-indigo-400'
                            : 'text-slate-500'
                        }`}
                      />
                      <span
                        className={
                          retentionInfo.expired
                            ? 'text-rose-300 font-medium'
                            : snap.autoDeleteAt
                            ? 'text-indigo-300'
                            : 'text-slate-400'
                        }
                      >
                        {retentionInfo.text}
                      </span>
                    </div>

                    <select
                      value=""
                      disabled={updatingRetentionSnap === snap.name}
                      onChange={(e) => {
                        if (e.target.value) {
                          handleRetentionSelect(snap.name, e.target.value);
                        }
                      }}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-0.5 text-[10px] text-slate-300 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">设置自动删除时间...</option>
                      <option value="permanent">设为永久保留</option>
                      <option value="1">1 小时后自动删除</option>
                      <option value="24">24 小时后自动删除</option>
                      <option value="72">3 天后自动删除</option>
                      <option value="168">7 天后自动删除</option>
                      <option value="336">14 天后自动删除</option>
                      <option value="expire_now_test">设为已过期 (测试自动清理)</option>
                    </select>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-900">
                  <button
                    onClick={() => openRestoreModal(snap)}
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm shadow-emerald-600/30 whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>恢复实例 + 防火墙 + DNS</span>
                  </button>

                  <button
                    onClick={() => handleDelete(snap)}
                    className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-800/60 transition-colors"
                    title="立即删除快照"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

