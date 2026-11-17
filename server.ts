import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_GITHUB_REPO = 'gansxx/aws_lightsail_manager';

function getLocalAppVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return String(pkg.version || '0.0.1').replace(/^v/, '');
  } catch {
    return '0.0.1';
  }
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

const PLACEHOLDER_AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';
const PLACEHOLDER_AWS_SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const PLACEHOLDER_CF_TOKEN = 'cf_tok_live_839a9b1837f81a7b';
const PLACEHOLDER_CF_ZONE = 'cf-zone-983b8a1e2f';

interface CredentialOverrides {
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsSessionToken?: string;
  awsRegion?: string;
  cloudflareApiToken?: string;
  cloudflareZoneId?: string;
  defaultDnsRecordName?: string;
}

interface ResolvedCredentials {
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken: string;
  awsRegion: string;
  rawAwsRegionInput: string;
  awsAvailabilityZone: string;
  awsSource: 'env_secret' | 'custom_input' | 'missing';
  cloudflareApiToken: string;
  cloudflareZoneId: string;
  cloudflareRecordName: string;
  cloudflareSource: 'env_secret' | 'custom_input' | 'missing';
}

function normalizeAwsRegion(input: string | undefined): { region: string; az: string; raw: string } {
  const raw = (input || 'ap-northeast-1').trim() || 'ap-northeast-1';
  // If user configured an Availability Zone (e.g. "ap-northeast-1a"), strip the trailing AZ letter for the regional endpoint
  const azMatch = raw.match(/^([a-z]{2}(?:-[a-z]+)+-\d+)([a-z])$/i);
  if (azMatch) {
    return { region: azMatch[1].toLowerCase(), az: raw.toLowerCase(), raw };
  }
  const region = raw.toLowerCase();
  return { region, az: `${region}a`, raw };
}

function maskSecret(val: string | undefined): { configured: boolean; maskedPreview: string | null; length: number } {
  const trimmed = (val || '').trim();
  if (!trimmed) {
    return { configured: false, maskedPreview: null, length: 0 };
  }
  const len = trimmed.length;
  if (len <= 8) {
    return { configured: true, maskedPreview: `${trimmed.slice(0, 2)}****`, length: len };
  }
  return {
    configured: true,
    maskedPreview: `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`,
    length: len,
  };
}

function isCustomValue(val: string | undefined, placeholder: string): val is string {
  const trimmed = (val || '').trim();
  return Boolean(trimmed && trimmed !== placeholder);
}

function resolveCredentials(overrides?: CredentialOverrides): ResolvedCredentials {
  const envAwsKey = (process.env.AWS_ACCESS_KEY_ID || '').trim();
  const envAwsSecret = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  const envAwsSession = (process.env.AWS_SESSION_TOKEN || '').trim();
  const envAwsRegion = (process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || 'ap-northeast-1').trim();
  const envCfToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const envCfZone = (process.env.CLOUDFLARE_ZONE_ID || '').trim();
  const envCfRecord = (process.env.CLOUDFLARE_RECORD_NAME || '').trim();

  const customAwsKey = isCustomValue(overrides?.awsAccessKeyId, PLACEHOLDER_AWS_KEY)
    ? overrides!.awsAccessKeyId!.trim()
    : '';
  const customAwsSecret = isCustomValue(overrides?.awsSecretAccessKey, PLACEHOLDER_AWS_SECRET)
    ? overrides!.awsSecretAccessKey!.trim()
    : '';
  const customAwsSession = (overrides?.awsSessionToken || '').trim();

  let awsAccessKeyId = '';
  let awsSecretAccessKey = '';
  let awsSessionToken = '';
  let awsSource: 'env_secret' | 'custom_input' | 'missing' = 'missing';

  if (customAwsKey && customAwsSecret) {
    awsAccessKeyId = customAwsKey;
    awsSecretAccessKey = customAwsSecret;
    awsSessionToken = customAwsSession;
    awsSource = 'custom_input';
  } else if (envAwsKey && envAwsSecret) {
    awsAccessKeyId = envAwsKey;
    awsSecretAccessKey = envAwsSecret;
    awsSessionToken = envAwsSession;
    awsSource = 'env_secret';
  } else if (customAwsKey || envAwsKey) {
    awsAccessKeyId = customAwsKey || envAwsKey;
    awsSecretAccessKey = customAwsSecret || envAwsSecret;
    awsSessionToken = customAwsSession || envAwsSession;
    awsSource = customAwsKey ? 'custom_input' : 'env_secret';
  }

  const normalizedRegion = normalizeAwsRegion((overrides?.awsRegion || '').trim() || envAwsRegion || 'ap-northeast-1');

  const customCfToken = isCustomValue(overrides?.cloudflareApiToken, PLACEHOLDER_CF_TOKEN)
    ? overrides!.cloudflareApiToken!.trim()
    : '';
  const customCfZone = isCustomValue(overrides?.cloudflareZoneId, PLACEHOLDER_CF_ZONE)
    ? overrides!.cloudflareZoneId!.trim()
    : '';

  let cloudflareApiToken = '';
  let cloudflareZoneId = '';
  let cloudflareSource: 'env_secret' | 'custom_input' | 'missing' = 'missing';

  if (customCfToken) {
    cloudflareApiToken = customCfToken;
    cloudflareZoneId = customCfZone || envCfZone;
    cloudflareSource = 'custom_input';
  } else if (envCfToken) {
    cloudflareApiToken = envCfToken;
    cloudflareZoneId = customCfZone || envCfZone;
    cloudflareSource = 'env_secret';
  }

  const meta = loadMetadataStore();
  const overrideDomain = (overrides?.defaultDnsRecordName || '').trim();
  if (overrideDomain && overrideDomain !== 'vpn.example.com' && overrideDomain !== meta.customDefaultDnsRecordName) {
    meta.customDefaultDnsRecordName = overrideDomain;
    saveMetadataStore(meta);
  }

  const cloudflareRecordName =
    (overrideDomain && overrideDomain !== 'vpn.example.com' ? overrideDomain : '') ||
    (meta.customDefaultDnsRecordName || '').trim() ||
    envCfRecord;

  return {
    awsAccessKeyId,
    awsSecretAccessKey,
    awsSessionToken,
    awsRegion: normalizedRegion.region,
    rawAwsRegionInput: normalizedRegion.raw,
    awsAvailabilityZone: normalizedRegion.az,
    awsSource,
    cloudflareApiToken,
    cloudflareZoneId,
    cloudflareRecordName,
    cloudflareSource,
  };
}

function hmacSha256(key: crypto.BinaryLike | crypto.KeyObject, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

async function callAwsLightsail(
  action: string,
  payload: Record<string, unknown>,
  creds: ResolvedCredentials
): Promise<{
  ok: boolean;
  status: number;
  data: any;
  latencyMs: number;
  endpoint: string;
}> {
  const start = performance.now();
  const region = creds.awsRegion || 'ap-northeast-1';
  const service = 'lightsail';
  const host = `lightsail.${region}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  const target = `Lightsail_20161128.${action}`;
  const body = JSON.stringify(payload || {});

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);

  const headerEntries: Array<[string, string]> = [
    ['content-type', 'application/x-amz-json-1.1'],
    ['host', host],
    ['x-amz-date', amzDate],
    ['x-amz-target', target],
  ];
  if (creds.awsSessionToken) {
    headerEntries.push(['x-amz-security-token', creds.awsSessionToken]);
  }
  headerEntries.sort((a, b) => a[0].localeCompare(b[0]));

  const canonicalHeaders = headerEntries.map(([k, v]) => `${k}:${v}\n`).join('');
  const signedHeaders = headerEntries.map(([k]) => k).join(';');
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign =
    `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const kDate = hmacSha256(`AWS4${creds.awsSecretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${creds.awsAccessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Date': amzDate,
    'X-Amz-Target': target,
    Authorization: authorization,
  };
  if (creds.awsSessionToken) {
    reqHeaders['X-Amz-Security-Token'] = creds.awsSessionToken;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: reqHeaders,
    body,
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    data: parsed,
    latencyMs: Math.round(performance.now() - start),
    endpoint: host,
  };
}

async function callCloudflare(
  apiPath: string,
  method: string,
  creds: ResolvedCredentials,
  body?: Record<string, unknown>
): Promise<{
  ok: boolean;
  status: number;
  data: any;
  latencyMs: number;
  endpoint: string;
}> {
  const start = performance.now();
  const url = `https://api.cloudflare.com/client/v4${apiPath}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${creds.cloudflareApiToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }

  return {
    ok: response.ok && parsed?.success !== false,
    status: response.status,
    data: parsed,
    latencyMs: Math.round(performance.now() - start),
    endpoint: `api.cloudflare.com/client/v4${apiPath}`,
  };
}

interface PersistedFirewallRule {
  fromPort: number;
  toPort: number;
  protocol: 'tcp' | 'udp' | 'icmp' | 'all';
  cidrs: string[];
  ipv6Cidrs?: string[];
  cidrListAliases?: string[];
  commonName?: string;
}

interface PersistedSnapshotLifecyclePolicy {
  enabled: boolean;
  defaultRetentionHours: number | null;
  maxSnapshotsPerInstance: number | null;
  protectLatestHibernatedSnapshot: boolean;
  lastCleanupTime?: string;
  lastDeletedCount?: number;
}

interface ServerBackgroundTaskStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  detail?: string;
}

interface ServerBackgroundTask {
  id: string;
  type: 'hibernate' | 'restore' | 'manual_release';
  title: string;
  instanceName: string;
  snapshotName?: string;
  status: 'running' | 'completed' | 'failed';
  progressPercent: number;
  currentStepTitle: string;
  steps: ServerBackgroundTaskStep[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  result?: {
    publicIpAddress?: string | null;
    domain?: string;
    firewallRulesCount?: number;
  };
}

interface ServerMetadataStore {
  firewallByInstance: Record<string, { rules: PersistedFirewallRule[]; updatedAt: string }>;
  firewallBySnapshot: Record<string, { rules: PersistedFirewallRule[]; updatedAt: string }>;
  snapshotAutoDeleteAt: Record<string, string | null>;
  lifecyclePolicy: PersistedSnapshotLifecyclePolicy;
  customDefaultDnsRecordName?: string;
  domainByInstance: Record<string, string>;
  backgroundTasks: ServerBackgroundTask[];
}

const METADATA_FILE_PATH = path.resolve(__dirname, '.lightsail-metadata.json');

const DEFAULT_FIREWALL_RULES: PersistedFirewallRule[] = [
  { fromPort: 22, toPort: 22, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'SSH' },
  { fromPort: 80, toPort: 80, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'HTTP' },
  { fromPort: 443, toPort: 443, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'HTTPS' },
  { fromPort: 2080, toPort: 2080, protocol: 'tcp', cidrs: ['0.0.0.0/0'], commonName: 'Sing-box TCP' },
  { fromPort: 2080, toPort: 2080, protocol: 'udp', cidrs: ['0.0.0.0/0'], commonName: 'Sing-box UDP' },
];

const DEFAULT_LIFECYCLE_POLICY: PersistedSnapshotLifecyclePolicy = {
  enabled: true,
  defaultRetentionHours: 168, // 7 days default
  maxSnapshotsPerInstance: 3,
  protectLatestHibernatedSnapshot: true,
};

function loadMetadataStore(): ServerMetadataStore {
  try {
    if (fs.existsSync(METADATA_FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(METADATA_FILE_PATH, 'utf8'));
      return {
        firewallByInstance: raw.firewallByInstance || {},
        firewallBySnapshot: raw.firewallBySnapshot || {},
        snapshotAutoDeleteAt: raw.snapshotAutoDeleteAt || {},
        lifecyclePolicy: {
          ...DEFAULT_LIFECYCLE_POLICY,
          ...(raw.lifecyclePolicy || {}),
        },
        customDefaultDnsRecordName: raw.customDefaultDnsRecordName || undefined,
        domainByInstance: raw.domainByInstance || {},
        backgroundTasks: Array.isArray(raw.backgroundTasks) ? raw.backgroundTasks : [],
      };
    }
  } catch (e) {
    console.warn('Failed to read .lightsail-metadata.json, using default:', e);
  }
  return {
    firewallByInstance: {},
    firewallBySnapshot: {},
    snapshotAutoDeleteAt: {},
    lifecyclePolicy: { ...DEFAULT_LIFECYCLE_POLICY },
    domainByInstance: {},
    backgroundTasks: [],
  };
}

function saveMetadataStore(store: ServerMetadataStore) {
  try {
    fs.writeFileSync(METADATA_FILE_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8');
  } catch (e) {
    console.warn('Failed to write .lightsail-metadata.json:', e);
  }
}

function upsertBackgroundTask(task: ServerBackgroundTask) {
  const meta = loadMetadataStore();
  const idx = meta.backgroundTasks.findIndex((t) => t.id === task.id);
  if (idx >= 0) {
    meta.backgroundTasks[idx] = task;
  } else {
    meta.backgroundTasks.unshift(task);
  }
  meta.backgroundTasks = meta.backgroundTasks.slice(0, 30);
  saveMetadataStore(meta);
}

function inferPortCommonName(fromPort: number, toPort: number, protocol: string, existing?: string): string {
  if (existing) return existing;
  if (fromPort === 22 && toPort === 22) return 'SSH';
  if (fromPort === 80 && toPort === 80) return 'HTTP';
  if (fromPort === 443 && toPort === 443) return 'HTTPS';
  if (fromPort === 53 && toPort === 53) return 'DNS';
  if (fromPort === 3389 && toPort === 3389) return 'RDP';
  if (fromPort === 2080 || fromPort === 8388 || fromPort === 4433) return `Proxy (${protocol.toUpperCase()})`;
  return fromPort === toPort ? `Custom ${protocol.toUpperCase()} ${fromPort}` : `Range ${fromPort}-${toPort}`;
}

function normalizeFirewallRules(rawPorts: any[]): PersistedFirewallRule[] {
  if (!Array.isArray(rawPorts) || rawPorts.length === 0) return [];
  return rawPorts
    .filter((p) => p && (p.state === undefined || p.state === 'open') && typeof p.fromPort === 'number')
    .map((p) => {
      const protoRaw = String(p.protocol || 'tcp').toLowerCase();
      const protocol: 'tcp' | 'udp' | 'icmp' | 'all' =
        protoRaw === 'udp' || protoRaw === 'icmp' || protoRaw === 'all' ? protoRaw : 'tcp';
      const fromPort = Number(p.fromPort);
      const toPort = Number(p.toPort ?? p.fromPort);
      const cidrs =
        Array.isArray(p.cidrs) && p.cidrs.length > 0
          ? p.cidrs.map(String)
          : ['0.0.0.0/0'];
      const ipv6Cidrs =
        Array.isArray(p.ipv6Cidrs) && p.ipv6Cidrs.length > 0
          ? p.ipv6Cidrs.map(String)
          : undefined;
      const cidrListAliases =
        Array.isArray(p.cidrListAliases) && p.cidrListAliases.length > 0
          ? p.cidrListAliases.map(String)
          : undefined;
      return {
        fromPort,
        toPort,
        protocol,
        cidrs,
        ...(ipv6Cidrs ? { ipv6Cidrs } : {}),
        ...(cidrListAliases ? { cidrListAliases } : {}),
        commonName: inferPortCommonName(fromPort, toPort, protocol, p.commonName),
      };
    });
}

function mapAwsState(rawName?: string): 'pending' | 'running' | 'stopping' | 'stopped' | 'shutting-down' | 'terminated' {
  const s = (rawName || 'running').toLowerCase();
  if (s === 'pending' || s === 'running' || s === 'stopping' || s === 'stopped' || s === 'shutting-down' || s === 'terminated') {
    return s;
  }
  return 'running';
}

function mapAwsInstance(
  raw: any,
  cfRecords: any[],
  meta: ServerMetadataStore,
  defaultDomain?: string,
  defaultZoneId?: string
) {
  const stateName = mapAwsState(raw?.state?.name);
  const publicIp = raw?.publicIpAddress || null;
  const preferredDomain = (
    meta.domainByInstance?.[raw.name] ||
    meta.customDefaultDnsRecordName ||
    defaultDomain ||
    ''
  ).trim();

  // Prioritize matching the user's configured domain first, falling back to publicIp match only if no preferred domain is set
  const matchedByName = preferredDomain
    ? cfRecords.find((r) => r.name?.toLowerCase() === preferredDomain.toLowerCase())
    : undefined;
  const matchedByIp = !preferredDomain
    ? cfRecords.find((r) => publicIp && r.content === publicIp)
    : undefined;
  const matchedCf = matchedByName || matchedByIp;

  const liveRules = normalizeFirewallRules(raw?.networking?.ports || []);
  let firewallRules = liveRules;
  let firewallExtractedAt = new Date().toISOString();

  if (liveRules.length > 0) {
    meta.firewallByInstance[raw.name] = {
      rules: liveRules,
      updatedAt: firewallExtractedAt,
    };
  } else if (meta.firewallByInstance[raw.name]?.rules?.length) {
    firewallRules = meta.firewallByInstance[raw.name].rules;
    firewallExtractedAt = meta.firewallByInstance[raw.name].updatedAt;
  } else {
    firewallRules = DEFAULT_FIREWALL_RULES;
  }

  return {
    name: raw.name,
    arn: raw.arn,
    blueprintId: raw.blueprintId || 'ubuntu_22_04',
    blueprintName: raw.blueprintName || raw.blueprintId || 'Linux',
    bundleId: raw.bundleId || 'micro_2_0',
    bundleName: `${raw.hardware?.ramSizeInGb ?? 1} GB RAM, ${raw.hardware?.cpuCount ?? 1} vCPU, ${raw.hardware?.disks?.[0]?.sizeInGb ?? 40} GB SSD`,
    ramGb: raw.hardware?.ramSizeInGb ?? 1,
    cpuCount: raw.hardware?.cpuCount ?? 1,
    diskSizeGb: raw.hardware?.disks?.[0]?.sizeInGb ?? 40,
    monthlyCostUsd: raw.bundleId?.includes('nano') ? 3.5 : raw.bundleId?.includes('small') ? 10 : raw.bundleId?.includes('medium') ? 20 : 5,
    state: stateName,
    publicIpAddress: publicIp,
    privateIpAddress: raw.privateIpAddress || '0.0.0.0',
    ipv6Addresses: raw.ipv6Addresses || [],
    location: {
      availabilityZone: raw.location?.availabilityZone || 'ap-northeast-1a',
      regionName: raw.location?.regionName || 'ap-northeast-1',
    },
    createdAt: raw.createdAt ? new Date(raw.createdAt * 1000).toISOString() : new Date().toISOString(),
    tags: raw.tags || [],
    keyPairName: raw.sshKeyName,
    firewallRules,
    firewallExtractedAt,
    cloudflareBinding: matchedCf
      ? {
          enabled: true,
          domain: preferredDomain || matchedCf.name,
          zoneId: matchedCf.zone_id || defaultZoneId || '',
          recordId: matchedCf.id,
          proxied: Boolean(matchedCf.proxied),
          lastUpdatedIp: matchedCf.content,
          lastSyncTime: matchedCf.modified_on,
        }
      : preferredDomain
      ? {
          enabled: true,
          domain: preferredDomain,
          zoneId: defaultZoneId || '',
          proxied: false,
        }
      : undefined,
  };
}

function mapAwsSnapshot(
  raw: any,
  meta: ServerMetadataStore,
  protectedSnapNames: Set<string>,
  defaultDomain?: string,
  defaultAz?: string
) {
  const fromInstanceName = raw.fromInstanceName || 'unknown';
  const savedFw =
    meta.firewallBySnapshot[raw.name]?.rules ||
    meta.firewallByInstance[fromInstanceName]?.rules ||
    DEFAULT_FIREWALL_RULES;

  const autoDeleteAt =
    meta.snapshotAutoDeleteAt[raw.name] !== undefined
      ? meta.snapshotAutoDeleteAt[raw.name]
      : null;

  const resolvedDomain =
    meta.domainByInstance?.[fromInstanceName] ||
    meta.customDefaultDnsRecordName ||
    defaultDomain ||
    undefined;

  return {
    name: raw.name,
    arn: raw.arn,
    fromInstanceName,
    fromInstanceArn: raw.fromInstanceArn || '',
    fromBlueprintId: raw.fromBlueprintId || 'ubuntu_22_04',
    fromBundleId: raw.fromBundleId || 'micro_2_0',
    sizeInGb: raw.sizeInGb ?? 40,
    state: raw.state === 'available' ? 'available' : raw.state === 'error' ? 'error' : 'in-progress',
    progress: raw.progress,
    createdAt: raw.createdAt ? new Date(raw.createdAt * 1000).toISOString() : new Date().toISOString(),
    isAutoHibernateSnapshot: Boolean(
      raw.name?.includes('auto') || raw.name?.includes('hibernate') || raw.name?.startsWith('snap-')
    ),
    autoDeleteAt,
    isProtectedHibernatedBase: protectedSnapNames.has(raw.name),
    preservedConfig: {
      blueprintId: raw.fromBlueprintId || 'debian_12',
      bundleId: raw.fromBundleId || 'micro_3_0',
      availabilityZone:
        raw.location?.availabilityZone && raw.location.availabilityZone !== 'all'
          ? raw.location.availabilityZone
          : defaultAz || 'ap-northeast-1a',
      cloudflareDomain: resolvedDomain,
      tags: raw.tags || [],
      firewallRules: savedFw,
    },
  };
}

async function applyFirewallRulesToAwsInstance(
  instanceName: string,
  rules: PersistedFirewallRule[],
  creds: ResolvedCredentials
): Promise<{ ok: boolean; latencyMs: number; endpoint: string; error?: string }> {
  const normalized = normalizeFirewallRules(rules);
  if (normalized.length === 0) {
    return { ok: true, latencyMs: 0, endpoint: `lightsail.${creds.awsRegion}.amazonaws.com` };
  }

  const portInfos = normalized.map((r) => ({
    fromPort: Number(r.fromPort),
    toPort: Number(r.toPort),
    protocol: r.protocol || 'tcp',
    cidrs: Array.isArray(r.cidrs) && r.cidrs.length > 0 ? r.cidrs : ['0.0.0.0/0'],
    ...(Array.isArray(r.ipv6Cidrs) && r.ipv6Cidrs.length > 0 ? { ipv6Cidrs: r.ipv6Cidrs } : {}),
    ...(Array.isArray(r.cidrListAliases) && r.cidrListAliases.length > 0
      ? { cidrListAliases: r.cidrListAliases }
      : {}),
  }));

  let lastErr = 'PutInstancePublicPorts failed';
  let lastLatency = 0;
  let lastEndpoint = `lightsail.${creds.awsRegion}.amazonaws.com`;

  for (let attempt = 0; attempt < 8; attempt++) {
    const resp = await callAwsLightsail(
      'PutInstancePublicPorts',
      { instanceName, portInfos },
      creds
    );
    lastLatency = resp.latencyMs;
    lastEndpoint = resp.endpoint;
    if (resp.ok) {
      return { ok: true, latencyMs: resp.latencyMs, endpoint: resp.endpoint };
    }
    lastErr = resp.data?.message || resp.data?.__type || 'PutInstancePublicPorts failed';
    // Retry if instance is still transitioning to 'running'
    await new Promise((r) => setTimeout(r, 2500));
  }

  return { ok: false, latencyMs: lastLatency, endpoint: lastEndpoint, error: lastErr };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // 1. Check Environment Secrets Status (never leaks raw secrets)
  app.get('/api/credentials/status', (_req: Request, res: Response) => {
    const meta = loadMetadataStore();
    const awsKey = maskSecret(process.env.AWS_ACCESS_KEY_ID);
    const awsSecret = maskSecret(process.env.AWS_SECRET_ACCESS_KEY);
    const cfToken = maskSecret(process.env.CLOUDFLARE_API_TOKEN);
    const cfZone = maskSecret(process.env.CLOUDFLARE_ZONE_ID);
    const normalizedRegion = normalizeAwsRegion(process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION);
    const effectiveDomain =
      (meta.customDefaultDnsRecordName || process.env.CLOUDFLARE_RECORD_NAME || '').trim() || null;

    res.json({
      awsAccessKeyId: awsKey,
      awsSecretAccessKey: awsSecret,
      awsRegion: normalizedRegion.region,
      cloudflareApiToken: cfToken,
      cloudflareZoneId: cfZone,
      cloudflareRecordName: effectiveDomain,
    });
  });

  // 1b. Update Default or Per-Instance Cloudflare DNS Domain Name
  app.post('/api/config/domain', (req: Request, res: Response) => {
    const { defaultDnsRecordName, instanceName } = req.body || {};
    const meta = loadMetadataStore();
    const cleanDomain = String(defaultDnsRecordName || '').trim();
    if (cleanDomain) {
      meta.customDefaultDnsRecordName = cleanDomain;
      if (instanceName) {
        meta.domainByInstance[instanceName] = cleanDomain;
      } else {
        // Update all known instances so the new default domain takes effect immediately
        for (const k of Object.keys(meta.domainByInstance)) {
          meta.domainByInstance[k] = cleanDomain;
        }
      }
      saveMetadataStore(meta);
    }
    res.json({
      success: true,
      defaultDnsRecordName: meta.customDefaultDnsRecordName || null,
      domainByInstance: meta.domainByInstance,
    });
  });

  // 2. Test Credentials against real AWS Lightsail and Cloudflare APIs
  app.post('/api/credentials/test', async (req: Request, res: Response) => {
    const overrides = (req.body || {}) as CredentialOverrides;
    const creds = resolveCredentials(overrides);

    // Test AWS
    let awsResult: any;
    if (!creds.awsAccessKeyId || !creds.awsSecretAccessKey) {
      awsResult = {
        configured: false,
        source: 'missing',
        success: false,
        status: 0,
        latencyMs: 0,
        message: '未读取到 AWS Access Key ID 或 Secret Access Key（请在 Secrets 或设置中配置）',
      };
    } else {
      try {
        const resp = await callAwsLightsail('GetInstances', {}, creds);
        if (resp.ok) {
          const instancesList = Array.isArray(resp.data?.instances) ? resp.data.instances : [];
          const regionNote =
            creds.rawAwsRegionInput !== creds.awsRegion
              ? `（已将 ${creds.rawAwsRegionInput} 自动规范化为区域 ${creds.awsRegion}）`
              : '';
          awsResult = {
            configured: true,
            source: creds.awsSource,
            success: true,
            status: resp.status,
            latencyMs: resp.latencyMs,
            message: `AWS Lightsail 鉴权成功！区域 ${creds.awsRegion} 共有 ${instancesList.length} 个实例${regionNote}`,
            details: {
              region: creds.awsRegion,
              endpoint: resp.endpoint,
              instanceCount: instancesList.length,
              instanceNames: instancesList.map((i: any) => i.name),
            },
          };
        } else {
          const isTempKeyWithoutSession =
            creds.awsAccessKeyId.startsWith('ASIA') && !creds.awsSessionToken;
          const extraHint = isTempKeyWithoutSession
            ? '（提示: 检测到 ASIA 开头的临时凭证，通常需要配合 AWS_SESSION_TOKEN 使用，或改用 AKIA 开头的长期 IAM Access Key）'
            : '';
          awsResult = {
            configured: true,
            source: creds.awsSource,
            success: false,
            status: resp.status,
            latencyMs: resp.latencyMs,
            message: `AWS 鉴权或请求失败 (${resp.status}): ${resp.data?.message || resp.data?.__type || 'Unknown error'}${extraHint}`,
            details: {
              region: creds.awsRegion,
              endpoint: resp.endpoint,
              errorType: resp.data?.__type,
            },
          };
        }
      } catch (err: any) {
        const causeDetail = err?.cause?.code || err?.cause?.message || err?.message || String(err);
        awsResult = {
          configured: true,
          source: creds.awsSource,
          success: false,
          status: 0,
          latencyMs: 0,
          message: `连接 AWS 接口网络异常 (${creds.awsRegion}): ${causeDetail}`,
        };
      }
    }

    // Test Cloudflare
    let cfResult: any;
    if (!creds.cloudflareApiToken) {
      cfResult = {
        configured: false,
        source: 'missing',
        success: false,
        status: 0,
        latencyMs: 0,
        message: '未读取到 Cloudflare API Token（请在 Secrets 或设置中配置）',
      };
    } else {
      try {
        const verifyResp = await callCloudflare('/user/tokens/verify', 'GET', creds);
        if (!verifyResp.ok && creds.cloudflareZoneId) {
          // Account-owned API tokens fail /user/tokens/verify, so verify directly against /zones/:zoneId
          const directZoneResp = await callCloudflare(`/zones/${creds.cloudflareZoneId}`, 'GET', creds);
          if (directZoneResp.ok) {
            const zoneName = directZoneResp.data?.result?.name;
            const recResp = await callCloudflare(
              `/zones/${creds.cloudflareZoneId}/dns_records?per_page=20`,
              'GET',
              creds
            );
            const recordsCount =
              recResp.ok && Array.isArray(recResp.data?.result) ? recResp.data.result.length : undefined;
            cfResult = {
              configured: true,
              source: creds.cloudflareSource,
              success: true,
              status: directZoneResp.status,
              latencyMs: directZoneResp.latencyMs,
              message: `Cloudflare Zone 验证成功！域名 Zone: ${zoneName || creds.cloudflareZoneId} (${recordsCount ?? 0} 条记录)`,
              details: {
                tokenType: 'zone_or_account_scoped',
                zoneId: creds.cloudflareZoneId,
                zoneName: zoneName || null,
                recordsCount: recordsCount ?? null,
              },
            };
          } else {
            const cfErr = verifyResp.data?.errors?.[0];
            const zErr = directZoneResp.data?.errors?.[0];
            cfResult = {
              configured: true,
              source: creds.cloudflareSource,
              success: false,
              status: directZoneResp.status || verifyResp.status,
              latencyMs: directZoneResp.latencyMs || verifyResp.latencyMs,
              message: `Cloudflare Token 验证失败 (${verifyResp.status}/${directZoneResp.status}): ${zErr?.message || cfErr?.message || 'Invalid token'}`,
              details: {
                verifyErrors: verifyResp.data?.errors,
                zoneErrors: directZoneResp.data?.errors,
              },
            };
          }
        } else if (!verifyResp.ok) {
          const cfErr = verifyResp.data?.errors?.[0];
          cfResult = {
            configured: true,
            source: creds.cloudflareSource,
            success: false,
            status: verifyResp.status,
            latencyMs: verifyResp.latencyMs,
            message: `Cloudflare Token 验证失败 (${verifyResp.status}): ${cfErr?.message || 'Invalid token'}`,
            details: { errors: verifyResp.data?.errors },
          };
        } else {
          const tokenStatus = verifyResp.data?.result?.status || 'active';
          let zoneName: string | undefined;
          let recordsCount: number | undefined;
          let zoneWarning: string | undefined;

          if (creds.cloudflareZoneId) {
            const zoneResp = await callCloudflare(`/zones/${creds.cloudflareZoneId}`, 'GET', creds);
            if (zoneResp.ok) {
              zoneName = zoneResp.data?.result?.name;
              const recResp = await callCloudflare(
                `/zones/${creds.cloudflareZoneId}/dns_records?per_page=20`,
                'GET',
                creds
              );
              if (recResp.ok && Array.isArray(recResp.data?.result)) {
                recordsCount = recResp.data.result.length;
              }
            } else {
              const zErr = zoneResp.data?.errors?.[0];
              zoneWarning = `Token 有效，但 Zone ID (${creds.cloudflareZoneId}) 查询失败: ${zErr?.message || zoneResp.status}`;
            }
          }

          cfResult = {
            configured: true,
            source: creds.cloudflareSource,
            success: !zoneWarning,
            status: verifyResp.status,
            latencyMs: verifyResp.latencyMs,
            message: zoneWarning
              ? zoneWarning
              : zoneName
              ? `Cloudflare 验证成功！Token 状态: ${tokenStatus}，域名 Zone: ${zoneName} (${recordsCount ?? 0} 条记录)`
              : `Cloudflare Token 验证成功（状态: ${tokenStatus}），未指定 Zone ID`,
            details: {
              tokenStatus,
              zoneId: creds.cloudflareZoneId || null,
              zoneName: zoneName || null,
              recordsCount: recordsCount ?? null,
            },
          };
        }
      } catch (err: any) {
        cfResult = {
          configured: true,
          source: creds.cloudflareSource,
          success: false,
          status: 0,
          latencyMs: 0,
          message: `连接 Cloudflare 接口网络异常: ${err?.message || String(err)}`,
        };
      }
    }

    res.json({
      timestamp: new Date().toISOString(),
      aws: awsResult,
      cloudflare: cfResult,
    });
  });

  // 3. Real Lightsail: Get Instances (merges active instances + hibernated instances derived from snapshots + firewall config)
  app.post('/api/lightsail/instances', async (req: Request, res: Response) => {
    const creds = resolveCredentials(req.body?.config);
    if (!creds.awsAccessKeyId || !creds.awsSecretAccessKey) {
      res.status(400).json({ error: '缺少 AWS 访问凭证，请在 Secrets 或设置中配置' });
      return;
    }

    try {
      const meta = loadMetadataStore();
      const [awsResp, snapResp] = await Promise.all([
        callAwsLightsail('GetInstances', {}, creds),
        callAwsLightsail('GetInstanceSnapshots', {}, creds),
      ]);

      if (!awsResp.ok) {
        res.status(awsResp.status || 500).json({
          error: awsResp.data?.message || awsResp.data?.__type || 'AWS GetInstances failed',
          raw: awsResp.data,
        });
        return;
      }

      let cfRecords: any[] = [];
      if (creds.cloudflareApiToken && creds.cloudflareZoneId) {
        const cfResp = await callCloudflare(
          `/zones/${creds.cloudflareZoneId}/dns_records?type=A&per_page=50`,
          'GET',
          creds
        );
        if (cfResp.ok && Array.isArray(cfResp.data?.result)) {
          cfRecords = cfResp.data.result;
        }
      }

      const rawInstances = Array.isArray(awsResp.data?.instances) ? awsResp.data.instances : [];
      const activeInstances = rawInstances
        .filter((inst: any) => {
          const st = String(inst?.state?.name || '').toLowerCase();
          return st !== 'terminated' && st !== 'shutting-down';
        })
        .map((inst: any) =>
          mapAwsInstance(inst, cfRecords, meta, creds.cloudflareRecordName, creds.cloudflareZoneId)
        );

      const activeNames = new Set(activeInstances.map((i: any) => i.name));
      const rawSnapshots =
        snapResp.ok && Array.isArray(snapResp.data?.instanceSnapshots)
          ? snapResp.data.instanceSnapshots
          : [];

      // Group snapshots by fromInstanceName (newest first) for instances that have been deleted (hibernated)
      const latestSnapByInstance = new Map<string, any>();
      for (const snap of rawSnapshots) {
        const fromName = snap?.fromInstanceName;
        if (!fromName || activeNames.has(fromName)) continue;
        const prev = latestSnapByInstance.get(fromName);
        if (!prev || (snap.createdAt || 0) > (prev.createdAt || 0)) {
          latestSnapByInstance.set(fromName, snap);
        }
      }

      const hibernatedInstances: any[] = [];
      for (const [fromName, snap] of latestSnapByInstance.entries()) {
        const preferredDomain = (
          meta.domainByInstance?.[fromName] ||
          meta.customDefaultDnsRecordName ||
          creds.cloudflareRecordName ||
          ''
        ).trim();
        const matchedCf = cfRecords.find(
          (r) =>
            preferredDomain &&
            r.name?.toLowerCase() === preferredDomain.toLowerCase()
        );
        const bundleId = snap.fromBundleId || 'micro_3_0';
        const isNano = bundleId.includes('nano');
        const isSmall = bundleId.includes('small');
        const isMedium = bundleId.includes('medium');
        const ramGb = isNano ? 0.5 : isSmall ? 2 : isMedium ? 4 : 1;
        const cpuCount = bundleId.includes('_3_0') ? 2 : isSmall || isMedium ? 2 : 1;
        const diskSizeGb = snap.sizeInGb ?? 40;

        // Ensure firewall rules are initialized and persisted for hibernated instances & their snapshot
        const nowIso = new Date().toISOString();
        if (!meta.firewallByInstance[fromName]?.rules?.length) {
          const snapSaved = meta.firewallBySnapshot[snap.name]?.rules;
          meta.firewallByInstance[fromName] = {
            rules: snapSaved && snapSaved.length > 0 ? snapSaved : DEFAULT_FIREWALL_RULES,
            updatedAt: nowIso,
          };
        }
        if (!meta.firewallBySnapshot[snap.name]?.rules?.length) {
          meta.firewallBySnapshot[snap.name] = {
            rules: meta.firewallByInstance[fromName].rules,
            updatedAt: meta.firewallByInstance[fromName].updatedAt,
          };
        }

        const fwEntry = meta.firewallByInstance[fromName];

        hibernatedInstances.push({
          name: fromName,
          arn: snap.fromInstanceArn || snap.arn,
          blueprintId: snap.fromBlueprintId || 'debian_12',
          blueprintName: snap.fromBlueprintId || 'Linux',
          bundleId,
          bundleName: `${ramGb} GB RAM, ${cpuCount} vCPU, ${diskSizeGb} GB SSD`,
          ramGb,
          cpuCount,
          diskSizeGb,
          monthlyCostUsd: isNano ? 3.5 : isSmall ? 10 : isMedium ? 20 : 5,
          state: 'hibernated',
          publicIpAddress: null,
          privateIpAddress: '0.0.0.0',
          location: {
            availabilityZone:
              snap.location?.availabilityZone && snap.location.availabilityZone !== 'all'
                ? snap.location.availabilityZone
                : creds.awsAvailabilityZone,
            regionName: snap.location?.regionName || creds.awsRegion,
          },
          createdAt: snap.createdAt
            ? new Date(snap.createdAt * 1000).toISOString()
            : new Date().toISOString(),
          tags: snap.tags || [],
          lastSnapshotName: snap.name,
          lastSnapshotTime: snap.createdAt
            ? new Date(snap.createdAt * 1000).toISOString()
            : new Date().toISOString(),
          firewallRules: fwEntry.rules,
          firewallExtractedAt: fwEntry.updatedAt,
          cloudflareBinding: matchedCf
            ? {
                enabled: true,
                domain: preferredDomain || matchedCf.name,
                zoneId: matchedCf.zone_id || creds.cloudflareZoneId || '',
                recordId: matchedCf.id,
                proxied: Boolean(matchedCf.proxied),
                lastUpdatedIp: matchedCf.content,
                lastSyncTime: matchedCf.modified_on,
              }
            : preferredDomain
            ? {
                enabled: true,
                domain: preferredDomain,
                zoneId: creds.cloudflareZoneId || '',
                proxied: false,
              }
            : undefined,
        });
      }

      saveMetadataStore(meta);

      res.json({
        instances: [...activeInstances, ...hibernatedInstances],
        latencyMs: awsResp.latencyMs,
        endpoint: awsResp.endpoint,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to query AWS Lightsail' });
    }
  });

  // 4. Real Lightsail: Get Snapshots (with lifecycle autoDeleteAt & preserved firewall rules)
  app.post('/api/lightsail/snapshots', async (req: Request, res: Response) => {
    const creds = resolveCredentials(req.body?.config);
    if (!creds.awsAccessKeyId || !creds.awsSecretAccessKey) {
      res.status(400).json({ error: '缺少 AWS 访问凭证' });
      return;
    }

    try {
      const meta = loadMetadataStore();
      const [awsResp, instResp] = await Promise.all([
        callAwsLightsail('GetInstanceSnapshots', {}, creds),
        callAwsLightsail('GetInstances', {}, creds),
      ]);
      if (!awsResp.ok) {
        res.status(awsResp.status || 500).json({
          error: awsResp.data?.message || 'AWS GetInstanceSnapshots failed',
        });
        return;
      }

      const rawInstances =
        instResp.ok && Array.isArray(instResp.data?.instances) ? instResp.data.instances : [];
      const activeNames = new Set(
        rawInstances
          .filter((i: any) => {
            const st = String(i?.state?.name || '').toLowerCase();
            return st !== 'terminated' && st !== 'shutting-down';
          })
          .map((i: any) => i.name)
      );

      const rawSnapshots = Array.isArray(awsResp.data?.instanceSnapshots)
        ? awsResp.data.instanceSnapshots
        : [];

      // Identify newest snapshot for each hibernated (deleted) instance so we can mark it protected
      const latestSnapByHibernated = new Map<string, any>();
      for (const snap of rawSnapshots) {
        const fromName = snap?.fromInstanceName;
        if (!fromName || activeNames.has(fromName)) continue;
        const prev = latestSnapByHibernated.get(fromName);
        if (!prev || (snap.createdAt || 0) > (prev.createdAt || 0)) {
          latestSnapByHibernated.set(fromName, snap);
        }
      }
      const protectedSnapNames = new Set<string>(
        Array.from(latestSnapByHibernated.values()).map((s: any) => s.name)
      );

      res.json({
        snapshots: rawSnapshots.map((s: any) =>
          mapAwsSnapshot(
            s,
            meta,
            protectedSnapNames,
            creds.cloudflareRecordName,
            creds.awsAvailabilityZone
          )
        ),
        lifecyclePolicy: meta.lifecyclePolicy,
        latencyMs: awsResp.latencyMs,
        endpoint: awsResp.endpoint,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to query snapshots' });
    }
  });

  // 4b. Firewall Extraction Endpoint (Step 1 of Hibernate or manual extraction)
  app.post('/api/lightsail/firewall/extract', async (req: Request, res: Response) => {
    const { instanceName, snapshotName, customRules, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    if (!instanceName) {
      res.status(400).json({ error: 'instanceName is required' });
      return;
    }

    try {
      const meta = loadMetadataStore();
      let extractedRules: PersistedFirewallRule[] = [];
      let source: 'aws_live' | 'custom_override' | 'saved_metadata' | 'default_preset' = 'aws_live';
      let latencyMs = 0;
      let endpoint = `lightsail.${creds.awsRegion}.amazonaws.com`;

      if (Array.isArray(customRules) && customRules.length > 0) {
        extractedRules = normalizeFirewallRules(customRules);
        source = 'custom_override';
      } else if (creds.awsAccessKeyId && creds.awsSecretAccessKey) {
        const portResp = await callAwsLightsail(
          'GetInstancePortStates',
          { instanceName },
          creds
        );
        latencyMs = portResp.latencyMs;
        endpoint = portResp.endpoint;

        if (portResp.ok && Array.isArray(portResp.data?.portStates)) {
          extractedRules = normalizeFirewallRules(portResp.data.portStates);
          source = 'aws_live';
        } else {
          // Fallback to GetInstance networking.ports
          const instResp = await callAwsLightsail('GetInstance', { instanceName }, creds);
          latencyMs = instResp.latencyMs;
          if (instResp.ok && Array.isArray(instResp.data?.instance?.networking?.ports)) {
            extractedRules = normalizeFirewallRules(instResp.data.instance.networking.ports);
            source = 'aws_live';
          }
        }
      }

      if (extractedRules.length === 0) {
        if (meta.firewallByInstance[instanceName]?.rules?.length) {
          extractedRules = meta.firewallByInstance[instanceName].rules;
          source = 'saved_metadata';
        } else if (snapshotName && meta.firewallBySnapshot[snapshotName]?.rules?.length) {
          extractedRules = meta.firewallBySnapshot[snapshotName].rules;
          source = 'saved_metadata';
        } else {
          extractedRules = DEFAULT_FIREWALL_RULES;
          source = 'default_preset';
        }
      }

      const extractedAt = new Date().toISOString();
      meta.firewallByInstance[instanceName] = {
        rules: extractedRules,
        updatedAt: extractedAt,
      };
      if (snapshotName) {
        meta.firewallBySnapshot[snapshotName] = {
          rules: extractedRules,
          updatedAt: extractedAt,
        };
      }
      saveMetadataStore(meta);

      res.json({
        success: true,
        instanceName,
        snapshotName: snapshotName || null,
        rules: extractedRules,
        extractedAt,
        source,
        latencyMs,
        endpoint,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Extract firewall rules failed' });
    }
  });

  // 4c. Firewall Save / Update Endpoint (for editing preserved rules or applying live to running instance)
  app.post('/api/lightsail/firewall/save', async (req: Request, res: Response) => {
    const { instanceName, snapshotName, rules, firewallRules, applyToRunningInstance, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    if (!instanceName && !snapshotName) {
      res.status(400).json({ error: 'instanceName or snapshotName is required' });
      return;
    }

    const inputRules = Array.isArray(rules) ? rules : Array.isArray(firewallRules) ? firewallRules : [];
    const normalized = normalizeFirewallRules(inputRules);
    if (normalized.length === 0) {
      res.status(400).json({ error: '至少需要保留一条有效的防火墙端口规则' });
      return;
    }

    try {
      const meta = loadMetadataStore();
      const updatedAt = new Date().toISOString();

      if (instanceName) {
        meta.firewallByInstance[instanceName] = { rules: normalized, updatedAt };
      }
      if (snapshotName) {
        meta.firewallBySnapshot[snapshotName] = { rules: normalized, updatedAt };
      }
      saveMetadataStore(meta);

      let appliedToCloud = false;
      let latencyMs = 0;
      let endpoint = `lightsail.${creds.awsRegion}.amazonaws.com`;

      if (applyToRunningInstance && instanceName && creds.awsAccessKeyId && creds.awsSecretAccessKey) {
        const applyRes = await applyFirewallRulesToAwsInstance(instanceName, normalized, creds);
        appliedToCloud = applyRes.ok;
        latencyMs = applyRes.latencyMs;
        endpoint = applyRes.endpoint;
        if (!applyRes.ok) {
          res.status(500).json({
            error: `防火墙配置已保存至本地元数据，但同步至云端实例失败: ${applyRes.error}`,
          });
          return;
        }
      }

      res.json({
        success: true,
        instanceName: instanceName || null,
        snapshotName: snapshotName || null,
        rules: normalized,
        updatedAt,
        appliedToCloud,
        latencyMs,
        endpoint,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Save firewall rules failed' });
    }
  });

  // 4d. Firewall Restore Endpoint (PutInstancePublicPorts on restored/running instance)
  app.post('/api/lightsail/firewall/restore', async (req: Request, res: Response) => {
    const { instanceName, snapshotName, rules, firewallRules, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    if (!instanceName) {
      res.status(400).json({ error: 'instanceName is required' });
      return;
    }

    try {
      const meta = loadMetadataStore();
      const customRules = Array.isArray(rules) ? rules : Array.isArray(firewallRules) ? firewallRules : null;
      const targetRules =
        (customRules && customRules.length > 0 ? normalizeFirewallRules(customRules) : null) ||
        (snapshotName ? meta.firewallBySnapshot[snapshotName]?.rules : null) ||
        meta.firewallByInstance[instanceName]?.rules ||
        DEFAULT_FIREWALL_RULES;

      const applyRes = await applyFirewallRulesToAwsInstance(instanceName, targetRules, creds);
      if (!applyRes.ok) {
        res.status(500).json({
          error: `恢复防火墙端口规则失败: ${applyRes.error}`,
        });
        return;
      }

      const updatedAt = new Date().toISOString();
      meta.firewallByInstance[instanceName] = {
        rules: targetRules,
        updatedAt,
      };
      saveMetadataStore(meta);

      res.json({
        success: true,
        instanceName,
        snapshotName: snapshotName || null,
        restoredRules: targetRules,
        latencyMs: applyRes.latencyMs,
        endpoint: applyRes.endpoint,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Restore firewall rules failed' });
    }
  });

  // 4e. Snapshot Lifecycle Policy & Per-Snapshot Retention Endpoints
  app.get('/api/lightsail/snapshots/lifecycle', (_req: Request, res: Response) => {
    const meta = loadMetadataStore();
    res.json({
      policy: meta.lifecyclePolicy,
      snapshotAutoDeleteAt: meta.snapshotAutoDeleteAt,
    });
  });

  app.post('/api/lightsail/snapshots/lifecycle', async (req: Request, res: Response) => {
    const { policy, applyToExistingSnapshots, config: overrides } = req.body || {};
    const meta = loadMetadataStore();

    if (policy && typeof policy === 'object') {
      meta.lifecyclePolicy = {
        ...meta.lifecyclePolicy,
        enabled: policy.enabled !== undefined ? Boolean(policy.enabled) : meta.lifecyclePolicy.enabled,
        defaultRetentionHours:
          policy.defaultRetentionHours === null
            ? null
            : Number(policy.defaultRetentionHours) > 0
            ? Number(policy.defaultRetentionHours)
            : meta.lifecyclePolicy.defaultRetentionHours,
        maxSnapshotsPerInstance:
          policy.maxSnapshotsPerInstance === null
            ? null
            : Number(policy.maxSnapshotsPerInstance) > 0
            ? Number(policy.maxSnapshotsPerInstance)
            : meta.lifecyclePolicy.maxSnapshotsPerInstance,
        protectLatestHibernatedSnapshot:
          policy.protectLatestHibernatedSnapshot !== undefined
            ? Boolean(policy.protectLatestHibernatedSnapshot)
            : meta.lifecyclePolicy.protectLatestHibernatedSnapshot,
      };
    }

    if (
      applyToExistingSnapshots &&
      meta.lifecyclePolicy.enabled &&
      meta.lifecyclePolicy.defaultRetentionHours &&
      meta.lifecyclePolicy.defaultRetentionHours > 0
    ) {
      const creds = resolveCredentials(overrides);
      if (creds.awsAccessKeyId && creds.awsSecretAccessKey) {
        const snapResp = await callAwsLightsail('GetInstanceSnapshots', {}, creds);
        if (snapResp.ok && Array.isArray(snapResp.data?.instanceSnapshots)) {
          for (const s of snapResp.data.instanceSnapshots) {
            if (!s?.name) continue;
            const createdMs = s.createdAt ? s.createdAt * 1000 : Date.now();
            const expireMs = createdMs + meta.lifecyclePolicy.defaultRetentionHours * 3600_000;
            meta.snapshotAutoDeleteAt[s.name] = new Date(expireMs).toISOString();
          }
        }
      }
    }

    saveMetadataStore(meta);
    res.json({
      success: true,
      policy: meta.lifecyclePolicy,
      snapshotAutoDeleteAt: meta.snapshotAutoDeleteAt,
    });
  });

  app.post('/api/lightsail/snapshots/retention', (req: Request, res: Response) => {
    const { snapshotName, autoDeleteAt, retentionHours } = req.body || {};
    if (!snapshotName) {
      res.status(400).json({ error: 'snapshotName is required' });
      return;
    }

    const meta = loadMetadataStore();
    let resolvedIso: string | null = null;

    if (retentionHours !== undefined) {
      if (retentionHours === null || Number(retentionHours) <= 0) {
        resolvedIso = null;
      } else {
        resolvedIso = new Date(Date.now() + Number(retentionHours) * 3600_000).toISOString();
      }
    } else if (autoDeleteAt) {
      const parsed = new Date(autoDeleteAt);
      if (!Number.isNaN(parsed.getTime())) {
        resolvedIso = parsed.toISOString();
      }
    }

    meta.snapshotAutoDeleteAt[snapshotName] = resolvedIso;
    saveMetadataStore(meta);

    res.json({
      success: true,
      snapshotName,
      autoDeleteAt: resolvedIso,
    });
  });

  // 4f. Snapshot Lifecycle Cleanup Execution (deletes expired snapshots while protecting hibernated base snapshot)
  app.post('/api/lightsail/snapshots/cleanup', async (req: Request, res: Response) => {
    const { forceCheckOverflow = true, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    if (!creds.awsAccessKeyId || !creds.awsSecretAccessKey) {
      res.status(400).json({ error: '缺少 AWS 访问凭证' });
      return;
    }

    try {
      const meta = loadMetadataStore();
      const [snapResp, instResp] = await Promise.all([
        callAwsLightsail('GetInstanceSnapshots', {}, creds),
        callAwsLightsail('GetInstances', {}, creds),
      ]);

      if (!snapResp.ok) {
        res.status(snapResp.status || 500).json({
          error: snapResp.data?.message || 'GetInstanceSnapshots failed',
        });
        return;
      }

      const rawInstances =
        instResp.ok && Array.isArray(instResp.data?.instances) ? instResp.data.instances : [];
      const activeNames = new Set(
        rawInstances
          .filter((i: any) => {
            const st = String(i?.state?.name || '').toLowerCase();
            return st !== 'terminated' && st !== 'shutting-down';
          })
          .map((i: any) => i.name)
      );

      const rawSnapshots: any[] = Array.isArray(snapResp.data?.instanceSnapshots)
        ? snapResp.data.instanceSnapshots
        : [];

      // Group snapshots per instance sorted newest first
      const snapsByInstance = new Map<string, any[]>();
      for (const s of rawSnapshots) {
        const fromName = s?.fromInstanceName || 'unknown';
        if (!snapsByInstance.has(fromName)) {
          snapsByInstance.set(fromName, []);
        }
        snapsByInstance.get(fromName)!.push(s);
      }
      for (const list of snapsByInstance.values()) {
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      }

      // Identify protected snapshots (newest snapshot of a currently hibernated/deleted instance)
      const protectedSnapNames = new Set<string>();
      if (meta.lifecyclePolicy.protectLatestHibernatedSnapshot) {
        for (const [fromName, list] of snapsByInstance.entries()) {
          if (!activeNames.has(fromName) && list.length > 0) {
            protectedSnapNames.add(list[0].name);
          }
        }
      }

      const nowMs = Date.now();
      const toDelete = new Map<string, string>(); // snapshotName -> reason
      const skippedProtected: Array<{ name: string; reason: string }> = [];

      // 1. Check explicit per-snapshot autoDeleteAt expiration
      for (const s of rawSnapshots) {
        const snapName = s?.name;
        if (!snapName) continue;
        const autoDeleteIso = meta.snapshotAutoDeleteAt[snapName];
        if (autoDeleteIso) {
          const expireMs = new Date(autoDeleteIso).getTime();
          if (!Number.isNaN(expireMs) && expireMs <= nowMs) {
            if (protectedSnapNames.has(snapName)) {
              skippedProtected.push({
                name: snapName,
                reason: '已到达自动删除时间，但该快照是休眠实例唯一最新基础镜像，受保护跳过',
              });
            } else {
              toDelete.set(snapName, `已到达设定过期时间 (${autoDeleteIso})`);
            }
          }
        }
      }

      // 2. Check maxSnapshotsPerInstance overflow if policy enabled
      const maxPerInst = meta.lifecyclePolicy.maxSnapshotsPerInstance;
      if (meta.lifecyclePolicy.enabled && forceCheckOverflow && maxPerInst && maxPerInst > 0) {
        for (const [fromName, list] of snapsByInstance.entries()) {
          if (list.length > maxPerInst) {
            const overflowList = list.slice(maxPerInst);
            for (const s of overflowList) {
              if (!s?.name || toDelete.has(s.name)) continue;
              if (protectedSnapNames.has(s.name)) {
                skippedProtected.push({
                  name: s.name,
                  reason: '超出单实例保留上限，但受休眠基础镜像保护跳过',
                });
              } else {
                toDelete.set(
                  s.name,
                  `超出实例 ${fromName} 最大保留数量限制 (${maxPerInst} 个)`
                );
              }
            }
          }
        }
      }

      const deletedSnapshots: Array<{ name: string; reason: string }> = [];
      const failedDeletes: Array<{ name: string; error: string }> = [];

      for (const [snapName, reason] of toDelete.entries()) {
        const delResp = await callAwsLightsail(
          'DeleteInstanceSnapshot',
          { instanceSnapshotName: snapName },
          creds
        );
        if (delResp.ok || delResp.data?.__type === 'NotFoundException') {
          deletedSnapshots.push({ name: snapName, reason });
          delete meta.snapshotAutoDeleteAt[snapName];
          delete meta.firewallBySnapshot[snapName];
        } else {
          failedDeletes.push({
            name: snapName,
            error: delResp.data?.message || delResp.data?.__type || 'DeleteInstanceSnapshot failed',
          });
        }
      }

      meta.lifecyclePolicy.lastCleanupTime = new Date().toISOString();
      meta.lifecyclePolicy.lastDeletedCount = deletedSnapshots.length;
      saveMetadataStore(meta);

      res.json({
        success: true,
        checkedCount: rawSnapshots.length,
        deletedSnapshots,
        skippedProtected,
        failedDeletes,
        policy: meta.lifecyclePolicy,
        timestamp: meta.lifecyclePolicy.lastCleanupTime,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Snapshot cleanup failed' });
    }
  });

  // 5. Real Lightsail: Stop Instance (without deleting or creating snapshot)
  app.post('/api/lightsail/stop', async (req: Request, res: Response) => {
    const { instanceName, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    if (!instanceName) {
      res.status(400).json({ error: 'instanceName is required' });
      return;
    }
    if (!creds.awsAccessKeyId || !creds.awsSecretAccessKey) {
      res.status(400).json({ error: '缺少 AWS 访问凭证' });
      return;
    }

    try {
      const awsResp = await callAwsLightsail('StopInstance', { instanceName }, creds);
      if (!awsResp.ok) {
        res.status(awsResp.status || 500).json({
          error: awsResp.data?.message || awsResp.data?.__type || 'StopInstance failed',
        });
        return;
      }
      res.json({
        success: true,
        operations: awsResp.data?.operations || [],
        latencyMs: awsResp.latencyMs,
        endpoint: awsResp.endpoint,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'StopInstance error' });
    }
  });

  // 6. Real Lightsail: Start Instance (without snapshot restore)
  app.post('/api/lightsail/start', async (req: Request, res: Response) => {
    const { instanceName, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    if (!instanceName) {
      res.status(400).json({ error: 'instanceName is required' });
      return;
    }
    if (!creds.awsAccessKeyId || !creds.awsSecretAccessKey) {
      res.status(400).json({ error: '缺少 AWS 访问凭证' });
      return;
    }

    try {
      const awsResp = await callAwsLightsail('StartInstance', { instanceName }, creds);
      if (!awsResp.ok) {
        res.status(awsResp.status || 500).json({
          error: awsResp.data?.message || awsResp.data?.__type || 'StartInstance failed',
        });
        return;
      }

      // Poll briefly (up to ~6s) to fetch newly allocated IP if available
      let publicIpAddress: string | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        const instResp = await callAwsLightsail('GetInstance', { instanceName }, creds);
        if (instResp.ok && instResp.data?.instance?.publicIpAddress) {
          publicIpAddress = instResp.data.instance.publicIpAddress;
          break;
        }
      }

      res.json({
        success: true,
        publicIpAddress,
        operations: awsResp.data?.operations || [],
        latencyMs: awsResp.latencyMs,
        endpoint: awsResp.endpoint,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'StartInstance error' });
    }
  });

  // 7a. Real Lightsail: Step 2 of Hibernate - Create or Reuse Snapshot (and associate firewall rules + lifecycle retention)
  app.post('/api/lightsail/snapshot/create', async (req: Request, res: Response) => {
    const { instanceName, snapshotName, retentionHours, firewallRules, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    if (!instanceName || !snapshotName) {
      res.status(400).json({ error: 'instanceName and snapshotName are required' });
      return;
    }

    try {
      const meta = loadMetadataStore();
      // Associate firewall rules with this snapshot
      const nowIso = new Date().toISOString();
      const fwToSave =
        (Array.isArray(firewallRules) && firewallRules.length > 0
          ? normalizeFirewallRules(firewallRules)
          : null) ||
        meta.firewallByInstance[instanceName]?.rules ||
        DEFAULT_FIREWALL_RULES;

      meta.firewallByInstance[instanceName] = { rules: fwToSave, updatedAt: nowIso };
      meta.firewallBySnapshot[snapshotName] = { rules: fwToSave, updatedAt: nowIso };

      // Configure snapshot autoDeleteAt based on explicit retentionHours or global lifecyclePolicy
      const effectiveHours =
        retentionHours !== undefined
          ? retentionHours
          : meta.lifecyclePolicy.enabled
          ? meta.lifecyclePolicy.defaultRetentionHours
          : null;

      if (effectiveHours && Number(effectiveHours) > 0) {
        meta.snapshotAutoDeleteAt[snapshotName] = new Date(
          Date.now() + Number(effectiveHours) * 3600_000
        ).toISOString();
      } else if (retentionHours === null) {
        meta.snapshotAutoDeleteAt[snapshotName] = null;
      }
      saveMetadataStore(meta);

      // Check if snapshot already exists
      const existingCheck = await callAwsLightsail(
        'GetInstanceSnapshot',
        { instanceSnapshotName: snapshotName },
        creds
      );
      if (existingCheck.ok && existingCheck.data?.instanceSnapshot) {
        const snap = existingCheck.data.instanceSnapshot;
        res.json({
          success: true,
          alreadyExists: true,
          snapshotName,
          state: snap.state,
          sizeInGb: snap.sizeInGb ?? 40,
          autoDeleteAt: meta.snapshotAutoDeleteAt[snapshotName] || null,
          firewallRulesCount: fwToSave.length,
          latencyMs: existingCheck.latencyMs,
          endpoint: existingCheck.endpoint,
        });
        return;
      }

      const snapResp = await callAwsLightsail(
        'CreateInstanceSnapshot',
        { instanceName, instanceSnapshotName: snapshotName },
        creds
      );
      if (!snapResp.ok) {
        res.status(snapResp.status || 500).json({
          error: snapResp.data?.message || snapResp.data?.__type || 'CreateInstanceSnapshot failed',
        });
        return;
      }

      res.json({
        success: true,
        alreadyExists: false,
        snapshotName,
        state: 'pending',
        autoDeleteAt: meta.snapshotAutoDeleteAt[snapshotName] || null,
        firewallRulesCount: fwToSave.length,
        latencyMs: snapResp.latencyMs,
        endpoint: snapResp.endpoint,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'CreateInstanceSnapshot failed' });
    }
  });

  // 7b. Real Lightsail: Check Snapshot Status
  app.post('/api/lightsail/snapshot/status', async (req: Request, res: Response) => {
    const { snapshotName, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    if (!snapshotName) {
      res.status(400).json({ error: 'snapshotName is required' });
      return;
    }

    try {
      const check = await callAwsLightsail(
        'GetInstanceSnapshot',
        { instanceSnapshotName: snapshotName },
        creds
      );
      if (!check.ok || !check.data?.instanceSnapshot) {
        res.status(check.status || 404).json({
          error: check.data?.message || 'Snapshot not found',
        });
        return;
      }
      const snap = check.data.instanceSnapshot;
      res.json({
        snapshotName: snap.name,
        state: snap.state,
        progress: snap.progress || null,
        sizeInGb: snap.sizeInGb ?? 40,
        fromInstanceName: snap.fromInstanceName,
        latencyMs: check.latencyMs,
        endpoint: check.endpoint,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'GetInstanceSnapshot failed' });
    }
  });

  // 7c. Real Lightsail: Step 3 of Hibernate - Delete Instance (with forceDeleteAddOns & retry)
  app.post('/api/lightsail/instance/delete', async (req: Request, res: Response) => {
    const { instanceName, snapshotName, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    if (!instanceName) {
      res.status(400).json({ error: 'instanceName is required' });
      return;
    }

    try {
      if (snapshotName) {
        const snapCheck = await callAwsLightsail(
          'GetInstanceSnapshot',
          { instanceSnapshotName: snapshotName },
          creds
        );
        if (!snapCheck.ok || snapCheck.data?.instanceSnapshot?.state !== 'available') {
          res.status(409).json({
            error: `快照 ${snapshotName} 当前状态为 ${snapCheck.data?.instanceSnapshot?.state || 'unknown'}，尚未就绪，拒绝删除实例`,
          });
          return;
        }
      }

      let lastErr = 'DeleteInstance failed';
      let lastStatus = 500;
      for (let attempt = 0; attempt < 6; attempt++) {
        const delResp = await callAwsLightsail(
          'DeleteInstance',
          { instanceName, forceDeleteAddOns: true },
          creds
        );
        if (delResp.ok) {
          res.json({
            success: true,
            instanceName,
            operations: delResp.data?.operations || [],
            latencyMs: delResp.latencyMs,
            endpoint: delResp.endpoint,
          });
          return;
        }

        // If instance is already deleted (NotFoundException), treat as success
        if (delResp.data?.__type === 'NotFoundException' || delResp.status === 404) {
          res.json({
            success: true,
            instanceName,
            alreadyDeleted: true,
            latencyMs: delResp.latencyMs,
            endpoint: delResp.endpoint,
          });
          return;
        }

        lastErr = delResp.data?.message || delResp.data?.__type || 'DeleteInstance failed';
        lastStatus = delResp.status || 500;
        await new Promise((r) => setTimeout(r, 2000));
      }

      res.status(lastStatus).json({ error: lastErr });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'DeleteInstance error' });
    }
  });

  // 7. Real Lightsail: Combined Hibernate (Step 1: Save Firewall -> Step 2: Create Snapshot & Wait -> Step 3: Delete Instance)
  app.post('/api/lightsail/hibernate', async (req: Request, res: Response) => {
    const { instanceName, snapshotName, retentionHours, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    if (!instanceName || !snapshotName) {
      res.status(400).json({ error: 'instanceName and snapshotName are required' });
      return;
    }

    try {
      const meta = loadMetadataStore();

      // Step 1: Extract & save firewall rules before snapshotting/deleting
      let extractedRules: PersistedFirewallRule[] = [];
      const portResp = await callAwsLightsail('GetInstancePortStates', { instanceName }, creds);
      if (portResp.ok && Array.isArray(portResp.data?.portStates)) {
        extractedRules = normalizeFirewallRules(portResp.data.portStates);
      }
      if (extractedRules.length === 0) {
        extractedRules = meta.firewallByInstance[instanceName]?.rules || DEFAULT_FIREWALL_RULES;
      }
      const nowIso = new Date().toISOString();
      meta.firewallByInstance[instanceName] = { rules: extractedRules, updatedAt: nowIso };
      meta.firewallBySnapshot[snapshotName] = { rules: extractedRules, updatedAt: nowIso };

      const effectiveHours =
        retentionHours !== undefined
          ? retentionHours
          : meta.lifecyclePolicy.enabled
          ? meta.lifecyclePolicy.defaultRetentionHours
          : null;
      if (effectiveHours && Number(effectiveHours) > 0) {
        meta.snapshotAutoDeleteAt[snapshotName] = new Date(
          Date.now() + Number(effectiveHours) * 3600_000
        ).toISOString();
      }
      saveMetadataStore(meta);

      // Step 2: Create Snapshot & wait until available
      const existingCheck = await callAwsLightsail(
        'GetInstanceSnapshot',
        { instanceSnapshotName: snapshotName },
        creds
      );

      let available =
        existingCheck.ok && existingCheck.data?.instanceSnapshot?.state === 'available';

      if (!existingCheck.ok || !existingCheck.data?.instanceSnapshot) {
        const snapResp = await callAwsLightsail(
          'CreateInstanceSnapshot',
          { instanceName, instanceSnapshotName: snapshotName },
          creds
        );
        if (!snapResp.ok) {
          res.status(snapResp.status || 500).json({
            error: snapResp.data?.message || 'CreateInstanceSnapshot failed',
          });
          return;
        }
      }

      // Poll until snapshot is available (up to 90 attempts * 2s = 180s)
      for (let i = 0; !available && i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const check = await callAwsLightsail(
          'GetInstanceSnapshot',
          { instanceSnapshotName: snapshotName },
          creds
        );
        if (check.ok && check.data?.instanceSnapshot?.state === 'available') {
          available = true;
          break;
        }
      }

      if (!available) {
        res.status(504).json({
          error: `快照 ${snapshotName} 创建耗时超过 180 秒尚未就绪，为保证数据安全暂未删除实例，请稍后重试`,
        });
        return;
      }

      // Step 3: Delete instance with retry & forceDeleteAddOns
      let deleted = false;
      let delError = 'DeleteInstance failed';
      let delStatus = 500;
      for (let attempt = 0; attempt < 6; attempt++) {
        const delResp = await callAwsLightsail(
          'DeleteInstance',
          { instanceName, forceDeleteAddOns: true },
          creds
        );
        if (delResp.ok || delResp.data?.__type === 'NotFoundException') {
          deleted = true;
          break;
        }
        delError = delResp.data?.message || delResp.data?.__type || 'DeleteInstance failed';
        delStatus = delResp.status || 500;
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!deleted) {
        res.status(delStatus).json({ error: delError });
        return;
      }

      res.json({
        success: true,
        snapshotName,
        firewallRulesSaved: extractedRules.length,
        instanceDeleted: true,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Hibernate failed' });
    }
  });

  // 8. Real Lightsail: Restore from Snapshot + Restore Firewall Rules + Sync Cloudflare DNS
  app.post('/api/lightsail/restore', async (req: Request, res: Response) => {
    const {
      instanceName,
      snapshotName,
      availabilityZone,
      bundleId,
      restoreFirewall = true,
      firewallRules: customFirewallRules,
      cloudflareConfig,
      config: overrides,
    } = req.body || {};
    const creds = resolveCredentials(overrides);

    try {
      const meta = loadMetadataStore();
      const targetAz =
        availabilityZone && availabilityZone !== 'all'
          ? availabilityZone
          : creds.awsAvailabilityZone;

      // Check if instance already exists (e.g. if called twice)
      const existingInstCheck = await callAwsLightsail('GetInstance', { instanceName }, creds);
      if (!existingInstCheck.ok || !existingInstCheck.data?.instance) {
        const createResp = await callAwsLightsail(
          'CreateInstancesFromSnapshot',
          {
            instanceNames: [instanceName],
            instanceSnapshotName: snapshotName,
            availabilityZone: targetAz,
            bundleId: bundleId || 'micro_3_0',
          },
          creds
        );

        if (!createResp.ok) {
          res.status(createResp.status || 500).json({
            error: createResp.data?.message || 'CreateInstancesFromSnapshot failed',
          });
          return;
        }
      }

      // Poll for new public IP and running state (up to 45 * 2s = 90s)
      let instanceData: any = null;
      for (let i = 0; i < 45; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const instResp = await callAwsLightsail('GetInstance', { instanceName }, creds);
        if (instResp.ok && instResp.data?.instance?.publicIpAddress) {
          instanceData = instResp.data.instance;
          // Prefer waiting until state is 'running' so PutInstancePublicPorts succeeds immediately
          if (String(instanceData?.state?.name || '').toLowerCase() === 'running') {
            break;
          }
        }
      }

      if (!instanceData?.publicIpAddress) {
        res.status(504).json({ error: '实例已发起重建，但等待公网 IP 分配超时' });
        return;
      }

      // Restore Firewall Rules via PutInstancePublicPorts
      let restoredFirewallRules: PersistedFirewallRule[] = [];
      let firewallRestored = false;
      if (restoreFirewall !== false) {
        restoredFirewallRules =
          (Array.isArray(customFirewallRules) && customFirewallRules.length > 0
            ? normalizeFirewallRules(customFirewallRules)
            : null) ||
          meta.firewallBySnapshot[snapshotName]?.rules ||
          meta.firewallByInstance[instanceName]?.rules ||
          DEFAULT_FIREWALL_RULES;

        const fwRes = await applyFirewallRulesToAwsInstance(
          instanceName,
          restoredFirewallRules,
          creds
        );
        firewallRestored = fwRes.ok;
        meta.firewallByInstance[instanceName] = {
          rules: restoredFirewallRules,
          updatedAt: new Date().toISOString(),
        };
        saveMetadataStore(meta);
      }

      let dnsRecord: any = undefined;
      const domain = cloudflareConfig?.domain || creds.cloudflareRecordName;
      const zoneId = cloudflareConfig?.zoneId || creds.cloudflareZoneId;
      if (cloudflareConfig?.enabled && domain && zoneId && creds.cloudflareApiToken) {
        const listResp = await callCloudflare(
          `/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}&type=A`,
          'GET',
          creds
        );
        const existing = listResp.data?.result?.[0];
        const body = {
          type: 'A',
          name: domain,
          content: instanceData.publicIpAddress,
          proxied: Boolean(cloudflareConfig?.proxied),
          ttl: 1,
        };
        const cfRes = existing
          ? await callCloudflare(`/zones/${zoneId}/dns_records/${existing.id}`, 'PUT', creds, body)
          : await callCloudflare(`/zones/${zoneId}/dns_records`, 'POST', creds, body);
        if (!cfRes.ok) {
          res.status(cfRes.status || 500).json({
            error: `实例已启动 (${instanceData.publicIpAddress})，但 Cloudflare DNS 更新失败: ${cfRes.data?.errors?.[0]?.message || 'Unknown error'}`,
          });
          return;
        }
        dnsRecord = cfRes.data?.result;
      }

      const mappedInstance = mapAwsInstance(
        instanceData,
        dnsRecord ? [dnsRecord] : [],
        meta,
        domain,
        zoneId
      );
      if (restoredFirewallRules.length > 0) {
        mappedInstance.firewallRules = restoredFirewallRules;
      }

      res.json({
        instance: mappedInstance,
        dnsRecord,
        firewallRestored,
        restoredFirewallRules,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Restore failed' });
    }
  });

  // 9. Real Lightsail: Delete Snapshot
  app.delete('/api/lightsail/snapshots/:name', async (req: Request, res: Response) => {
    const creds = resolveCredentials(req.body?.config);
    const snapshotName = req.params.name;
    try {
      const resp = await callAwsLightsail(
        'DeleteInstanceSnapshot',
        { instanceSnapshotName: snapshotName },
        creds
      );
      if (!resp.ok) {
        res.status(resp.status || 500).json({ error: resp.data?.message || 'DeleteInstanceSnapshot failed' });
        return;
      }
      const meta = loadMetadataStore();
      delete meta.snapshotAutoDeleteAt[snapshotName];
      delete meta.firewallBySnapshot[snapshotName];
      saveMetadataStore(meta);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Delete snapshot error' });
    }
  });

  // 10. Real Cloudflare: Sync DNS A record
  app.post('/api/cloudflare/sync', async (req: Request, res: Response) => {
    const { domainName, ip, zoneId, proxied, instanceName, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    const targetZone = (zoneId && zoneId !== PLACEHOLDER_CF_ZONE ? zoneId : '') || creds.cloudflareZoneId;
    const targetDomain = (domainName || creds.cloudflareRecordName || '').trim();

    if (!creds.cloudflareApiToken || !targetZone || !targetDomain || !ip) {
      res.status(400).json({ error: '缺少 Cloudflare Token、Zone ID、域名或 IP 参数' });
      return;
    }

    try {
      const meta = loadMetadataStore();
      meta.customDefaultDnsRecordName = targetDomain;
      if (instanceName) {
        meta.domainByInstance[instanceName] = targetDomain;
      }
      saveMetadataStore(meta);

      const listResp = await callCloudflare(
        `/zones/${targetZone}/dns_records?name=${encodeURIComponent(targetDomain)}&type=A`,
        'GET',
        creds
      );
      const existing = listResp.data?.result?.[0];
      const payload = {
        type: 'A',
        name: targetDomain,
        content: ip,
        proxied: Boolean(proxied),
        ttl: 1,
      };
      const cfResp = existing
        ? await callCloudflare(`/zones/${targetZone}/dns_records/${existing.id}`, 'PUT', creds, payload)
        : await callCloudflare(`/zones/${targetZone}/dns_records`, 'POST', creds, payload);

      if (!cfResp.ok) {
        res.status(cfResp.status || 500).json({
          error: cfResp.data?.errors?.[0]?.message || 'Cloudflare DNS sync failed',
        });
        return;
      }

      res.json({ record: cfResp.data?.result, latencyMs: cfResp.latencyMs });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Cloudflare sync error' });
    }
  });

  // 10b. Server-Side Non-Blocking Background Task Queue (Hibernate, Restore, Manual Release)
  app.get('/api/lightsail/tasks', (_req: Request, res: Response) => {
    const meta = loadMetadataStore();
    res.json({ tasks: meta.backgroundTasks || [] });
  });

  app.post('/api/lightsail/tasks/clear', (_req: Request, res: Response) => {
    const meta = loadMetadataStore();
    meta.backgroundTasks = (meta.backgroundTasks || []).filter((t) => t.status === 'running');
    saveMetadataStore(meta);
    res.json({ success: true, tasks: meta.backgroundTasks });
  });

  // Enqueue non-blocking background Hibernate task (Step 1: Save Firewall -> Step 2: Create & Wait Snapshot -> Step 3: Delete Instance)
  app.post('/api/lightsail/tasks/hibernate', (req: Request, res: Response) => {
    const {
      instanceName,
      snapshotName,
      retentionHours,
      firewallRules: customFirewallRules,
      config: overrides,
    } = req.body || {};
    const creds = resolveCredentials(overrides);

    if (!instanceName || !snapshotName) {
      res.status(400).json({ error: 'instanceName and snapshotName are required' });
      return;
    }

    const nowIso = new Date().toISOString();
    const taskId = `task-hib-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const task: ServerBackgroundTask = {
      id: taskId,
      type: 'hibernate',
      title: `后台休眠实例 ${instanceName}`,
      instanceName,
      snapshotName,
      status: 'running',
      progressPercent: 10,
      currentStepTitle: '1/3 提取并备份实例防火墙配置',
      steps: [
        {
          id: 'save_firewall',
          title: '1/3 提取并备份实例防火墙配置',
          description: `正在通过 GetInstancePortStates 提取 ${instanceName} 的开放端口...`,
          status: 'running',
        },
        {
          id: 'snap_create',
          title: '2/3 创建系统快照并后台等待就绪',
          description: `等待发起快照 ${snapshotName}...`,
          status: 'pending',
        },
        {
          id: 'delete_compute',
          title: '3/3 暂时删除计算实例停止计费',
          description: '快照就绪后自动调用 DeleteInstance 释放实例',
          status: 'pending',
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    upsertBackgroundTask(task);

    // Fire-and-forget async worker on server so client window is never blocked
    (async () => {
      try {
        const meta = loadMetadataStore();
        // Step 1: Extract Firewall Rules
        let extractedRules: PersistedFirewallRule[] = [];
        if (Array.isArray(customFirewallRules) && customFirewallRules.length > 0) {
          extractedRules = normalizeFirewallRules(customFirewallRules);
        } else {
          const portResp = await callAwsLightsail('GetInstancePortStates', { instanceName }, creds);
          if (portResp.ok && Array.isArray(portResp.data?.portStates)) {
            extractedRules = normalizeFirewallRules(portResp.data.portStates);
          }
        }
        if (extractedRules.length === 0) {
          extractedRules = meta.firewallByInstance[instanceName]?.rules || DEFAULT_FIREWALL_RULES;
        }

        const fwUpdatedAt = new Date().toISOString();
        meta.firewallByInstance[instanceName] = { rules: extractedRules, updatedAt: fwUpdatedAt };
        meta.firewallBySnapshot[snapshotName] = { rules: extractedRules, updatedAt: fwUpdatedAt };

        const resolvedRetention =
          retentionHours !== undefined
            ? retentionHours
            : meta.lifecyclePolicy.enabled
            ? meta.lifecyclePolicy.defaultRetentionHours
            : null;
        if (resolvedRetention && Number(resolvedRetention) > 0) {
          meta.snapshotAutoDeleteAt[snapshotName] = new Date(
            Date.now() + Number(resolvedRetention) * 3600_000
          ).toISOString();
        } else {
          meta.snapshotAutoDeleteAt[snapshotName] = null;
        }
        saveMetadataStore(meta);

        task.steps[0] = {
          id: 'save_firewall',
          title: '1/3 防火墙配置已提取并备份',
          description: `已保存 ${extractedRules.length} 条端口规则 (${extractedRules
            .map((r) => `${r.protocol.toUpperCase()}:${r.fromPort}`)
            .join(', ')})`,
          status: 'completed',
        };
        task.steps[1] = {
          id: 'snap_create',
          title: '2/3 正在创建 AWS 系统快照',
          description: `正在向 AWS 发起创建快照 ${snapshotName}...`,
          status: 'running',
        };
        task.progressPercent = 30;
        task.currentStepTitle = '2/3 正在创建并等待 AWS 快照就绪';
        task.updatedAt = new Date().toISOString();
        upsertBackgroundTask(task);

        // Step 2: Create or Reuse Snapshot & Poll until 'available'
        const existingCheck = await callAwsLightsail(
          'GetInstanceSnapshot',
          { instanceSnapshotName: snapshotName },
          creds
        );
        let available =
          existingCheck.ok && existingCheck.data?.instanceSnapshot?.state === 'available';

        if (!existingCheck.ok || !existingCheck.data?.instanceSnapshot) {
          const snapResp = await callAwsLightsail(
            'CreateInstanceSnapshot',
            { instanceName, instanceSnapshotName: snapshotName },
            creds
          );
          if (!snapResp.ok) {
            throw new Error(snapResp.data?.message || 'CreateInstanceSnapshot 调用失败');
          }
        }

        const pollStart = Date.now();
        for (let i = 0; !available && i < 150; i++) {
          const elapsedSec = Math.round((Date.now() - pollStart) / 1000);
          task.steps[1] = {
            id: 'snap_create',
            title: '2/3 后台等待 AWS 快照就绪',
            description: `AWS 正在写入快照 ${snapshotName}（已后台等待 ${elapsedSec} 秒，即使关闭窗口也会在完成后自动删除实例）...`,
            status: 'running',
          };
          task.progressPercent = Math.min(80, 30 + Math.round((i / 40) * 50));
          task.updatedAt = new Date().toISOString();
          upsertBackgroundTask(task);

          await new Promise((r) => setTimeout(r, 3000));
          const check = await callAwsLightsail(
            'GetInstanceSnapshot',
            { instanceSnapshotName: snapshotName },
            creds
          );
          const state = check.data?.instanceSnapshot?.state;
          if (check.ok && state === 'available') {
            available = true;
            break;
          }
          if (state === 'error') {
            throw new Error(`AWS 快照 ${snapshotName} 状态异常 (error)`);
          }
        }

        if (!available) {
          throw new Error(`等待快照 ${snapshotName} 超时，为确保数据安全未自动删除实例，可稍后点击手动释放`);
        }

        task.steps[1] = {
          id: 'snap_create',
          title: '2/3 系统快照已就绪 (Available)',
          description: `快照 ${snapshotName} 已完成持久化备份`,
          status: 'completed',
        };
        task.steps[2] = {
          id: 'delete_compute',
          title: '3/3 正在释放计算实例 (DeleteInstance)',
          description: `正在调用 DeleteInstance 删除实例 ${instanceName} 停止计费...`,
          status: 'running',
        };
        task.progressPercent = 88;
        task.currentStepTitle = '3/3 正在删除计算实例停止计费';
        task.updatedAt = new Date().toISOString();
        upsertBackgroundTask(task);

        // Step 3: Delete Instance
        let deleted = false;
        let delError = 'DeleteInstance failed';
        for (let attempt = 0; attempt < 6; attempt++) {
          const delResp = await callAwsLightsail(
            'DeleteInstance',
            { instanceName, forceDeleteAddOns: true },
            creds
          );
          if (delResp.ok || delResp.data?.__type === 'NotFoundException') {
            deleted = true;
            break;
          }
          delError = delResp.data?.message || delResp.data?.__type || 'DeleteInstance failed';
          await new Promise((r) => setTimeout(r, 2500));
        }

        if (!deleted) {
          throw new Error(`删除实例失败: ${delError}`);
        }

        task.steps[2] = {
          id: 'delete_compute',
          title: '3/3 计算实例已安全释放',
          description: `实例 ${instanceName} 已从 AWS 删除，当前计算费用已降为 $0/月`,
          status: 'completed',
        };
        task.status = 'completed';
        task.progressPercent = 100;
        task.currentStepTitle = `休眠完成 (${snapshotName})`;
        task.completedAt = new Date().toISOString();
        task.updatedAt = task.completedAt;
        task.result = {
          firewallRulesCount: extractedRules.length,
        };
        upsertBackgroundTask(task);
      } catch (err: any) {
        const errMsg = err?.message || '后台休眠任务执行失败';
        task.status = 'failed';
        task.error = errMsg;
        task.currentStepTitle = `执行失败: ${errMsg}`;
        task.updatedAt = new Date().toISOString();
        task.steps = task.steps.map((s) =>
          s.status === 'running' ? { ...s, status: 'error', description: errMsg } : s
        );
        upsertBackgroundTask(task);
      }
    })();

    res.json({ success: true, taskId, task });
  });

  // Enqueue non-blocking background Restore task (Step 1: Rebuild -> Step 2: Wait IP -> Step 3: Restore Firewall -> Step 4: Sync DNS)
  app.post('/api/lightsail/tasks/restore', (req: Request, res: Response) => {
    const {
      instanceName,
      snapshotName,
      availabilityZone,
      bundleId,
      restoreFirewall = true,
      firewallRules: customFirewallRules,
      cloudflareConfig,
      config: overrides,
    } = req.body || {};
    const creds = resolveCredentials(overrides);

    if (!instanceName || !snapshotName) {
      res.status(400).json({ error: 'instanceName and snapshotName are required' });
      return;
    }

    const nowIso = new Date().toISOString();
    const taskId = `task-res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const task: ServerBackgroundTask = {
      id: taskId,
      type: 'restore',
      title: `后台恢复实例 ${instanceName}`,
      instanceName,
      snapshotName,
      status: 'running',
      progressPercent: 10,
      currentStepTitle: '1/4 从快照重建 Lightsail 实例',
      steps: [
        {
          id: 'restore_instance',
          title: '1/4 从快照重建 Lightsail 实例',
          description: `正在调用 CreateInstancesFromSnapshot (${snapshotName})...`,
          status: 'running',
        },
        {
          id: 'wait_ip',
          title: '2/4 等待实例运行并分配公网 IP',
          description: '等待 AWS 分配全新公网 IPv4 地址...',
          status: 'pending',
        },
        {
          id: 'restore_firewall',
          title: '3/4 复原防火墙端口规则',
          description: '等待调用 PutInstancePublicPorts 恢复开放端口...',
          status: 'pending',
        },
        {
          id: 'cf_dns_update',
          title: '4/4 同步 Cloudflare DNS 记录',
          description: '等待将新公网 IP 写入 Cloudflare A 记录...',
          status: 'pending',
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    upsertBackgroundTask(task);

    (async () => {
      try {
        const meta = loadMetadataStore();
        const targetAz =
          availabilityZone && availabilityZone !== 'all'
            ? availabilityZone
            : creds.awsAvailabilityZone;

        const existingInstCheck = await callAwsLightsail('GetInstance', { instanceName }, creds);
        if (!existingInstCheck.ok || !existingInstCheck.data?.instance) {
          const createResp = await callAwsLightsail(
            'CreateInstancesFromSnapshot',
            {
              instanceNames: [instanceName],
              instanceSnapshotName: snapshotName,
              availabilityZone: targetAz,
              bundleId: bundleId || 'micro_3_0',
            },
            creds
          );
          if (!createResp.ok) {
            throw new Error(createResp.data?.message || 'CreateInstancesFromSnapshot 失败');
          }
        }

        task.steps[0] = {
          id: 'restore_instance',
          title: '1/4 实例重建请求已提交',
          description: `已在可用区 ${targetAz} 从快照 ${snapshotName} 启动重建`,
          status: 'completed',
        };
        task.steps[1] = {
          id: 'wait_ip',
          title: '2/4 正在等待实例就绪与公网 IP',
          description: '正在后台轮询 GetInstance 状态...',
          status: 'running',
        };
        task.progressPercent = 35;
        task.currentStepTitle = '2/4 正在等待实例 Running 与公网 IP';
        task.updatedAt = new Date().toISOString();
        upsertBackgroundTask(task);

        let instanceData: any = null;
        const pollStart = Date.now();
        for (let i = 0; i < 60; i++) {
          const elapsedSec = Math.round((Date.now() - pollStart) / 1000);
          task.steps[1].description = `正在等待 AWS 分配公网 IP 并启动系统（已等待 ${elapsedSec} 秒）...`;
          task.progressPercent = Math.min(65, 35 + Math.round((i / 30) * 30));
          task.updatedAt = new Date().toISOString();
          upsertBackgroundTask(task);

          await new Promise((r) => setTimeout(r, 2500));
          const instResp = await callAwsLightsail('GetInstance', { instanceName }, creds);
          if (instResp.ok && instResp.data?.instance?.publicIpAddress) {
            instanceData = instResp.data.instance;
            if (String(instanceData?.state?.name || '').toLowerCase() === 'running') {
              break;
            }
          }
        }

        if (!instanceData?.publicIpAddress) {
          throw new Error('等待新实例公网 IP 分配超时');
        }

        const newIp = instanceData.publicIpAddress;
        task.steps[1] = {
          id: 'wait_ip',
          title: '2/4 公网 IP 分配成功',
          description: `已分配新公网 IP: ${newIp}`,
          status: 'completed',
          detail: newIp,
        };
        task.steps[2] = {
          id: 'restore_firewall',
          title: '3/4 正在复原防火墙端口配置',
          description: '正在调用 PutInstancePublicPorts 写入开放端口...',
          status: 'running',
        };
        task.progressPercent = 75;
        task.currentStepTitle = '3/4 正在复原防火墙端口规则';
        task.updatedAt = new Date().toISOString();
        upsertBackgroundTask(task);

        let restoredRules: PersistedFirewallRule[] = [];
        if (restoreFirewall !== false) {
          restoredRules =
            (Array.isArray(customFirewallRules) && customFirewallRules.length > 0
              ? normalizeFirewallRules(customFirewallRules)
              : null) ||
            meta.firewallBySnapshot[snapshotName]?.rules ||
            meta.firewallByInstance[instanceName]?.rules ||
            DEFAULT_FIREWALL_RULES;

          await applyFirewallRulesToAwsInstance(instanceName, restoredRules, creds);
          const freshMeta = loadMetadataStore();
          freshMeta.firewallByInstance[instanceName] = {
            rules: restoredRules,
            updatedAt: new Date().toISOString(),
          };
          saveMetadataStore(freshMeta);
        }

        task.steps[2] = {
          id: 'restore_firewall',
          title: '3/4 防火墙端口配置已复原',
          description:
            restoreFirewall !== false
              ? `已成功开放 ${restoredRules.length} 条端口规则 (${restoredRules
                  .map((r) => `${r.protocol.toUpperCase()}:${r.fromPort}`)
                  .join(', ')})`
              : '已跳过防火墙自定义恢复',
          status: 'completed',
        };

        const domain = (cloudflareConfig?.domain || creds.cloudflareRecordName || '').trim();
        const zoneId = (cloudflareConfig?.zoneId || creds.cloudflareZoneId || '').trim();
        task.steps[3] = {
          id: 'cf_dns_update',
          title: '4/4 正在同步 Cloudflare DNS 记录',
          description: `正在将 ${domain} 指向 ${newIp}...`,
          status: 'running',
        };
        task.progressPercent = 90;
        task.currentStepTitle = '4/4 正在更新 Cloudflare DNS';
        task.updatedAt = new Date().toISOString();
        upsertBackgroundTask(task);

        if (cloudflareConfig?.enabled && domain && zoneId && creds.cloudflareApiToken) {
          const freshMeta = loadMetadataStore();
          freshMeta.customDefaultDnsRecordName = domain;
          freshMeta.domainByInstance[instanceName] = domain;
          saveMetadataStore(freshMeta);

          const listResp = await callCloudflare(
            `/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}&type=A`,
            'GET',
            creds
          );
          const existing = listResp.data?.result?.[0];
          const body = {
            type: 'A',
            name: domain,
            content: newIp,
            proxied: Boolean(cloudflareConfig?.proxied),
            ttl: 1,
          };
          const cfRes = existing
            ? await callCloudflare(`/zones/${zoneId}/dns_records/${existing.id}`, 'PUT', creds, body)
            : await callCloudflare(`/zones/${zoneId}/dns_records`, 'POST', creds, body);
          if (!cfRes.ok) {
            throw new Error(
              `实例已恢复 (${newIp})，但 Cloudflare DNS 同步失败: ${
                cfRes.data?.errors?.[0]?.message || 'Unknown error'
              }`
            );
          }
          task.steps[3] = {
            id: 'cf_dns_update',
            title: '4/4 Cloudflare DNS 已同步更新',
            description: `${domain} -> ${newIp} 已生效`,
            status: 'completed',
            detail: `${domain} -> ${newIp}`,
          };
        } else {
          task.steps[3] = {
            id: 'cf_dns_update',
            title: '4/4 实例已就绪（跳过 DNS 同步）',
            description: `新公网 IP: ${newIp}`,
            status: 'completed',
          };
        }

        task.status = 'completed';
        task.progressPercent = 100;
        task.currentStepTitle = `恢复完成 (${newIp})`;
        task.completedAt = new Date().toISOString();
        task.updatedAt = task.completedAt;
        task.result = {
          publicIpAddress: newIp,
          domain,
          firewallRulesCount: restoredRules.length,
        };
        upsertBackgroundTask(task);
      } catch (err: any) {
        const errMsg = err?.message || '后台恢复实例失败';
        task.status = 'failed';
        task.error = errMsg;
        task.currentStepTitle = `恢复失败: ${errMsg}`;
        task.updatedAt = new Date().toISOString();
        task.steps = task.steps.map((s) =>
          s.status === 'running' ? { ...s, status: 'error', description: errMsg } : s
        );
        upsertBackgroundTask(task);
      }
    })();

    res.json({ success: true, taskId, task });
  });

  // Manual Release / Force Delete Instance Endpoint (with optional firewall rule backup, no snapshot wait)
  app.post('/api/lightsail/tasks/release', async (req: Request, res: Response) => {
    const { instanceName, backupFirewall = true, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    if (!instanceName) {
      res.status(400).json({ error: 'instanceName is required' });
      return;
    }
    if (!creds.awsAccessKeyId || !creds.awsSecretAccessKey) {
      res.status(400).json({ error: '缺少 AWS 访问凭证' });
      return;
    }

    const nowIso = new Date().toISOString();
    const taskId = `task-rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const task: ServerBackgroundTask = {
      id: taskId,
      type: 'manual_release',
      title: `手动释放实例 ${instanceName}`,
      instanceName,
      status: 'running',
      progressPercent: 30,
      currentStepTitle: '正在提取防火墙并直接释放实例',
      steps: [
        {
          id: 'backup_fw',
          title: '1/2 提取并保存当前防火墙配置',
          description: backupFirewall ? '正在备份实例防火墙开放端口...' : '已跳过防火墙提取',
          status: backupFirewall ? 'running' : 'completed',
        },
        {
          id: 'force_delete',
          title: '2/2 手动释放计算实例 (DeleteInstance)',
          description: `正在调用 DeleteInstance 立即删除 ${instanceName}...`,
          status: 'pending',
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    upsertBackgroundTask(task);

    try {
      const meta = loadMetadataStore();
      if (backupFirewall) {
        const portResp = await callAwsLightsail('GetInstancePortStates', { instanceName }, creds);
        if (portResp.ok && Array.isArray(portResp.data?.portStates)) {
          const rules = normalizeFirewallRules(portResp.data.portStates);
          if (rules.length > 0) {
            meta.firewallByInstance[instanceName] = {
              rules,
              updatedAt: new Date().toISOString(),
            };
            saveMetadataStore(meta);
          }
        }
        task.steps[0] = {
          id: 'backup_fw',
          title: '1/2 防火墙配置已备份',
          description: '已保存实例最新防火墙端口规则',
          status: 'completed',
        };
      }

      task.steps[1] = {
        id: 'force_delete',
        title: '2/2 正在执行 DeleteInstance',
        description: `正在强制释放计算实例 ${instanceName}...`,
        status: 'running',
      };
      task.progressPercent = 70;
      upsertBackgroundTask(task);

      let deleted = false;
      let lastErr = 'DeleteInstance failed';
      let lastLatency = 0;
      let lastEndpoint = `lightsail.${creds.awsRegion}.amazonaws.com`;

      for (let attempt = 0; attempt < 6; attempt++) {
        const delResp = await callAwsLightsail(
          'DeleteInstance',
          { instanceName, forceDeleteAddOns: true },
          creds
        );
        lastLatency = delResp.latencyMs;
        lastEndpoint = delResp.endpoint;
        if (delResp.ok || delResp.data?.__type === 'NotFoundException') {
          deleted = true;
          break;
        }
        lastErr = delResp.data?.message || delResp.data?.__type || 'DeleteInstance failed';
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!deleted) {
        throw new Error(lastErr);
      }

      task.steps[1] = {
        id: 'force_delete',
        title: '2/2 实例已成功手动释放',
        description: `实例 ${instanceName} 已从 AWS 删除，停止产生计算费用`,
        status: 'completed',
      };
      task.status = 'completed';
      task.progressPercent = 100;
      task.currentStepTitle = `实例 ${instanceName} 已手动释放`;
      task.completedAt = new Date().toISOString();
      task.updatedAt = task.completedAt;
      upsertBackgroundTask(task);

      res.json({
        success: true,
        taskId,
        task,
        instanceName,
        latencyMs: lastLatency,
        endpoint: lastEndpoint,
      });
    } catch (err: any) {
      const errMsg = err?.message || '手动释放实例失败';
      task.status = 'failed';
      task.error = errMsg;
      task.currentStepTitle = `释放失败: ${errMsg}`;
      task.updatedAt = new Date().toISOString();
      upsertBackgroundTask(task);
      res.status(500).json({ error: errMsg });
    }
  });

  // 11. GitHub Source Version Check & Release APK Inspector
  app.get('/api/github/update-check', async (req: Request, res: Response) => {
    const rawRepo = String(req.query.repo || DEFAULT_GITHUB_REPO).trim();
    const repoMatch = rawRepo.match(/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)$/);
    const repo = repoMatch ? repoMatch[1].replace(/\.git$/, '') : DEFAULT_GITHUB_REPO;
    const currentVersion = getLocalAppVersion();

    const ghHeaders: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AWS-Lightsail-Manager-Updater/1.0',
    };
    if (process.env.GITHUB_TOKEN) {
      ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    try {
      const [releasesResp, commitResp, rawPkgResp] = await Promise.allSettled([
        fetch(`https://api.github.com/repos/${repo}/releases?per_page=5`, { headers: ghHeaders }),
        fetch(`https://api.github.com/repos/${repo}/commits/main`, { headers: ghHeaders }),
        fetch(`https://raw.githubusercontent.com/${repo}/main/package.json`, { headers: ghHeaders }),
      ]);

      let latestRelease: any = null;
      if (releasesResp.status === 'fulfilled' && releasesResp.value.ok) {
        const list = await releasesResp.value.json();
        if (Array.isArray(list) && list.length > 0) {
          latestRelease = list[0];
        }
      }

      let latestCommit: any = null;
      if (commitResp.status === 'fulfilled' && commitResp.value.ok) {
        const c = await commitResp.value.json();
        if (c?.sha) {
          latestCommit = {
            sha: String(c.sha).slice(0, 7),
            message: String(c.commit?.message || '').split('\n')[0],
            date: c.commit?.committer?.date || c.commit?.author?.date || new Date().toISOString(),
            author: c.commit?.author?.name || c.author?.login || 'GitHub Actions',
            url: c.html_url || `https://github.com/${repo}/commit/${c.sha}`,
          };
        }
      }

      let remotePkgVersion: string | null = null;
      if (rawPkgResp.status === 'fulfilled' && rawPkgResp.value.ok) {
        try {
          const remotePkg = await rawPkgResp.value.json();
          if (remotePkg?.version) {
            remotePkgVersion = String(remotePkg.version).replace(/^v/i, '');
          }
        } catch {}
      }

      const releaseVersion = latestRelease?.tag_name
        ? String(latestRelease.tag_name).replace(/^v/i, '')
        : null;

      let latestVersion = currentVersion;
      if (releaseVersion && remotePkgVersion) {
        latestVersion = compareSemver(releaseVersion, remotePkgVersion) >= 0 ? releaseVersion : remotePkgVersion;
      } else if (releaseVersion) {
        latestVersion = releaseVersion;
      } else if (remotePkgVersion) {
        latestVersion = remotePkgVersion;
      }

      const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;
      const rawAssets = Array.isArray(latestRelease?.assets) ? latestRelease.assets : [];
      const apkAssets = rawAssets
        .filter((a: any) => String(a?.name || '').endsWith('.apk'))
        .map((a: any) => ({
          name: a.name,
          downloadUrl: a.browser_download_url,
          sizeBytes: a.size || 0,
          sizeMb: ((a.size || 0) / (1024 * 1024)).toFixed(2),
          downloadCount: a.download_count || 0,
        }));

      res.json({
        repo,
        currentVersion,
        latestVersion,
        hasUpdate,
        releaseTag: latestRelease?.tag_name || (latestVersion ? `v${latestVersion}` : null),
        releaseName: latestRelease?.name || (latestVersion ? `Release v${latestVersion}` : null),
        releaseNotes: latestRelease?.body || null,
        publishedAt: latestRelease?.published_at || latestCommit?.date || null,
        htmlUrl: latestRelease?.html_url || `https://github.com/${repo}/releases`,
        apkAssets,
        latestCommit,
        checkedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: `连接 GitHub 源失败: ${err?.message || String(err)}` });
    }
  });

  // 12. Sync local version metadata with remote GitHub source
  app.post('/api/github/sync-version', async (req: Request, res: Response) => {
    const targetVersion = String(req.body?.version || '').replace(/^v/i, '').trim();
    if (!targetVersion || !/^\d+\.\d+\.\d+$/.test(targetVersion)) {
      res.status(400).json({ error: '无效的目标版本号' });
      return;
    }
    try {
      const pkgPath = path.resolve(__dirname, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      pkg.version = targetVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      res.json({ success: true, currentVersion: targetVersion });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '同步版本号失败' });
    }
  });

  // Mount Vite dev server or production static files
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
