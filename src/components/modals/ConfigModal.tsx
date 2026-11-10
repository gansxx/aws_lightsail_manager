/**
 * Cloud Configuration & Settings Modal
 */

import React, { useState } from 'react';
import {
  Settings,
  Sparkles,
  ShieldCheck,
  Zap,
  Flame,
  Check,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CloudConfig } from '../../types/lightsail';

export const ConfigModal: React.FC = () => {
  const { config, updateConfig, configModalOpen, setConfigModalOpen, resetSimulator, showToast } =
    useApp();

  const [form, setForm] = useState<CloudConfig>(config);

  React.useEffect(() => {
    setForm(config);
  }, [config, configModalOpen]);

  if (!configModalOpen) return null;

  const handleSave = () => {
    updateConfig(form);
    setConfigModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center">
              <Settings className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">云端服务与测试环境配置</h2>
              <p className="text-xs text-slate-400">AWS Lightsail 与 Cloudflare API 凭证管理</p>
            </div>
          </div>
          <button onClick={() => setConfigModalOpen(false)} className="text-slate-400 hover:text-white p-1">
            关闭
          </button>
        </div>

        <div className="space-y-4 my-3.5">
          {/* Service Mode Selector */}
          <div>
            <label className="block font-semibold text-slate-200 mb-2">执行运行模式:</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, mode: 'floci_simulation' }))}
                className={`p-3 rounded-xl border text-left transition-all ${
                  form.mode === 'floci_simulation'
                    ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/40 text-amber-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-white mb-1">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Floci 模拟器 (推荐)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  零云端扣费。内置 Lightsail 与 Cloudflare 状态机，完整测试快照删除、恢复与 DNS 写入。
                </p>
              </button>

              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, mode: 'real_cloud' }))}
                className={`p-3 rounded-xl border text-left transition-all ${
                  form.mode === 'real_cloud'
                    ? 'bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/40 text-emerald-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-white mb-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>真实云端模式</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  直接连接 AWS 账户与 Cloudflare 真实 API，管理线上生产实例。
                </p>
              </button>
            </div>
          </div>

          {/* Floci Simulation Controls */}
          {form.mode === 'floci_simulation' && (
            <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Floci 仿真引擎参数</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    resetSimulator();
                    setConfigModalOpen(false);
                  }}
                  className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>重置模拟数据</span>
                </button>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">仿真响应延迟:</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['instant', 'normal', 'slow'] as const).map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, flociSimulationSpeed: spd }))}
                      className={`py-1.5 rounded-lg border text-center font-medium capitalize transition-colors ${
                        form.flociSimulationSpeed === spd
                          ? 'bg-amber-600/30 border-amber-500 text-amber-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {spd === 'instant' ? '极速 (50ms)' : spd === 'normal' ? '标准 (200ms)' : '慢速 (600ms)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fault Injections */}
              <div className="pt-2 border-t border-amber-900/40">
                <span className="block text-slate-400 mb-1.5 font-medium flex items-center gap-1 text-[11px]">
                  <Flame className="w-3.5 h-3.5 text-rose-400" />
                  <span>故障排查测试 / 异常注入 (测试容错能力):</span>
                </span>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.simulateFaults.awsThrottle}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          simulateFaults: { ...prev.simulateFaults, awsThrottle: e.target.checked },
                        }))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                    />
                    <span>模拟 AWS API 限流错误 (HTTP 429 TooManyRequests)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.simulateFaults.snapshotTimeout}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          simulateFaults: { ...prev.simulateFaults, snapshotTimeout: e.target.checked },
                        }))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                    />
                    <span>模拟创建快照超时异常 (HTTP 504 Gateway Timeout)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.simulateFaults.cloudflareError}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          simulateFaults: { ...prev.simulateFaults, cloudflareError: e.target.checked },
                        }))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                    />
                    <span>模拟 Cloudflare API 鉴权/冲突错误 (Code 10000 / 81044)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* AWS Credentials */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
            <span className="font-semibold text-white block">AWS Lightsail 访问凭证</span>
            <div className="space-y-2">
              <div>
                <label className="block text-slate-400 mb-1">AWS Access Key ID:</label>
                <input
                  type="text"
                  value={form.awsAccessKeyId}
                  onChange={(e) => setForm((prev) => ({ ...prev, awsAccessKeyId: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-white text-xs"
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">AWS Secret Access Key:</label>
                <input
                  type="password"
                  value={form.awsSecretAccessKey}
                  onChange={(e) => setForm((prev) => ({ ...prev, awsSecretAccessKey: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-white text-xs"
                  placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">默认 AWS 区域 (Region):</label>
                <select
                  value={form.awsRegion}
                  onChange={(e) => setForm((prev) => ({ ...prev, awsRegion: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                >
                  <option value="ap-northeast-1">亚太东北（东京 ap-northeast-1）</option>
                  <option value="ap-southeast-1">亚太东南（新加坡 ap-southeast-1）</option>
                  <option value="ap-northeast-2">亚太东北（首尔 ap-northeast-2）</option>
                  <option value="us-west-2">美国西部（俄勒冈 us-west-2）</option>
                  <option value="us-east-1">美国东部（弗吉尼亚 us-east-1）</option>
                  <option value="eu-central-1">欧洲（法兰克福 eu-central-1）</option>
                </select>
              </div>
            </div>
          </div>

          {/* Cloudflare Credentials */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
            <span className="font-semibold text-white block">Cloudflare API 访问凭证</span>
            <div className="space-y-2">
              <div>
                <label className="block text-slate-400 mb-1">Cloudflare API Token:</label>
                <input
                  type="password"
                  value={form.cloudflareApiToken}
                  onChange={(e) => setForm((prev) => ({ ...prev, cloudflareApiToken: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-white text-xs"
                  placeholder="需具备 Zone.DNS 写入权限的 API Token"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Zone ID (区域 ID):</label>
                  <input
                    type="text"
                    value={form.cloudflareZoneId}
                    onChange={(e) => setForm((prev) => ({ ...prev, cloudflareZoneId: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-white text-xs"
                    placeholder="cf-zone-xxx"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">默认解析域名:</label>
                  <input
                    type="text"
                    value={form.defaultDnsRecordName}
                    onChange={(e) => setForm((prev) => ({ ...prev, defaultDnsRecordName: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-white text-xs"
                    placeholder="vpn.mydomain.dev"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-end gap-2.5">
          <button
            onClick={() => setConfigModalOpen(false)}
            className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
          >
            <Check className="w-3.5 h-3.5" />
            <span>保存配置</span>
          </button>
        </div>
      </div>
    </div>
  );
};
