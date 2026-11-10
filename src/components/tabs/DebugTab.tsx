/**
 * Debug Tab: Live API request/response inspector, one-click diagnostics, and fault troubleshooting
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
  Filter,
  Flame,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ApiLogEntry, DiagnosticResult } from '../../types/lightsail';

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
  } = useApp();

  const [serviceFilter, setServiceFilter] = useState<string>('ALL');
  const [onlyErrors, setOnlyErrors] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState<boolean>(false);

  const filteredLogs = apiLogs.filter((log) => {
    if (serviceFilter !== 'ALL' && log.service !== serviceFilter) return false;
    if (onlyErrors && log.success) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchAction = log.action.toLowerCase().includes(term);
      const matchEndpoint = log.endpoint.toLowerCase().includes(term);
      const matchErr = log.errorMessage?.toLowerCase().includes(term);
      return matchAction || matchEndpoint || matchErr;
    }
    return true;
  });

  const handleRunDiagnostics = async () => {
    setDiagnosing(true);
    await runDiagnostics();
    setDiagnosing(false);
  };

  const copyLogJson = (log: ApiLogEntry) => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    showToast('日志详情已复制到剪贴板', 'info');
  };

  const exportDebugBundle = () => {
    const bundle = {
      timestamp: new Date().toISOString(),
      config: {
        mode: config.mode,
        awsRegion: config.awsRegion,
        hasAwsKey: !!config.awsAccessKeyId,
        hasCloudflareToken: !!config.cloudflareApiToken,
        cloudflareZoneId: config.cloudflareZoneId,
      },
      instances: instances.map((i) => ({
        name: i.name,
        state: i.state,
        ip: i.publicIpAddress,
        domain: i.cloudflareBinding?.domain,
      })),
      snapshots: snapshots.map((s) => ({
        name: s.name,
        from: s.fromInstanceName,
        size: s.sizeInGb,
      })),
      recentLogs: apiLogs.slice(0, 30),
      diagnostics,
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lightsail-debug-bundle-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出调试诊断报告包 (JSON)', 'success');
  };

  return (
    <div className="p-4 space-y-4 pb-24 text-xs">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">调试与排查中心</h2>
          <p className="text-slate-400">调用日志流、全链路连通性诊断与异常排查接口</p>
        </div>
        <button
          onClick={exportDebugBundle}
          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
          title="导出调试日志与诊断快照"
        >
          <Download className="w-3.5 h-3.5 text-indigo-400" />
          <span>导出诊断包</span>
        </button>
      </div>

      {/* Diagnostic Health Check Suite */}
      <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-white">一键全链路诊断</h3>
          </div>
          <button
            onClick={handleRunDiagnostics}
            disabled={diagnosing}
            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Play className={`w-3 h-3 ${diagnosing ? 'animate-spin' : ''}`} />
            <span>{diagnosing ? '正在诊断...' : '执行诊断'}</span>
          </button>
        </div>

        {diagnostics.length === 0 ? (
          <p className="text-[11px] text-slate-400">
            点击「执行诊断」可自动检测 AWS 连通性、Cloudflare Token 有效性、DNS 解析漂移与快照完整性。
          </p>
        ) : (
          <div className="space-y-2 pt-1">
            {diagnostics.map((d) => (
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
              checked={config.simulateFaults.awsThrottle}
              onChange={(e) =>
                updateConfig({
                  simulateFaults: { ...config.simulateFaults, awsThrottle: e.target.checked },
                })
              }
              className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
            />
            <span className="text-slate-300">AWS 429 限流</span>
          </label>

          <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={config.simulateFaults.cloudflareError}
              onChange={(e) =>
                updateConfig({
                  simulateFaults: { ...config.simulateFaults, cloudflareError: e.target.checked },
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

          <div className="flex items-center gap-1.5 text-[11px]">
            {['ALL', 'AWS_LIGHTSAIL', 'CLOUDFLARE_DNS', 'SCHEDULER'].map((svc) => (
              <button
                key={svc}
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
                  : '调度器'}
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
              const formattedTime = new Date(log.timestamp).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

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
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                          log.method === 'POST'
                            ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                            : log.method === 'GET'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {log.method}
                      </span>

                      <div>
                        <span className="font-mono text-white font-semibold text-xs">
                          {log.action}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate max-w-[200px]">
                          {log.endpoint}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
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
