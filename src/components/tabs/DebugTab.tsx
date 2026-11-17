/**
 * Debug Tab: Live API request/response inspector, one-click diagnostics, and fault troubleshooting
 * Hardened for Android WebView (Capacitor) & Desktop environments
 */

import React, { useState } from 'react';
import {
  Terminal,
  Activity,
  Play,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Download,
  Flame,
  ChevronDown,
  ChevronUp,
  Search,
  KeyRound,
  RefreshCw,
  GitBranch,
  ExternalLink,
  ArrowUpCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ApiLogEntry } from '../../types/lightsail';

export const DebugTab: React.FC = () => {
  const {
    apiLogs,
    clearApiLogs,
    diagnostics,
    runDiagnostics,
    config,
    updateConfig,
    instances,
    snapshots,
    showToast,
    envSecretStatus,
    credentialTestResult,
    testingCredentials,
    testCurrentCredentials,
    refreshSecretStatus,
    githubUpdateInfo,
    checkingGitHubUpdate,
    checkGitHubUpdate,
    syncGitHubVersion,
  } = useApp();

  const [serviceFilter, setServiceFilter] = useState<string>('ALL');
  const [onlyErrors, setOnlyErrors] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState<boolean>(false);

  const safeLogs = Array.isArray(apiLogs) ? apiLogs : [];
  const safeDiagnostics = Array.isArray(diagnostics) ? diagnostics : [];

  const filteredLogs = safeLogs.filter((log) => {
    if (!log) return false;
    if (serviceFilter !== 'ALL' && log.service !== serviceFilter) return false;
    if (onlyErrors && log.success) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchAction = (log.action || '').toLowerCase().includes(term);
      const matchEndpoint = (log.endpoint || '').toLowerCase().includes(term);
      const matchErr = (log.errorMessage || '').toLowerCase().includes(term);
      return matchAction || matchEndpoint || matchErr;
    }
    return true;
  });

  const handleRunDiagnostics = async () => {
    setDiagnosing(true);
    try {
      await runDiagnostics();
    } finally {
      setDiagnosing(false);
    }
  };

  const copyLogJson = async (log: ApiLogEntry) => {
    const text = JSON.stringify(log, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast('日志详情已复制到剪贴板', 'info');
        return;
      }
    } catch {}
    showToast('已生成日志 JSON 数据', 'info');
  };

  const exportDebugBundle = async () => {
    const bundle = {
      timestamp: new Date().toISOString(),
      config: {
        mode: config?.mode,
        awsRegion: config?.awsRegion,
        hasAwsKey: Boolean(config?.awsAccessKeyId),
        hasCloudflareToken: Boolean(config?.cloudflareApiToken),
        cloudflareZoneId: config?.cloudflareZoneId,
      },
      instances: (Array.isArray(instances) ? instances : []).map((i) => ({
        name: i.name,
        state: i.state,
        ip: i.publicIpAddress,
        domain: i.cloudflareBinding?.domain,
      })),
      snapshots: (Array.isArray(snapshots) ? snapshots : []).map((s) => ({
        name: s.name,
        from: s.fromInstanceName,
        size: s.sizeInGb,
      })),
      recentLogs: safeLogs.slice(0, 30),
      diagnostics: safeDiagnostics,
    };

    const jsonText = JSON.stringify(bundle, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonText);
      }
    } catch {}

    try {
      const blob = new Blob([jsonText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lightsail-debug-bundle-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('已导出调试诊断报告包 (JSON) 并复制到剪贴板', 'success');
    } catch {
      showToast('诊断报告包 JSON 已复制到剪贴板', 'success');
    }
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
        { title: 'AWS Lightsail 真实鉴权测试', item: credentialTestResult.aws },
        { title: 'Cloudflare API 真实鉴权测试', item: credentialTestResult.cloudflare },
      ].filter((r) => Boolean(r.item))
    : [];

  const safeApkAssets = Array.isArray(githubUpdateInfo?.apkAssets)
    ? githubUpdateInfo!.apkAssets
    : [];

  return (
    <div className="p-4 space-y-4 pb-24 text-xs">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">调试与排查中心</h2>
          <p className="text-slate-400">密钥验证、调用日志流、全链路连通性诊断与异常排查</p>
        </div>
        <button
          type="button"
          onClick={exportDebugBundle}
          className="px-2.5 py-2 min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors whitespace-nowrap"
          title="导出调试日志与诊断快照"
        >
          <Download className="w-3.5 h-3.5 text-indigo-400" />
          <span>导出诊断包</span>
        </button>
      </div>

      {/* Credential & Secrets Verification Suite */}
      <div className="p-3.5 rounded-2xl bg-indigo-950/20 border border-indigo-800/40 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <KeyRound className="w-4 h-4 text-indigo-400 shrink-0" />
            <h3 className="font-bold text-white truncate">密钥读取状态与连通性测试</h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => refreshSecretStatus()}
              className="px-2.5 py-2 min-h-[40px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 whitespace-nowrap"
              title="重新读取服务端或本地凭证状态"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>刷新</span>
            </button>
            <button
              type="button"
              onClick={() => testCurrentCredentials()}
              disabled={testingCredentials}
              className="px-3 py-2 min-h-[40px] rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingCredentials ? 'animate-spin' : ''}`} />
              <span>{testingCredentials ? '测试中...' : '测试当前密钥'}</span>
            </button>
          </div>
        </div>

        {secretRows.length > 0 ? (
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {secretRows.map((row) => (
              <div
                key={row.label}
                className="p-2 rounded-xl bg-slate-950/75 border border-slate-800 flex flex-col gap-0.5"
              >
                <span className="font-mono text-[10px] text-slate-400 truncate">{row.label}</span>
                {row.item?.configured ? (
                  <span className="text-emerald-300 font-mono flex items-center gap-1 truncate">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>
                      {row.item.maskedPreview || '已配置'} ({row.item.length ?? 0} chars)
                    </span>
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
          <p className="text-[11px] text-slate-400">正在检查密钥与环境变量读取情况...</p>
        )}

        {credentialRows.length > 0 && (
          <div className="space-y-2 pt-1">
            {credentialRows.map((entry) => (
              <div
                key={entry.title}
                className={`p-2.5 rounded-xl border flex items-start gap-2.5 ${
                  entry.item?.success
                    ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                    : 'bg-rose-950/20 border-rose-800/40 text-rose-200'
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
                    <span className="text-[10px] font-mono opacity-80">
                      {entry.item?.source === 'env_secret'
                        ? 'Secrets'
                        : entry.item?.source === 'custom_input'
                        ? '手动输入'
                        : '缺失'}{' '}
                      · HTTP {entry.item?.status ?? 0} · {entry.item?.latencyMs ?? 0}ms
                    </span>
                  </div>
                  <span className="text-[11px] opacity-90 block mt-0.5 break-words">
                    {entry.item?.message || ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GitHub Repository Update & Sync Card */}
      <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <GitBranch className="w-4 h-4 text-indigo-400 shrink-0" />
            <h3 className="font-bold text-white truncate">GitHub 源版本检查与更新同步</h3>
          </div>
          <button
            type="button"
            onClick={() => checkGitHubUpdate()}
            disabled={checkingGitHubUpdate}
            className="px-3 py-2 min-h-[40px] rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingGitHubUpdate ? 'animate-spin text-indigo-400' : ''}`} />
            <span>{checkingGitHubUpdate ? '检查中...' : '检查更新'}</span>
          </button>
        </div>

        {githubUpdateInfo && githubUpdateInfo.currentVersion ? (
          <div className="space-y-2 text-[11px]">
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">源仓库:</span>
                <span className="font-mono text-slate-200">
                  {githubUpdateInfo.repo || 'gansxx/aws_lightsail_manager'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-white">当前 v{githubUpdateInfo.currentVersion}</span>
                <span className="text-slate-500">→</span>
                <span className="font-mono font-bold text-indigo-300">
                  最新 v{githubUpdateInfo.latestVersion || githubUpdateInfo.currentVersion}
                </span>
              </div>
            </div>

            {githubUpdateInfo.latestCommit && (
              <div className="p-2 rounded-xl bg-slate-900/50 border border-slate-800/80 text-slate-300">
                <span className="font-mono text-indigo-400 mr-1.5">
                  #{githubUpdateInfo.latestCommit.sha || ''}
                </span>
                <span>{githubUpdateInfo.latestCommit.message || ''}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {githubUpdateInfo.hasUpdate && (
                <button
                  type="button"
                  onClick={syncGitHubVersion}
                  disabled={checkingGitHubUpdate}
                  className="px-3 py-2 min-h-[40px] rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
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
                  className="px-3 py-2 min-h-[40px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
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
                  className="px-3 py-2 min-h-[40px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                  <span>打开 GitHub Releases</span>
                </a>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">点击上方「检查更新」可实时拉取 GitHub 仓库 Release 与最新提交信息</p>
        )}
      </div>

      {/* Diagnostic Health Check Suite */}
      <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-white">一键全链路诊断</h3>
          </div>
          <button
            type="button"
            onClick={handleRunDiagnostics}
            disabled={diagnosing}
            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Play className={`w-3 h-3 ${diagnosing ? 'animate-spin' : ''}`} />
            <span>{diagnosing ? '正在诊断...' : '执行诊断'}</span>
          </button>
        </div>

        {safeDiagnostics.length === 0 ? (
          <p className="text-[11px] text-slate-400">
            点击「执行诊断」可自动检测 AWS 连通性、Cloudflare Token 有效性、DNS 解析漂移与快照完整性。
          </p>
        ) : (
          <div className="space-y-2 pt-1">
            {safeDiagnostics.map((d) => (
              <div
                key={d.id}
                className={`p-2.5 rounded-xl border flex items-start gap-2.5 ${
                  d.status === 'success'
                    ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                    : d.status === 'warning'
                    ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                    : 'bg-rose-950/20 border-rose-800/40 text-rose-200'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {d.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : d.status === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                </div>
                <div className="flex-1">
                  <span className="font-semibold text-white block">{d.name}</span>
                  <span className="text-[11px] opacity-90">{d.message}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fault Injection Quick Toggles */}
      <div className="p-3.5 rounded-2xl bg-amber-950/15 border border-amber-900/30 space-y-2">
        <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
          <Flame className="w-4 h-4 text-rose-400" />
          <span>模拟异常注入 (验证系统容错排查)</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(config?.simulateFaults?.awsThrottle)}
              onChange={(e) =>
                updateConfig({
                  simulateFaults: {
                    awsThrottle: e.target.checked,
                    cloudflareError: Boolean(config?.simulateFaults?.cloudflareError),
                    snapshotTimeout: Boolean(config?.simulateFaults?.snapshotTimeout),
                  },
                })
              }
              className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
            />
            <span className="text-slate-300">AWS 429 限流</span>
          </label>

          <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(config?.simulateFaults?.cloudflareError)}
              onChange={(e) =>
                updateConfig({
                  simulateFaults: {
                    awsThrottle: Boolean(config?.simulateFaults?.awsThrottle),
                    cloudflareError: e.target.checked,
                    snapshotTimeout: Boolean(config?.simulateFaults?.snapshotTimeout),
                  },
                })
              }
              className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
            />
            <span className="text-slate-300">Cloudflare 异常</span>
          </label>
        </div>
      </div>

      {/* API Log Stream Inspector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <h3 className="font-bold text-white">API 调用轨迹与日志</h3>
            <span className="text-[10px] font-mono text-slate-500">({filteredLogs.length})</span>
          </div>

          <button
            type="button"
            onClick={clearApiLogs}
            className="text-slate-400 hover:text-rose-400 flex items-center gap-1 text-[11px]"
          >
            <Trash2 className="w-3 h-3" />
            <span>清空日志</span>
          </button>
        </div>

        {/* Filter Controls */}
        <div className="space-y-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索 Action 或 Endpoint..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setOnlyErrors(!onlyErrors)}
              className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                onlyErrors
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              仅显示错误
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
            {['ALL', 'AWS_LIGHTSAIL', 'CLOUDFLARE_DNS', 'SCHEDULER', 'DIAGNOSTIC'].map((svc) => (
              <button
                key={svc}
                type="button"
                onClick={() => setServiceFilter(svc)}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  serviceFilter === svc
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {svc === 'ALL'
                  ? '全部服务'
                  : svc === 'AWS_LIGHTSAIL'
                  ? 'AWS'
                  : svc === 'CLOUDFLARE_DNS'
                  ? 'Cloudflare'
                  : svc === 'SCHEDULER'
                  ? '调度器'
                  : '系统诊断'}
              </button>
            ))}
          </div>
        </div>

        {/* Logs Feed */}
        <div className="space-y-2">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 rounded-xl border border-dashed border-slate-800 bg-slate-950/30 text-slate-500">
              暂无符合条件的 API 调用日志
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              let formattedTime = '';
              try {
                formattedTime = new Date(log.timestamp).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });
              } catch {}

              return (
                <div
                  key={log.id}
                  className={`rounded-xl border transition-all overflow-hidden ${
                    log.success
                      ? 'bg-slate-950/80 border-slate-800'
                      : 'bg-rose-950/20 border-rose-900/40'
                  }`}
                >
                  {/* Summary Row */}
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="p-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-900/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ${
                          log.method === 'POST'
                            ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                            : log.method === 'GET'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {log.method}
                      </span>

                      <div className="min-w-0">
                        <span className="font-mono text-white font-semibold text-xs block truncate">
                          {log.action}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate max-w-[200px]">
                          {log.endpoint}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-mono font-semibold ${
                          log.status === 200
                            ? 'text-emerald-400'
                            : log.status === 429
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {log.status}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">{log.latencyMs}ms</span>
                      <span className="text-[10px] text-slate-500 font-mono">{formattedTime}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <div className="p-3 bg-slate-900/90 border-t border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono text-slate-400">
                          服务: <strong className="text-white">{log.service}</strong> · 耗时:{' '}
                          <strong className="text-white">{log.latencyMs} ms</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => copyLogJson(log)}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          <span>复制完整 JSON</span>
                        </button>
                      </div>

                      {log.errorMessage && (
                        <div className="p-2 rounded bg-rose-950/60 border border-rose-800/60 text-rose-300 font-mono text-[11px] break-all">
                          {log.errorMessage}
                        </div>
                      )}

                      {log.requestPayload && (
                        <div>
                          <span className="text-[10px] text-slate-400 block mb-0.5">Request Payload:</span>
                          <pre className="bg-slate-950 p-2 rounded border border-slate-800 text-[10px] font-mono text-slate-300 overflow-x-auto max-h-36">
                            {JSON.stringify(log.requestPayload, null, 2)}
                          </pre>
                        </div>
                      )}

                      {log.responsePayload && (
                        <div>
                          <span className="text-[10px] text-slate-400 block mb-0.5">Response Payload:</span>
                          <pre className="bg-slate-950 p-2 rounded border border-slate-800 text-[10px] font-mono text-slate-300 overflow-x-auto max-h-36">
                            {JSON.stringify(log.responsePayload, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
