import { runtimeEnvironment } from "./environment";

export const RUNTIME_SCHEMA_VERSION = "execution:v1";
export const RUNTIME_VERSION = "phase9";

export type DeploymentMetadata = {
  deploymentId?: string;
  commitSha?: string;
  branch?: string;
  deploymentUrl?: string;
  environment: string;
  authority: "vercel" | "secondary";
  deployedAt?: string;
  status: "ONLINE";
  runtimeVersion: string;
  schemaVersion: string;
};

export interface DeploymentMetadataProvider {
  get(): DeploymentMetadata;
}

export class VercelDeploymentMetadataProvider implements DeploymentMetadataProvider {
  get(): DeploymentMetadata {
    const runtime = runtimeEnvironment();
    return {
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
      branch: process.env.VERCEL_GIT_COMMIT_REF,
      deploymentUrl: process.env.VERCEL_URL,
      environment: runtime.stage,
      authority: runtime.authority,
      deployedAt: process.env.DEPLOYED_AT,
      status: "ONLINE",
      runtimeVersion: RUNTIME_VERSION,
      schemaVersion: RUNTIME_SCHEMA_VERSION,
    };
  }
}

export function deploymentMetadata(provider: DeploymentMetadataProvider = new VercelDeploymentMetadataProvider()) {
  return provider.get();
}
