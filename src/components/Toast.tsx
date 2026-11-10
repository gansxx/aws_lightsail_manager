/**
 * Android SnackBar Toast Notifications
 */

import React from 'react';
import { CheckCircle2, AlertCircle, Info, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const ToastContainer: React.FC = () => {
  const { toasts } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="absolute bottom-20 left-4 right-4 z-50 flex flex-col gap-2 pointer-events-none select-none">
      {toasts.map((toast) => {
        let Icon = Info;
        let bgStyle = 'bg-slate-800 text-slate-100 border-slate-700';

        if (toast.type === 'success') {
          Icon = CheckCircle2;
          bgStyle = 'bg-emerald-950/90 text-emerald-200 border-emerald-800/80';
        } else if (toast.type === 'error') {
          Icon = XCircle;
          bgStyle = 'bg-rose-950/90 text-rose-200 border-rose-800/80';
        } else if (toast.type === 'warning') {
          Icon = AlertCircle;
          bgStyle = 'bg-amber-950/90 text-amber-200 border-amber-800/80';
        }

        return (
          <div
            key={toast.id}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md text-xs font-medium animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto ${bgStyle}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 leading-snug">{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
};
