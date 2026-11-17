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
  FirewallPortRule,
  SnapshotLifecyclePolicy,
  BackgroundTask,
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
   * Extract & persist instance firewall configuration
   */
  public static async extractFirewallRules(
    instanceName: string,
    snapshotName: string | undefined,
    config: CloudConfig,
    customRules?: FirewallPortRule[]
  ): Promise<{ rules: FirewallPortRule[]; extractedAt: string; source: string }> {
    if (config.mode === 'floci_simulation') {
      const rules = await flociSimulator.extractFirewallRules(
        instanceName,
        snapshotName,
        config,
        customRules
      );
      return {
        rules,
        extractedAt: new Date().toISOString(),
        source: 'floci_simulation',
      };
    }

    const data = await postJson<{
      success: boolean;
      instanceName: string;
      rules: FirewallPortRule[];
      extractedAt: string;
      source: string;
      latencyMs: number;
      endpoint: string;
    }>('/api/lightsail/firewall/extract', {
      instanceName,
      snapshotName,
      customRules,
      config,
    });

    flociSimulator.recordExternalLog({
      service: 'AWS_LIGHTSAIL',
      method: 'POST',
      action: 'GetInstancePortStates (Extract Firewall)',
      endpoint: data.endpoint,
      requestPayload: { instanceName, snapshotName },
      responsePayload: { rulesCount: data.rules.length, source: data.source, rules: data.rules },
      status: 200,
      latencyMs: data.latencyMs,
      success: true,
    });

    return {
      rules: data.rules,
      extractedAt: data.extractedAt,
      source: data.source,
    };
  }

  /**
   * Save or update firewall rules for an instance / snapshot (and optionally apply live)
   */
  public static async saveFirewallRules(
    instanceName: string,
    snapshotName: string | undefined,
    rules: FirewallPortRule[],
    applyToRunningInstance: boolean,
    config: CloudConfig
  ): Promise<FirewallPortRule[]> {
    if (config.mode === 'floci_simulation') {
      return flociSimulator.extractFirewallRules(instanceName, snapshotName, config, rules);
    }

    const data = await postJson<{
      success: boolean;
      rules: FirewallPortRule[];
      appliedToCloud: boolean;
      latencyMs: number;
      endpoint: string;
    }>('/api/lightsail/firewall/save', {
      instanceName,
      snapshotName,
      rules,
      applyToRunningInstance,
      config,
    });

    flociSimulator.recordExternalLog({
      service: 'AWS_LIGHTSAIL',
      method: 'POST',
      action: applyToRunningInstance
        ? 'PutInstancePublicPorts (Apply & Save Firewall)'
        : 'SavePreservedFirewallConfig',
      endpoint: data.endpoint,
      requestPayload: { instanceName, snapshotName, rulesCount: rules.length },
      responsePayload: { appliedToCloud: data.appliedToCloud, rules: data.rules },
      status: 200,
      latencyMs: data.latencyMs,
      success: true,
    });

    return data.rules;
  }

  /**
   * Restore firewall rules to a running/restored instance via PutInstancePublicPorts
   */
  public static async restoreFirewallRules(
    instanceName: string,
    snapshotName: string | undefined,
    config: CloudConfig,
    customRules?: FirewallPortRule[]
  ): Promise<FirewallPortRule[]> {
    if (config.mode === 'floci_simulation') {
      return flociSimulator.restoreFirewallRules(instanceName, snapshotName, config, customRules);
    }

    const data = await postJson<{
      success: boolean;
      restoredRules: FirewallPortRule[];
      latencyMs: number;
      endpoint: string;
    }>('/api/lightsail/firewall/restore', {
      instanceName,
      snapshotName,
      rules: customRules,
      config,
    });

    flociSimulator.recordExternalLog({
      service: 'AWS_LIGHTSAIL',
      method: 'POST',
      action: 'PutInstancePublicPorts (Restore Firewall)',
      endpoint: data.endpoint,
      requestPayload: { instanceName, snapshotName, portCount: data.restoredRules.length },
      responsePayload: { restoredRules: data.restoredRules },
      status: 200,
      latencyMs: data.latencyMs,
      success: true,
    });

    return data.restoredRules;
  }

  /**
   * Snapshot Lifecycle Policy & Auto-Delete Management
   */
  public static async getSnapshotLifecyclePolicy(): Promise<SnapshotLifecyclePolicy> {
    try {
      const res = await fetch('/api/lightsail/snapshots/lifecycle');
      if (res.ok) {
        const data = await res.json();
        if (data?.policy) return data.policy as SnapshotLifecyclePolicy;
      }
    } catch {}
    return {
      enabled: true,
      defaultRetentionHours: 168,
      maxSnapshotsPerInstance: 3,
      protectLatestHibernatedSnapshot: true,
    };
  }

  public static async updateSnapshotLifecyclePolicy(
    policy: Partial<SnapshotLifecyclePolicy>,
    applyToExistingSnapshots: boolean,
    config: CloudConfig
  ): Promise<SnapshotLifecyclePolicy> {
    const data = await postJson<{ success: boolean; policy: SnapshotLifecyclePolicy }>(
      '/api/lightsail/snapshots/lifecycle',
      { policy, applyToExistingSnapshots, config }
    );
    return data.policy;
  }

  public static async setSnapshotRetention(
    snapshotName: string,
    retentionHours: number | null | undefined,
    autoDeleteAt: string | null | undefined,
    config: CloudConfig
  ): Promise<string | null> {
    if (config.mode === 'floci_simulation') {
      const resolved =
        retentionHours !== undefined
          ? retentionHours && retentionHours > 0
            ? new Date(Date.now() + retentionHours * 3600_000).toISOString()
            : null
          : autoDeleteAt || null;
      flociSimulator.setSnapshotRetention(snapshotName, resolved);
      return resolved;
    }

    const data = await postJson<{ success: boolean; snapshotName: string; autoDeleteAt: string | null }>(
      '/api/lightsail/snapshots/retention',
      { snapshotName, retentionHours, autoDeleteAt }
    );
    return data.autoDeleteAt;
  }

  public static async cleanupExpiredSnapshots(
    policy: SnapshotLifecyclePolicy,
    config: CloudConfig
  ): Promise<{
    checkedCount: number;
    deletedSnapshots: Array<{ name: string; reason: string }>;
    skippedProtected: Array<{ name: string; reason: string }>;
  }> {
    if (config.mode === 'floci_simulation') {
      return flociSimulator.cleanupExpiredSnapshots(policy, config);
    }

    const start = performance.now();
    const data = await postJson<{
      success: boolean;
      checkedCount: number;
      deletedSnapshots: Array<{ name: string; reason: string }>;
      skippedProtected: Array<{ name: string; reason: string }>;
    }>('/api/lightsail/snapshots/cleanup', { config });

    flociSimulator.recordExternalLog({
      service: 'AWS_LIGHTSAIL',
      method: 'POST',
      action: 'SnapshotLifecycleCleanup',
      endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
      requestPayload: { policy },
      responsePayload: {
        checkedCount: data.checkedCount,
        deletedCount: data.deletedSnapshots.length,
        deletedSnapshots: data.deletedSnapshots,
        skippedProtected: data.skippedProtected,
      },
      status: 200,
      latencyMs: Math.round(performance.now() - start),
      success: true,
    });

    return {
      checkedCount: data.checkedCount,
      deletedSnapshots: data.deletedSnapshots || [],
      skippedProtected: data.skippedProtected || [],
    };
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
   * Feature 1: 休眠并释放实例 (Step 1: 保存防火墙配置 -> Step 2: 创建系统快照 -> Step 3: 暂时删除计算实例)
   */
  public static async hibernateInstance(
    instanceName: string,
    snapshotName: string,
    config: CloudConfig,
    onProgress?: (step: OperationStep) => void,
    options?: {
      retentionHours?: number | null;
      customFirewallRules?: FirewallPortRule[];
    }
  ): Promise<{ snapshot?: LightsailSnapshot; firewallRules: FirewallPortRule[]; success: boolean }> {
    // STEP 1/3: Extract & Save Firewall Configuration
    onProgress?.({
      id: 'save_firewall',
      title: '1/3 提取并备份实例防火墙配置',
      description: `正在通过 GetInstancePortStates 提取实例 ${instanceName} 的开放端口与 CIDR 规则...`,
      status: 'running',
    });

    const fwResult = await ApiBridge.extractFirewallRules(
      instanceName,
      snapshotName,
      config,
      options?.customFirewallRules
    );

    onProgress?.({
      id: 'save_firewall',
      title: '1/3 防火墙配置已提取并备份',
      description: `已安全保存 ${fwResult.rules.length} 条防火墙端口规则 (${fwResult.rules
        .map((r) => `${r.protocol.toUpperCase()}:${r.fromPort}`)
        .join(', ')})`,
      status: 'completed',
    });

    if (config.mode === 'real_cloud') {
      // STEP 2/3: Create AWS Snapshot & Wait Available
      onProgress?.({
        id: 'snap_create',
        title: '2/3 发起创建 AWS 系统快照',
        description: `正在向 AWS Lightsail 发起快照创建请求 (${snapshotName})...`,
        status: 'running',
      });

      const createRes = await postJson<{
        success: boolean;
        alreadyExists: boolean;
        snapshotName: string;
        state: string;
        sizeInGb?: number;
        autoDeleteAt?: string | null;
        latencyMs: number;
        endpoint: string;
      }>('/api/lightsail/snapshot/create', {
        instanceName,
        snapshotName,
        retentionHours: options?.retentionHours,
        firewallRules: fwResult.rules,
        config,
      });

      flociSimulator.recordExternalLog({
        service: 'AWS_LIGHTSAIL',
        method: 'POST',
        action: createRes.alreadyExists
          ? 'GetInstanceSnapshot (Reuse Existing)'
          : 'CreateInstanceSnapshot (Real Cloud)',
        endpoint: createRes.endpoint,
        requestPayload: {
          instanceName,
          instanceSnapshotName: snapshotName,
          preservedFirewallRulesCount: fwResult.rules.length,
        },
        responsePayload: {
          state: createRes.state,
          alreadyExists: createRes.alreadyExists,
          autoDeleteAt: createRes.autoDeleteAt,
        },
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
          title: '2/3 等待 AWS 快照写入完成',
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

      // STEP 3/3: Delete Compute Instance
      onProgress?.({
        id: 'delete_compute',
        title: '3/3 快照与防火墙已就绪，正在释放计算实例',
        description: `快照 ${snapshotName} (${snapSize} GB) 及 ${fwResult.rules.length} 条防火墙规则已归档！正在调用 DeleteInstance 暂时删除实例以停止计费...`,
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
        responsePayload: {
          deleted: true,
          preservedSnapshot: snapshotName,
          preservedFirewallRules: fwResult.rules.length,
        },
        status: 200,
        latencyMs: delRes.latencyMs,
        success: true,
      });

      onProgress?.({
        id: 'delete_compute',
        title: '实例已安全休眠并释放',
        description: `计算实例 ${instanceName} 已从 AWS 删除停止计费，防火墙规则 (${fwResult.rules.length} 条) 与快照 ${snapshotName} 已完整保留！`,
        status: 'completed',
      });
      return { firewallRules: fwResult.rules, success: true };
    }

    onProgress?.({
      id: 'snap_create',
      title: '2/3 创建实例系统快照',
      description: `正在向 AWS 发起创建快照请求: ${snapshotName}...`,
      status: 'running',
    });

    const snapshot = await flociSimulator.createInstanceSnapshot(
      instanceName,
      snapshotName,
      config,
      true,
      options?.retentionHours
    );

    onProgress?.({
      id: 'snap_create',
      title: '2/3 创建实例系统快照',
      description: `快照 ${snapshotName} 状态已就绪 (Available, ${snapshot.sizeInGb} GB)`,
      status: 'completed',
    });

    onProgress?.({
      id: 'delete_compute',
      title: '3/3 暂时删除 Lightsail 计算实例',
      description: `确认防火墙配置与快照已安全入库，正在释放实例计算资源以暂停计费...`,
      status: 'running',
    });

    await flociSimulator.deleteInstance(instanceName, config, true);

    onProgress?.({
      id: 'delete_compute',
      title: '实例已安全休眠',
      description: `计算实例已终止释放。防火墙规则 (${fwResult.rules.length} 条) 与系统快照已保存，随时可一键唤醒并复原！`,
      status: 'completed',
    });

    return { snapshot, firewallRules: fwResult.rules, success: true };
  }

  /**
   * Feature 2: 从 Snapshot 快速恢复 + 复原防火墙端口配置 + Cloudflare DNS 新 IP 同步
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
    onStepUpdate?: (stepIndex: number, step: OperationStep) => void,
    firewallConfig?: {
      enabled: boolean;
      rules?: FirewallPortRule[];
    }
  ): Promise<{
    instance: LightsailInstance;
    dnsRecord?: CloudflareDnsRecord;
    restoredFirewallRules?: FirewallPortRule[];
  }> {
    const shouldRestoreFirewall = firewallConfig?.enabled !== false;

    if (config.mode === 'real_cloud') {
      onStepUpdate?.(0, {
        id: 'restore_instance',
        title: '从快照重建 Lightsail 实例',
        description: `正在调用真实 AWS API 从快照 ${snapshotName} 重建实例并恢复防火墙与 DNS...`,
        status: 'running',
      });
      const data = await postJson<{
        instance: LightsailInstance;
        dnsRecord?: CloudflareDnsRecord;
        firewallRestored?: boolean;
        restoredFirewallRules?: FirewallPortRule[];
      }>('/api/lightsail/restore', {
        instanceName,
        snapshotName,
        availabilityZone,
        bundleId,
        restoreFirewall: shouldRestoreFirewall,
        firewallRules: firewallConfig?.rules,
        cloudflareConfig,
        config,
      });

      flociSimulator.recordExternalLog({
        service: 'AWS_LIGHTSAIL',
        method: 'POST',
        action: 'CreateInstancesFromSnapshot + PutInstancePublicPorts',
        endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
        requestPayload: {
          instanceName,
          snapshotName,
          bundleId,
          restoreFirewall: shouldRestoreFirewall,
        },
        responsePayload: {
          publicIpAddress: data.instance.publicIpAddress,
          firewallRestored: data.firewallRestored,
          restoredFirewallCount: data.restoredFirewallRules?.length || 0,
        },
        status: 200,
        latencyMs: 1200,
        success: true,
      });

      onStepUpdate?.(0, {
        id: 'restore_instance',
        title: '从快照重建 Lightsail 实例',
        description: `实例已在区域 ${data.instance.location.regionName} 重建就绪`,
        status: 'completed',
      });
      onStepUpdate?.(1, {
        id: 'wait_ip',
        title: '公网 IP 分配成功',
        description: `已获得新公网 IP: ${data.instance.publicIpAddress}`,
        status: 'completed',
        detail: data.instance.publicIpAddress || undefined,
      });

      const fwCount = data.restoredFirewallRules?.length || data.instance.firewallRules?.length || 0;
      onStepUpdate?.(2, {
        id: 'restore_firewall',
        title: shouldRestoreFirewall ? '防火墙端口配置已复原' : '跳过防火墙复原',
        description: shouldRestoreFirewall
          ? `已调用 PutInstancePublicPorts 复原 ${fwCount} 条端口规则 (${(
              data.restoredFirewallRules ||
              data.instance.firewallRules ||
              []
            )
              .map((r) => `${r.protocol.toUpperCase()}:${r.fromPort}`)
              .join(', ')})`
          : '使用 AWS 默认安全组规则',
        status: 'completed',
        detail: shouldRestoreFirewall ? `${fwCount} 端口已开放` : undefined,
      });

      onStepUpdate?.(3, {
        id: 'cf_dns_update',
        title: cloudflareConfig.enabled ? 'Cloudflare DNS 已同步更新' : '实例就绪（跳过 DNS 更新）',
        description: cloudflareConfig.enabled
          ? `域名 ${cloudflareConfig.domain} 已指向 ${data.instance.publicIpAddress}`
          : '未开启 Cloudflare 域名同步，实例已完全就绪',
        status: 'completed',
        detail: cloudflareConfig.enabled
          ? `${cloudflareConfig.domain} -> ${data.instance.publicIpAddress}`
          : undefined,
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

    await new Promise((r) => setTimeout(r, config.flociSimulationSpeed === 'instant' ? 100 : 500));

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

    let restoredFirewallRules: FirewallPortRule[] = [];
    if (shouldRestoreFirewall) {
      onStepUpdate?.(2, {
        id: 'restore_firewall',
        title: '复原实例防火墙配置',
        description: `正在调用 PutInstancePublicPorts 恢复保存的防火墙开放端口规则...`,
        status: 'running',
      });

      restoredFirewallRules = await flociSimulator.restoreFirewallRules(
        instanceName,
        snapshotName,
        config,
        firewallConfig?.rules
      );

      onStepUpdate?.(2, {
        id: 'restore_firewall',
        title: '防火墙端口配置已复原',
        description: `已恢复 ${restoredFirewallRules.length} 条规则 (${restoredFirewallRules
          .map((r) => `${r.protocol.toUpperCase()}:${r.fromPort}`)
          .join(', ')})`,
        status: 'completed',
        detail: `${restoredFirewallRules.length} 端口已开放`,
      });
    } else {
      onStepUpdate?.(2, {
        id: 'restore_firewall',
        title: '跳过防火墙复原',
        description: '保留 AWS 默认防火墙端口配置',
        status: 'completed',
      });
    }

    let dnsRecord: CloudflareDnsRecord | undefined;
    if (cloudflareConfig.enabled && cloudflareConfig.domain) {
      onStepUpdate?.(3, {
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

      onStepUpdate?.(3, {
        id: 'cf_dns_update',
        title: 'Cloudflare DNS 已同步更新',
        description: `域名 ${cloudflareConfig.domain} 已指向 ${instance.publicIpAddress} (${cloudflareConfig.proxied ? '开启 CDN 代理' : '仅 DNS 直连'})`,
        status: 'completed',
        detail: `${cloudflareConfig.domain} -> ${instance.publicIpAddress}`,
      });
    } else {
      onStepUpdate?.(3, {
        id: 'cf_dns_skip',
        title: '实例就绪（跳过 DNS 更新）',
        description: '未配置 Cloudflare 绑定域名，实例与防火墙已就绪。',
        status: 'completed',
      });
    }

    return { instance, dnsRecord, restoredFirewallRules };
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

  /**
   * Persist Default or Per-Instance Cloudflare DNS Domain Name on Server
   */
  public static async saveDefaultDomain(
    defaultDnsRecordName: string,
    instanceName?: string
  ): Promise<void> {
    try {
      await postJson('/api/config/domain', { defaultDnsRecordName, instanceName });
    } catch {
      // Ignore if in static/offline mode
    }
  }

  /**
   * Fetch Server-Side Background Tasks
   */
  public static async getBackgroundTasks(): Promise<BackgroundTask[]> {
    try {
      const res = await fetch('/api/lightsail/tasks');
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data?.tasks) ? data.tasks : [];
      }
    } catch {}
    return [];
  }

  /**
   * Clear Completed / Failed Background Tasks
   */
  public static async clearCompletedTasks(): Promise<BackgroundTask[]> {
    try {
      const data = await postJson<{ tasks: BackgroundTask[] }>('/api/lightsail/tasks/clear', {});
      return data.tasks || [];
    } catch {}
    return [];
  }

  /**
   * Enqueue Non-Blocking Background Hibernate Task
   */
  public static async enqueueHibernateTask(
    instanceName: string,
    snapshotName: string,
    config: CloudConfig,
    options?: {
      retentionHours?: number | null;
      customFirewallRules?: FirewallPortRule[];
    }
  ): Promise<{ taskId: string; task: BackgroundTask }> {
    const data = await postJson<{ success: boolean; taskId: string; task: BackgroundTask }>(
      '/api/lightsail/tasks/hibernate',
      {
        instanceName,
        snapshotName,
        retentionHours: options?.retentionHours,
        firewallRules: options?.customFirewallRules,
        config,
      }
    );

    flociSimulator.recordExternalLog({
      service: 'AWS_LIGHTSAIL',
      method: 'POST',
      action: 'EnqueueBackgroundHibernate',
      endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
      requestPayload: { instanceName, snapshotName },
      responsePayload: { taskId: data.taskId, status: data.task.status },
      status: 200,
      latencyMs: 35,
      success: true,
    });

    return { taskId: data.taskId, task: data.task };
  }

  /**
   * Enqueue Non-Blocking Background Restore Task
   */
  public static async enqueueRestoreTask(
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
    firewallConfig?: {
      enabled: boolean;
      rules?: FirewallPortRule[];
    }
  ): Promise<{ taskId: string; task: BackgroundTask }> {
    const data = await postJson<{ success: boolean; taskId: string; task: BackgroundTask }>(
      '/api/lightsail/tasks/restore',
      {
        instanceName,
        snapshotName,
        availabilityZone,
        bundleId,
        restoreFirewall: firewallConfig?.enabled !== false,
        firewallRules: firewallConfig?.rules,
        cloudflareConfig,
        config,
      }
    );

    flociSimulator.recordExternalLog({
      service: 'AWS_LIGHTSAIL',
      method: 'POST',
      action: 'EnqueueBackgroundRestore',
      endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
      requestPayload: { instanceName, snapshotName, bundleId, domain: cloudflareConfig.domain },
      responsePayload: { taskId: data.taskId, status: data.task.status },
      status: 200,
      latencyMs: 40,
      success: true,
    });

    return { taskId: data.taskId, task: data.task };
  }

  /**
   * Manual Release / Force Delete Compute Instance (without waiting for snapshot creation)
   */
  public static async manualReleaseInstance(
    instanceName: string,
    backupFirewall: boolean,
    config: CloudConfig
  ): Promise<void> {
    if (config.mode === 'floci_simulation') {
      if (backupFirewall) {
        await flociSimulator.extractFirewallRules(instanceName, undefined, config);
      }
      await flociSimulator.deleteInstance(instanceName, config, true);
      return;
    }

    const start = performance.now();
    const data = await postJson<{
      success: boolean;
      instanceName: string;
      latencyMs: number;
      endpoint: string;
    }>('/api/lightsail/tasks/release', {
      instanceName,
      backupFirewall,
      config,
    });

    flociSimulator.recordExternalLog({
      service: 'AWS_LIGHTSAIL',
      method: 'POST',
      action: 'ManualReleaseInstance (DeleteInstance)',
      endpoint: data.endpoint,
      requestPayload: { instanceName, backupFirewall, forceDeleteAddOns: true },
      responsePayload: { deleted: true },
      status: 200,
      latencyMs: data.latencyMs || Math.round(performance.now() - start),
      success: true,
    });
  }
}

