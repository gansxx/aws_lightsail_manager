/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
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

const AppContent: React.FC = () => {
  const { activeTab } = useApp();

  return (
    <AndroidFrame>
      {/* Tab Switcher */}
      {activeTab === 'instances' && <InstancesTab />}
      {activeTab === 'snapshots' && <SnapshotsTab />}
      {activeTab === 'automation' && <AutomationTab />}
      {activeTab === 'debug' && <DebugTab />}

      {/* Global Modals & Sheets */}
      <HibernateModal />
      <RestoreModal />
      <ScheduleModal />
      <ConfigModal />
      <ToastContainer />
    </AndroidFrame>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
