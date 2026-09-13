export type RuntimeStage = "development" | "preview" | "production";
export type ProductionAuthority = "vercel" | "secondary";

const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 48);
const enabled = (name: string) => process.env[name] === "true";

export type RuntimeEnvironment = {
  stage: RuntimeStage;
  authority: ProductionAuthority;
  redisNamespace: string;
  autonomousRuntimeEnabled: boolean;
  realModelCanaryEnabled: boolean;
  opportunityAutoRefreshEnabled: boolean;
  organizationReviewEnabled: boolean;
  mutationAllowed: boolean;
};

export function runtimeEnvironment(): RuntimeEnvironment {
  const vercelStage = process.env.VERCEL_ENV;
  const stage: RuntimeStage = vercelStage === "production" ? "production" : vercelStage === "preview" ? "preview" : "development";
  const authority: ProductionAuthority = process.env.CF_PAGES === "1" ? "secondary" : "vercel";
  const previewId = clean(process.env.VERCEL_GIT_COMMIT_REF ?? process.env.VERCEL_DEPLOYMENT_ID ?? "local");
  const redisNamespace = stage === "production" ? "prod" : stage === "preview" ? "preview:" + previewId : "dev";
  const productionAuthority = stage === "production" && authority === "vercel";
  return {
    stage,
    authority,
    redisNamespace,
    autonomousRuntimeEnabled: productionAuthority && enabled("AUTONOMOUS_RUNTIME_ENABLED"),
    realModelCanaryEnabled: productionAuthority && enabled("REAL_MODEL_CANARY_ENABLED"),
    opportunityAutoRefreshEnabled: productionAuthority && enabled("OPPORTUNITY_AUTO_REFRESH_ENABLED"),
    organizationReviewEnabled: productionAuthority && enabled("ORGANIZATION_REVIEW_ENABLED"),
    // Preview writes only to its branch/deployment-scoped namespace. Secondary
    // runtimes remain read-only and can never reach the production namespace.
    mutationAllowed: authority === "vercel",
  };
}

export function assertProductionMutationAllowed() {
  const environment = runtimeEnvironment();
  if (!environment.mutationAllowed) throw new Error("PRODUCTION_MUTATION_DISABLED");
  return environment;
}

export function validateRuntimeEnvironment() {
  const environment = runtimeEnvironment();
  const errors: string[] = [];
  if (environment.stage === "production" && environment.authority !== "vercel") errors.push("VERCEL_PRODUCTION_AUTHORITY_REQUIRED");
  if (environment.stage === "preview" && environment.autonomousRuntimeEnabled) errors.push("PREVIEW_AUTONOMOUS_RUNTIME_FORBIDDEN");
  if (environment.redisNamespace === "prod" && environment.stage !== "production") errors.push("PRODUCTION_NAMESPACE_FORBIDDEN");
  if (environment.stage === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL && process.env.VERCEL_PROJECT_PRODUCTION_URL !== "ai-company-ilqd.vercel.app")
    errors.push("UNEXPECTED_PRODUCTION_PROJECT");
  return { ok: errors.length === 0, errors, environment };
}
