export const DEPARTMENT_IDS = [
  "executive",
  "planning",
  "content",
  "investment",
  "finance",
  "sales",
  "research",
  "development",
  "kaizen",
] as const;

export type DepartmentId = (typeof DEPARTMENT_IDS)[number];

export const ARTIFACT_TYPES = [
  "capture",
  "research",
  "insight",
  "viewpoint",
  "idea",
  "draft",
  "published-content",
  "decision",
  "plan",
  "report",
  "knowledge",
  "automation",
  "log",
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_STATUSES = [
  "inbox",
  "researching",
  "reviewed",
  "selected",
  "draft",
  "approved",
  "published",
  "archived",
  "rejected",
] as const;

export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];
export type MemoryTier = "core" | "working" | "archive";

export type ArtifactMeta = {
  id: string;
  ownerDepartment: DepartmentId;
  relatedDepartments?: DepartmentId[];
  artifactType: ArtifactType;
  status: ArtifactStatus;
  memoryTier?: MemoryTier;
  topic?: string;
  tags?: string[];
  sourceType?: string;
  sourceUrls?: string[];
  createdAt: string;
  updatedAt: string;
  parentArtifactIds?: string[];
  childArtifactIds?: string[];
  reusable?: boolean;
};

export type ContentLineage = {
  sourceResearchIds: string[];
  sourceViewpointIds: string[];
  sourceExperienceIds: string[];
  generatedDraftId?: string;
  publishedArtifactId?: string;
};

const isOneOf = <T extends readonly string[]>(value: unknown, values: T): value is T[number] =>
  typeof value === "string" && values.includes(value);

export function validateArtifactMeta(value: unknown): value is ArtifactMeta {
  if (!value || typeof value !== "object") return false;
  const meta = value as Partial<ArtifactMeta>;
  return Boolean(
    meta.id &&
      isOneOf(meta.ownerDepartment, DEPARTMENT_IDS) &&
      isOneOf(meta.artifactType, ARTIFACT_TYPES) &&
      isOneOf(meta.status, ARTIFACT_STATUSES) &&
      meta.createdAt &&
      meta.updatedAt &&
      (!meta.relatedDepartments ||
        meta.relatedDepartments.every((department) => isOneOf(department, DEPARTMENT_IDS)))
  );
}

export function createArtifactMeta(
  input: Omit<ArtifactMeta, "createdAt" | "updatedAt"> & Partial<Pick<ArtifactMeta, "createdAt" | "updatedAt">>
): ArtifactMeta {
  const now = new Date().toISOString();
  const meta: ArtifactMeta = { ...input, createdAt: input.createdAt ?? now, updatedAt: input.updatedAt ?? now };
  if (!validateArtifactMeta(meta)) throw new Error("Invalid artifact metadata");
  return meta;
}

/** Draftは本人の正式発言ではなく、published-contentだけを公開済みとして扱う。 */
export function isOfficialPublishedArtifact(meta: ArtifactMeta): boolean {
  return meta.artifactType === "published-content" && meta.status === "published";
}

