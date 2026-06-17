import { findSecretary } from "../config/registry";
import { InboxTask } from "../router/inbox";

export type DecisionNode = {
  timestamp: string;
  from: string;
  to: string;
  reason: string;
};

export type TaskStatus = 
  | "inboxed"
  | "approved"
  | "assigned"
  | "in_progress"
  | "completed"
  | "pending"
  | "done"
  | "blocked";

export type TaskNode = {
  id: string;
  title: string;
  owner: string;
  status: TaskStatus;
};

export type ContextBus = {
  currentIntent: string;
  currentGoal: string;

  activeDepartment: string;
  activeSecretary: string;
  previousSecretary?: string;

  decisionHistory: DecisionNode[];
  taskPipeline: TaskNode[];
  
  // Temporal inbox classification buffer
  pendingInboxTasks?: InboxTask[];

  createdAt: string;
  updatedAt: string;
};

/**
 * Creates an empty/default ContextBus state
 */
export function createDefaultBus(): ContextBus {
  const now = new Date().toISOString().split("T")[0];
  return {
    currentIntent: "",
    currentGoal: "",
    activeDepartment: "executive",
    activeSecretary: "executive-coo",
    previousSecretary: "",
    decisionHistory: [],
    taskPipeline: [],
    pendingInboxTasks: [],
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Custom YAML serializer for ContextBus
 */
export function serializeBus(bus: ContextBus): string {
  const cleanVal = (val?: string) => (val ? val.replace(/"/g, '\\"') : "");

  let yaml = "---\n";
  yaml += `currentIntent: "${cleanVal(bus.currentIntent)}"\n`;
  yaml += `currentGoal: "${cleanVal(bus.currentGoal)}"\n`;
  yaml += `activeDepartment: "${cleanVal(bus.activeDepartment)}"\n`;
  yaml += `activeSecretary: "${cleanVal(bus.activeSecretary)}"\n`;
  yaml += `previousSecretary: "${cleanVal(bus.previousSecretary)}"\n`;
  
  yaml += "decisionHistory:\n";
  if (bus.decisionHistory && bus.decisionHistory.length > 0) {
    bus.decisionHistory.forEach(d => {
      yaml += `  - timestamp: "${cleanVal(d.timestamp)}"\n`;
      yaml += `    from: "${cleanVal(d.from)}"\n`;
      yaml += `    to: "${cleanVal(d.to)}"\n`;
      yaml += `    reason: "${cleanVal(d.reason)}"\n`;
    });
  }

  yaml += "taskPipeline:\n";
  if (bus.taskPipeline && bus.taskPipeline.length > 0) {
    bus.taskPipeline.forEach(t => {
      yaml += `  - id: "${cleanVal(t.id)}"\n`;
      yaml += `    title: "${cleanVal(t.title)}"\n`;
      yaml += `    owner: "${cleanVal(t.owner)}"\n`;
      yaml += `    status: "${cleanVal(t.status)}"\n`;
    });
  }

  yaml += "pendingInboxTasks:\n";
  if (bus.pendingInboxTasks && bus.pendingInboxTasks.length > 0) {
    bus.pendingInboxTasks.forEach(t => {
      yaml += `  - id: "${cleanVal(t.id)}"\n`;
      yaml += `    title: "${cleanVal(t.title)}"\n`;
      yaml += `    department: "${cleanVal(t.department)}"\n`;
      yaml += `    suggestedSecretary: "${cleanVal(t.suggestedSecretary)}"\n`;
      yaml += `    confidence: ${t.confidence}\n`;
      yaml += `    reason: "${cleanVal(t.reason)}"\n`;
    });
  }

  yaml += `createdAt: "${cleanVal(bus.createdAt)}"\n`;
  yaml += `updatedAt: "${cleanVal(bus.updatedAt)}"\n`;
  yaml += "---\n";

  return yaml;
}

/**
 * Custom YAML parser for ContextBus
 */
export function parseBus(yaml: string): ContextBus {
  const lines = yaml.split("\n");
  const bus = createDefaultBus();

  let currentKey: "decisionHistory" | "taskPipeline" | "pendingInboxTasks" | "" = "";
  let currentItem: any = null;

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") continue;

    // Handle array list items
    if (line.startsWith("  - ") || line.startsWith("    - ")) {
      if (currentItem) {
        if (currentKey === "decisionHistory") bus.decisionHistory.push(currentItem);
        if (currentKey === "taskPipeline") bus.taskPipeline.push(currentItem);
        if (currentKey === "pendingInboxTasks") {
          bus.pendingInboxTasks = bus.pendingInboxTasks || [];
          bus.pendingInboxTasks.push(currentItem);
        }
      }
      currentItem = {};
      const keyVal = trimmed.substring(2).trim();
      const colonIdx = keyVal.indexOf(":");
      if (colonIdx !== -1) {
        const k = keyVal.substring(0, colonIdx).trim();
        const v = keyVal.substring(colonIdx + 1).trim().replace(/^["']|["']$/g, "").replace(/\\"/g, '"');
        if (k === "confidence") {
          currentItem[k] = Number(v) || 0.5;
        } else {
          currentItem[k] = v;
        }
      }
      continue;
    }

    if (line.startsWith("    ") && currentItem) {
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx !== -1) {
        const k = trimmed.substring(0, colonIdx).trim();
        const v = trimmed.substring(colonIdx + 1).trim().replace(/^["']|["']$/g, "").replace(/\\"/g, '"');
        if (k === "confidence") {
          currentItem[k] = Number(v) || 0.5;
        } else {
          currentItem[k] = v;
        }
      }
      continue;
    }

    // Handle root-level key-values
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx !== -1) {
      if (currentItem) {
        if (currentKey === "decisionHistory") bus.decisionHistory.push(currentItem);
        if (currentKey === "taskPipeline") bus.taskPipeline.push(currentItem);
        if (currentKey === "pendingInboxTasks") {
          bus.pendingInboxTasks = bus.pendingInboxTasks || [];
          bus.pendingInboxTasks.push(currentItem);
        }
        currentItem = null;
      }

      const k = trimmed.substring(0, colonIdx).trim();
      const v = trimmed.substring(colonIdx + 1).trim().replace(/^["']|["']$/g, "").replace(/\\"/g, '"');

      if (k === "decisionHistory") {
        currentKey = "decisionHistory";
        bus.decisionHistory = [];
      } else if (k === "taskPipeline") {
        currentKey = "taskPipeline";
        bus.taskPipeline = [];
      } else if (k === "pendingInboxTasks") {
        currentKey = "pendingInboxTasks";
        bus.pendingInboxTasks = [];
      } else {
        currentKey = "";
        if (k === "currentIntent") bus.currentIntent = v;
        else if (k === "currentGoal") bus.currentGoal = v;
        else if (k === "activeDepartment") bus.activeDepartment = v;
        else if (k === "activeSecretary") bus.activeSecretary = v;
        else if (k === "previousSecretary") bus.previousSecretary = v;
        else if (k === "createdAt") bus.createdAt = v;
        else if (k === "updatedAt") bus.updatedAt = v;
      }
    }
  }

  if (currentItem) {
    if (currentKey === "decisionHistory") bus.decisionHistory.push(currentItem);
    if (currentKey === "taskPipeline") bus.taskPipeline.push(currentItem);
    if (currentKey === "pendingInboxTasks") {
      bus.pendingInboxTasks = bus.pendingInboxTasks || [];
      bus.pendingInboxTasks.push(currentItem);
    }
  }

  return bus;
}

/**
 * Updates ContextBus parameters
 */
export function updateBus(bus: ContextBus, updates: Partial<ContextBus>): ContextBus {
  return {
    ...bus,
    ...updates,
    updatedAt: new Date().toISOString().split("T")[0]
  };
}

/**
 * Appends a new decision to the decision history
 */
export function pushDecision(
  bus: ContextBus,
  decision: Omit<DecisionNode, "timestamp">
): ContextBus {
  const newNode: DecisionNode = {
    ...decision,
    timestamp: new Date().toISOString()
  };
  return {
    ...bus,
    decisionHistory: [...bus.decisionHistory, newNode],
    updatedAt: new Date().toISOString().split("T")[0]
  };
}

/**
 * Registers or updates a task in the task pipeline
 */
export function pushTask(bus: ContextBus, task: TaskNode): ContextBus {
  const pipeline = [...bus.taskPipeline];
  const idx = pipeline.findIndex(t => t.id === task.id);
  if (idx !== -1) {
    pipeline[idx] = task;
  } else {
    pipeline.push(task);
  }
  return {
    ...bus,
    taskPipeline: pipeline,
    updatedAt: new Date().toISOString().split("T")[0]
  };
}

/**
 * Changes active secretary and logs the transition in decisionHistory
 */
export function switchSecretary(
  bus: ContextBus,
  nextSecretaryId: string,
  reason: string
): ContextBus {
  const secretaryInfo = findSecretary(nextSecretaryId);
  const departmentId = secretaryInfo ? secretaryInfo.departmentId : "executive";

  const updated = pushDecision(bus, {
    from: bus.activeSecretary,
    to: nextSecretaryId,
    reason
  });

  return {
    ...updated,
    previousSecretary: bus.activeSecretary,
    activeSecretary: nextSecretaryId,
    activeDepartment: departmentId
  };
}
