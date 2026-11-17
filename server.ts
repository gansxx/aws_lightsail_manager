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

  const cloudflareRecordName = (overrides?.defaultDnsRecordName || '').trim() || envCfRecord;

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

function mapAwsState(rawName?: string): 'pending' | 'running' | 'stopping' | 'stopped' | 'shutting-down' | 'terminated' {
  const s = (rawName || 'running').toLowerCase();
  if (s === 'pending' || s === 'running' || s === 'stopping' || s === 'stopped' || s === 'shutting-down' || s === 'terminated') {
    return s;
  }
  return 'running';
}

function mapAwsInstance(raw: any, cfRecords: any[], defaultDomain?: string, defaultZoneId?: string) {
  const stateName = mapAwsState(raw?.state?.name);
  const publicIp = raw?.publicIpAddress || null;
  const matchedCf = cfRecords.find(
    (r) =>
      (publicIp && r.content === publicIp) ||
      (defaultDomain && r.name?.toLowerCase() === defaultDomain.toLowerCase())
  );

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
    cloudflareBinding: matchedCf
      ? {
          enabled: true,
          domain: matchedCf.name,
          zoneId: matchedCf.zone_id || defaultZoneId || '',
          recordId: matchedCf.id,
          proxied: Boolean(matchedCf.proxied),
          lastUpdatedIp: matchedCf.content,
          lastSyncTime: matchedCf.modified_on,
        }
      : defaultDomain
      ? {
          enabled: true,
          domain: defaultDomain,
          zoneId: defaultZoneId || '',
          proxied: false,
        }
      : undefined,
  };
}

function mapAwsSnapshot(raw: any) {
  return {
    name: raw.name,
    arn: raw.arn,
    fromInstanceName: raw.fromInstanceName || 'unknown',
    fromInstanceArn: raw.fromInstanceArn || '',
    fromBlueprintId: raw.fromBlueprintId || 'ubuntu_22_04',
    fromBundleId: raw.fromBundleId || 'micro_2_0',
    sizeInGb: raw.sizeInGb ?? 40,
    state: raw.state === 'available' ? 'available' : raw.state === 'error' ? 'error' : 'in-progress',
    progress: raw.progress,
    createdAt: raw.createdAt ? new Date(raw.createdAt * 1000).toISOString() : new Date().toISOString(),
    isAutoHibernateSnapshot: Boolean(raw.name?.includes('auto') || raw.name?.includes('hibernate')),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // 1. Check Environment Secrets Status (never leaks raw secrets)
  app.get('/api/credentials/status', (_req: Request, res: Response) => {
    const awsKey = maskSecret(process.env.AWS_ACCESS_KEY_ID);
    const awsSecret = maskSecret(process.env.AWS_SECRET_ACCESS_KEY);
    const cfToken = maskSecret(process.env.CLOUDFLARE_API_TOKEN);
    const cfZone = maskSecret(process.env.CLOUDFLARE_ZONE_ID);
    const normalizedRegion = normalizeAwsRegion(process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION);

    res.json({
      awsAccessKeyId: awsKey,
      awsSecretAccessKey: awsSecret,
      awsRegion: normalizedRegion.region,
      cloudflareApiToken: cfToken,
      cloudflareZoneId: cfZone,
      cloudflareRecordName: (process.env.CLOUDFLARE_RECORD_NAME || '').trim() || null,
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

  // 3. Real Lightsail: Get Instances (merges active instances + hibernated instances derived from snapshots)
  app.post('/api/lightsail/instances', async (req: Request, res: Response) => {
    const creds = resolveCredentials(req.body?.config);
    if (!creds.awsAccessKeyId || !creds.awsSecretAccessKey) {
      res.status(400).json({ error: '缺少 AWS 访问凭证，请在 Secrets 或设置中配置' });
      return;
    }

    try {
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
          mapAwsInstance(inst, cfRecords, creds.cloudflareRecordName, creds.cloudflareZoneId)
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
        const matchedCf = cfRecords.find(
          (r) =>
            creds.cloudflareRecordName &&
            r.name?.toLowerCase() === creds.cloudflareRecordName.toLowerCase()
        );
        const bundleId = snap.fromBundleId || 'micro_3_0';
        const isNano = bundleId.includes('nano');
        const isSmall = bundleId.includes('small');
        const isMedium = bundleId.includes('medium');
        const ramGb = isNano ? 0.5 : isSmall ? 2 : isMedium ? 4 : 1;
        const cpuCount = bundleId.includes('_3_0') ? 2 : isSmall || isMedium ? 2 : 1;
        const diskSizeGb = snap.sizeInGb ?? 40;

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
          cloudflareBinding: matchedCf
            ? {
                enabled: true,
                domain: matchedCf.name,
                zoneId: matchedCf.zone_id || creds.cloudflareZoneId || '',
                recordId: matchedCf.id,
                proxied: Boolean(matchedCf.proxied),
                lastUpdatedIp: matchedCf.content,
                lastSyncTime: matchedCf.modified_on,
              }
            : creds.cloudflareRecordName
            ? {
                enabled: true,
                domain: creds.cloudflareRecordName,
                zoneId: creds.cloudflareZoneId || '',
                proxied: false,
              }
            : undefined,
        });
      }

      res.json({
        instances: [...activeInstances, ...hibernatedInstances],
        latencyMs: awsResp.latencyMs,
        endpoint: awsResp.endpoint,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to query AWS Lightsail' });
    }
  });

  // 4. Real Lightsail: Get Snapshots
  app.post('/api/lightsail/snapshots', async (req: Request, res: Response) => {
    const creds = resolveCredentials(req.body?.config);
    if (!creds.awsAccessKeyId || !creds.awsSecretAccessKey) {
      res.status(400).json({ error: '缺少 AWS 访问凭证' });
      return;
    }

    try {
      const awsResp = await callAwsLightsail('GetInstanceSnapshots', {}, creds);
      if (!awsResp.ok) {
        res.status(awsResp.status || 500).json({
          error: awsResp.data?.message || 'AWS GetInstanceSnapshots failed',
        });
        return;
      }
      const rawSnapshots = Array.isArray(awsResp.data?.instanceSnapshots) ? awsResp.data.instanceSnapshots : [];
      res.json({
        snapshots: rawSnapshots.map(mapAwsSnapshot),
        latencyMs: awsResp.latencyMs,
        endpoint: awsResp.endpoint,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to query snapshots' });
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

  // 7a. Real Lightsail: Step 1 of Hibernate - Create or Reuse Snapshot
  app.post('/api/lightsail/snapshot/create', async (req: Request, res: Response) => {
    const { instanceName, snapshotName, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    if (!instanceName || !snapshotName) {
      res.status(400).json({ error: 'instanceName and snapshotName are required' });
      return;
    }

    try {
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
        latencyMs: snapResp.latencyMs,
        endpoint: snapResp.endpoint,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'CreateInstanceSnapshot failed' });
    }
  });

  // 7b. Real Lightsail: Step 2 of Hibernate - Check Snapshot Status
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

  // 7. Real Lightsail: Combined Hibernate (Create Snapshot -> Wait Available -> Delete Instance)
  app.post('/api/lightsail/hibernate', async (req: Request, res: Response) => {
    const { instanceName, snapshotName, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    if (!instanceName || !snapshotName) {
      res.status(400).json({ error: 'instanceName and snapshotName are required' });
      return;
    }

    try {
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

      // Delete instance with retry & forceDeleteAddOns
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

      res.json({ success: true, snapshotName, instanceDeleted: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Hibernate failed' });
    }
  });

  // 8. Real Lightsail: Restore from Snapshot + Sync Cloudflare DNS
  app.post('/api/lightsail/restore', async (req: Request, res: Response) => {
    const {
      instanceName,
      snapshotName,
      availabilityZone,
      bundleId,
      cloudflareConfig,
      config: overrides,
    } = req.body || {};
    const creds = resolveCredentials(overrides);

    try {
      const targetAz =
        availabilityZone && availabilityZone !== 'all'
          ? availabilityZone
          : creds.awsAvailabilityZone;

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

      // Poll for new public IP (up to 45 * 2s = 90s)
      let instanceData: any = null;
      for (let i = 0; i < 45; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const instResp = await callAwsLightsail('GetInstance', { instanceName }, creds);
        if (instResp.ok && instResp.data?.instance?.publicIpAddress) {
          instanceData = instResp.data.instance;
          break;
        }
      }

      if (!instanceData?.publicIpAddress) {
        res.status(504).json({ error: '实例已发起重建，但等待公网 IP 分配超时' });
        return;
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

      res.json({
        instance: mapAwsInstance(instanceData, dnsRecord ? [dnsRecord] : [], domain, zoneId),
        dnsRecord,
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
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Delete snapshot error' });
    }
  });

  // 10. Real Cloudflare: Sync DNS A record
  app.post('/api/cloudflare/sync', async (req: Request, res: Response) => {
    const { domainName, ip, zoneId, proxied, config: overrides } = req.body || {};
    const creds = resolveCredentials(overrides);
    const targetZone = (zoneId && zoneId !== PLACEHOLDER_CF_ZONE ? zoneId : '') || creds.cloudflareZoneId;
    const targetDomain = domainName || creds.cloudflareRecordName;

    if (!creds.cloudflareApiToken || !targetZone || !targetDomain || !ip) {
      res.status(400).json({ error: '缺少 Cloudflare Token、Zone ID、域名或 IP 参数' });
      return;
    }

    try {
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
