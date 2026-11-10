/**
 * Android Material 3 Bottom Navigation Bar
 */

import React from 'react';
import { Server, Camera, Clock, Terminal } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const AndroidBottomNav: React.FC = () => {
  const { activeTab, setActiveTab, instances, snapshots, apiLogs } = useApp();

  const activeInstancesCount = instances.filter((i) => i.state === 'running').length;
  const snapshotsCount = snapshots.length;
  const errorLogsCount = apiLogs.filter((l) => !l.success).length;

  const tabs = [
    {
      id: 'instances' as const,
      label: '实例管理',
      icon: Server,
      badge: activeInstancesCount > 0 ? `${activeInstancesCount}` : undefined,
      badgeColor: 'bg-emerald-500',
    },
    {
      id: 'snapshots' as const,
      label: '休眠快照',
      icon: Camera,
      badge: snapshotsCount > 0 ? `${snapshotsCount}` : undefined,
      badgeColor: 'bg-indigo-500',
    },
    {
      id: 'automation' as const,
      label: '定时任务',
      icon: Clock,
      badge: undefined,
    },
    {
      id: 'debug' as const,
      label: '调试排查',
      icon: Terminal,
      badge: errorLogsCount > 0 ? `${errorLogsCount}` : undefined,
      badgeColor: 'bg-rose-500',
    },
  ];

  return (
    <nav className="w-full bg-slate-900/95 backdrop-blur-lg border-t border-slate-800/80 px-2 py-1.5 flex items-center justify-around z-30 select-none">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 transition-all group focus:outline-none"
          >
            {/* Active Pill Container */}
            <div
              className={`relative px-4 py-1 rounded-full flex items-center justify-center transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-600/30 text-indigo-400 ring-1 ring-indigo-500/50'
                  : 'text-slate-400 group-hover:text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 text-indigo-400' : ''}`} />

              {/* Badge */}
              {tab.badge && (
                <span
                  className={`absolute -top-1 -right-1 text-[10px] font-bold text-white px-1.5 py-0.2 rounded-full ring-2 ring-slate-900 ${
                    tab.badgeColor || 'bg-indigo-500'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </div>

            {/* Label */}
            <span
              className={`text-[11px] font-medium tracking-tight mt-1 transition-colors ${
                isActive ? 'text-indigo-400 font-semibold' : 'text-slate-400 group-hover:text-slate-300'
              }`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
