import type { ExecutionStore } from "@/app/lib/company/runtime/runtimeTypes";
import type { NotificationAdapter, NotificationDelivery, NotificationEvent } from "./types";
import { slackNotificationAdapter } from "./slack";

export async function deliverNotifications(events: NotificationEvent[], store: ExecutionStore, adapters: NotificationAdapter[] = [slackNotificationAdapter]): Promise<NotificationDelivery[]> {
  const deliveries: NotificationDelivery[] = [];
  for (const event of events) for (const adapter of adapters) {
    const key = `${adapter.channel}:${event.fingerprint}`;
    const previous = await store.getIdempotencyResult<NotificationDelivery>("notification-delivery", key);
    if (previous?.status === "SENT") { deliveries.push({ ...previous, status: "SKIPPED" }); continue; }
    if (!(await store.claimIdempotency("notification-delivery", key))) { deliveries.push({ eventId: event.id, channel: adapter.channel, status: "SKIPPED" }); continue; }
    const result = await adapter.deliver(event).catch((error) => ({ status: "FAILED" as const, error: error instanceof Error ? error.message : "DELIVERY_FAILED" }));
    const delivery = { eventId: event.id, channel: adapter.channel, ...result } as NotificationDelivery;
    await store.completeIdempotency("notification-delivery", key, delivery);
    deliveries.push(delivery);
  }
  return deliveries;
}
