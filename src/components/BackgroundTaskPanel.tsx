/**
 * Non-Blocking Background Task Queue Banner & Expandable Progress Drawer
 * Allows users to monitor long-running AWS operations (Snapshot creation, Instance restore, Manual release)
 * without blocking the main UI window.
 */

import React from 'react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Layers,
  Flame,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const BackgroundTaskPanel: React.FC = () => {
  const {
    backgroundTasks,
    taskDrawerOpen,
    setTaskDrawerOpen,
    clearCompletedBackgroundTasks,
    executeManualReleaseInstance,
    instanceActionLoading,
  } = useApp();

  if (backgroundTasks.length === 0) return null;

  const runningTasks = backgroundTasks.filter((t) => t.status === 'running');
  const completedCount = backgroundTasks.filter((t) => t.status !== 'running').length;
  const primaryRunning = runningTasks[0] || backgroundTasks[0];

  return (
    <div className="mx-3.5 mt-3 rounded-2xl border border-indigo-800/60 bg-slate-950/95 shadow-lg shadow-indigo-950/30 overflow-hidden text-xs">
      {/* Compact Top Summary Bar (Always visible when tasks exist) */}
      <div
        onClick={() => setTaskDrawerOpen(!taskDrawerOpen)}
        className="px-3.5 py-2.5 flex items-center justify-between gap-2 cursor-pointer bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-950 hover:from-indigo-950/80 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {runningTasks.length > 0 ? (
            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center shrink-0">
              <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
            </div>
          ) : primaryRunning.status === 'completed' ? (
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          ) : (
            <div className="w-6 h-6 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white truncate">
                {runningTasks.length > 0
                  ? `后台任务队列运行中 (${runningTasks.length})`
                  : `后台任务队列 (${backgroundTasks.length})`}
              </span>
              {runningTasks.length > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-mono text-[10px]">
                  {primaryRunning.progressPercent}%
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {primaryRunning.title}: {primaryRunning.currentStepTitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {completedCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearCompletedBackgroundTasks();
              }}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1"
              title="清理已完成或失败的任务记录"
            >
              <Trash2 className="w-3 h-3" />
              <span>清理记录</span>
            </button>
          )}
          <span className="p-1 text-slate-400 hover:text-white">
            {taskDrawerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </div>
      </div>

      {/* Progress Bar Strip for active task */}
      {runningTasks.length > 0 && (
        <div className="w-full h-1 bg-slate-900">
          <div
            className="h-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${Math.max(8, primaryRunning.progressPercent)}%` }}
          />
        </div>
      )}

      {/* Expanded Task Queue Details */}
      {taskDrawerOpen && (
        <div className="p-3 space-y-2.5 border-t border-slate-800/80 max-h-72 overflow-y-auto bg-slate-950/90">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>服务端异步队列（关闭弹窗或刷新页面不会中断云端执行）</span>
            </span>
          </div>

          {backgroundTasks.map((task) => {
            const isRunning = task.status === 'running';
            const isCompleted = task.status === 'completed';
            const isReleasing = instanceActionLoading === task.instanceName;

            return (
              <div
                key={task.id}
                className={`p-3 rounded-xl border space-y-2 ${
                  isRunning
                    ? 'bg-indigo-950/20 border-indigo-800/50'
                    : isCompleted
                    ? 'bg-emerald-950/15 border-emerald-900/40'
                    : 'bg-rose-950/20 border-rose-900/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    {isRunning ? (
                      <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
                    ) : isCompleted ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    )}
                    <span>{task.title}</span>
                    {task.snapshotName && (
                      <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-800/50">
                        {task.snapshotName}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(task.updatedAt).toLocaleTimeString('zh-CN')}
                  </span>
                </div>

                {/* Step Breakdown */}
                <div className="space-y-1 pl-1">
                  {task.steps.map((s) => (
                    <div key={s.id} className="flex items-start gap-2 text-[11px]">
                      <span className="mt-0.5 shrink-0">
                        {s.status === 'completed' ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : s.status === 'running' ? (
                          <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                        ) : s.status === 'error' ? (
                          <XCircle className="w-3 h-3 text-rose-400" />
                        ) : (
                          <span className="inline-block w-3 h-3 rounded-full border border-slate-700" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span
                          className={`font-medium ${
                            s.status === 'completed'
                              ? 'text-emerald-300'
                              : s.status === 'running'
                              ? 'text-indigo-200'
                              : s.status === 'error'
                              ? 'text-rose-300'
                              : 'text-slate-500'
                          }`}
                        >
                          {s.title}
                        </span>
                        <p className="text-[10px] text-slate-400 break-words">{s.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Emergency Manual Release Button if Hibernate task is waiting or failed */}
                {task.type === 'hibernate' && (isRunning || task.status === 'failed') && (
                  <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400">
                      若无需等待新快照或需立即停止计费:
                    </span>
                    <button
                      type="button"
                      disabled={isReleasing}
                      onClick={() => executeManualReleaseInstance(task.instanceName, true)}
                      className="px-2.5 py-1 rounded-lg bg-rose-600/25 hover:bg-rose-600/40 text-rose-200 border border-rose-500/40 text-[11px] font-medium flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                    >
                      {isReleasing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Flame className="w-3 h-3 text-rose-400" />
                      )}
                      <span>手动立即释放实例</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
