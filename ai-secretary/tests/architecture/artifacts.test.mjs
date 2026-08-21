import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const artifacts = await import(path.join(process.env.ARCHITECTURE_DIST, "artifacts.js"));

test("artifact metadata accepts owner and cross-department references", () => {
  const meta = artifacts.createArtifactMeta({
    id: "research-20260807-001",
    ownerDepartment: "investment",
    relatedDepartments: ["content", "research"],
    artifactType: "research",
    status: "reviewed",
    memoryTier: "working",
  });
  assert.equal(artifacts.validateArtifactMeta(meta), true);
});

test("unknown departments are rejected", () => {
  assert.throws(() =>
    artifacts.createArtifactMeta({
      id: "bad-001",
      ownerDepartment: "unknown",
      artifactType: "research",
      status: "inbox",
    })
  );
});

test("draft is not treated as the owner's published statement", () => {
  const draft = artifacts.createArtifactMeta({
    id: "draft-001",
    ownerDepartment: "content",
    artifactType: "draft",
    status: "approved",
  });
  const published = artifacts.createArtifactMeta({
    id: "published-001",
    ownerDepartment: "content",
    artifactType: "published-content",
    status: "published",
    parentArtifactIds: [draft.id],
  });
  assert.equal(artifacts.isOfficialPublishedArtifact(draft), false);
  assert.equal(artifacts.isOfficialPublishedArtifact(published), true);
});
