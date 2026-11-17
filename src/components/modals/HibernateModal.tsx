/**
 * Hibernate / Temporary Delete Modal
 * Supports non-blocking server-side background queue execution & manual direct instance release
 * Strictly executes: Step 1 (Extract & Save Firewall Config) -> Step 2 (Create Snapshot & Wait) -> Step 3 (Delete Compute Instance)
 */

import React, { useState } from 'react';
import {
  Moon,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Shield,
  Clock,
  Layers,
  Flame,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { OperationStep } from '../../types/lightsail';

export const HibernateModal: React.FC = () => {
  const {
    hibernateModal,
    closeHibernateModal,
    executeHibernate,
    enqueueBackgroundHibernate,
    executeManualReleaseInstance,
    snapshotLifecycle,
    snapshots,
  } = useApp();
  const { isOpen, instance } = hibernateModal;

  const [snapshotName, setSnapshotName] = useState<string>('');
  const [retentionMode, setRetentionMode] = useState<string>('policy_default');
  const [runInBackground, setRunInBackground] = useState<boolean>(true);
  const [inProgress, setInProgress] = useState<boolean>(false);
  const [releasingManual, setReleasingManual] = useState<boolean>(false);
  const [confirmManualRelease, setConfirmManualRelease] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<OperationStep | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState<boolean>(false);

  // Initialize snapshot name when modal opens
  React.useEffect(() => {
    if (instance) {
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
        now.getDate()
      ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(
        now.getMinutes()
      ).padStart(2, '0')}`;
      setSnapshotName(`snap-${instance.name}-${ts}`);
      setRetentionMode('policy_default');
      setRunInBackground(true);
      setInProgress(false);
      setReleasingManual(false);
      setConfirmManualRelease(false);
      setCurrentStep(null);
      setErrorMsg(null);
      setDone(false);
    }
  }, [instance]);

  if (!isOpen || !instance) return null;

  const firewallRules = instance.firewallRules || [
    { fromPort: 22, toPort: 22, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'SSH' },
    { fromPort: 80, toPort: 80, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'HTTP' },
    { fromPort: 443, toPort: 443, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'HTTPS' },
  ];

  const existingSnapshotsForInst = snapshots.filter(
    (s) => s.fromInstanceName === instance.name && s.state === 'available'
  );

  const resolveRetentionHours = (): number | null | undefined => {
    if (retentionMode === 'permanent') return null;
    if (retentionMode !== 'policy_default') return Number(retentionMode);
    return undefined;
  };

  const handleStartHibernate = async () => {
    if (!snapshotName.trim()) {
      setErrorMsg('请输入快照名称');
      return;
    }

    setErrorMsg(null);
    const retentionHours = resolveRetentionHours();

    if (runInBackground) {
      setInProgress(true);
      try {
        await enqueueBackgroundHibernate(instance.name, snapshotName.trim(), {
          retentionHours,
          customFirewallRules: firewallRules,
        });
        closeHibernateModal();
      } catch (e: any) {
        setErrorMsg(e.message || '加入后台休眠队列失败');
      } finally {
        setInProgress(false);
      }
      return;
    }

    setInProgress(true);
    try {
      await executeHibernate(
        instance.name,
        snapshotName.trim(),
        (step) => {
          setCurrentStep(step);
        },
        {
          retentionHours,
          customFirewallRules: firewallRules,
        }
      );
      setDone(true);
    } catch (e: any) {
      setErrorMsg(e.message || '休眠过程失败');
    } finally {
      setInProgress(false);
    }
  };

  const handleDirectManualRelease = async () => {
    setReleasingManual(true);
    setErrorMsg(null);
    try {
      await executeManualReleaseInstance(instance.name, true);
      closeHibernateModal();
    } catch (e: any) {
      setErrorMsg(e.message || '手动释放实例失败');
    } finally {
      setReleasingManual(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Moon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">休眠 / 暂时删除实例</h2>
              <p className="text-xs text-slate-400">
                ① 提取保存防火墙配置 → ② 创建系统快照 → ③ 释放实例
              </p>
            </div>
          </div>
          <button
            onClick={closeHibernateModal}
            className="text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg text-xs bg-slate-800/80 hover:bg-slate-800"
          >
            {inProgress ? '最小化到后台' : '关闭'}
          </button>
        </div>

        {/* Cost Saving Notice */}
        <div className="my-3 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-300 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-emerald-200">支持后台异步队列运行（不阻塞窗口）: </span>
            提交后由服务端后台队列自动等待 AWS 快照就绪并执行实例删除，您可以随时关闭此窗口或浏览其他页面，并在顶部「后台任务队列」实时查看进度。
          </div>
        </div>

        {/* Target Instance & Firewall Preview */}
        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 mb-3 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">目标实例:</span>
            <span className="font-semibold text-white font-mono">{instance.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">规格配置:</span>
            <span className="text-slate-300">{instance.bundleName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">当前公网 IP:</span>
            <span className="font-mono text-indigo-300">{instance.publicIpAddress || '无'}</span>
          </div>
          {instance.cloudflareBinding?.enabled && (
            <div className="flex justify-between">
              <span className="text-slate-400">已绑定 Cloudflare 域名:</span>
              <span className="font-mono text-amber-300">{instance.cloudflareBinding.domain}</span>
            </div>
          )}

          {/* Firewall rules to be backed up */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-slate-400 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                <span>待提取备份的防火墙规则 ({firewallRules.length} 条):</span>
              </span>
              <span className="text-[10px] text-cyan-300 font-mono">GetInstancePortStates</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {firewallRules.map((rule, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-cyan-950/60 border border-cyan-800/50 text-cyan-200 font-mono text-[10px]"
                >
                  {rule.protocol.toUpperCase()}{' '}
                  {rule.fromPort === rule.toPort ? rule.fromPort : `${rule.fromPort}-${rule.toPort}`}
                  {rule.commonName ? ` (${rule.commonName})` : ''}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Snapshot Name, Background Queue Mode & Lifecycle Retention Input */}
        {!done && (
          <div className="space-y-3 mb-4 text-xs">
            <div>
              <label className="block font-medium text-slate-300 mb-1">
                快照名称 (用于后续一键唤醒):
              </label>
              <input
                type="text"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                disabled={inProgress}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                placeholder="snap-instance-YYYYMMDD"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>快照生命周期自动删除时间:</span>
              </label>
              <select
                value={retentionMode}
                onChange={(e) => setRetentionMode(e.target.value)}
                disabled={inProgress}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="policy_default">
                  跟随全局生命周期策略 (
                  {snapshotLifecycle.enabled && snapshotLifecycle.defaultRetentionHours
                    ? `${snapshotLifecycle.defaultRetentionHours} 小时后自动清理`
                    : '永久保留'}
                  ，休眠期最新基础镜像受保护)
                </option>
                <option value="permanent">永久保留 (不自动删除)</option>
                <option value="24">24 小时 (1 天) 后到期</option>
                <option value="72">72 小时 (3 天) 后到期</option>
                <option value="168">168 小时 (7 天) 后到期</option>
                <option value="336">336 小时 (14 天) 后到期</option>
                <option value="720">720 小时 (30 天) 后到期</option>
              </select>
            </div>

            {/* Background Queue Toggle */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-800/50 cursor-pointer">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
                <div>
                  <span className="font-semibold text-indigo-200 block">
                    在后台队列中运行长耗时等待 (推荐)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    立即释放当前窗口，即使提前退出页面服务端也会等待快照完成并自动删除实例
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

            {/* Manual Direct Release Section */}
            <div className="p-2.5 rounded-xl bg-rose-950/20 border border-rose-900/40 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-rose-200">
                  <span className="font-semibold flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-rose-400" />
                    <span>手动直接释放实例（跳过快照等待）</span>
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    {existingSnapshotsForInst.length > 0
                      ? `已存在可用快照 ${existingSnapshotsForInst[0].name}，可直接删除实例停止计费`
                      : '若之前已发起快照或应用提前退出，可直接手动删除实例'}
                  </span>
                </div>
                {!confirmManualRelease ? (
                  <button
                    type="button"
                    onClick={() => setConfirmManualRelease(true)}
                    disabled={releasingManual}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 border border-rose-500/40 text-[11px] font-medium whitespace-nowrap shrink-0"
                  >
                    手动释放实例
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmManualRelease(false)}
                      className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[10px]"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleDirectManualRelease}
                      disabled={releasingManual}
                      className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-semibold flex items-center gap-1"
                    >
                      {releasingManual && <Loader2 className="w-3 h-3 animate-spin" />}
                      <span>确认立即删除实例</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* In-progress status visualizer */}
        {inProgress && currentStep && (
          <div className="my-3 p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-800/40 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>{currentStep.title}</span>
            </div>
            <p className="text-xs text-slate-300">{currentStep.description}</p>
          </div>
        )}

        {/* Error notice */}
        {errorMsg && (
          <div className="my-2 p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Done State */}
        {done && (
          <div className="my-3 p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <h3 className="text-sm font-bold text-white">实例休眠完成！</h3>
            <p className="text-xs text-slate-300">
              已保存 <strong className="text-cyan-300">{firewallRules.length} 条防火墙规则</strong> 与快照{' '}
              <strong className="text-indigo-300 font-mono">{snapshotName}</strong>，并已删除计算实例停止计费。
              后续恢复时将自动复原防火墙端口并同步 Cloudflare DNS。
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
          {done ? (
            <button
              onClick={closeHibernateModal}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors"
            >
              完成并返回
            </button>
          ) : (
            <>
              <button
                onClick={closeHibernateModal}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                {inProgress ? '转入后台继续运行' : '取消'}
              </button>
              <button
                onClick={handleStartHibernate}
                disabled={inProgress || !snapshotName}
                className="px-5 py-2 rounded-xl text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-600/20 whitespace-nowrap"
              >
                {inProgress ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在提交...</span>
                  </>
                ) : (
                  <>
                    <span>{runInBackground ? '加入后台队列并休眠' : '保存防火墙与快照并休眠'}</span>
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
