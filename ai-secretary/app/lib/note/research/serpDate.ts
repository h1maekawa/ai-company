export function normalizeSerpPublishedAt(value: string | undefined, observedAt = new Date()): string | undefined {
  const input = value?.trim();
  if (!input) return undefined;
  const relative = input.match(/^(\d+)\s+(minute|hour|day|week)s?\s+ago$/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unitMs = relative[2].toLowerCase() === "minute" ? 60_000
      : relative[2].toLowerCase() === "hour" ? 3_600_000
        : relative[2].toLowerCase() === "day" ? 86_400_000 : 7 * 86_400_000;
    return new Date(observedAt.getTime() - amount * unitMs).toISOString();
  }
  const timestamp = Date.parse(input);
  if (!Number.isFinite(timestamp) || timestamp > observedAt.getTime() + 86_400_000) return undefined;
  return new Date(timestamp).toISOString();
}
