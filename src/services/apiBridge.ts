/**
 * Unified API Bridge for Lightsail Manager
 * Seamlessly abstracts between Floci Simulator and Real Cloud APIs (via /api/* server proxy)
 */

import {
  LightsailInstance,
  LightsailSnapshot,
  CloudflareDnsRecord,
  CloudConfig,
  DiagnosticResult,
  OperationStep,
  EnvSecretStatus,
  CredentialTestReport,
  GitHubUpdateInfo,
} from '../types/lightsail';
import { flociSimulator } from './flociSimulator';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export class ApiBridge {
  /**
   * Check GitHub repository for latest release & version updates
   */
  public static async checkGitHubUpdate(repo?: string): Promise<GitHubUpdateInfo> {
    const start = performance.now();
    const targetRepo = (repo || 'gansxx/aws_lightsail_manager').trim();
    const res = await fetch(`/api/github/update-check?repo=${encodeURIComponent(targetRepo)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `检查 GitHub 更新失败 (HTTP ${res.status})`);
    }
    flociSimulator.recordExternalLog({
      service: 'DIAGNOSTIC',
      method: 'GET',
      action: 'CheckGitHubReleaseUpdate',
      endpoint: `api.github.com/repos/${data.repo}/releases`,
      requestPayload: { repo: data.repo },
      responsePayload: {
        currentVersion: data.currentVersion,
        latestVersion: data.latestVersion,
        hasUpdate: data.hasUpdate,
        apkCount: data.apkAssets?.length || 0,
      },
      status: 200,
      latencyMs: Math.round(performance.now() - start),
      success: true,
    });
    return data as GitHubUpdateInfo;
  }

  /**
   * Sync local app version metadata with remote GitHub version
   */
  public static async syncGitHubVersion(version: string): Promise<{ success: boolean; currentVersion: string }> {
    return postJson<{ success: boolean; currentVersion: string }>('/api/github/sync-version', {
      version,
    });
  }

  /**
   * Read server environment secret status (never returns raw secret values)
   */
  public static async getCredentialStatus(): Promise<EnvSecretStatus> {
    const res = await fetch('/api/credentials/status');
    if (!res.ok) {
      throw new Error(`获取环境变量状态失败 (HTTP ${res.status})`);
    }
    return res.json();
  }

  /**
   * Test current AWS & Cloudflare credentials (server reads Secrets / overrides)
   */
  public static async testCredentials(config: CloudConfig): Promise<CredentialTestReport> {
    const report = await postJson<CredentialTestReport>('/api/credentials/test', {
      awsAccessKeyId: config.awsAccessKeyId,
      awsSecretAccessKey: config.awsSecretAccessKey,
      awsRegion: config.awsRegion,
      cloudflareApiToken: config.cloudflareApiToken,
      cloudflareZoneId: config.cloudflareZoneId,
      defaultDnsRecordName: config.defaultDnsRecordName,
    });

    flociSimulator.recordExternalLog({
      service: 'AWS_LIGHTSAIL',
      method: 'POST',
      action: 'TestCredentials (GetInstances)',
      endpoint: `lightsail.${report.aws.details?.region || config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
      requestPayload: { source: report.aws.source },
      responsePayload: report.aws.details || { message: report.aws.message },
      status: report.aws.status,
      latencyMs: report.aws.latencyMs,
      success: report.aws.success,
      errorMessage: report.aws.success ? undefined : report.aws.message,
    });

    flociSimulator.recordExternalLog({
      service: 'CLOUDFLARE_DNS',
      method: 'GET',
      action: 'TestCredentials (VerifyToken & Zone)',
      endpoint: 'api.cloudflare.com/client/v4/user/tokens/verify',
      requestPayload: { source: report.cloudflare.source },
      responsePayload: report.cloudflare.details || { message: report.cloudflare.message },
      status: report.cloudflare.status,
      latencyMs: report.cloudflare.latencyMs,
      success: report.cloudflare.success,
      errorMessage: report.cloudflare.success ? undefined : report.cloudflare.message,
    });

    return report;
  }

  /**
   * Fetch all instances (from Floci simulation or Real AWS)
   */
  public static async getInstances(config: CloudConfig): Promise<LightsailInstance[]> {
    if (config.mode === 'floci_simulation') {
      return flociSimulator.getInstances(config);
    }

    const start = performance.now();
    try {
      const data = await postJson<{ instances: LightsailInstance[]; latencyMs: number; endpoint: string }>(
        '/api/lightsail/instances',
        { config }
      );
      flociSimulator.recordExternalLog({
        service: 'AWS_LIGHTSAIL',
        method: 'POST',
        action: 'GetInstances (Real Cloud)',
        endpoint: data.endpoint,
        status: 200,
        latencyMs: data.latencyMs || Math.round(performance.now() - start),
        success: true,
        responsePayload: { count: data.instances.length },
      });
      return data.instances;
    } catch (e: any) {
      flociSimulator.recordExternalLog({
        service: 'AWS_LIGHTSAIL',
        method: 'POST',
        action: 'GetInstances (Real Cloud)',
        endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
        status: 400,
        latencyMs: Math.round(performance.now() - start),
        success: false,
        errorMessage: e.message,
      });
      throw e;
    }
  }

  /**
   * Fetch snapshots
   */
  public static async getSnapshots(config: CloudConfig): Promise<LightsailSnapshot[]> {
    if (config.mode === 'floci_simulation') {
      return flociSimulator.getInstanceSnapshots(config);
    }

    const start = performance.now();
    try {
      const data = await postJson<{ snapshots: LightsailSnapshot[]; latencyMs: number; endpoint: string }>(
        '/api/lightsail/snapshots',
        { config }
      );
      flociSimulator.recordExternalLog({
        service: 'AWS_LIGHTSAIL',
        method: 'POST',
        action: 'GetInstanceSnapshots (Real Cloud)',
        endpoint: data.endpoint,
        status: 200,
        latencyMs: data.latencyMs || Math.round(performance.now() - start),
        success: true,
        responsePayload: { count: data.snapshots.length },
      });
      return data.snapshots;
    } catch (e: any) {
      flociSimulator.recordExternalLog({
        service: 'AWS_LIGHTSAIL',
        method: 'POST',
        action: 'GetInstanceSnapshots (Real Cloud)',
        endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
        status: 400,
        latencyMs: Math.round(performance.now() - start),
        success: false,
        errorMessage: e.message,
      });
      throw e;
    }
  }

  /**
   * Stop instance without deleting it or creating a snapshot
   */
  public static async stopInstance(instanceName: string, config: CloudConfig): Promise<LightsailInstance | null> {
    if (config.mode === 'floci_simulation') {
      return flociSimulator.stopInstance(instanceName, config);
    }

    const start = performance.now();
    try {
      const data = await postJson<{ success: boolean; latencyMs: number; endpoint: string }>(
        '/api/lightsail/stop',
        { instanceName, config }
      );
      flociSimulator.recordExternalLog({
        service: 'AWS_LIGHTSAIL',
        method: 'POST',
        action: 'StopInstance (Real Cloud)',
        endpoint: data.endpoint,
        requestPayload: { instanceName },
        responsePayload: { success: true },
        status: 200,
        latencyMs: data.latencyMs || Math.round(performance.now() - start),
        success: true,
      });
      return null;
    } catch (e: any) {
      flociSimulator.recordExternalLog({
        service: 'AWS_LIGHTSAIL',
        method: 'POST',
        action: 'StopInstance (Real Cloud)',
        endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
        requestPayload: { instanceName },
        status: 400,
        latencyMs: Math.round(performance.now() - start),
        success: false,
        errorMessage: e.message,
      });
      throw e;
    }
  }

  /**
   * Start a stopped instance directly (without snapshot restore)
   */
  public static async startInstance(
    instance: LightsailInstance,
    config: CloudConfig
  ): Promise<{ publicIpAddress: string | null; dnsUpdated: boolean }> {
    if (config.mode === 'floci_simulation') {
      const started = await flociSimulator.startInstance(instance.name, config);
      let dnsUpdated = false;
      if (started.publicIpAddress && instance.cloudflareBinding?.enabled && instance.cloudflareBinding.domain) {
        await flociSimulator.updateCloudflareDnsRecord(
          instance.cloudflareBinding.domain,
          started.publicIpAddress,
          instance.cloudflareBinding.zoneId,
          instance.cloudflareBinding.proxied,
          config
        );
        dnsUpdated = true;
      }
      return { publicIpAddress: started.publicIpAddress, dnsUpdated };
    }

    const start = performance.now();
    try {
      const data = await postJson<{
        success: boolean;
        publicIpAddress: string | null;
        latencyMs: number;
        endpoint: string;
      }>('/api/lightsail/start', { instanceName: instance.name, config });

      flociSimulator.recordExternalLog({
        service: 'AWS_LIGHTSAIL',
        method: 'POST',
        action: 'StartInstance (Real Cloud)',
        endpoint: data.endpoint,
        requestPayload: { instanceName: instance.name },
        responsePayload: { publicIpAddress: data.publicIpAddress },
        status: 200,
        latencyMs: data.latencyMs || Math.round(performance.now() - start),
        success: true,
      });

      let dnsUpdated = false;
      if (data.publicIpAddress && instance.cloudflareBinding?.enabled && instance.cloudflareBinding.domain) {
        await ApiBridge.syncCloudflareDns(
          instance.cloudflareBinding.domain,
          data.publicIpAddress,
          instance.cloudflareBinding.zoneId,
          instance.cloudflareBinding.proxied,
          config
        );
        dnsUpdated = true;
      }

      return { publicIpAddress: data.publicIpAddress, dnsUpdated };
    } catch (e: any) {
      flociSimulator.recordExternalLog({
        service: 'AWS_LIGHTSAIL',
        method: 'POST',
        action: 'StartInstance (Real Cloud)',
        endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
        requestPayload: { instanceName: instance.name },
        status: 400,
        latencyMs: Math.round(performance.now() - start),
        success: false,
        errorMessage: e.message,
      });
      throw e;
    }
  }

  /**
   * Feature 1: 暂时删除实例 (Save Snapshot -> Delete Instance)
   */
  public static async hibernateInstance(
    instanceName: string,
    snapshotName: string,
    config: CloudConfig,
    onProgress?: (step: OperationStep) => void
  ): Promise<{ snapshot?: LightsailSnapshot; success: boolean }> {
    if (config.mode === 'real_cloud') {
      onProgress?.({
        id: 'snap_create',
        title: '1/2 发起创建 AWS 系统快照',
        description: `正在向 AWS Lightsail 发起快照创建请求 (${snapshotName})...`,
        status: 'running',
      });

      const createRes = await postJson<{
        success: boolean;
        alreadyExists: boolean;
        snapshotName: string;
        state: string;
        sizeInGb?: number;
        latencyMs: number;
        endpoint: string;
      }>('/api/lightsail/snapshot/create', { instanceName, snapshotName, config });

      flociSimulator.recordExternalLog({
        service: 'AWS_LIGHTSAIL',
        method: 'POST',
        action: createRes.alreadyExists
          ? 'GetInstanceSnapshot (Reuse Existing)'
          : 'CreateInstanceSnapshot (Real Cloud)',
        endpoint: createRes.endpoint,
        requestPayload: { instanceName, instanceSnapshotName: snapshotName },
        responsePayload: { state: createRes.state, alreadyExists: createRes.alreadyExists },
        status: 200,
        latencyMs: createRes.latencyMs,
        success: true,
      });

      let snapState = createRes.state;
      let snapSize = createRes.sizeInGb || 40;
      const pollStart = Date.now();

      for (let i = 0; snapState !== 'available' && i < 120; i++) {
        const elapsedSec = Math.round((Date.now() - pollStart) / 1000);
        onProgress?.({
          id: 'snap_wait',
          title: '1/2 等待 AWS 快照写入完成',
          description: `AWS 正在备份实例磁盘至快照 ${snapshotName}（当前状态: ${snapState}，已等待 ${elapsedSec} 秒，通常需 30~90 秒）...`,
          status: 'running',
        });

        await new Promise((r) => setTimeout(r, 3000));
        const statusRes = await postJson<{
          snapshotName: string;
          state: string;
          progress: string | null;
          sizeInGb: number;
          latencyMs: number;
          endpoint: string;
        }>('/api/lightsail/snapshot/status', { snapshotName, config });

        snapState = statusRes.state;
        snapSize = statusRes.sizeInGb || snapSize;
        if (snapState === 'error') {
          throw new Error(`AWS 快照 ${snapshotName} 创建失败 (state: error)`);
        }
      }

      if (snapState !== 'available') {
        throw new Error(`等待快照 ${snapshotName} 就绪超时，为确保数据安全未删除实例`);
      }

      onProgress?.({
        id: 'delete_compute',
        title: '2/2 快照已就绪，正在释放计算实例',
        description: `快照 ${snapshotName} (${snapSize} GB) 已安全入库！正在调用 DeleteInstance 暂时删除实例以停止计费...`,
        status: 'running',
      });

      const delRes = await postJson<{
        success: boolean;
        instanceName: string;
        latencyMs: number;
        endpoint: string;
      }>('/api/lightsail/instance/delete', { instanceName, snapshotName, config });

      flociSimulator.recordExternalLog({
        service: 'AWS_LIGHTSAIL',
        method: 'POST',
        action: 'DeleteInstance (Real Cloud)',
        endpoint: delRes.endpoint,
        requestPayload: { instanceName, forceDeleteAddOns: true },
        responsePayload: { deleted: true, preservedSnapshot: snapshotName },
        status: 200,
        latencyMs: delRes.latencyMs,
        success: true,
      });

      onProgress?.({
        id: 'delete_compute',
        title: '实例已安全休眠并释放',
        description: `计算实例 ${instanceName} 已从 AWS 删除停止计费，快照 ${snapshotName} 已保留，随时可一键唤醒！`,
        status: 'completed',
      });
      return { success: true };
    }

    onProgress?.({
      id: 'snap_create',
      title: '创建实例系统快照',
      description: `正在向 AWS 发起创建快照请求: ${snapshotName}...`,
      status: 'running',
    });

    const snapshot = await flociSimulator.createInstanceSnapshot(
      instanceName,
      snapshotName,
      config,
      true
    );

    onProgress?.({
      id: 'snap_create',
      title: '创建实例系统快照',
      description: `快照 ${snapshotName} 状态已就绪 (Available, ${snapshot.sizeInGb} GB)`,
      status: 'completed',
    });

    onProgress?.({
      id: 'delete_compute',
      title: '暂时删除 Lightsail 计算实例',
      description: `确认快照已安全入库，正在释放实例计算资源以暂停计费...`,
      status: 'running',
    });

    await flociSimulator.deleteInstance(instanceName, config, true);

    onProgress?.({
      id: 'delete_compute',
      title: '实例已安全休眠',
      description: `计算实例已终止释放。系统快照保存在 AWS，随时可一键唤醒并自动同步 Cloudflare DNS！`,
      status: 'completed',
    });

    return { snapshot, success: true };
  }

  /**
   * Feature 2: 从 Snapshot 快速恢复，并在启动时使用 Cloudflare DNS 将新 IP 写入记录
   */
  public static async restoreInstanceWithDns(
    instanceName: string,
    snapshotName: string,
    availabilityZone: string,
    bundleId: string,
    cloudflareConfig: {
      enabled: boolean;
      domain: string;
      zoneId: string;
      proxied: boolean;
    },
    config: CloudConfig,
    onStepUpdate?: (stepIndex: number, step: OperationStep) => void
  ): Promise<{ instance: LightsailInstance; dnsRecord?: CloudflareDnsRecord }> {
    if (config.mode === 'real_cloud') {
      onStepUpdate?.(0, {
        id: 'restore_instance',
        title: '从快照重建 Lightsail 实例',
        description: `正在调用真实 AWS API 从快照 ${snapshotName} 恢复实例并同步 DNS...`,
        status: 'running',
      });
      const data = await postJson<{ instance: LightsailInstance; dnsRecord?: CloudflareDnsRecord }>(
        '/api/lightsail/restore',
        {
          instanceName,
          snapshotName,
          availabilityZone,
          bundleId,
          cloudflareConfig,
          config,
        }
      );
      onStepUpdate?.(0, {
        id: 'restore_instance',
        title: '从快照重建 Lightsail 实例',
        description: `实例已在区域 ${data.instance.location.regionName} 重建`,
        status: 'completed',
      });
      onStepUpdate?.(1, {
        id: 'wait_ip',
        title: '公网 IP 分配成功',
        description: `已获得新公网 IP: ${data.instance.publicIpAddress}`,
        status: 'completed',
        detail: data.instance.publicIpAddress || undefined,
      });
      onStepUpdate?.(2, {
        id: 'cf_dns_update',
        title: cloudflareConfig.enabled ? 'Cloudflare DNS 已同步更新' : '跳过 DNS 更新',
        description: cloudflareConfig.enabled
          ? `域名 ${cloudflareConfig.domain} 已指向 ${data.instance.publicIpAddress}`
          : '未开启 Cloudflare 同步',
        status: 'completed',
      });
      onStepUpdate?.(3, {
        id: 'verify_ready',
        title: '就绪检查与服务连接验证',
        description: `真实云端实例已启动就绪！`,
        status: 'completed',
      });
      return data;
    }

    onStepUpdate?.(0, {
      id: 'restore_instance',
      title: '从快照重建 Lightsail 实例',
      description: `正在根据快照 ${snapshotName} 恢复规格 (${bundleId || '原有规格'})...`,
      status: 'running',
    });

    const instance = await flociSimulator.createInstanceFromSnapshot(
      instanceName,
      snapshotName,
      availabilityZone,
      bundleId,
      config
    );

    onStepUpdate?.(0, {
      id: 'restore_instance',
      title: '从快照重建 Lightsail 实例',
      description: `实例创建请求已成功提交至 AWS 区域 ${instance.location.regionName}`,
      status: 'completed',
    });

    onStepUpdate?.(1, {
      id: 'wait_ip',
      title: '等待公网 IP 地址分配',
      description: `轮询 Lightsail 网络状态，等待 AWS 分配新的弹性公网 IP...`,
      status: 'running',
    });

    await new Promise((r) => setTimeout(r, config.flociSimulationSpeed === 'instant' ? 100 : 700));

    if (!instance.publicIpAddress) {
      throw new Error('AWS 未能在超时时间内为该实例分配有效的 IPv4 公网地址');
    }

    onStepUpdate?.(1, {
      id: 'wait_ip',
      title: '公网 IP 分配成功',
      description: `已获得全新公网 IP: ${instance.publicIpAddress} (私网: ${instance.privateIpAddress})`,
      status: 'completed',
      detail: instance.publicIpAddress,
    });

    let dnsRecord: CloudflareDnsRecord | undefined;
    if (cloudflareConfig.enabled && cloudflareConfig.domain) {
      onStepUpdate?.(2, {
        id: 'cf_dns_update',
        title: '写入 Cloudflare DNS 记录',
        description: `正在通过 Cloudflare API 将 ${cloudflareConfig.domain} 的 A 记录指向 ${instance.publicIpAddress}...`,
        status: 'running',
      });

      dnsRecord = await flociSimulator.updateCloudflareDnsRecord(
        cloudflareConfig.domain,
        instance.publicIpAddress,
        cloudflareConfig.zoneId,
        cloudflareConfig.proxied,
        config
      );

      onStepUpdate?.(2, {
        id: 'cf_dns_update',
        title: 'Cloudflare DNS 已同步更新',
        description: `域名 ${cloudflareConfig.domain} 已指向 ${instance.publicIpAddress} (${cloudflareConfig.proxied ? '开启 CDN 代理' : '仅 DNS 直连'})`,
        status: 'completed',
        detail: `${cloudflareConfig.domain} -> ${instance.publicIpAddress}`,
      });
    } else {
      onStepUpdate?.(2, {
        id: 'cf_dns_skip',
        title: '跳过 DNS 更新',
        description: '未配置 Cloudflare 绑定域名，保留原配置。',
        status: 'completed',
      });
    }

    onStepUpdate?.(3, {
      id: 'verify_ready',
      title: '就绪检查与服务连接验证',
      description: `实例已处于 Running 状态，SSH 端口 22 开放，DNS 全球节点广播中！`,
      status: 'completed',
    });

    return { instance, dnsRecord };
  }

  /**
   * Sync Cloudflare DNS manually
   */
  public static async syncCloudflareDns(
    domainName: string,
    ip: string,
    zoneId: string,
    proxied: boolean,
    config: CloudConfig
  ): Promise<CloudflareDnsRecord> {
    if (config.mode === 'floci_simulation') {
      return flociSimulator.updateCloudflareDnsRecord(domainName, ip, zoneId, proxied, config);
    }

    const data = await postJson<{ record: CloudflareDnsRecord; latencyMs: number }>('/api/cloudflare/sync', {
      domainName,
      ip,
      zoneId,
      proxied,
      config,
    });
    flociSimulator.recordExternalLog({
      service: 'CLOUDFLARE_DNS',
      method: 'PUT',
      action: 'UpdateDnsRecord (Real Cloud)',
      endpoint: `api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      requestPayload: { domainName, ip, proxied },
      responsePayload: data.record,
      status: 200,
      latencyMs: data.latencyMs,
      success: true,
    });
    return data.record;
  }

  /**
   * Delete snapshot
   */
  public static async deleteSnapshot(snapshotName: string, config: CloudConfig): Promise<boolean> {
    if (config.mode === 'floci_simulation') {
      return flociSimulator.deleteSnapshot(snapshotName, config);
    }

    const res = await fetch(`/api/lightsail/snapshots/${encodeURIComponent(snapshotName)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return true;
  }

  /**
   * Feature 4: 诊断与排查接口 (Diagnostics & Troubleshooting Suite)
   */
  public static async runDiagnostics(config: CloudConfig): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    if (config.mode === 'real_cloud') {
      const report = await ApiBridge.testCredentials(config);
      results.push({
        id: 'aws_ping',
        name: 'AWS Lightsail 真实密钥与连通性',
        status: report.aws.success ? 'success' : 'error',
        message: `${report.aws.message} (来源: ${report.aws.source}, 耗时 ${report.aws.latencyMs}ms)`,
        details: report.aws.details,
      });
      results.push({
        id: 'cf_auth',
        name: 'Cloudflare API 真实密钥与 Zone 验证',
        status: report.cloudflare.success ? 'success' : 'error',
        message: `${report.cloudflare.message} (来源: ${report.cloudflare.source}, 耗时 ${report.cloudflare.latencyMs}ms)`,
        details: report.cloudflare.details,
      });
      return results;
    }

    // 1. AWS API Connectivity Ping (Floci)
    try {
      const start = performance.now();
      await flociSimulator.getInstances(config);
      results.push({
        id: 'aws_ping',
        name: 'AWS Lightsail 接口连通性 (Floci)',
        status: 'success',
        message: `通信正常 (延迟 ${Math.round(performance.now() - start)}ms，目标区域: ${config.awsRegion || 'ap-northeast-1'})`,
        details: { mode: config.mode, endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com` },
      });
    } catch (e: any) {
      results.push({
        id: 'aws_ping',
        name: 'AWS Lightsail 接口连通性 (Floci)',
        status: 'error',
        message: `连接失败: ${e.message}`,
      });
    }

    // 2. Cloudflare API Auth & Zone Check (Floci)
    try {
      const records = await flociSimulator.getCloudflareRecords(config.cloudflareZoneId, undefined, config);
      results.push({
        id: 'cf_auth',
        name: 'Cloudflare API 凭证与 Zone 验证 (Floci)',
        status: 'success',
        message: `验证成功 (查询到 ${records.length} 条已解析的 A/CNAME 记录)`,
        details: { recordsCount: records.length, zoneId: config.cloudflareZoneId || 'cf-zone-default' },
      });
    } catch (e: any) {
      results.push({
        id: 'cf_auth',
        name: 'Cloudflare API 凭证与 Zone 验证 (Floci)',
        status: 'error',
        message: `鉴权异常: ${e.message}`,
      });
    }

    // 3. DNS Consistency & IP Drift Check
    try {
      const instances = await flociSimulator.getInstances(config);
      const records = await flociSimulator.getCloudflareRecords(config.cloudflareZoneId, undefined, config);

      let drifts = 0;
      instances.forEach((inst) => {
        if (inst.cloudflareBinding?.enabled && inst.state === 'running' && inst.publicIpAddress) {
          const rec = records.find((r) => r.name.toLowerCase() === inst.cloudflareBinding?.domain.toLowerCase());
          if (rec && rec.content !== inst.publicIpAddress) {
            drifts++;
          }
        }
      });

      if (drifts > 0) {
        results.push({
          id: 'dns_consistency',
          name: 'DNS IP 解析漂移检查',
          status: 'warning',
          message: `发现 ${drifts} 处 DNS 记录与当前实例公网 IP 不一致，建议执行快速同步`,
        });
      } else {
        results.push({
          id: 'dns_consistency',
          name: 'DNS IP 解析漂移检查',
          status: 'success',
          message: '所有运行中实例的公网 IP 均与 Cloudflare DNS 保持严格一致',
        });
      }
    } catch (e: any) {
      results.push({
        id: 'dns_consistency',
        name: 'DNS IP 解析漂移检查',
        status: 'error',
        message: `检查失败: ${e.message}`,
      });
    }

    // 4. Snapshot Integrity & Cost Analysis
    try {
      const snaps = await flociSimulator.getInstanceSnapshots(config);
      const autoSnaps = snaps.filter((s) => s.isAutoHibernateSnapshot);
      const totalGb = snaps.reduce((acc, s) => acc + s.sizeInGb, 0);
      const monthlyCost = (totalGb * 0.05).toFixed(2);

      results.push({
        id: 'snapshot_health',
        name: '休眠快照链与存储成本',
        status: 'success',
        message: `共 ${snaps.length} 个快照 (${autoSnaps.length} 个自动休眠快照, 合计 ${totalGb} GB, 预计仅 $${monthlyCost}/月)`,
        details: { totalGb, estimatedCost: `$${monthlyCost}/month` },
      });
    } catch (e: any) {
      results.push({
        id: 'snapshot_health',
        name: '休眠快照链与存储成本',
        status: 'error',
        message: `快照检查失败: ${e.message}`,
      });
    }

    return results;
  }
}
