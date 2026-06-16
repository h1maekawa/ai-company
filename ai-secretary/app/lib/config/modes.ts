export const SECRETARY_MODES = [
  "personal",
  "company",
  "finance",
  "note",
] as const;

export type SecretaryMode = typeof SECRETARY_MODES[number];
