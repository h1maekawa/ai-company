import { createHash, randomUUID } from "node:crypto";
export function careerHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function careerId(prefix: string) { return `${prefix}_${randomUUID()}`; }
