/**
 * Cloud Configuration & Settings Modal
 * Hardened for Android WebView (Capacitor) & Desktop environments
 */

import React, { useState } from 'react';
import {
  Settings,
  Sparkles,
  ShieldCheck,
  Zap,
  Flame,
  Check,
  RotateCcw,
  KeyRound,
  CheckCircle2,
  XCircle,
  RefreshCw,
  GitBranch,
  Download,
  ExternalLink,
  ArrowUpCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CloudConfig } from '../../types/lightsail';

function normalizeFormConfig(cfg: CloudConfig): CloudConfig {
  return {
    mode: cfg?.mode === 'floci_simulation' ? 'floci_simulation' : 'real_cloud',
    flociSimulationSpeed: cfg?.flociSimulationSpeed || 'normal',
    simulateFaults: {
      awsThrottle: Boolean(cfg?.simulateFaults?.awsThrottle),
      cloudflareError: Boolean(cfg?.simulateFaults?.cloudflareError),
      snapshotTimeout: Boolean(cfg?.simulateFaults?.snapshotTimeout),
    },
    awsAccessKeyId: cfg?.awsAccessKeyId || '',
    awsSecretAccessKey: cfg?.awsSecretAccessKey || '',
    awsRegion: cfg?.awsRegion || 'ap-northeast-1',
    cloudflareApiToken: cfg?.cloudflareApiToken || '',
    cloudflareZoneId: cfg?.cloudflareZoneId || '',
    defaultDnsRecordName: cfg?.defaultDnsRecordName || 'test.selfgo.asia',
    githubRepo: cfg?.githubRepo || 'gansxx/aws_lightsail_manager',
  };
}

export const ConfigModal: React.FC = () => {
  const {
    config,
    updateConfig,
    configModalOpen,
    setConfigModalOpen,
    resetSimulator,
    envSecretStatus,
    credentialTestResult,
    testingCredentials,
    testCurrentCredentials,
    refreshSecretStatus,
    githubUpdateInfo,
    checkingGitHubUpdate,
    checkGitHubUpdate,
    syncGitHubVersion,
    updateInstanceDomain,
  } = useApp();

  const [form, setForm] = useState<CloudConfig>(() => normalizeFormConfig(config));
  const wasOpenRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    if (configModalOpen && !wasOpenRef.current) {
      setForm(normalizeFormConfig(config));
      refreshSecretStatus();
    }
    wasOpenRef.current = configModalOpen;
  }, [config, configModalOpen, refreshSecretStatus]);

  if (!configModalOpen) return null;

  const handleSave = async () => {
    const safeAwsKey = (form.awsAccessKeyId || '').trim();
    const safeAwsSecret = (form.awsSecretAccessKey || '').trim();
    const safeCfToken = (form.cloudflareApiToken || '').trim();
    const safeDomain = (form.defaultDnsRecordName || '').trim();

    const hasCustomInput = Boolean(safeAwsKey || safeAwsSecret || safeCfToken);
    const nextForm: CloudConfig = hasCustomInput ? { ...form, mode: 'real_cloud' } : form;
    updateConfig(nextForm);
    if (safeDomain) {
      await updateInstanceDomain(safeDomain);
    }
    setConfigModalOpen(false);
  };

  const handleTestCredentials = async () => {
    const report = await testCurrentCredentials(form);
    if (report && (report.aws?.configured || report.cloudflare?.configured)) {
      setForm((prev) => ({ ...prev, mode: 'real_cloud' }));
      updateConfig({ ...form, mode: 'real_cloud' });
    }
  };

  const sourceLabel = (src?: 'env_secret' | 'custom_input' | 'missing') => {
    if (src === 'env_secret') return '服务端 Secrets';
    if (src === 'custom_input') return '表单/本地配置';
    return '未配置';
  };

  const secretRows = envSecretStatus
    ? [
        { label: 'AWS_ACCESS_KEY_ID', item: envSecretStatus.awsAccessKeyId },
        { label: 'AWS_SECRET_ACCESS_KEY', item: envSecretStatus.awsSecretAccessKey },
        { label: 'CLOUDFLARE_API_TOKEN', item: envSecretStatus.cloudflareApiToken },
        { label: 'CLOUDFLARE_ZONE_ID', item: envSecretStatus.cloudflareZoneId },
      ]
    : [];

  const credentialRows = credentialTestResult
    ? [
        { title: 'AWS Lightsail API', item: credentialTestResult.aws },
        { title: 'Cloudflare DNS API', item: credentialTestResult.cloudflare },
      ].filter((r) => Boolean(r.item))
    : [];

  const safeApkAssets = Array.isArray(githubUpdateInfo?.apkAssets)
    ? githubUpdateInfo!.apkAssets
    : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/85">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto text-xs">
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
          <button
            type="button"
            onClick={() => setConfigModalOpen(false)}
            className="text-slate-400 hover:text-white px-2.5 py-2 min-h-[40px] whitespace-nowrap"
          >
            关闭
          </button>
        </div>

        <div className="space-y-4 my-3.5">
          {/* Server Secrets Reading Status & Live Credential Test */}
          <div className="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-800/40 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-200">
                <KeyRound className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>密钥状态读取与连通性测试</span>
              </div>
              <button
                type="button"
                onClick={handleTestCredentials}
                disabled={testingCredentials}
                className="px-3 py-2 min-h-[40px] rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingCredentials ? 'animate-spin' : ''}`} />
                <span>{testingCredentials ? '测试中...' : '测试当前密钥'}</span>
              </button>
            </div>

            {secretRows.length > 0 ? (
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                {secretRows.map((row) => (
                  <div
                    key={row.label}
                    className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/90 flex flex-col gap-0.5"
                  >
                    <span className="font-mono text-[10px] text-slate-400 truncate">{row.label}</span>
                    {row.item?.configured ? (
                      <span className="text-emerald-300 font-mono flex items-center gap-1 truncate">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>{row.item.maskedPreview || '已配置'}</span>
                      </span>
                    ) : (
                      <span className="text-amber-300 flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>未检测到</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">正在检测环境变量或本地凭证状态...</p>
            )}

            {envSecretStatus && (
              <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  默认区域:{' '}
                  <strong className="font-mono text-slate-200">
                    {envSecretStatus.awsRegion || form.awsRegion || 'ap-northeast-1'}
                  </strong>
                </span>
                {envSecretStatus.cloudflareRecordName && (
                  <span>
                    解析域名:{' '}
                    <strong className="font-mono text-slate-200">{envSecretStatus.cloudflareRecordName}</strong>
                  </span>
                )}
              </div>
            )}

            {credentialRows.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-indigo-900/40">
                {credentialRows.map((entry) => (
                  <div
                    key={entry.title}
                    className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                      entry.item?.success
                        ? 'bg-emerald-950/25 border-emerald-800/50 text-emerald-200'
                        : 'bg-rose-950/25 border-rose-800/50 text-rose-200'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {entry.item?.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-semibold text-white">{entry.title}</span>
                        <span className="text-[10px] font-mono text-slate-300">
                          {sourceLabel(entry.item?.source)} · HTTP {entry.item?.status ?? 0} ·{' '}
                          {entry.item?.latencyMs ?? 0}ms
                        </span>
                      </div>
                      <p className="text-[11px] mt-0.5 break-words">{entry.item?.message || ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

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
                      checked={Boolean(form.simulateFaults?.awsThrottle)}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          simulateFaults: {
                            ...(prev.simulateFaults || {
                              awsThrottle: false,
                              cloudflareError: false,
                              snapshotTimeout: false,
                            }),
                            awsThrottle: e.target.checked,
                          },
                        }))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                    />
                    <span>模拟 AWS API 限流错误 (HTTP 429 TooManyRequests)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={Boolean(form.simulateFaults?.snapshotTimeout)}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          simulateFaults: {
                            ...(prev.simulateFaults || {
                              awsThrottle: false,
                              cloudflareError: false,
                              snapshotTimeout: false,
                            }),
                            snapshotTimeout: e.target.checked,
                          },
                        }))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                    />
                    <span>模拟创建快照超时异常 (HTTP 504 Gateway Timeout)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={Boolean(form.simulateFaults?.cloudflareError)}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          simulateFaults: {
                            ...(prev.simulateFaults || {
                              awsThrottle: false,
                              cloudflareError: false,
                              snapshotTimeout: false,
                            }),
                            cloudflareError: e.target.checked,
                          },
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
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">AWS Lightsail 访问凭证</span>
              <span className="text-[10px] text-slate-400">支持本地保存或服务端 Secrets</span>
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-slate-400 mb-1">AWS Access Key ID:</label>
                <input
                  type="text"
                  value={form.awsAccessKeyId || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, awsAccessKeyId: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 font-mono text-white text-xs"
                  placeholder="输入 AWS Access Key ID 或留空读取服务端 Secrets"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">AWS Secret Access Key:</label>
                <input
                  type="password"
                  value={form.awsSecretAccessKey || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, awsSecretAccessKey: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 font-mono text-white text-xs"
                  placeholder="输入 AWS Secret Access Key 或留空读取服务端 Secrets"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">默认 AWS 区域 (Region):</label>
                <select
                  value={form.awsRegion || 'ap-northeast-1'}
                  onChange={(e) => setForm((prev) => ({ ...prev, awsRegion: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs"
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
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Cloudflare API 访问凭证</span>
              <span className="text-[10px] text-slate-400">支持本地保存或服务端 Secrets</span>
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-slate-400 mb-1">Cloudflare API Token:</label>
                <input
                  type="password"
                  value={form.cloudflareApiToken || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, cloudflareApiToken: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 font-mono text-white text-xs"
                  placeholder="输入 Cloudflare API Token 或留空读取服务端 Secrets"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Zone ID (区域 ID):</label>
                  <input
                    type="text"
                    value={form.cloudflareZoneId || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, cloudflareZoneId: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 font-mono text-white text-xs"
                    placeholder="输入 CLOUDFLARE_ZONE_ID"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">默认解析域名 (可随时修改):</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={form.defaultDnsRecordName || ''}
                      onChange={(e) => setForm((prev) => ({ ...prev, defaultDnsRecordName: e.target.value }))}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 font-mono text-white text-xs focus:border-indigo-500 focus:outline-none"
                      placeholder="例如 vpn.selfgo.asia"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const clean = (form.defaultDnsRecordName || '').trim();
                        if (clean) {
                          updateInstanceDomain(clean);
                        }
                      }}
                      className="px-2.5 py-2 rounded-lg bg-amber-600/25 hover:bg-amber-600/40 text-amber-300 border border-amber-500/40 text-[11px] font-medium whitespace-nowrap shrink-0"
                      title="立即应用并覆盖默认解析域名"
                    >
                      应用
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* GitHub Source Version Update & Release Sync */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-white">
                <GitBranch className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>GitHub 源版本检查与同步</span>
              </div>
              <button
                type="button"
                onClick={() => checkGitHubUpdate(form.githubRepo || 'gansxx/aws_lightsail_manager')}
                disabled={checkingGitHubUpdate}
                className="px-3 py-2 min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingGitHubUpdate ? 'animate-spin text-indigo-400' : ''}`} />
                <span>{checkingGitHubUpdate ? '正在检查...' : '检查新版本'}</span>
              </button>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">GitHub 仓库源 (Owner/Repo):</label>
              <input
                type="text"
                value={form.githubRepo || 'gansxx/aws_lightsail_manager'}
                onChange={(e) => setForm((prev) => ({ ...prev, githubRepo: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 font-mono text-white text-xs"
                placeholder="gansxx/aws_lightsail_manager"
              />
            </div>

            {githubUpdateInfo && githubUpdateInfo.currentVersion && (
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">当前版本:</span>
                    <span className="font-mono font-bold text-white">
                      v{githubUpdateInfo.currentVersion}
                    </span>
                    <span className="text-slate-600">→</span>
                    <span className="text-slate-400">GitHub 最新:</span>
                    <span className="font-mono font-bold text-indigo-300">
                      v{githubUpdateInfo.latestVersion || githubUpdateInfo.currentVersion}
                    </span>
                  </div>

                  {githubUpdateInfo.hasUpdate ? (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 font-semibold text-[11px] flex items-center gap-1">
                      <ArrowUpCircle className="w-3 h-3 text-indigo-400" />
                      <span>发现新版本</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold text-[11px] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>已同步最新</span>
                    </span>
                  )}
                </div>

                {githubUpdateInfo.latestCommit && (
                  <div className="text-[11px] text-slate-400 bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
                    <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 mb-0.5">
                      <span>最新提交: #{githubUpdateInfo.latestCommit.sha || ''}</span>
                      <span>
                        {githubUpdateInfo.latestCommit.date
                          ? new Date(githubUpdateInfo.latestCommit.date).toLocaleString('zh-CN')
                          : ''}
                      </span>
                    </div>
                    <p className="text-slate-200 truncate">{githubUpdateInfo.latestCommit.message || ''}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {githubUpdateInfo.hasUpdate && (
                    <button
                      type="button"
                      onClick={syncGitHubVersion}
                      disabled={checkingGitHubUpdate}
                      className="px-3 py-2 min-h-[40px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                      <span>同步至 v{githubUpdateInfo.latestVersion}</span>
                    </button>
                  )}

                  {safeApkAssets.map((apk) => (
                    <a
                      key={apk.name}
                      href={apk.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        下载 {apk.name} ({apk.sizeMb} MB)
                      </span>
                    </a>
                  ))}

                  {githubUpdateInfo.htmlUrl && (
                    <a
                      href={githubUpdateInfo.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                      <span>查看 GitHub Releases</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setConfigModalOpen(false)}
            className="px-4 py-2 min-h-[40px] rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800 whitespace-nowrap"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 min-h-[40px] rounded-xl text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 whitespace-nowrap"
          >
            <Check className="w-3.5 h-3.5" />
            <span>保存配置</span>
          </button>
        </div>
      </div>
    </div>
  );
};
