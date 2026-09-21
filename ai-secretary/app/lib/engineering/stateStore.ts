import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EngineeringRunAudit, EngineeringTask, WorkerHeartbeat } from "./types";
import { redactSecrets } from "./security";

type WorkerState = { version: 1; tasks: Record<string, EngineeringTask>; heartbeat?: WorkerHeartbeat };

export class EngineeringStateStore {
  private readonly statePath: string;
  private readonly lockPath: string;

  constructor(private readonly stateDir: string, private readonly logsDir: string) {
    this.statePath = path.join(stateDir, "worker-state.json");
    this.lockPath = path.join(stateDir, "worker-state.lock");
  }

  async init(): Promise<void> {
    await Promise.all([mkdir(this.stateDir, { recursive: true, mode: 0o700 }), mkdir(this.logsDir, { recursive: true, mode: 0o700 })]);
  }

  async read(): Promise<WorkerState> {
    await this.init();
    try {
      const parsed = JSON.parse(await readFile(this.statePath, "utf8")) as WorkerState;
      return parsed.version === 1 && parsed.tasks ? parsed : { version: 1, tasks: {} };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, tasks: {} };
      throw error;
    }
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.init();
    let handle;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        handle = await open(this.lockPath, "wx", 0o600);
        await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const age = Date.now() - (await stat(this.lockPath)).mtimeMs;
        if (attempt === 0 && age > 60_000) { await unlink(this.lockPath); continue; }
        throw new Error("ENGINEERING_STATE_LOCKED");
      }
    }
    if (!handle) throw new Error("ENGINEERING_STATE_LOCKED");
    try { return await operation(); } finally { await handle.close(); await unlink(this.lockPath).catch(() => undefined); }
  }

  async updateTask(task: EngineeringTask): Promise<void> {
    await this.withLock(async () => {
      const state = await this.read();
      state.tasks[String(task.issueNumber)] = task;
      const temporary = `${this.statePath}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.statePath);
    });
  }

  async claimTask(task: EngineeringTask, now = Date.now()): Promise<boolean> {
    return this.withLock(async () => {
      const state = await this.read();
      const active = Object.values(state.tasks).some((candidate) =>
        candidate.issueNumber === task.issueNumber &&
        !hasExpiredLease(candidate, now) &&
        !["READY_FOR_HUMAN_REVIEW", "BLOCKED", "FAILED"].includes(candidate.status),
      );
      if (active) return false;
      state.tasks[String(task.issueNumber)] = task;
      const temporary = `${this.statePath}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.statePath);
      return true;
    });
  }

  async updateHeartbeat(heartbeat: WorkerHeartbeat): Promise<void> {
    await this.withLock(async () => {
      const state = await this.read();
      state.heartbeat = heartbeat;
      const temporary = `${this.statePath}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.statePath);
    });
  }

  async appendAudit(audit: EngineeringRunAudit): Promise<void> {
    await this.init();
    const safe = redactSecrets(JSON.stringify(audit));
    await writeFile(path.join(this.logsDir, "audit.jsonl"), `${safe}\n`, { flag: "a", mode: 0o600 });
  }

  async countRunsToday(now = new Date()): Promise<number> {
    try {
      const lines = (await readFile(path.join(this.logsDir, "audit.jsonl"), "utf8")).trim().split("\n").filter(Boolean);
      const day = now.toISOString().slice(0, 10);
      return lines.filter((line) => {
        try {
          const audit = JSON.parse(line) as EngineeringRunAudit;
          return audit.issue !== undefined && audit.startedAt.startsWith(day);
        } catch { return false; }
      }).length;
    } catch { return 0; }
  }
}

export function hasExpiredLease(task: EngineeringTask, now = Date.now()): boolean {
  return Boolean(task.leaseExpiresAt && new Date(task.leaseExpiresAt).getTime() <= now && !["READY_FOR_HUMAN_REVIEW", "BLOCKED", "FAILED"].includes(task.status));
}
