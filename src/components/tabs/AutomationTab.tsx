/**
 * Automation Tab: Scheduled lifecycle management & automation execution log
 */

import React from 'react';
import {
  Clock,
  Moon,
  Sun,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  Trash2,
  Sliders,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { schedulerService } from '../../services/scheduler';

export const AutomationTab: React.FC = () => {
  const {
    instances,
    openScheduleModal,
    scheduleHistory,
    triggerTestHibernateSchedule,
    triggerTestStartSchedule,
  } = useApp();

  const handleClearHistory = () => {
    schedulerService.clearHistory();
  };

  return (
    <div className="p-4 space-y-4 pb-24 text-xs">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white tracking-tight">定时自动化调度</h2>
        <p className="text-slate-400">设置定时休眠省钱与自动唤醒，支持在 Floci 模拟器中即时测试</p>
      </div>

      {/* Scheduler Daemon Heartbeat Card */}
      <div className="p-3.5 rounded-2xl bg-indigo-950/20 border border-indigo-900/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
          <div>
            <span className="font-semibold text-white block">调度守护引擎在线</span>
            <span className="text-[11px] text-slate-400">检测周期: 每 30 秒轮询一次任务队列</span>
          </div>
        </div>
        <span className="text-[11px] text-indigo-300 bg-indigo-950/80 border border-indigo-800/60 px-2 py-0.5 rounded font-mono">
          Daemon Active
        </span>
      </div>

      {/* Instance Automation Rules List */}
      <div className="space-y-3">
        <h3 className="font-bold text-white text-xs flex items-center justify-between">
          <span>实例调度策略配置</span>
          <span className="text-slate-400 font-normal">点击卡片可调整计划时间</span>
        </h3>

        {instances.map((inst) => {
          const hasHibernate = inst.autoHibernateSchedule?.enabled;
          const hasStart = inst.autoStartSchedule?.enabled;

          return (
            <div
              key={inst.name}
              className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3"
            >
              {/* Instance Title */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-white font-mono text-sm block">{inst.name}</span>
                  <span className="text-[11px] text-slate-400">
                    当前状态:{' '}
                    <strong
                      className={
                        inst.state === 'running'
                          ? 'text-emerald-400'
                          : inst.state === 'hibernated'
                          ? 'text-indigo-400'
                          : 'text-slate-400'
                      }
                    >
                      {inst.state === 'running'
                        ? '运行中'
                        : inst.state === 'hibernated'
                        ? '已休眠'
                        : inst.state}
                    </strong>
                  </span>
                </div>

                <button
                  onClick={() => openScheduleModal(inst)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 text-slate-300 hover:text-white border border-slate-800 flex items-center gap-1.5 transition-colors"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>编辑规则</span>
                </button>
              </div>

              {/* Rules Summary */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {/* Auto Hibernate box */}
                <div
                  className={`p-2 rounded-xl border ${
                    hasHibernate
                      ? 'bg-indigo-950/30 border-indigo-800/40 text-indigo-200'
                      : 'bg-slate-900/40 border-slate-800/60 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-1 font-semibold mb-0.5">
                    <Moon className="w-3 h-3 text-indigo-400" />
                    <span>自动休眠</span>
                  </div>
                  {hasHibernate ? (
                    <div>
                      <span className="font-mono text-white text-xs">
                        {inst.autoHibernateSchedule?.time}
                      </span>
                      <span className="block text-[10px] text-slate-400">保存快照并终止实例</span>
                    </div>
                  ) : (
                    <span>未开启</span>
                  )}
                </div>

                {/* Auto Start box */}
                <div
                  className={`p-2 rounded-xl border ${
                    hasStart
                      ? 'bg-amber-950/30 border-amber-800/40 text-amber-200'
                      : 'bg-slate-900/40 border-slate-800/60 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-1 font-semibold mb-0.5">
                    <Sun className="w-3 h-3 text-amber-400" />
                    <span>自动启动</span>
                  </div>
                  {hasStart ? (
                    <div>
                      <span className="font-mono text-white text-xs">
                        {inst.autoStartSchedule?.time}
                      </span>
                      <span className="block text-[10px] text-slate-400">从快照唤醒并更新 DNS</span>
                    </div>
                  ) : (
                    <span>未开启</span>
                  )}
                </div>
              </div>

              {/* Instant Test Action Trigger Buttons */}
              <div className="pt-2 border-t border-slate-900 flex items-center gap-2">
                <button
                  onClick={() => triggerTestHibernateSchedule(inst)}
                  disabled={inst.state !== 'running'}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 disabled:opacity-40 text-indigo-300 border border-indigo-800/50 flex items-center justify-center gap-1 text-[11px] transition-colors"
                >
                  <Play className="w-3 h-3" />
                  <span>模拟立即休眠</span>
                </button>

                <button
                  onClick={() => triggerTestStartSchedule(inst)}
                  disabled={inst.state !== 'hibernated'}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 disabled:opacity-40 text-amber-300 border border-amber-800/50 flex items-center justify-center gap-1 text-[11px] transition-colors"
                >
                  <Play className="w-3 h-3" />
                  <span>模拟立即唤醒</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Execution History */}
      <div className="space-y-2.5 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-xs">调度执行历史记录</h3>
          {scheduleHistory.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="text-slate-400 hover:text-rose-400 flex items-center gap-1 text-[11px]"
            >
              <Trash2 className="w-3 h-3" />
              <span>清空记录</span>
            </button>
          )}
        </div>

        {scheduleHistory.length === 0 ? (
          <div className="text-center py-8 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 text-slate-500">
            暂无历史执行记录
          </div>
        ) : (
          <div className="space-y-2">
            {scheduleHistory.map((rec) => {
              const isSuccess = rec.status === 'success';
              const formattedTime = new Date(rec.timestamp).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <div
                  key={rec.id}
                  className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                    isSuccess
                      ? 'bg-slate-950/80 border-slate-800'
                      : 'bg-rose-950/20 border-rose-900/40 text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-white">
                      {rec.type === 'AUTO_HIBERNATE' ? (
                        <Moon className="w-3.5 h-3.5 text-indigo-400" />
                      ) : (
                        <Sun className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      <span>{rec.instanceName}</span>
                      <span className="text-[10px] text-slate-400 font-normal">({rec.type})</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-slate-500">{formattedTime}</span>
                      {isSuccess ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-snug">{rec.message}</p>

                  {rec.newIp && (
                    <div className="text-[10px] font-mono text-emerald-400 pt-0.5">
                      新获得公网 IP: {rec.newIp}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
