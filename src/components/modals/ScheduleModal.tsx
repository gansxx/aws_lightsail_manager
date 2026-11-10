/**
 * Schedule Configuration Modal
 * Sets up auto-hibernate & auto-start schedules per instance
 */

import React, { useState, useEffect } from 'react';
import { Clock, Moon, Sun, Play, Check, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { flociSimulator } from '../../services/flociSimulator';

const DAYS = [
  { val: 1, label: '周一' },
  { val: 2, label: '周二' },
  { val: 3, label: '周三' },
  { val: 4, label: '周四' },
  { val: 5, label: '周五' },
  { val: 6, label: '周六' },
  { val: 0, label: '周日' },
];

export const ScheduleModal: React.FC = () => {
  const {
    scheduleModal,
    closeScheduleModal,
    refreshData,
    showToast,
    triggerTestHibernateSchedule,
    triggerTestStartSchedule,
  } = useApp();
  const { isOpen, instance } = scheduleModal;

  // Auto Hibernate state
  const [hibernateEnabled, setHibernateEnabled] = useState<boolean>(false);
  const [hibernateTime, setHibernateTime] = useState<string>('23:00');
  const [hibernateDays, setHibernateDays] = useState<number[]>([1, 2, 3, 4, 5]);

  // Auto Start state
  const [startEnabled, setStartEnabled] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<string>('08:30');
  const [startDays, setStartDays] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => {
    if (instance) {
      setHibernateEnabled(!!instance.autoHibernateSchedule?.enabled);
      setHibernateTime(instance.autoHibernateSchedule?.time || '23:00');
      setHibernateDays(instance.autoHibernateSchedule?.daysOfWeek || [1, 2, 3, 4, 5]);

      setStartEnabled(!!instance.autoStartSchedule?.enabled);
      setStartTime(instance.autoStartSchedule?.time || '08:30');
      setStartDays(instance.autoStartSchedule?.daysOfWeek || [1, 2, 3, 4, 5]);
    }
  }, [instance]);

  if (!isOpen || !instance) return null;

  const toggleHibernateDay = (day: number) => {
    setHibernateDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const toggleStartDay = (day: number) => {
    setStartDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleSave = () => {
    flociSimulator.updateInstanceSchedules(
      instance.name,
      {
        enabled: hibernateEnabled,
        time: hibernateTime,
        daysOfWeek: hibernateDays,
      },
      {
        enabled: startEnabled,
        time: startTime,
        daysOfWeek: startDays,
      }
    );
    refreshData();
    showToast(`实例 ${instance.name} 的定时任务已保存`, 'success');
    closeScheduleModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">配置生命周期定时任务</h2>
              <p className="text-xs text-slate-400 font-mono">{instance.name}</p>
            </div>
          </div>
          <button onClick={closeScheduleModal} className="text-slate-400 hover:text-white p-1">
            关闭
          </button>
        </div>

        <div className="space-y-4 my-3.5">
          {/* Section 1: Auto Hibernate */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-300 font-semibold text-sm">
                <Moon className="w-4 h-4 text-indigo-400" />
                <span>夜间 / 定时自动休眠 (保存快照后删除)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={hibernateEnabled}
                  onChange={(e) => setHibernateEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <p className="text-slate-400 text-[11px]">
              到达指定时间时，自动创建最新系统快照并安全删除 Lightsail 计算实例，节省闲时算力费用。
            </p>

            {hibernateEnabled && (
              <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-medium">执行时间:</span>
                  <input
                    type="time"
                    value={hibernateTime}
                    onChange={(e) => setHibernateTime(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono text-sm"
                  />
                </div>

                <div>
                  <span className="block text-slate-400 mb-1.5">生效周期:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((d) => {
                      const selected = hibernateDays.includes(d.val);
                      return (
                        <button
                          key={d.val}
                          type="button"
                          onClick={() => toggleHibernateDay(d.val)}
                          className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                            selected
                              ? 'bg-indigo-600 text-white border-indigo-500'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Instant Test trigger */}
                {instance.state === 'running' && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        closeScheduleModal();
                        triggerTestHibernateSchedule(instance);
                      }}
                      className="w-full py-1.5 px-3 rounded-lg bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 hover:bg-indigo-900/60 transition-colors flex items-center justify-center gap-1.5 text-xs"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>立即测试运行自动休眠任务</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Auto Start */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                <Sun className="w-4 h-4 text-amber-400" />
                <span>早晨 / 定时自动启动 (快照恢复 & DNS 同步)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={startEnabled}
                  onChange={(e) => setStartEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
              </label>
            </div>

            <p className="text-slate-400 text-[11px]">
              到达指定时间时，自动从最新快照唤醒实例，并自动将全新分配的公网 IP 写入 Cloudflare DNS。
            </p>

            {startEnabled && (
              <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-medium">执行时间:</span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono text-sm"
                  />
                </div>

                <div>
                  <span className="block text-slate-400 mb-1.5">生效周期:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((d) => {
                      const selected = startDays.includes(d.val);
                      return (
                        <button
                          key={d.val}
                          type="button"
                          onClick={() => toggleStartDay(d.val)}
                          className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                            selected
                              ? 'bg-amber-600 text-white border-amber-500'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Instant Test trigger */}
                {instance.state === 'hibernated' && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        closeScheduleModal();
                        triggerTestStartSchedule(instance);
                      }}
                      className="w-full py-1.5 px-3 rounded-lg bg-amber-950/60 border border-amber-800/60 text-amber-300 hover:bg-amber-900/60 transition-colors flex items-center justify-center gap-1.5 text-xs"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>立即测试运行自动唤醒任务</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-end gap-2.5">
          <button
            onClick={closeScheduleModal}
            className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
          >
            <Check className="w-3.5 h-3.5" />
            <span>保存定时策略</span>
          </button>
        </div>
      </div>
    </div>
  );
};
