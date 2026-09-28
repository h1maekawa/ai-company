import type { NavigationDepartmentId } from "@/app/lib/config/navigation";

export type NotificationPriority = "INFO" | "ACTION_REQUIRED" | "URGENT";
export type NotificationEvent = { id: string; fingerprint: string; kind: string; sourceType: "approval" | "mission" | "attention" | "content"; sourceId: string; departmentId?: NavigationDepartmentId; title: string; summary: string; priority: NotificationPriority; actionRequired: boolean; deepLink: string; createdAt: string; riskLevel?: string; approvalKind?: string };
export type NotificationDelivery = { eventId: string; channel: "slack" | "line" | "notion" | "obsidian"; deliveredAt?: string; status: "PENDING" | "SENT" | "FAILED" | "SKIPPED"; error?: string };
export interface NotificationAdapter { channel: NotificationDelivery["channel"]; deliver(event: NotificationEvent): Promise<Omit<NotificationDelivery, "eventId" | "channel">>; }
