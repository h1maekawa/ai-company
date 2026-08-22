import { getSupabaseConfig, supabaseRequest } from "./client";

export type SyncStatusValue = "connected" | "warning" | "disconnected" | "not_configured" | "unknown";
export type SystemSyncStatus = { service: string; status: SyncStatusValue; last_checked_at: string; last_success_at?: string | null; last_sync_at?: string | null; item_count?: number | null; message?: string | null; last_error?: string | null; metadata?: Record<string, unknown> };
export const syncStatusRepository = {
  configured: () => Boolean(getSupabaseConfig()),
  list: () => supabaseRequest<SystemSyncStatus[]>("system_sync_status?select=*&order=service.asc"),
  upsert: (value: SystemSyncStatus) => supabaseRequest("system_sync_status?on_conflict=service", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(value) }),
};
