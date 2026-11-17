/**
 * Fast Restore from Snapshot Modal with Firewall Restoration & Cloudflare DNS Auto-Update
 */

import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  Globe,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Copy,
  Shield,
  Plus,
  X,
  Layers,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { OperationStep, FirewallPortRule } from '../../types/lightsail';

const DEFAULT_FALLBACK_RULES: FirewallPortRule[] = [
  { fromPort: 22, toPort: 22, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'SSH' },
  { fromPort: 80, toPort: 80, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'HTTP' },
  { fromPort: 443, toPort: 443, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'HTTPS' },
  { fromPort: 2080, toPort: 2080, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'Sing-box TCP' },
  { fromPort: 2080, toPort: 2080, protocol: 'udp', cidrs: ['0.0.0.0/0'], commonName: 'Sing-box UDP' },
];

export const RestoreModal: React.FC = () => {
  const {
    restoreModal,
    closeRestoreModal,
    snapshots,
    executeRestore,
    enqueueBackgroundRestore,
    updateInstanceDomain,
    showToast,
    config,
  } = useApp();
  const { isOpen, snapshot, instance } = restoreModal;

  const [selectedSnapshotName, setSelectedSnapshotName] = useState<string>('');
  const [targetInstanceName, setTargetInstanceName] = useState<string>('');
  const [selectedBundleId, setSelectedBundleId] = useState<string>('micro_3_0');
  const [availabilityZone, setAvailabilityZone] = useState<string>('ap-northeast-1a');
  const [runInBackground, setRunInBackground] = useState<boolean>(true);
  const wasOpenRef = React.useRef<boolean>(false);

  // Firewall restoration settings
  const [fwEnabled, setFwEnabled] = useState<boolean>(true);
  const [fwRules, setFwRules] = useState<FirewallPortRule[]>(DEFAULT_FALLBACK_RULES);
  const [newPortInput, setNewPortInput] = useState<string>('');
  const [newProtoInput, setNewProtoInput] = useState<'tcp' | 'udp'>('tcp');

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
    { id: '3', title: '复原防火墙端口规则', description: '调用 PutInstancePublicPorts 复原保存的端口规则', status: 'pending' },
    { id: '4', title: '更新 Cloudflare DNS 记录', description: '调用 Cloudflare v4 API 写入新的公网 IP', status: 'pending' },
  ]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [restoredIp, setRestoredIp] = useState<string | null>(null);
  const [done, setDone] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const snap = snapshot || snapshots[0];
      const instName = instance ? instance.name : snap ? snap.fromInstanceName : 'sing-box-test';
      setSelectedSnapshotName(snap ? snap.name : '');
      setTargetInstanceName(instName);
      setSelectedBundleId(snap?.fromBundleId || instance?.bundleId || 'micro_3_0');
      const rawAz = instance?.location.availabilityZone;
      setAvailabilityZone(rawAz && rawAz !== 'all' ? rawAz : 'ap-northeast-1a');
      setRunInBackground(true);

      const initialRules =
        (snap?.preservedConfig?.firewallRules && snap.preservedConfig.firewallRules.length > 0
          ? snap.preservedConfig.firewallRules
          : null) ||
        (instance?.firewallRules && instance.firewallRules.length > 0
          ? instance.firewallRules
          : null) ||
        DEFAULT_FALLBACK_RULES;

      setFwEnabled(true);
      setFwRules(initialRules);

      // Prioritize user's configured defaultDnsRecordName first so domain edits take effect immediately
      const customSaved = localStorage.getItem('lightsail_custom_domain');
      const initialDomain =
        customSaved ||
        config.defaultDnsRecordName ||
        instance?.cloudflareBinding?.domain ||
        snap?.preservedConfig?.cloudflareDomain ||
        'test.selfgo.asia';
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
        { id: '3', title: '复原防火墙端口规则', description: '调用 PutInstancePublicPorts 复原保存的端口规则', status: 'pending' },
        { id: '4', title: '更新 Cloudflare DNS 记录', description: '调用 Cloudflare v4 API 写入新的公网 IP', status: 'pending' },
      ]);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, snapshot, instance, snapshots, config]);

  // Update firewall rules when user switches snapshot in dropdown
  const handleSnapshotChange = (snapName: string) => {
    setSelectedSnapshotName(snapName);
    const matched = snapshots.find((s) => s.name === snapName);
    if (matched?.preservedConfig?.firewallRules?.length) {
      setFwRules(matched.preservedConfig.firewallRules);
    }
  };

  if (!isOpen) return null;

  const handleAddRule = () => {
    const portNum = parseInt(newPortInput.trim(), 10);
    if (!portNum || portNum < 1 || portNum > 65535) {
      showToast('请输入有效的端口号 (1 - 65535)', 'warning');
      return;
    }
    const exists = fwRules.some(
      (r) => r.fromPort === portNum && r.toPort === portNum && r.protocol === newProtoInput
    );
    if (exists) {
      showToast(`端口 ${newProtoInput.toUpperCase()} ${portNum} 已在恢复列表中`, 'info');
      return;
    }
    setFwRules((prev) => [
      ...prev,
      {
        fromPort: portNum,
        toPort: portNum,
        protocol: newProtoInput,
        cidrs: ['0.0.0.0/0'],
        commonName: `Custom ${newProtoInput.toUpperCase()}`,
      },
    ]);
    setNewPortInput('');
  };

  const handleRemoveRule = (idx: number) => {
    setFwRules((prev) => prev.filter((_, i) => i !== idx));
  };

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

    setErrorMsg(null);
    if (cfEnabled && cfDomain.trim()) {
      updateInstanceDomain(cfDomain.trim(), targetInstanceName.trim());
    }

    if (runInBackground) {
      setInProgress(true);
      try {
        await enqueueBackgroundRestore(
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
          {
            enabled: fwEnabled,
            rules: fwRules,
          }
        );
        closeRestoreModal();
      } catch (e: any) {
        setErrorMsg(e.message || '提交后台恢复任务失败');
      } finally {
        setInProgress(false);
      }
      return;
    }

    setInProgress(true);
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
        },
        {
          enabled: fwEnabled,
          rules: fwRules,
        }
      );
      setDone(true);
    } catch (e: any) {
      setErrorMsg(e.message || '恢复或防火墙/DNS 同步过程中出错');
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
              <h2 className="text-base font-bold text-white">从快照恢复 + 防火墙复原 + DNS 同步</h2>
              <p className="text-xs text-slate-400">一键重建实例、恢复防火墙端口并更新 Cloudflare</p>
            </div>
          </div>
          <button
            onClick={closeRestoreModal}
            className="text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg text-xs bg-slate-800/80 hover:bg-slate-800"
          >
            {inProgress ? '最小化到后台' : '关闭'}
          </button>
        </div>

        {/* Form Inputs (Hidden once done) */}
        {!done && (
          <div className="space-y-3 my-3 text-xs">
            {/* Snapshot Selector */}
            <div>
              <label className="block font-medium text-slate-300 mb-1">选择恢复来源快照:</label>
              <select
                value={selectedSnapshotName}
                onChange={(e) => handleSnapshotChange(e.target.value)}
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
                  <option value="nano_3_0">Nano Gen3 ($5/mo, 512MB, 2 vCPU)</option>
                  <option value="micro_3_0">Micro Gen3 ($7/mo, 1GB, 2 vCPU)</option>
                  <option value="small_3_0">Small Gen3 ($12/mo, 2GB, 2 vCPU)</option>
                  <option value="medium_3_0">Medium Gen3 ($24/mo, 4GB, 2 vCPU)</option>
                  <option value="nano_2_0">Nano Gen2 ($3.50/mo, 512MB, 1 vCPU)</option>
                  <option value="micro_2_0">Micro Gen2 ($5.00/mo, 1GB, 1 vCPU)</option>
                  <option value="small_2_0">Small Gen2 ($10.00/mo, 2GB, 1 vCPU)</option>
                  <option value="medium_2_0">Medium Gen2 ($20.00/mo, 4GB, 2 vCPU)</option>
                </select>
              </div>
            </div>

            {/* Firewall Restoration Configuration Card */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span className="font-semibold text-white">
                    防火墙端口配置自动复原 ({fwRules.length} 条)
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fwEnabled}
                    onChange={(e) => setFwEnabled(e.target.checked)}
                    disabled={inProgress}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600"></div>
                </label>
              </div>

              {fwEnabled && (
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap gap-1.5">
                    {fwRules.map((rule, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-950/60 border border-cyan-800/60 text-cyan-200 font-mono text-[10px]"
                      >
                        <span>
                          {rule.protocol.toUpperCase()}{' '}
                          {rule.fromPort === rule.toPort
                            ? rule.fromPort
                            : `${rule.fromPort}-${rule.toPort}`}
                        </span>
                        {!inProgress && fwRules.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRule(idx)}
                            className="text-cyan-400 hover:text-rose-400 ml-0.5"
                            title="移除该端口"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>

                  {/* Quick add port rule */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <select
                      value={newProtoInput}
                      onChange={(e) => setNewProtoInput(e.target.value as 'tcp' | 'udp')}
                      disabled={inProgress}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white font-mono"
                    >
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                    </select>
                    <input
                      type="number"
                      value={newPortInput}
                      onChange={(e) => setNewPortInput(e.target.value)}
                      disabled={inProgress}
                      placeholder="添加端口 (如 8388)"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleAddRule}
                      disabled={inProgress || !newPortInput.trim()}
                      className="px-2.5 py-1 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 text-[11px] flex items-center gap-1 whitespace-nowrap disabled:opacity-40"
                    >
                      <Plus className="w-3 h-3" />
                      <span>添加端口</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Cloudflare DNS Auto-Update Configuration Card */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
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
                      placeholder="test.selfgo.asia"
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
              <span className="font-bold text-sm text-white">实例唤醒、防火墙复原与 DNS 同步已完成！</span>
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

              {fwEnabled && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">已复原防火墙规则:</span>
                  <span className="font-mono text-cyan-300 text-[11px]">
                    {fwRules.map((r) => `${r.protocol.toUpperCase()}:${r.fromPort}`).join(', ')}
                  </span>
                </div>
              )}

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
                  ssh admin@{cfDomain || restoredIp}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Background Queue Toggle */}
        {!done && (
          <label className="flex items-center justify-between p-2.5 mb-2 rounded-xl bg-indigo-950/30 border border-indigo-800/50 cursor-pointer text-xs">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
              <div>
                <span className="font-semibold text-indigo-200 block">
                  在后台队列中运行恢复任务 (不阻塞当前窗口)
                </span>
                <span className="text-[10px] text-slate-400">
                  提交后立即关闭弹窗，由后台队列自动等待 IP 分配、复原防火墙并同步 DNS
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={runInBackground}
              onChange={(e) => setRunInBackground(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 w-4 h-4"
            />
          </label>
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
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                {inProgress ? '转入后台继续运行' : '取消'}
              </button>
              <button
                onClick={handleStartRestore}
                disabled={inProgress || !selectedSnapshotName}
                className="px-5 py-2 rounded-xl text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-600/20 whitespace-nowrap"
              >
                {inProgress ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在提交恢复...</span>
                  </>
                ) : (
                  <>
                    <span>{runInBackground ? '加入后台队列恢复实例' : '一键恢复并复原防火墙与 DNS'}</span>
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

