/**
 * Android / Client-Side Direct Cloud Engine (Capacitor Native HTTP + Web Crypto SigV4)
 * Used automatically when running inside a standalone Android APK where the local Express `/api/*` server is absent.
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import {
  CloudConfig,
  CloudflareDnsRecord,
  CredentialTestReport,
  EnvSecretStatus,
  FirewallPortRule,
  GitHubReleaseAsset,
  GitHubUpdateInfo,
  LightsailInstance,
  LightsailSnapshot,
  SnapshotLifecyclePolicy,
} from '../types/lightsail';

const ANDROID_META_STORAGE_KEY = 'lightsail_android_metadata_v1';
const ANDROID_APP_VERSION_KEY = 'lightsail_android_app_version';

interface PersistedAndroidMetadata {
  preservedFirewalls: Record<
    string,
    {
      instanceName: string;
      snapshotName?: string;
      rules: FirewallPortRule[];
      updatedAt: string;
      source: 'extracted_from_aws' | 'custom_configured' | 'default_preset';
    }
  >;
  hibernatedInstances: Record<
    string,
    {
      instanceName: string;
      latestSnapshotName: string;
      hibernatedAt: string;
      bundleId: string;
      availabilityZone: string;
      regionName: string;
      blueprintName: string;
      cloudflareDomain: string;
      firewallRules: FirewallPortRule[];
    }
  >;
  snapshotAutoDeleteAt: Record<string, string | null>;
  lifecyclePolicy: SnapshotLifecyclePolicy;
}

const DEFAULT_FIREWALL_RULES: FirewallPortRule[] = [
  { fromPort: 22, toPort: 22, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'SSH' },
  { fromPort: 80, toPort: 80, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'HTTP' },
  { fromPort: 443, toPort: 443, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'HTTPS' },
];

export function loadAndroidMetadata(): PersistedAndroidMetadata {
  try {
    const raw = localStorage.getItem(ANDROID_META_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        preservedFirewalls: parsed.preservedFirewalls || {},
        hibernatedInstances: parsed.hibernatedInstances || {},
        snapshotAutoDeleteAt: parsed.snapshotAutoDeleteAt || {},
        lifecyclePolicy: {
          enabled: parsed.lifecyclePolicy?.enabled ?? true,
          defaultRetentionHours: parsed.lifecyclePolicy?.defaultRetentionHours ?? 168,
          maxSnapshotsPerInstance: parsed.lifecyclePolicy?.maxSnapshotsPerInstance ?? 3,
          protectLatestHibernatedSnapshot:
            parsed.lifecyclePolicy?.protectLatestHibernatedSnapshot ?? true,
        },
      };
    }
  } catch {}
  return {
    preservedFirewalls: {},
    hibernatedInstances: {},
    snapshotAutoDeleteAt: {},
    lifecyclePolicy: {
      enabled: true,
      defaultRetentionHours: 168,
      maxSnapshotsPerInstance: 3,
      protectLatestHibernatedSnapshot: true,
    },
  };
}

export function saveAndroidMetadata(meta: PersistedAndroidMetadata): void {
  try {
    localStorage.setItem(ANDROID_META_STORAGE_KEY, JSON.stringify(meta));
  } catch {}
}

function maskSecret(val?: string): { configured: boolean; maskedPreview: string | null; length: number } {
  const clean = (val || '').trim();
  if (!clean) {
    return { configured: false, maskedPreview: null, length: 0 };
  }
  if (clean.length <= 8) {
    return { configured: true, maskedPreview: `${clean.slice(0, 2)}***`, length: clean.length };
  }
  return {
    configured: true,
    maskedPreview: `${clean.slice(0, 4)}••••${clean.slice(-4)}`,
    length: clean.length,
  };
}

export function getClientCredentialStatus(config?: CloudConfig): EnvSecretStatus {
  let storedConfig: Partial<CloudConfig> = config || {};
  if (!config) {
    try {
      const raw = localStorage.getItem('lightsail_cloud_config');
      if (raw) storedConfig = JSON.parse(raw);
    } catch {}
  }
  const customDomain = localStorage.getItem('lightsail_custom_domain');
  return {
    awsAccessKeyId: maskSecret(storedConfig.awsAccessKeyId),
    awsSecretAccessKey: maskSecret(storedConfig.awsSecretAccessKey),
    awsRegion: storedConfig.awsRegion || 'ap-northeast-1',
    cloudflareApiToken: maskSecret(storedConfig.cloudflareApiToken),
    cloudflareZoneId: maskSecret(storedConfig.cloudflareZoneId),
    cloudflareRecordName:
      customDomain || storedConfig.defaultDnsRecordName || 'test.selfgo.asia',
  };
}

/**
 * Perform HTTP request using CapacitorHttp on native Android (bypasses CORS) or standard fetch on Web
 */
async function universalHttpRequest(options: {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ ok: boolean; status: number; data: any }> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await CapacitorHttp.request({
        url: options.url,
        method: options.method,
        headers: options.headers || {},
        data: options.body ? JSON.parse(options.body) : undefined,
      });
      const parsedData =
        typeof res.data === 'string'
          ? (() => {
              try {
                return JSON.parse(res.data);
              } catch {
                return { message: res.data };
              }
            })()
          : res.data || {};
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        data: parsedData,
      };
    } catch (e: any) {
      return {
        ok: false,
        status: 500,
        data: { error: e?.message || 'Native HTTP Error' },
      };
    }
  }

  const res = await fetch(options.url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Web Crypto SHA-256 & HMAC helpers for AWS Signature V4
 */
async function sha256Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const rawKey = key instanceof Uint8Array ? (key.buffer as ArrayBuffer) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function hmacSha256Hex(key: ArrayBuffer | Uint8Array, message: string): Promise<string> {
  const sig = await hmacSha256(key, message);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function clientAwsLightsailRequest(
  action: string,
  payload: Record<string, unknown>,
  config: CloudConfig
) {
  const accessKeyId = (config.awsAccessKeyId || '').trim();
  const secretAccessKey = (config.awsSecretAccessKey || '').trim();
  const region = (config.awsRegion || 'ap-northeast-1').trim();

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('当前处于 Android 独立运行模式，请在「设置」中填入 AWS Access Key ID 与 Secret Access Key');
  }

  const service = 'lightsail';
  const host = `lightsail.${region}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  const amzTarget = `Lightsail_20161128.${action}`;
  const contentType = 'application/x-amz-json-1.1';
  const body = JSON.stringify(payload);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(body);

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${amzTarget}\n`;

  const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalHash = await sha256Hex(canonicalRequest);
  const stringToSign = [algorithm, amzDate, credentialScope, canonicalHash].join('\n');

  const kSecret = new TextEncoder().encode(`AWS4${secretAccessKey}`);
  const kDate = await hmacSha256(kSecret, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = await hmacSha256Hex(kSigning, stringToSign);

  const authorizationHeader =
    `${algorithm} Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const start = Date.now();
  const response = await universalHttpRequest({
    url: endpoint,
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'X-Amz-Date': amzDate,
      'X-Amz-Target': amzTarget,
      Authorization: authorizationHeader,
    },
    body,
  });

  return {
    ok: response.ok,
    status: response.status,
    latencyMs: Date.now() - start,
    data: response.data,
    endpoint: `${host}/`,
  };
}

export async function clientCheckGitHubUpdate(repo?: string): Promise<GitHubUpdateInfo> {
  const targetRepo = (repo || 'gansxx/aws_lightsail_manager').trim();
  const currentVersion = localStorage.getItem(ANDROID_APP_VERSION_KEY) || '1.0.1';
  const ghHeaders: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  };

  let latestVersion = currentVersion;
  let releaseTag: string | null = `v${currentVersion}`;
  let releaseName: string | null = `v${currentVersion}`;
  let publishedAt: string | null = new Date().toISOString();
  let releaseNotes: string | null = '';
  let htmlUrl = `https://github.com/${targetRepo}/releases`;
  let apkAssets: GitHubReleaseAsset[] = [];

  try {
    const relRes = await universalHttpRequest({
      url: `https://api.github.com/repos/${targetRepo}/releases?per_page=5`,
      method: 'GET',
      headers: ghHeaders,
    });
    if (relRes.ok && Array.isArray(relRes.data) && relRes.data.length > 0) {
      const latestRel = relRes.data[0];
      releaseTag = latestRel.tag_name || releaseTag;
      latestVersion = String(latestRel.tag_name || latestVersion).replace(/^v/i, '');
      releaseName = latestRel.name || latestRel.tag_name || releaseName;
      publishedAt = latestRel.published_at || latestRel.created_at || publishedAt;
      releaseNotes = latestRel.body || 'GitHub Release 版本发布';
      htmlUrl = latestRel.html_url || htmlUrl;
      if (Array.isArray(latestRel.assets)) {
        apkAssets = latestRel.assets
          .filter((a: any) => a?.name && (a.name.endsWith('.apk') || a.name.endsWith('.zip')))
          .map((a: any) => {
            const sizeBytes = Number(a.size) || 0;
            return {
              name: String(a.name),
              downloadUrl: String(a.browser_download_url || htmlUrl),
              sizeBytes,
              sizeMb: (sizeBytes / (1024 * 1024)).toFixed(2),
              downloadCount: Number(a.download_count) || 0,
            };
          });
      }
    }
  } catch {}

  let latestCommit: GitHubUpdateInfo['latestCommit'] = null;
  try {
    const commitRes = await universalHttpRequest({
      url: `https://api.github.com/repos/${targetRepo}/commits/main`,
      method: 'GET',
      headers: ghHeaders,
    });
    if (commitRes.ok && commitRes.data?.sha) {
      latestCommit = {
        sha: String(commitRes.data.sha).slice(0, 7),
        message: String(commitRes.data.commit?.message || '').split('\n')[0],
        date: commitRes.data.commit?.committer?.date || new Date().toISOString(),
        author: commitRes.data.commit?.author?.name || 'Developer',
        url: commitRes.data.html_url || `https://github.com/${targetRepo}/commits/main`,
      };
    }
  } catch {}

  const normalize = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const cParts = normalize(currentVersion);
  const lParts = normalize(latestVersion);
  let hasUpdate = false;
  for (let i = 0; i < Math.max(cParts.length, lParts.length); i++) {
    const l = lParts[i] || 0;
    const c = cParts[i] || 0;
    if (l > c) {
      hasUpdate = true;
      break;
    }
    if (l < c) break;
  }

  return {
    repo: targetRepo,
    currentVersion,
    latestVersion,
    hasUpdate,
    releaseTag,
    releaseName,
    publishedAt,
    releaseNotes,
    htmlUrl,
    apkAssets: Array.isArray(apkAssets) ? apkAssets : [],
    latestCommit,
    checkedAt: new Date().toISOString(),
  };
}

export function clientSyncGitHubVersion(version: string): {
  success: boolean;
  currentVersion: string;
} {
  const clean = String(version || '1.0.1').replace(/^v/i, '').trim();
  try {
    localStorage.setItem(ANDROID_APP_VERSION_KEY, clean);
  } catch {}
  return { success: true, currentVersion: clean };
}

export async function clientTestCredentials(config: CloudConfig): Promise<CredentialTestReport> {
  const awsAccessKeyId = (config.awsAccessKeyId || '').trim();
  const awsSecretAccessKey = (config.awsSecretAccessKey || '').trim();
  const awsRegion = (config.awsRegion || 'ap-northeast-1').trim();
  const cfToken = (config.cloudflareApiToken || '').trim();
  const cfZoneId = (config.cloudflareZoneId || '').trim();

  let awsReport: CredentialTestReport['aws'] = {
    configured: Boolean(awsAccessKeyId && awsSecretAccessKey),
    source: awsAccessKeyId ? 'custom_input' : 'missing',
    success: false,
    latencyMs: 0,
    status: 0,
    message: '未配置 AWS 密钥，请在设置表单中填入 AWS_ACCESS_KEY_ID 和 AWS_SECRET_ACCESS_KEY',
  };

  if (awsAccessKeyId && awsSecretAccessKey) {
    try {
      const awsRes = await clientAwsLightsailRequest('GetInstances', {}, config);
      if (awsRes.ok) {
        const instances = Array.isArray(awsRes.data?.instances) ? awsRes.data.instances : [];
        awsReport = {
          configured: true,
          source: 'custom_input',
          success: true,
          latencyMs: awsRes.latencyMs,
          status: awsRes.status,
          message: `AWS Lightsail 连接成功 (区域 ${awsRegion}，读取到 ${instances.length} 台真实实例)`,
          details: {
            region: awsRegion,
            instanceCount: instances.length,
            instanceNames: instances.map((i: any) => i.name),
          },
        };
      } else {
        awsReport = {
          configured: true,
          source: 'custom_input',
          success: false,
          latencyMs: awsRes.latencyMs,
          status: awsRes.status,
          message: `AWS 鉴权或请求失败: ${awsRes.data?.message || awsRes.data?.__type || 'HTTP ' + awsRes.status}`,
          details: awsRes.data,
        };
      }
    } catch (e: any) {
      awsReport = {
        configured: true,
        source: 'custom_input',
        success: false,
        latencyMs: 0,
        status: 500,
        message: `AWS 网络连接异常: ${e.message}`,
      };
    }
  }

  let cfReport: CredentialTestReport['cloudflare'] = {
    configured: Boolean(cfToken),
    source: cfToken ? 'custom_input' : 'missing',
    success: false,
    latencyMs: 0,
    status: 0,
    message: '未配置 Cloudflare API Token',
  };

  if (cfToken) {
    const start = Date.now();
    try {
      const verifyUrl = cfZoneId
        ? `https://api.cloudflare.com/client/v4/zones/${cfZoneId}`
        : 'https://api.cloudflare.com/client/v4/user/tokens/verify';
      const cfRes = await universalHttpRequest({
        url: verifyUrl,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cfToken}`,
          'Content-Type': 'application/json',
        },
      });
      const latencyMs = Date.now() - start;
      if (cfRes.ok && cfRes.data?.success) {
        cfReport = {
          configured: true,
          source: 'custom_input',
          success: true,
          latencyMs,
          status: cfRes.status,
          message: cfZoneId
            ? `Cloudflare Token 与域名 Zone (${cfRes.data.result?.name || cfZoneId}) 验证通过`
            : 'Cloudflare API Token 验证通过',
          details: cfRes.data.result,
        };
      } else {
        cfReport = {
          configured: true,
          source: 'custom_input',
          success: false,
          latencyMs,
          status: cfRes.status,
          message: `Cloudflare 鉴权失败: ${cfRes.data?.errors?.[0]?.message || 'HTTP ' + cfRes.status}`,
          details: cfRes.data,
        };
      }
    } catch (e: any) {
      cfReport = {
        configured: true,
        source: 'custom_input',
        success: false,
        latencyMs: Date.now() - start,
        status: 500,
        message: `Cloudflare 网络请求异常: ${e.message}`,
      };
    }
  }

  return {
    timestamp: new Date().toISOString(),
    aws: awsReport,
    cloudflare: cfReport,
  };
}

export async function clientSyncCloudflareDns(
  domainName: string,
  ip: string,
  zoneId: string,
  proxied: boolean,
  config: CloudConfig
): Promise<{ record: CloudflareDnsRecord; latencyMs: number }> {
  const cfToken = (config.cloudflareApiToken || '').trim();
  const targetZoneId = (zoneId || config.cloudflareZoneId || '').trim();
  if (!cfToken || !targetZoneId) {
    throw new Error('缺少 Cloudflare API Token 或 Zone ID，请在设置中配置');
  }

  const start = Date.now();
  const listRes = await universalHttpRequest({
    url: `https://api.cloudflare.com/client/v4/zones/${targetZoneId}/dns_records?type=A&name=${encodeURIComponent(domainName)}`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${cfToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!listRes.ok || !listRes.data?.success) {
    throw new Error(listRes.data?.errors?.[0]?.message || '查询 Cloudflare DNS 记录失败');
  }

  const existing = listRes.data.result?.[0];
  const recordUrl = existing
    ? `https://api.cloudflare.com/client/v4/zones/${targetZoneId}/dns_records/${existing.id}`
    : `https://api.cloudflare.com/client/v4/zones/${targetZoneId}/dns_records`;

  const saveRes = await universalHttpRequest({
    url: recordUrl,
    method: existing ? 'PUT' : 'POST',
    headers: {
      Authorization: `Bearer ${cfToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'A',
      name: domainName,
      content: ip,
      ttl: 60,
      proxied: Boolean(proxied),
    }),
  });

  if (!saveRes.ok || !saveRes.data?.success) {
    throw new Error(saveRes.data?.errors?.[0]?.message || '更新 Cloudflare DNS 记录失败');
  }

  const r = saveRes.data.result;
  return {
    record: {
      id: r.id,
      zone_id: targetZoneId,
      zone_name: domainName.split('.').slice(-2).join('.'),
      name: r.name,
      type: 'A',
      content: r.content,
      proxied: r.proxied,
      ttl: r.ttl,
      modified_on: r.modified_on || new Date().toISOString(),
    },
    latencyMs: Date.now() - start,
  };
}

export async function clientGetInstances(
  config: CloudConfig
): Promise<{ instances: LightsailInstance[]; latencyMs: number; endpoint: string }> {
  const meta = loadAndroidMetadata();
  const [awsRes, snapRes] = await Promise.all([
    clientAwsLightsailRequest('GetInstances', {}, config),
    clientAwsLightsailRequest('GetInstanceSnapshots', {}, config),
  ]);

  if (!awsRes.ok) {
    throw new Error(awsRes.data?.message || `AWS Lightsail GetInstances 失败 (HTTP ${awsRes.status})`);
  }

  const defaultDomain =
    localStorage.getItem('lightsail_custom_domain') ||
    config.defaultDnsRecordName ||
    'test.selfgo.asia';
  const defaultZoneId = config.cloudflareZoneId || '';

  const rawInstances = Array.isArray(awsRes.data?.instances) ? awsRes.data.instances : [];
  const rawSnapshots =
    snapRes.ok && Array.isArray(snapRes.data?.instanceSnapshots) ? snapRes.data.instanceSnapshots : [];
  const activeNames = new Set<string>();

  const instances: LightsailInstance[] = rawInstances.map((inst: any) => {
    activeNames.add(inst.name);
    const livePorts: FirewallPortRule[] = Array.isArray(inst.networking?.ports)
      ? inst.networking.ports.map((p: any) => ({
          fromPort: Number(p.fromPort ?? 80),
          toPort: Number(p.toPort ?? p.fromPort ?? 80),
          protocol: (String(p.protocol || 'tcp').toLowerCase() as FirewallPortRule['protocol']),
          cidrs: Array.isArray(p.cidrs) && p.cidrs.length > 0 ? p.cidrs : ['0.0.0.0/0'],
          cidrListAliases: Array.isArray(p.cidrListAliases) ? p.cidrListAliases : [],
          commonName: p.commonName,
        }))
      : meta.preservedFirewalls[inst.name]?.rules || DEFAULT_FIREWALL_RULES;

    if (livePorts.length > 0) {
      meta.preservedFirewalls[inst.name] = {
        instanceName: inst.name,
        rules: livePorts,
        updatedAt: new Date().toISOString(),
        source: 'extracted_from_aws',
      };
    }

    const bundleId = inst.bundleId || 'nano_3_0';
    return {
      name: inst.name,
      arn: inst.arn || '',
      blueprintId: inst.blueprintId || 'ubuntu_22_04',
      blueprintName: inst.blueprintName || 'Ubuntu',
      bundleId,
      bundleName: `${bundleId} (${inst.hardware?.ramSizeInGb || 0.5}GB RAM, ${inst.hardware?.cpuCount || 2} vCPU)`,
      ramGb: inst.hardware?.ramSizeInGb || 0.5,
      cpuCount: inst.hardware?.cpuCount || 2,
      diskSizeGb: inst.hardware?.disks?.[0]?.sizeInGb || 20,
      monthlyCostUsd: 5.0,
      state: (inst.state?.name || 'running') as LightsailInstance['state'],
      publicIpAddress: inst.publicIpAddress || null,
      privateIpAddress: inst.privateIpAddress || '172.26.0.1',
      ipv6Addresses: inst.ipv6Addresses || [],
      location: {
        availabilityZone: inst.location?.availabilityZone || `${config.awsRegion}a`,
        regionName: inst.location?.regionName || config.awsRegion,
      },
      createdAt: inst.createdAt
        ? new Date(inst.createdAt * 1000).toISOString()
        : new Date().toISOString(),
      cloudflareBinding: {
        enabled: true,
        domain: defaultDomain,
        zoneId: defaultZoneId,
        recordId: '',
        proxied: false,
        lastUpdatedIp: inst.publicIpAddress || '',
        lastSyncTime: new Date().toISOString(),
      },
      autoHibernateSchedule: { enabled: false, time: '02:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
      autoStartSchedule: { enabled: false, time: '08:30', daysOfWeek: [1, 2, 3, 4, 5] },
      firewallRules: livePorts,
      firewallExtractedAt: meta.preservedFirewalls[inst.name]?.updatedAt || new Date().toISOString(),
    };
  });

  // Also synthesize hibernated instances from snapshots
  const snapshotsByInstance = new Map<string, any>();
  for (const snap of rawSnapshots) {
    const fromName = snap.fromInstanceName;
    if (!fromName || activeNames.has(fromName)) continue;
    const prev = snapshotsByInstance.get(fromName);
    if (!prev || Number(snap.createdAt || 0) > Number(prev.createdAt || 0)) {
      snapshotsByInstance.set(fromName, snap);
    }
  }

  for (const [fromName, latestSnap] of snapshotsByInstance.entries()) {
    const savedRecord = meta.hibernatedInstances[fromName];
    const preservedFw =
      meta.preservedFirewalls[latestSnap.name]?.rules ||
      meta.preservedFirewalls[fromName]?.rules ||
      savedRecord?.firewallRules ||
      DEFAULT_FIREWALL_RULES;
    const bundleId = latestSnap.fromBundleId || savedRecord?.bundleId || 'micro_3_0';

    instances.push({
      name: fromName,
      arn: latestSnap.arn || `arn:aws:lightsail:${config.awsRegion}:hibernated:${fromName}`,
      blueprintId: latestSnap.fromBlueprintId || 'ubuntu_22_04',
      blueprintName: savedRecord?.blueprintName || 'Ubuntu 22.04 LTS',
      bundleId,
      bundleName: `${bundleId} (已休眠省钱中)`,
      ramGb: 1,
      cpuCount: 2,
      diskSizeGb: latestSnap.sizeInGb || 40,
      monthlyCostUsd: 5.0,
      state: 'hibernated',
      publicIpAddress: null,
      privateIpAddress: '172.26.0.0',
      ipv6Addresses: [],
      location: {
        availabilityZone: savedRecord?.availabilityZone || `${config.awsRegion}a`,
        regionName: latestSnap.location?.regionName || config.awsRegion,
      },
      createdAt: latestSnap.createdAt
        ? new Date(latestSnap.createdAt * 1000).toISOString()
        : new Date().toISOString(),
      lastSnapshotName: latestSnap.name,
      lastSnapshotTime:
        savedRecord?.hibernatedAt ||
        (latestSnap.createdAt
          ? new Date(latestSnap.createdAt * 1000).toISOString()
          : new Date().toISOString()),
      cloudflareBinding: {
        enabled: true,
        domain: savedRecord?.cloudflareDomain || defaultDomain,
        zoneId: defaultZoneId,
        recordId: '',
        proxied: false,
        lastUpdatedIp: '已释放 (休眠中)',
        lastSyncTime: savedRecord?.hibernatedAt || new Date().toISOString(),
      },
      autoHibernateSchedule: { enabled: false, time: '02:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
      autoStartSchedule: { enabled: false, time: '08:30', daysOfWeek: [1, 2, 3, 4, 5] },
      firewallRules: preservedFw,
      firewallExtractedAt: meta.preservedFirewalls[fromName]?.updatedAt,
    });
  }

  saveAndroidMetadata(meta);
  return { instances, latencyMs: awsRes.latencyMs, endpoint: awsRes.endpoint };
}

export async function clientGetSnapshots(
  config: CloudConfig
): Promise<{ snapshots: LightsailSnapshot[]; latencyMs: number; endpoint: string }> {
  const meta = loadAndroidMetadata();
  const awsRes = await clientAwsLightsailRequest('GetInstanceSnapshots', {}, config);
  if (!awsRes.ok) {
    throw new Error(awsRes.data?.message || `AWS Lightsail GetInstanceSnapshots 失败 (HTTP ${awsRes.status})`);
  }

  const rawSnapshots = Array.isArray(awsRes.data?.instanceSnapshots) ? awsRes.data.instanceSnapshots : [];
  const snapshots: LightsailSnapshot[] = rawSnapshots.map((s: any) => {
    const snapName = s.name;
    const fromInstance = s.fromInstanceName || 'unknown';
    const fwRules =
      meta.preservedFirewalls[snapName]?.rules ||
      meta.preservedFirewalls[fromInstance]?.rules ||
      undefined;

    return {
      name: snapName,
      arn: s.arn || '',
      fromInstanceName: fromInstance,
      fromInstanceArn: s.fromInstanceArn || '',
      fromBlueprintId: s.fromBlueprintId || 'ubuntu_22_04',
      fromBundleId: s.fromBundleId || 'nano_3_0',
      sizeInGb: s.sizeInGb || 20,
      state: s.state === 'available' ? 'available' : s.state === 'pending' ? 'in-progress' : 'error',
      progress: s.progress || '100%',
      createdAt: s.createdAt ? new Date(s.createdAt * 1000).toISOString() : new Date().toISOString(),
      isAutoHibernateSnapshot:
        snapName.includes('hib-') || snapName.includes('auto-') || snapName.includes('snap-'),
      autoDeleteAt: meta.snapshotAutoDeleteAt[snapName] || null,
      preservedConfig: {
        blueprintId: s.fromBlueprintId || 'ubuntu_22_04',
        bundleId: s.fromBundleId || 'nano_3_0',
        availabilityZone: s.location?.availabilityZone || `${config.awsRegion}a`,
        firewallRules: fwRules,
      },
    };
  });

  return { snapshots, latencyMs: awsRes.latencyMs, endpoint: awsRes.endpoint };
}
