/**
 * Human Approval Boundary — Viewpoint / Experience の承認境界。
 *
 * 原則: これらの関数だけが status を "approved" にできる。
 * AI生成関数（interview.ts等）は常に "candidate" のオブジェクトしか作らない。
 * この分離自体が「AI Draftの自動承認禁止」を型・関数レベルで保証する。
 */

import { ExperienceEntry, ViewpointLibraryEntry } from "../../note/research/types";

export function candidateViewpoint(
  input: Omit<ViewpointLibraryEntry, "id" | "status" | "verifiedByUser" | "approvedAt" | "createdAt" | "updatedAt" | "sourceDraftIds" | "reusable"> &
    Partial<Pick<ViewpointLibraryEntry, "sourceDraftIds" | "reusable">>
): ViewpointLibraryEntry {
  const now = new Date().toISOString();
  return {
    id: `vp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    title: input.title,
    topic: input.topic,
    opinion: input.opinion,
    reasons: input.reasons,
    uncertainties: input.uncertainties,
    sourceBriefId: input.sourceBriefId,
    sourceDraftIds: input.sourceDraftIds ?? [],
    reusable: input.reusable ?? false,
    sourceMessageIds: input.sourceMessageIds,
    sourceMaterialIds: input.sourceMaterialIds,
    // AIが作った直後は必ずcandidate。verifiedByUserもfalseで固定する
    status: "candidate",
    verifiedByUser: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function approveViewpoint(entry: ViewpointLibraryEntry): ViewpointLibraryEntry {
  const now = new Date().toISOString();
  return { ...entry, status: "approved", verifiedByUser: true, approvedAt: now, updatedAt: now };
}

export function rejectViewpoint(entry: ViewpointLibraryEntry): ViewpointLibraryEntry {
  return { ...entry, status: "rejected", verifiedByUser: false, updatedAt: new Date().toISOString() };
}

export function candidateExperience(
  input: Omit<ExperienceEntry, "id" | "status" | "verifiedByUser" | "approvedAt" | "createdAt" | "updatedAt">
): ExperienceEntry {
  const now = new Date().toISOString();
  return {
    ...input,
    id: `exp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    status: "candidate",
    verifiedByUser: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function approveExperience(entry: ExperienceEntry): ExperienceEntry {
  const now = new Date().toISOString();
  return { ...entry, status: "approved", verifiedByUser: true, approvedAt: now, updatedAt: now };
}

export function rejectExperience(entry: ExperienceEntry): ExperienceEntry {
  return { ...entry, status: "rejected", verifiedByUser: false, updatedAt: new Date().toISOString() };
}
