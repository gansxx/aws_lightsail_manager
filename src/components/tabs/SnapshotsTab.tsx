/**
 * Snapshots Tab: View, restore and manage AWS Lightsail instance snapshots
 */

import React from 'react';
import { Camera, RotateCcw, Trash2, HardDrive, Calendar, Server, Globe, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LightsailSnapshot } from '../../types/lightsail';

export const SnapshotsTab: React.FC = () => {
  const { snapshots, openRestoreModal, deleteSnapshot } = useApp();

  const totalGb = snapshots.reduce((acc, s) => acc + s.sizeInGb, 0);
  const monthlyCost = (totalGb * 0.05).toFixed(2);

  const handleDelete = (snap: LightsailSnapshot) => {
    if (confirm(`确定要永久删除快照 ${snap.name} 吗？`)) {
      deleteSnapshot(snap.name);
    }
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Top Header */}
      <div>
        <h2 className="text-lg font-bold text-white tracking-tight">休眠快照库</h2>
        <p className="text-xs text-slate-400">实例休眠时保存的完整系统快照，支持一键恢复与 DNS 同步</p>
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

      {/* Snapshots List */}
      <div className="space-y-3">
        {snapshots.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40">
            <Camera className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-400">快照库为空</p>
            <p className="text-xs text-slate-500 mt-1">
              在「实例管理」中休眠实例时，系统将自动在此创建安全快照
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

            return (
              <div
                key={snap.name}
                className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all space-y-2.5 text-xs"
              >
                {/* Title & Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-white font-mono text-xs break-all">{snap.name}</h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                      <Server className="w-3 h-3 text-slate-500" />
                      <span>源实例: {snap.fromInstanceName}</span>
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

                {/* Preserved cloudflare domain */}
                {snap.preservedConfig?.cloudflareDomain && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
                    <Globe className="w-3.5 h-3.5 text-amber-400" />
                    <span>绑定域名: {snap.preservedConfig.cloudflareDomain}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-900">
                  <button
                    onClick={() => openRestoreModal(snap)}
                    className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm shadow-emerald-600/30"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>从快照快速恢复 & 同步 DNS</span>
                  </button>

                  <button
                    onClick={() => handleDelete(snap)}
                    className="p-1.5 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-800/60 transition-colors"
                    title="删除快照"
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
