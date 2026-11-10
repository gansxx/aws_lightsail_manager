/**
 * Fast Restore from Snapshot Modal with Cloudflare DNS Auto-Update
 */

import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  Globe,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Server,
  ArrowRight,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { OperationStep, CloudflareDnsRecord } from '../../types/lightsail';

export const RestoreModal: React.FC = () => {
  const { restoreModal, closeRestoreModal, snapshots, executeRestore, showToast, config } = useApp();
  const { isOpen, snapshot, instance } = restoreModal;

  const [selectedSnapshotName, setSelectedSnapshotName] = useState<string>('');
  const [targetInstanceName, setTargetInstanceName] = useState<string>('');
  const [selectedBundleId, setSelectedBundleId] = useState<string>('micro_2_0');
  const [availabilityZone, setAvailabilityZone] = useState<string>('ap-northeast-1a');

  // Cloudflare settings
  const [cfEnabled, setCfEnabled] = useState<boolean>(true);
  const [cfDomain, setCfDomain] = useState<string>('');
  const [cfZoneId, setCfZoneId] = useState<string>('');
  const [cfProxied, setCfProxied] = useState<boolean>(false);

  // Execution state
  const [inProgress, setInProgress] = useState<boolean>(false);
  const [steps, setSteps] = useState<OperationStep[]>([
    { id: '1', title: '从快照重建 Lightsail 实例', description: '调用 AWS API 恢复计算资源与系统镜像', status: 'pending' },
    { id: '2', title: '等待分配公网 IP 地址', description: '等待 AWS 网络栈就绪并分配全新公网 IPv4', status: 'pending' },
    { id: '3', title: '更新 Cloudflare DNS 记录', description: '调用 Cloudflare v4 API 写入新的公网 IP', status: 'pending' },
    { id: '4', title: '服务就绪与连通性验证', description: '完成全链路网络解析与就绪检查', status: 'pending' },
  ]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [restoredIp, setRestoredIp] = useState<string | null>(null);
  const [done, setDone] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const snap = snapshot || snapshots[0];
      const instName = instance ? instance.name : snap ? snap.fromInstanceName : 'lightsail-instance-1';
      setSelectedSnapshotName(snap ? snap.name : '');
      setTargetInstanceName(instName);
      setSelectedBundleId(snap?.fromBundleId || instance?.bundleId || 'micro_2_0');
      setAvailabilityZone(instance?.location.availabilityZone || 'ap-northeast-1a');

      // Setup Cloudflare initial values
      const initialDomain =
        instance?.cloudflareBinding?.domain ||
        snap?.preservedConfig?.cloudflareDomain ||
        config.defaultDnsRecordName ||
        'vpn.mydomain.dev';
      const initialZoneId =
        instance?.cloudflareBinding?.zoneId ||
        config.cloudflareZoneId ||
        'cf-zone-983b8a1e2f';
      const initialProxied = instance?.cloudflareBinding?.proxied ?? false;

      setCfEnabled(true);
      setCfDomain(initialDomain);
      setCfZoneId(initialZoneId);
      setCfProxied(initialProxied);

      setInProgress(false);
      setErrorMsg(null);
      setRestoredIp(null);
      setDone(false);
      setSteps([
        { id: '1', title: '从快照重建 Lightsail 实例', description: '调用 AWS API 恢复计算资源与系统镜像', status: 'pending' },
        { id: '2', title: '等待分配公网 IP 地址', description: '等待 AWS 网络栈就绪并分配全新公网 IPv4', status: 'pending' },
        { id: '3', title: '更新 Cloudflare DNS 记录', description: '调用 Cloudflare v4 API 写入新的公网 IP', status: 'pending' },
        { id: '4', title: '服务就绪与连通性验证', description: '完成全链路网络解析与就绪检查', status: 'pending' },
      ]);
    }
  }, [isOpen, snapshot, instance, snapshots, config]);

  if (!isOpen) return null;

  const handleStartRestore = async () => {
    if (!selectedSnapshotName) {
      setErrorMsg('请选择一个有效的快照');
      return;
    }
    if (!targetInstanceName.trim()) {
      setErrorMsg('请输入目标实例名称');
      return;
    }
    if (cfEnabled && !cfDomain.trim()) {
      setErrorMsg('已开启 Cloudflare DNS 更新，请输入解析域名');
      return;
    }

    setInProgress(true);
    setErrorMsg(null);

    try {
      await executeRestore(
        targetInstanceName.trim(),
        selectedSnapshotName,
        availabilityZone,
        selectedBundleId,
        {
          enabled: cfEnabled,
          domain: cfDomain.trim(),
          zoneId: cfZoneId.trim(),
          proxied: cfProxied,
        },
        (index, step) => {
          setSteps((prev) => {
            const next = [...prev];
            next[index] = step;
            return next;
          });
          if (step.id === 'wait_ip' && step.status === 'completed' && step.detail) {
            setRestoredIp(step.detail);
          }
        }
      );
      setDone(true);
    } catch (e: any) {
      setErrorMsg(e.message || '恢复或 DNS 同步过程中出错');
    } finally {
      setInProgress(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast(`已复制: ${text}`, 'info');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">从快照恢复 & DNS 自动更新</h2>
              <p className="text-xs text-slate-400">一键唤醒实例并将新分配 IP 绑定至 Cloudflare</p>
            </div>
          </div>
          {!inProgress && (
            <button
              onClick={closeRestoreModal}
              className="text-slate-400 hover:text-white p-1 rounded-lg text-xs"
            >
              关闭
            </button>
          )}
        </div>

        {/* Form Inputs (Hidden once done) */}
        {!done && (
          <div className="space-y-3.5 my-3 text-xs">
            {/* Snapshot Selector */}
            <div>
              <label className="block font-medium text-slate-300 mb-1">选择恢复来源快照:</label>
              <select
                value={selectedSnapshotName}
                onChange={(e) => setSelectedSnapshotName(e.target.value)}
                disabled={inProgress}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
              >
                {snapshots.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.sizeInGb} GB - {s.fromBlueprintId})
                  </option>
                ))}
              </select>
            </div>

            {/* Instance Name & Bundle */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-medium text-slate-300 mb-1">实例名称:</label>
                <input
                  type="text"
                  value={targetInstanceName}
                  onChange={(e) => setTargetInstanceName(e.target.value)}
                  disabled={inProgress}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-300 mb-1">规格套餐:</label>
                <select
                  value={selectedBundleId}
                  onChange={(e) => setSelectedBundleId(e.target.value)}
                  disabled={inProgress}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="nano_2_0">Nano ($3.50/mo, 512MB)</option>
                  <option value="micro_2_0">Micro ($5.00/mo, 1GB)</option>
                  <option value="small_2_0">Small ($10.00/mo, 2GB)</option>
                  <option value="medium_2_0">Medium ($20.00/mo, 4GB)</option>
                </select>
              </div>
            </div>

            {/* Cloudflare DNS Auto-Update Configuration Card */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold text-white">Cloudflare DNS 自动写入</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfEnabled}
                    onChange={(e) => setCfEnabled(e.target.checked)}
                    disabled={inProgress}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {cfEnabled && (
                <div className="space-y-2 pt-1">
                  <div>
                    <label className="block text-slate-400 mb-1">目标解析域名 (A 记录):</label>
                    <input
                      type="text"
                      value={cfDomain}
                      onChange={(e) => setCfDomain(e.target.value)}
                      disabled={inProgress}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-white text-xs"
                      placeholder="vpn.mydomain.dev"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-slate-400">开启 Cloudflare CDN 代理 (橙色云朵):</span>
                    <button
                      type="button"
                      onClick={() => setCfProxied(!cfProxied)}
                      disabled={inProgress}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                        cfProxied
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {cfProxied ? '已开启 Proxied' : '仅 DNS (直连)'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Step Tracker (Always visible during execution or done) */}
        {(inProgress || done) && (
          <div className="my-3 space-y-2">
            {steps.map((s, idx) => (
              <div
                key={s.id}
                className={`p-2.5 rounded-xl border text-xs flex items-start gap-2.5 transition-colors ${
                  s.status === 'completed'
                    ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                    : s.status === 'running'
                    ? 'bg-indigo-950/40 border-indigo-700/60 text-indigo-200'
                    : s.status === 'error'
                    ? 'bg-rose-950/40 border-rose-800/60 text-rose-200'
                    : 'bg-slate-950/30 border-slate-800/60 text-slate-500'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {s.status === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : s.status === 'running' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-slate-600 flex items-center justify-center text-[10px] text-slate-400">
                      {idx + 1}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-white flex items-center justify-between">
                    <span>{s.title}</span>
                    {s.detail && <span className="font-mono text-indigo-300 text-[11px]">{s.detail}</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <div className="my-2 p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Card */}
        {done && (
          <div className="my-3 p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/40 space-y-3">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="font-bold text-sm text-white">实例唤醒恢复完毕，DNS 已无缝生效！</span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">新公网 IP 地址:</span>
                <div className="flex items-center gap-1.5 font-mono text-emerald-400 font-bold">
                  <span>{restoredIp || '已分配'}</span>
                  {restoredIp && (
                    <button
                      onClick={() => copyToClipboard(restoredIp)}
                      className="p-1 hover:text-white"
                      title="复制 IP"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {cfEnabled && cfDomain && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Cloudflare 解析域名:</span>
                  <div className="flex items-center gap-1.5 font-mono text-amber-300 font-medium">
                    <span>{cfDomain}</span>
                    <button
                      onClick={() => copyToClipboard(cfDomain)}
                      className="p-1 hover:text-white"
                      title="复制域名"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-1 border-t border-slate-800/80">
                <span className="text-slate-400">快速连接命令:</span>
                <span className="font-mono text-[11px] text-slate-300 select-all">
                  ssh ubuntu@{cfDomain || restoredIp}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Actions Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
          {done ? (
            <button
              onClick={closeRestoreModal}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors shadow-lg shadow-emerald-600/20"
            >
              完成并查看实例
            </button>
          ) : (
            <>
              <button
                onClick={closeRestoreModal}
                disabled={inProgress}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleStartRestore}
                disabled={inProgress || !selectedSnapshotName}
                className="px-5 py-2 rounded-xl text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-600/20"
              >
                {inProgress ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在恢复与同步...</span>
                  </>
                ) : (
                  <>
                    <span>一键恢复并同步 DNS</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
