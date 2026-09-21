import { createHash } from "node:crypto";
import type { ExecutionState } from "@/app/lib/company/execution/store";
import type { NotificationEvent } from "./types";

const id = (fingerprint: string) => `ntf_${createHash("sha256").update(fingerprint).digest("hex").slice(0, 16)}`;
type EngineeringNotificationSource = { id: string; title: string; url: string; updatedAt: string };
type EngineeringNotifications = { notificationSources?: { prReady?: EngineeringNotificationSource[]; ciFailure?: EngineeringNotificationSource[]; blocked?: EngineeringNotificationSource[] } } | null;
export function buildNotificationEvents(state: ExecutionState, engineering?: EngineeringNotifications): NotificationEvent[] {
  const approvals = state.approvals.filter((item) => item.status === "PENDING").map((approval): NotificationEvent => {
    const fingerprint = `approval:${approval.id}`;
    return { id: id(fingerprint), fingerprint, kind: "COMPANY_APPROVAL_REQUIRED", sourceType: "approval", sourceId: approval.id, title: approval.title, summary: approval.summary, priority: approval.riskLevel === "R4" ? "URGENT" : "ACTION_REQUIRED", actionRequired: true, deepLink: `/ceo/approvals#approval-${encodeURIComponent(approval.id)}`, createdAt: approval.createdAt, riskLevel: approval.riskLevel };
  });
  const attention = (state.runtime?.attention ?? []).filter((item) => !item.resolvedAt).map((item): NotificationEvent => ({ id: id(item.fingerprint), fingerprint: item.fingerprint, kind: item.type, sourceType: item.type === "MISSION_BLOCKED" ? "mission" : "attention", sourceId: item.targetId ?? item.missionId ?? item.id, title: item.title, summary: item.summary, priority: item.priority === "critical" ? "URGENT" : item.priority === "high" ? "ACTION_REQUIRED" : "INFO", actionRequired: item.priority === "critical" || item.priority === "high", deepLink: item.type === "APPROVAL_REQUIRED" && item.targetId ? `/ceo/approvals#approval-${encodeURIComponent(item.targetId)}` : item.missionId ? `/company?mission=${encodeURIComponent(item.missionId)}` : "/ceo/approvals", createdAt: item.createdAt }));
  const engineeringEvents: NotificationEvent[] = [
    ...(engineering?.notificationSources?.prReady ?? []).map((item): NotificationEvent => ({ id: id(`engineering:pr:${item.id}`), fingerprint: `engineering:pr:${item.id}`, kind: "ENGINEERING_PR_READY", sourceType: "attention", sourceId: item.id, departmentId: "engineering", title: item.title, summary: "PR Ready — Human review required. AI does not merge.", priority: "ACTION_REQUIRED", actionRequired: true, deepLink: "/ceo/departments/engineering", createdAt: item.updatedAt })),
    ...(engineering?.notificationSources?.ciFailure ?? []).map((item): NotificationEvent => ({ id: id(`engineering:ci:${item.id}`), fingerprint: `engineering:ci:${item.id}`, kind: "ENGINEERING_CI_FAILURE", sourceType: "attention", sourceId: item.id, departmentId: "engineering", title: item.title, summary: "CI Failure", priority: "ACTION_REQUIRED", actionRequired: true, deepLink: "/ceo/departments/engineering", createdAt: item.updatedAt })),
    ...(engineering?.notificationSources?.blocked ?? []).map((item): NotificationEvent => ({ id: id(`engineering:blocked:${item.id}`), fingerprint: `engineering:blocked:${item.id}`, kind: "ENGINEERING_BLOCKED", sourceType: "attention", sourceId: item.id, departmentId: "engineering", title: item.title, summary: "Engineering task is blocked", priority: "ACTION_REQUIRED", actionRequired: true, deepLink: "/ceo/departments/engineering", createdAt: item.updatedAt })),
  ];
  return [...approvals, ...attention, ...engineeringEvents].filter((event, index, all) => all.findIndex((candidate) => candidate.fingerprint === event.fingerprint) === index).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
