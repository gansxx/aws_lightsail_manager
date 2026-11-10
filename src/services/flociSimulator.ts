/**
 * Floci Simulated AWS Lightsail & Cloudflare Engine
 * Faithful client-side emulation of AWS Lightsail API and Cloudflare v4 DNS API
 */

import {
  LightsailInstance,
  LightsailSnapshot,
  CloudflareDnsRecord,
  ApiLogEntry,
  CloudConfig,
} from '../types/lightsail';

// Pre-seeded initial instances
const INITIAL_INSTANCES: LightsailInstance[] = [
  {
    name: 'lightsail-prod-vpn',
    arn: 'arn:aws:lightsail:ap-northeast-1:123456789012:Instance/lightsail-prod-vpn',
    blueprintId: 'ubuntu_22_04',
    blueprintName: 'Ubuntu 22.04 LTS',
    bundleId: 'micro_2_0',
    bundleName: '$5.00/mo (1 GB RAM, 1 vCPU, 40 GB SSD)',
    ramGb: 1,
    cpuCount: 1,
    diskSizeGb: 40,
    monthlyCostUsd: 5.0,
    state: 'running',
    publicIpAddress: '54.248.82.119',
    privateIpAddress: '172.26.12.84',
    location: {
      availabilityZone: 'ap-northeast-1a',
      regionName: 'Tokyo (ap-northeast-1)',
    },
    createdAt: '2026-10-15T08:00:00Z',
    keyPairName: 'id_ed25519_tokyo',
    tags: [{ key: 'Environment', value: 'Production' }, { key: 'Role', value: 'VPN' }],
    cloudflareBinding: {
      enabled: true,
      domain: 'vpn.mydomain.dev',
      zoneId: 'cf-zone-983b8a1e2f',
      recordId: 'rec-cf-01',
      proxied: false,
      lastUpdatedIp: '54.248.82.119',
      lastSyncTime: '2026-11-09T14:20:00Z',
    },
    autoHibernateSchedule: {
      enabled: true,
      time: '23:30',
      daysOfWeek: [1, 2, 3, 4, 5],
    },
    autoStartSchedule: {
      enabled: true,
      time: '08:30',
      daysOfWeek: [1, 2, 3, 4, 5],
    },
  },
  {
    name: 'dev-api-node',
    arn: 'arn:aws:lightsail:us-west-2:123456789012:Instance/dev-api-node',
    blueprintId: 'debian_12',
    blueprintName: 'Debian 12 Bookworm',
    bundleId: 'small_2_0',
    bundleName: '$10.00/mo (2 GB RAM, 2 vCPUs, 60 GB SSD)',
    ramGb: 2,
    cpuCount: 2,
    diskSizeGb: 60,
    monthlyCostUsd: 10.0,
    state: 'running',
    publicIpAddress: '35.160.77.12',
    privateIpAddress: '172.26.4.15',
    location: {
      availabilityZone: 'us-west-2a',
      regionName: 'Oregon (us-west-2)',
    },
    createdAt: '2026-10-28T12:30:00Z',
    keyPairName: 'id_rsa_oregon',
    tags: [{ key: 'Environment', value: 'Development' }],
    cloudflareBinding: {
      enabled: true,
      domain: 'api-dev.mydomain.dev',
      zoneId: 'cf-zone-983b8a1e2f',
      recordId: 'rec-cf-02',
      proxied: true,
      lastUpdatedIp: '35.160.77.12',
      lastSyncTime: '2026-11-08T09:15:00Z',
    },
    autoHibernateSchedule: {
      enabled: false,
      time: '22:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    },
    autoStartSchedule: {
      enabled: false,
      time: '09:00',
      daysOfWeek: [1, 2, 3, 4, 5],
    },
  },
  {
    name: 'staging-microservice',
    arn: 'arn:aws:lightsail:ap-northeast-1:123456789012:Instance/staging-microservice',
    blueprintId: 'almalinux_9',
    blueprintName: 'AlmaLinux 9',
    bundleId: 'nano_2_0',
    bundleName: '$3.50/mo (512 MB RAM, 1 vCPU, 20 GB SSD)',
    ramGb: 0.5,
    cpuCount: 1,
    diskSizeGb: 20,
    monthlyCostUsd: 3.5,
    state: 'hibernated',
    publicIpAddress: null,
    privateIpAddress: '0.0.0.0',
    location: {
      availabilityZone: 'ap-northeast-1a',
      regionName: 'Tokyo (ap-northeast-1)',
    },
    createdAt: '2026-11-01T04:12:00Z',
    lastSnapshotName: 'snap-staging-auto-saved-1109',
    lastSnapshotTime: '2026-11-09T22:00:15Z',
    cloudflareBinding: {
      enabled: true,
      domain: 'stage.mydomain.dev',
      zoneId: 'cf-zone-983b8a1e2f',
      recordId: 'rec-cf-03',
      proxied: false,
      lastUpdatedIp: '54.248.19.42',
      lastSyncTime: '2026-11-09T22:00:15Z',
    },
  },
];

// Pre-seeded initial snapshots
const INITIAL_SNAPSHOTS: LightsailSnapshot[] = [
  {
    name: 'snap-staging-auto-saved-1109',
    arn: 'arn:aws:lightsail:ap-northeast-1:123456789012:InstanceSnapshot/snap-staging-auto-saved-1109',
    fromInstanceName: 'staging-microservice',
    fromInstanceArn: 'arn:aws:lightsail:ap-northeast-1:123456789012:Instance/staging-microservice',
    fromBlueprintId: 'almalinux_9',
    fromBundleId: 'nano_2_0',
    sizeInGb: 20,
    state: 'available',
    createdAt: '2026-11-09T22:00:15Z',
    isAutoHibernateSnapshot: true,
    preservedConfig: {
      blueprintId: 'almalinux_9',
      bundleId: 'nano_2_0',
      availabilityZone: 'ap-northeast-1a',
      cloudflareDomain: 'stage.mydomain.dev',
      tags: [{ key: 'Environment', value: 'Staging' }],
    },
  },
  {
    name: 'snap-vpn-golden-image-v2',
    arn: 'arn:aws:lightsail:ap-northeast-1:123456789012:InstanceSnapshot/snap-vpn-golden-image-v2',
    fromInstanceName: 'lightsail-prod-vpn',
    fromInstanceArn: 'arn:aws:lightsail:ap-northeast-1:123456789012:Instance/lightsail-prod-vpn',
    fromBlueprintId: 'ubuntu_22_04',
    fromBundleId: 'micro_2_0',
    sizeInGb: 40,
    state: 'available',
    createdAt: '2026-11-05T10:14:00Z',
    isAutoHibernateSnapshot: false,
    preservedConfig: {
      blueprintId: 'ubuntu_22_04',
      bundleId: 'micro_2_0',
      availabilityZone: 'ap-northeast-1a',
      cloudflareDomain: 'vpn.mydomain.dev',
    },
  },
];

// Pre-seeded Cloudflare DNS Records
const INITIAL_CF_RECORDS: CloudflareDnsRecord[] = [
  {
    id: 'rec-cf-01',
    zone_id: 'cf-zone-983b8a1e2f',
    zone_name: 'mydomain.dev',
    name: 'vpn.mydomain.dev',
    type: 'A',
    content: '54.248.82.119',
    proxied: false,
    ttl: 1,
    modified_on: '2026-11-09T14:20:00Z',
  },
  {
    id: 'rec-cf-02',
    zone_id: 'cf-zone-983b8a1e2f',
    zone_name: 'mydomain.dev',
    name: 'api-dev.mydomain.dev',
    type: 'A',
    content: '35.160.77.12',
    proxied: true,
    ttl: 1,
    modified_on: '2026-11-08T09:15:00Z',
  },
  {
    id: 'rec-cf-03',
    zone_id: 'cf-zone-983b8a1e2f',
    zone_name: 'mydomain.dev',
    name: 'stage.mydomain.dev',
    type: 'A',
    content: '54.248.19.42',
    proxied: false,
    ttl: 1,
    modified_on: '2026-11-09T22:00:15Z',
  },
];

// Helper to generate fresh AWS-style dynamic public IPs
function getRandomAwsPublicIp(): string {
  const pools = [
    [54, 248], // AWS Tokyo
    [3, 112],  // AWS Tokyo
    [13, 230], // AWS Tokyo
    [35, 160], // AWS Oregon
    [44, 234], // AWS Oregon
    [18, 204], // AWS Virginia
  ];
  const pool = pools[Math.floor(Math.random() * pools.length)];
  const b3 = Math.floor(Math.random() * 254) + 1;
  const b4 = Math.floor(Math.random() * 254) + 1;
  return `${pool[0]}.${pool[1]}.${b3}.${b4}`;
}

export class FlociSimulatorEngine {
  private instances: LightsailInstance[] = [];
  private snapshots: LightsailSnapshot[] = [];
  private cfRecords: CloudflareDnsRecord[] = [];
  private logListeners: ((log: ApiLogEntry) => void)[] = [];

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      const storedInstances = localStorage.getItem('floci_instances');
      const storedSnapshots = localStorage.getItem('floci_snapshots');
      const storedCf = localStorage.getItem('floci_cf_records');

      this.instances = storedInstances ? JSON.parse(storedInstances) : JSON.parse(JSON.stringify(INITIAL_INSTANCES));
      this.snapshots = storedSnapshots ? JSON.parse(storedSnapshots) : JSON.parse(JSON.stringify(INITIAL_SNAPSHOTS));
      this.cfRecords = storedCf ? JSON.parse(storedCf) : JSON.parse(JSON.stringify(INITIAL_CF_RECORDS));
    } catch {
      this.instances = JSON.parse(JSON.stringify(INITIAL_INSTANCES));
      this.snapshots = JSON.parse(JSON.stringify(INITIAL_SNAPSHOTS));
      this.cfRecords = JSON.parse(JSON.stringify(INITIAL_CF_RECORDS));
    }
  }

  public saveState() {
    try {
      localStorage.setItem('floci_instances', JSON.stringify(this.instances));
      localStorage.setItem('floci_snapshots', JSON.stringify(this.snapshots));
      localStorage.setItem('floci_cf_records', JSON.stringify(this.cfRecords));
    } catch (e) {
      console.warn('LocalStorage save error', e);
    }
  }

  public resetToDefault() {
    this.instances = JSON.parse(JSON.stringify(INITIAL_INSTANCES));
    this.snapshots = JSON.parse(JSON.stringify(INITIAL_SNAPSHOTS));
    this.cfRecords = JSON.parse(JSON.stringify(INITIAL_CF_RECORDS));
    this.saveState();
  }

  public onLog(listener: (log: ApiLogEntry) => void) {
    this.logListeners.push(listener);
    return () => {
      this.logListeners = this.logListeners.filter((l) => l !== listener);
    };
  }

  private emitLog(log: Omit<ApiLogEntry, 'id' | 'timestamp'>) {
    const fullLog: ApiLogEntry = {
      id: 'log-' + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      ...log,
    };
    this.logListeners.forEach((l) => l(fullLog));
  }

  // --- AWS Lightsail API Emulation ---

  public async getInstances(config: CloudConfig): Promise<LightsailInstance[]> {
    const start = performance.now();
    if (config.simulateFaults.awsThrottle) {
      this.emitLog({
        service: 'AWS_LIGHTSAIL',
        method: 'POST',
        action: 'GetInstances',
        endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
        status: 429,
        latencyMs: Math.round(performance.now() - start),
        success: false,
        errorMessage: 'ClientError: Rate exceeded (HTTP 429 TooManyRequests)',
      });
      throw new Error('AWS Error (429): Rate exceeded. Floci throttle simulation triggered.');
    }

    const delay = config.flociSimulationSpeed === 'instant' ? 50 : config.flociSimulationSpeed === 'slow' ? 600 : 200;
    await new Promise((r) => setTimeout(r, delay));

    this.emitLog({
      service: 'AWS_LIGHTSAIL',
      method: 'POST',
      action: 'GetInstances',
      endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
      requestPayload: {},
      responsePayload: { instances: this.instances },
      status: 200,
      latencyMs: Math.round(performance.now() - start),
      success: true,
    });

    return JSON.parse(JSON.stringify(this.instances));
  }

  public async getInstanceSnapshots(config: CloudConfig): Promise<LightsailSnapshot[]> {
    const start = performance.now();
    const delay = config.flociSimulationSpeed === 'instant' ? 40 : 150;
    await new Promise((r) => setTimeout(r, delay));

    this.emitLog({
      service: 'AWS_LIGHTSAIL',
      method: 'POST',
      action: 'GetInstanceSnapshots',
      endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
      requestPayload: {},
      responsePayload: { instanceSnapshots: this.snapshots },
      status: 200,
      latencyMs: Math.round(performance.now() - start),
      success: true,
    });

    return JSON.parse(JSON.stringify(this.snapshots));
  }

  /**
   * Create snapshot for instance
   */
  public async createInstanceSnapshot(
    instanceName: string,
    snapshotName: string,
    config: CloudConfig,
    isAutoHibernate = false
  ): Promise<LightsailSnapshot> {
    const start = performance.now();
    const target = this.instances.find((i) => i.name === instanceName);
    if (!target) {
      throw new Error(`Instance '${instanceName}' not found`);
    }

    if (config.simulateFaults.snapshotTimeout) {
      this.emitLog({
        service: 'AWS_LIGHTSAIL',
        method: 'POST',
        action: 'CreateInstanceSnapshot',
        endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
        requestPayload: { instanceName, instanceSnapshotName: snapshotName },
        status: 504,
        latencyMs: Math.round(performance.now() - start),
        success: false,
        errorMessage: 'OperationTimedOutException: Snapshot creation timed out.',
      });
      throw new Error('AWS Error (504): Snapshot creation timed out. Simulated fault.');
    }

    const newSnapshot: LightsailSnapshot = {
      name: snapshotName,
      arn: `arn:aws:lightsail:${target.location.availabilityZone.slice(0, -1)}:123456789012:InstanceSnapshot/${snapshotName}`,
      fromInstanceName: target.name,
      fromInstanceArn: target.arn,
      fromBlueprintId: target.blueprintId,
      fromBundleId: target.bundleId,
      sizeInGb: target.diskSizeGb,
      state: 'available',
      progress: '100%',
      createdAt: new Date().toISOString(),
      isAutoHibernateSnapshot: isAutoHibernate,
      preservedConfig: {
        blueprintId: target.blueprintId,
        bundleId: target.bundleId,
        availabilityZone: target.location.availabilityZone,
        cloudflareDomain: target.cloudflareBinding?.domain,
        tags: target.tags,
      },
    };

    // Add to snapshots
    this.snapshots.unshift(newSnapshot);

    // Update instance last snapshot info
    target.lastSnapshotName = snapshotName;
    target.lastSnapshotTime = new Date().toISOString();
    this.saveState();

    this.emitLog({
      service: 'AWS_LIGHTSAIL',
      method: 'POST',
      action: 'CreateInstanceSnapshot',
      endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
      requestPayload: { instanceName, instanceSnapshotName: snapshotName },
      responsePayload: { operations: [{ status: 'Succeeded', operationType: 'CreateInstanceSnapshot' }], snapshot: newSnapshot },
      status: 200,
      latencyMs: Math.round(performance.now() - start),
      success: true,
    });

    return newSnapshot;
  }

  /**
   * Delete instance (Hibernate mode deletes compute but keeps snapshot!)
   */
  public async deleteInstance(instanceName: string, config: CloudConfig, hibernateMode = false): Promise<boolean> {
    const start = performance.now();
    const idx = this.instances.findIndex((i) => i.name === instanceName);
    if (idx === -1) {
      throw new Error(`Instance '${instanceName}' not found`);
    }

    const inst = this.instances[idx];

    if (hibernateMode) {
      // In Hibernate mode, we transition instance state to 'hibernated'
      // releasing public IP (0.0.0.0 / null) to simulate true AWS deletion of instance compute
      inst.state = 'hibernated';
      inst.publicIpAddress = null;
      inst.privateIpAddress = '0.0.0.0';
    } else {
      // Hard delete from list
      this.instances.splice(idx, 1);
    }

    this.saveState();

    this.emitLog({
      service: 'AWS_LIGHTSAIL',
      method: 'POST',
      action: 'DeleteInstance',
      endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
      requestPayload: { instanceName },
      responsePayload: { operations: [{ status: 'Succeeded', operationType: 'DeleteInstance' }] },
      status: 200,
      latencyMs: Math.round(performance.now() - start),
      success: true,
    });

    return true;
  }

  /**
   * Fast Restore from Snapshot (creates fresh instance & allocates new dynamic IP)
   */
  public async createInstanceFromSnapshot(
    instanceName: string,
    snapshotName: string,
    availabilityZone: string,
    bundleId: string,
    config: CloudConfig
  ): Promise<LightsailInstance> {
    const start = performance.now();
    const snap = this.snapshots.find((s) => s.name === snapshotName);
    if (!snap) {
      throw new Error(`Snapshot '${snapshotName}' not found`);
    }

    // Allocate a brand-new AWS public IP to simulate the real behavior of Lightsail recreation
    const freshPublicIp = getRandomAwsPublicIp();
    const freshPrivateIp = '172.26.' + Math.floor(Math.random() * 254) + '.' + Math.floor(Math.random() * 254);

    let instance = this.instances.find((i) => i.name === instanceName);

    if (instance) {
      // Waking up hibernated instance
      instance.state = 'running';
      instance.publicIpAddress = freshPublicIp;
      instance.privateIpAddress = freshPrivateIp;
      instance.bundleId = bundleId || snap.fromBundleId;
      instance.createdAt = new Date().toISOString();
    } else {
      // Creating as brand new restored instance
      instance = {
        name: instanceName,
        arn: `arn:aws:lightsail:${availabilityZone.slice(0, -1)}:123456789012:Instance/${instanceName}`,
        blueprintId: snap.fromBlueprintId,
        blueprintName: snap.fromBlueprintId.replace('_', ' ').toUpperCase(),
        bundleId: bundleId || snap.fromBundleId,
        bundleName: `$5.00/mo (${snap.sizeInGb} GB SSD)`,
        ramGb: 1,
        cpuCount: 1,
        diskSizeGb: snap.sizeInGb,
        monthlyCostUsd: 5.0,
        state: 'running',
        publicIpAddress: freshPublicIp,
        privateIpAddress: freshPrivateIp,
        location: {
          availabilityZone: availabilityZone || 'ap-northeast-1a',
          regionName: availabilityZone.startsWith('ap-') ? 'Tokyo (ap-northeast-1)' : 'US West (Oregon)',
        },
        createdAt: new Date().toISOString(),
        tags: snap.preservedConfig?.tags || [],
        cloudflareBinding: snap.preservedConfig?.cloudflareDomain
          ? {
              enabled: true,
              domain: snap.preservedConfig.cloudflareDomain,
              zoneId: 'cf-zone-983b8a1e2f',
              proxied: false,
              lastUpdatedIp: freshPublicIp,
              lastSyncTime: new Date().toISOString(),
            }
          : undefined,
      };
      this.instances.unshift(instance);
    }

    this.saveState();

    this.emitLog({
      service: 'AWS_LIGHTSAIL',
      method: 'POST',
      action: 'CreateInstancesFromSnapshot',
      endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
      requestPayload: {
        instanceNames: [instanceName],
        instanceSnapshotName: snapshotName,
        availabilityZone,
        bundleId,
      },
      responsePayload: {
        operations: [{ status: 'Succeeded', operationType: 'CreateInstancesFromSnapshot' }],
        instance,
      },
      status: 200,
      latencyMs: Math.round(performance.now() - start),
      success: true,
    });

    return instance;
  }

  public async deleteSnapshot(snapshotName: string, config: CloudConfig): Promise<boolean> {
    const start = performance.now();
    const idx = this.snapshots.findIndex((s) => s.name === snapshotName);
    if (idx === -1) {
      throw new Error(`Snapshot '${snapshotName}' not found`);
    }

    this.snapshots.splice(idx, 1);
    this.saveState();

    this.emitLog({
      service: 'AWS_LIGHTSAIL',
      method: 'POST',
      action: 'DeleteInstanceSnapshot',
      endpoint: `lightsail.${config.awsRegion || 'ap-northeast-1'}.amazonaws.com/`,
      requestPayload: { instanceSnapshotName: snapshotName },
      responsePayload: { operations: [{ status: 'Succeeded', operationType: 'DeleteInstanceSnapshot' }] },
      status: 200,
      latencyMs: Math.round(performance.now() - start),
      success: true,
    });

    return true;
  }

  // --- Cloudflare DNS API Emulation ---

  public async getCloudflareRecords(zoneId: string, domainName?: string, config?: CloudConfig): Promise<CloudflareDnsRecord[]> {
    const start = performance.now();
    if (config?.simulateFaults.cloudflareError) {
      this.emitLog({
        service: 'CLOUDFLARE_DNS',
        method: 'GET',
        action: 'ListDnsRecords',
        endpoint: `api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
        status: 403,
        latencyMs: Math.round(performance.now() - start),
        success: false,
        errorMessage: 'Cloudflare API Error (10000): Authentication Error / Invalid Token',
      });
      throw new Error('Cloudflare Error (10000): Authentication Error. Simulated fault.');
    }

    let results = this.cfRecords.filter((r) => r.zone_id === zoneId || !zoneId);
    if (domainName) {
      results = results.filter((r) => r.name.toLowerCase() === domainName.toLowerCase());
    }

    this.emitLog({
      service: 'CLOUDFLARE_DNS',
      method: 'GET',
      action: 'ListDnsRecords',
      endpoint: `api.cloudflare.com/client/v4/zones/${zoneId || 'all'}/dns_records`,
      requestPayload: { domainName },
      responsePayload: { success: true, errors: [], result: results },
      status: 200,
      latencyMs: Math.round(performance.now() - start),
      success: true,
    });

    return results;
  }

  /**
   * Update or Create Cloudflare DNS Record with the newly acquired Lightsail IP
   */
  public async updateCloudflareDnsRecord(
    domainName: string,
    newIp: string,
    zoneId: string,
    proxied: boolean,
    config: CloudConfig
  ): Promise<CloudflareDnsRecord> {
    const start = performance.now();

    if (config.simulateFaults.cloudflareError) {
      this.emitLog({
        service: 'CLOUDFLARE_DNS',
        method: 'PUT',
        action: 'UpdateDnsRecord',
        endpoint: `api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
        requestPayload: { name: domainName, content: newIp, type: 'A' },
        status: 400,
        latencyMs: Math.round(performance.now() - start),
        success: false,
        errorMessage: 'Cloudflare API Error (81044): DNS record already exists or invalid parameters',
      });
      throw new Error('Cloudflare Error (81044): DNS record conflict. Simulated fault.');
    }

    let record = this.cfRecords.find((r) => r.name.toLowerCase() === domainName.toLowerCase());

    if (record) {
      record.content = newIp;
      record.proxied = proxied;
      record.modified_on = new Date().toISOString();
    } else {
      record = {
        id: 'rec-cf-' + Math.random().toString(36).substring(2, 8),
        zone_id: zoneId || 'cf-zone-983b8a1e2f',
        zone_name: domainName.split('.').slice(-2).join('.'),
        name: domainName,
        type: 'A',
        content: newIp,
        proxied,
        ttl: 1,
        modified_on: new Date().toISOString(),
      };
      this.cfRecords.push(record);
    }

    // Also update bound instance metadata if match found
    const boundInstance = this.instances.find(
      (i) => i.cloudflareBinding?.domain.toLowerCase() === domainName.toLowerCase()
    );
    if (boundInstance && boundInstance.cloudflareBinding) {
      boundInstance.cloudflareBinding.lastUpdatedIp = newIp;
      boundInstance.cloudflareBinding.lastSyncTime = new Date().toISOString();
      boundInstance.cloudflareBinding.recordId = record.id;
    }

    this.saveState();

    this.emitLog({
      service: 'CLOUDFLARE_DNS',
      method: 'PUT',
      action: 'UpdateDnsRecord',
      endpoint: `api.cloudflare.com/client/v4/zones/${zoneId || record.zone_id}/dns_records/${record.id}`,
      requestPayload: {
        name: domainName,
        type: 'A',
        content: newIp,
        proxied,
        ttl: 1,
      },
      responsePayload: {
        success: true,
        errors: [],
        messages: [],
        result: record,
      },
      status: 200,
      latencyMs: Math.round(performance.now() - start),
      success: true,
    });

    return record;
  }

  public updateInstanceSchedules(
    instanceName: string,
    autoHibernate?: { enabled: boolean; time: string; daysOfWeek: number[] },
    autoStart?: { enabled: boolean; time: string; daysOfWeek: number[] },
    cloudflareBinding?: { enabled: boolean; domain: string; zoneId: string; proxied: boolean }
  ) {
    const inst = this.instances.find((i) => i.name === instanceName);
    if (!inst) return;

    if (autoHibernate !== undefined) {
      inst.autoHibernateSchedule = {
        ...inst.autoHibernateSchedule,
        ...autoHibernate,
      };
    }

    if (autoStart !== undefined) {
      inst.autoStartSchedule = {
        ...inst.autoStartSchedule,
        ...autoStart,
      };
    }

    if (cloudflareBinding !== undefined) {
      inst.cloudflareBinding = {
        ...inst.cloudflareBinding,
        ...cloudflareBinding,
        lastUpdatedIp: inst.publicIpAddress || inst.cloudflareBinding?.lastUpdatedIp,
      };
    }

    this.saveState();
  }
}

export const flociSimulator = new FlociSimulatorEngine();
