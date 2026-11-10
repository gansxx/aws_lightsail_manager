/**
 * Android System Status Bar Component
 */

import React, { useState, useEffect } from 'react';
import { Wifi, Signal, BatteryCharging, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const AndroidStatusBar: React.FC = () => {
  const [time, setTime] = useState<string>('09:41');
  const { config } = useApp();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full px-5 pt-2 pb-1.5 flex items-center justify-between text-xs font-semibold text-slate-300 select-none bg-slate-950/80 backdrop-blur-md z-30">
      {/* Left: Time & Simulation indicator */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] tracking-tight text-white">{time}</span>
        {config.mode === 'floci_simulation' && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.2 rounded font-mono">
            <Zap className="w-2.5 h-2.5 text-amber-400" />
            Floci
          </span>
        )}
      </div>

      {/* Center: Punch-hole camera placeholder when in phone frame */}
      <div className="w-3.5 h-3.5 rounded-full bg-slate-900 border border-slate-800/80 mx-auto" />

      {/* Right: Signals & Battery */}
      <div className="flex items-center gap-2 text-slate-400">
        <Signal className="w-3.5 h-3.5" />
        <Wifi className="w-3.5 h-3.5" />
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-slate-300">92%</span>
          <BatteryCharging className="w-4 h-4 text-emerald-400" />
        </div>
      </div>
    </div>
  );
};
