/**
 * Hibernate / Temporary Delete Modal
 * Creates snapshot before deleting compute instance to pause costs
 */

import React, { useState } from 'react';
import { Moon, ShieldCheck, AlertTriangle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { OperationStep } from '../../types/lightsail';

export const HibernateModal: React.FC = () => {
  const { hibernateModal, closeHibernateModal, executeHibernate } = useApp();
  const { isOpen, instance } = hibernateModal;

  const [snapshotName, setSnapshotName] = useState<string>('');
  const [inProgress, setInProgress] = useState<boolean>(false);
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
      setInProgress(false);
      setCurrentStep(null);
      setErrorMsg(null);
      setDone(false);
    }
  }, [instance]);

  if (!isOpen || !instance) return null;

  const handleStartHibernate = async () => {
    if (!snapshotName.trim()) {
      setErrorMsg('请输入快照名称');
      return;
    }

    setInProgress(true);
    setErrorMsg(null);

    try {
      await executeHibernate(instance.name, snapshotName.trim(), (step) => {
        setCurrentStep(step);
      });
      setDone(true);
    } catch (e: any) {
      setErrorMsg(e.message || '休眠过程失败');
    } finally {
      setInProgress(false);
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
              <p className="text-xs text-slate-400">保存完整快照后安全释放计算资源</p>
            </div>
          </div>
          {!inProgress && (
            <button
              onClick={closeHibernateModal}
              className="text-slate-400 hover:text-white p-1 rounded-lg text-xs"
            >
              关闭
            </button>
          )}
        </div>

        {/* Cost Saving Notice */}
        <div className="my-3 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-300 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-emerald-200">数据与配置 100% 保全: </span>
            删除前将创建完整 EBS 系统快照。实例休眠后计算费率（原约 ${instance.monthlyCostUsd}/月）即刻降为 $0，仅保留极低的快照存储费（约 $0.05/GB-月）。随时可以一键启动恢复！
          </div>
        </div>

        {/* Target Instance Info */}
        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 mb-3 space-y-1.5 text-xs">
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
        </div>

        {/* Snapshot Name Input */}
        {!done && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
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
              实例已安全删除，快照 <strong className="text-indigo-300 font-mono">{snapshotName}</strong> 已安全存入快照库。
              后续可在「休眠快照」页面随时一键恢复并自动同步 Cloudflare DNS。
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
                disabled={inProgress}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleStartHibernate}
                disabled={inProgress || !snapshotName}
                className="px-5 py-2 rounded-xl text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-600/20"
              >
                {inProgress ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在执行休眠...</span>
                  </>
                ) : (
                  <>
                    <span>立即保存快照并休眠</span>
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
