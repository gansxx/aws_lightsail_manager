/**
 * Android Device Frame & Layout Wrapper
 * Supports Authentic Google Pixel phone mockup and responsive desktop expansion
 */

import React from 'react';
import { Smartphone, Monitor, Settings, RefreshCw, Sparkles, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AndroidStatusBar } from './AndroidStatusBar';
import { AndroidBottomNav } from './AndroidBottomNav';

export const AndroidFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    viewMode,
    setViewMode,
    config,
    setConfigModalOpen,
    refreshData,
    loading,
    instances,
    resetSimulator,
  } = useApp();

  const hibernatedCount = instances.filter((i) => i.state === 'hibernated').length;
  const runningCount = instances.filter((i) => i.state === 'running').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Banner Toolbar (Outer frame controls) */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 py-2.5 flex items-center justify-between text-xs select-none sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              <span>Lightsail Manager</span>
              <span className="text-[11px] font-normal text-indigo-400 bg-indigo-950/80 border border-indigo-800/60 px-1.5 py-0.5 rounded">
                Android App
              </span>
            </h1>
          </div>

          <div className="hidden md:flex items-center gap-3 text-slate-400 pl-3 border-l border-slate-800">
            <span>运行中: <strong className="text-emerald-400 font-mono">{runningCount}</strong></span>
            <span>已休眠省钱: <strong className="text-indigo-400 font-mono">{hibernatedCount}</strong></span>
            <span>每月预估省: <strong className="text-amber-400 font-mono">${(hibernatedCount * 5.0).toFixed(1)}/mo</strong></span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Simulation / Real badge */}
          {config.mode === 'floci_simulation' ? (
            <button
              onClick={() => setConfigModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors"
              title="使用 Floci 模拟 AWS 与 Cloudflare API，零费用放心测试"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Floci 模拟器</span>
            </button>
          ) : (
            <button
              onClick={() => setConfigModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">真实 AWS & CF 模式</span>
            </button>
          )}

          {/* Reset button for simulator */}
          {config.mode === 'floci_simulation' && (
            <button
              onClick={resetSimulator}
              className="hidden lg:flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors text-[11px]"
              title="重置模拟器到初始演示状态"
            >
              重置数据
            </button>
          )}

          {/* Refresh Data */}
          <button
            onClick={() => refreshData()}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none"
            title="刷新状态"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          {/* Settings */}
          <button
            onClick={() => setConfigModalOpen(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none"
            title="设置凭证与服务模式"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setViewMode('android_frame')}
              className={`p-1.5 rounded flex items-center gap-1 transition-colors ${
                viewMode === 'android_frame'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="手机框架视图 (Google Pixel 8)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="text-[11px] hidden xl:inline">手机模式</span>
            </button>
            <button
              onClick={() => setViewMode('responsive')}
              className={`p-1.5 rounded flex items-center gap-1 transition-colors ${
                viewMode === 'responsive'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="宽屏响应式视图"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="text-[11px] hidden xl:inline">宽屏视图</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-0 md:p-6 lg:p-8 bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950 overflow-auto">
        {viewMode === 'android_frame' ? (
          /* Android Physical Phone Frame (Pixel 8 style) */
          <div className="relative my-auto w-full max-w-[420px] h-[870px] max-h-[92vh] bg-slate-950 rounded-[44px] shadow-2xl shadow-indigo-950/40 ring-1 ring-slate-800/90 flex flex-col overflow-hidden border-[7px] border-slate-800">
            {/* Top Phone Speaker grill */}
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-16 h-1 bg-slate-800 rounded-full z-40" />

            {/* Android System Status Bar */}
            <AndroidStatusBar />

            {/* Scrollable Screen Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden relative flex flex-col bg-slate-900">
              {children}
            </div>

            {/* Android Bottom Navigation */}
            <AndroidBottomNav />

            {/* Android Home Navigation Gesture Bar */}
            <div className="w-full bg-slate-900 py-1.5 flex justify-center items-center select-none z-30">
              <div className="w-28 h-1 bg-slate-600 rounded-full opacity-80" />
            </div>
          </div>
        ) : (
          /* Responsive Desktop View */
          <div className="w-full max-w-5xl h-[88vh] bg-slate-900 rounded-2xl shadow-xl border border-slate-800 flex flex-col overflow-hidden">
            <AndroidStatusBar />
            <div className="flex-1 overflow-y-auto overflow-x-hidden relative bg-slate-900">
              {children}
            </div>
            <AndroidBottomNav />
          </div>
        )}
      </main>
    </div>
  );
};
