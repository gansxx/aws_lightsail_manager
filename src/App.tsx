/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { AndroidFrame } from './components/AndroidFrame';
import { InstancesTab } from './components/tabs/InstancesTab';
import { SnapshotsTab } from './components/tabs/SnapshotsTab';
import { AutomationTab } from './components/tabs/AutomationTab';
import { DebugTab } from './components/tabs/DebugTab';
import { HibernateModal } from './components/modals/HibernateModal';
import { RestoreModal } from './components/modals/RestoreModal';
import { ScheduleModal } from './components/modals/ScheduleModal';
import { ConfigModal } from './components/modals/ConfigModal';
import { ToastContainer } from './components/Toast';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; onReset?: () => void }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || String(error),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Caught runtime error:', error, info);
  }

  handleRecover = () => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onReset?.();
  };

  handleHardReset = () => {
    try {
      localStorage.removeItem('lightsail_cloud_config');
    } catch {}
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-5 m-4 rounded-2xl bg-slate-900 border border-rose-800/60 text-slate-200 space-y-3 text-xs">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>界面组件渲染保护已触发</span>
          </div>
          <p className="text-slate-400 leading-relaxed">
            已拦截一处运行时异常以防止 Android WebView 灰屏，您可以点击下方按钮立即恢复界面：
          </p>
          <pre className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-rose-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
            {this.state.errorMessage}
          </pre>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={this.handleRecover}
              className="px-4 py-2 min-h-[40px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>立即恢复界面</span>
            </button>
            <button
              type="button"
              onClick={this.handleHardReset}
              className="px-3 py-2 min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            >
              清理配置缓存并恢复
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  const { activeTab, setActiveTab, setConfigModalOpen } = useApp();

  return (
    <>
      <AndroidFrame>
        <AppErrorBoundary onReset={() => setActiveTab('instances')}>
          {activeTab === 'instances' && <InstancesTab />}
          {activeTab === 'snapshots' && <SnapshotsTab />}
          {activeTab === 'automation' && <AutomationTab />}
          {activeTab === 'debug' && <DebugTab />}
        </AppErrorBoundary>
      </AndroidFrame>

      {/* Global Modals & Sheets rendered at Root Level outside scroll containers */}
      <AppErrorBoundary onReset={() => setConfigModalOpen(false)}>
        <HibernateModal />
        <RestoreModal />
        <ScheduleModal />
        <ConfigModal />
        <ToastContainer />
      </AppErrorBoundary>
    </>
  );
};

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AppErrorBoundary>
  );
}
