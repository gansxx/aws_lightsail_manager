/**
 * AWS Lightsail and Cloudflare DNS Types
 */

export type InstanceState = 
  | 'pending'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'shutting-down'
  | 'terminated'
  | 'hibernated'; // Custom state indicating instance was safely deleted with preserved snapshot

export interface LightsailInstance {
  name: string;
  arn: string;
  blueprintId: string;
  blueprintName: string;
  bundleId: string; // e.g. nano_2_0, micro_2_0, small_2_0
  bundleName: string; // e.g. $3.50/mo (512MB RAM, 1 vCPU, 20GB SSD)
  ramGb: number;
  cpuCount: number;
  diskSizeGb: number;
  monthlyCostUsd: number;
  state: InstanceState;
  publicIpAddress: string | null;
  privateIpAddress: string;
  ipv6Addresses?: string[];
  location: {
    availabilityZone: string;
    regionName: string;
  };
  createdAt: string;
  tags?: { key: string; value: string }[];
  keyPairName?: string;
  
  // Hibernation & Cloudflare binding metadata
  lastSnapshotName?: string;
  lastSnapshotTime?: string;
  cloudflareBinding?: {
    enabled: boolean;
    domain: string; // e.g. vpn.example.com
    zoneId: string;
    recordId?: string;
    proxied: boolean;
    lastUpdatedIp?: string;
    lastSyncTime?: string;
  };
  
  // Scheduled Automation metadata
  autoHibernateSchedule?: {
    enabled: boolean;
    time: string; // e.g. "23:00"
    daysOfWeek: number[]; // [0,1,2,3,4,5,6] (0 = Sunday)
    lastExecuted?: string;
  };
  autoStartSchedule?: {
    enabled: boolean;
    time: string; // e.g. "08:30"
    daysOfWeek: number[];
    lastExecuted?: string;
  };
}

export interface LightsailSnapshot {
  name: string;
  arn: string;
  fromInstanceName: string;
  fromInstanceArn: string;
  fromBlueprintId: string;
  fromBundleId: string;
  sizeInGb: number;
  state: 'in-progress' | 'available' | 'error';
  progress?: string;
  createdAt: string;
  isAutoHibernateSnapshot?: boolean;
  preservedConfig?: {
    blueprintId: string;
    bundleId: string;
    availabilityZone: string;
    cloudflareDomain?: string;
    tags?: { key: string; value: string }[];
  };
}

export interface CloudflareDnsRecord {
  id: string;
  zone_id: string;
  zone_name: string;
  name: string; // e.g. vpn.mydomain.dev
  type: 'A' | 'AAAA' | 'CNAME';
  content: string; // IP address
  proxied: boolean;
  ttl: number; // 1 for auto
  modified_on: string;
}

export interface ApiLogEntry {
  id: string;
  timestamp: string;
  service: 'AWS_LIGHTSAIL' | 'CLOUDFLARE_DNS' | 'SCHEDULER' | 'DIAGNOSTIC';
  method: string;
  action: string;
  endpoint: string;
  requestPayload?: any;
  responsePayload?: any;
  status: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
}

export interface DiagnosticResult {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'success' | 'warning' | 'error';
  message: string;
  timestamp?: string;
  details?: any;
}

export interface CloudConfig {
  mode: 'floci_simulation' | 'real_cloud';
  flociSimulationSpeed: 'instant' | 'normal' | 'slow';
  simulateFaults: {
    awsThrottle: boolean;
    cloudflareError: boolean;
    snapshotTimeout: boolean;
  };
  
  // Real AWS Credentials
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
  
  // Real Cloudflare Credentials
  cloudflareApiToken: string;
  cloudflareZoneId: string;
  defaultDnsRecordName: string;

  // GitHub Update Source
  githubRepo?: string;
}

export interface OperationStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  detail?: string;
}

export interface SecretFieldStatus {
  configured: boolean;
  maskedPreview: string | null;
  length: number;
}

export interface EnvSecretStatus {
  awsAccessKeyId: SecretFieldStatus;
  awsSecretAccessKey: SecretFieldStatus;
  awsRegion: string;
  cloudflareApiToken: SecretFieldStatus;
  cloudflareZoneId: SecretFieldStatus;
  cloudflareRecordName: string | null;
}

export interface CredentialCheckItem {
  configured: boolean;
  source: 'env_secret' | 'custom_input' | 'missing';
  success: boolean;
  status: number;
  latencyMs: number;
  message: string;
  details?: Record<string, any>;
}

export interface CredentialTestReport {
  timestamp: string;
  aws: CredentialCheckItem;
  cloudflare: CredentialCheckItem;
}

export interface GitHubReleaseAsset {
  name: string;
  downloadUrl: string;
  sizeBytes: number;
  sizeMb: string;
  downloadCount: number;
}

export interface GitHubUpdateInfo {
  repo: string;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseTag: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  htmlUrl: string;
  apkAssets: GitHubReleaseAsset[];
  latestCommit: {
    sha: string;
    message: string;
    date: string;
    author: string;
    url: string;
  } | null;
  checkedAt: string;
}


