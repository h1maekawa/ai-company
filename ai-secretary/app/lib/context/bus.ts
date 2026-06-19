import { CompanyType } from "../config/projects";
import { findSecretary } from "../config/registry";

export type { CompanyType };

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
  projectId?: string;
};

export type InboxItem = {
  id: string;
  rawText: string;
  approvalStatus: "pending" | "approved" | "rejected";
  createdAt: string;
  company?: CompanyType;

  // PMO MVP fields
  type?: "task" | "idea" | "decision";
  title?: string;
  content?: string;
  suggestedDepartment?: string;
  suggestedSecretary?: string;
  priority?: "S" | "A" | "B";
  projectId?: string;
};

export type CompanyBus = {
  currentIntent: string;
  currentGoal: string;
  activeDepartment: string;
  activeSecretary: string;
  previousSecretary?: string;
  decisionHistory: DecisionNode[];
  taskPipeline: TaskNode[];
  inboxQueue: InboxItem[];
  updatedAt: string;
};

export type ContextBus = {
  activeCompany: CompanyType;
  personal: CompanyBus;
  crestix?: CompanyBus; // For backward compatibility
  company: CompanyBus;
  createdAt: string;
  updatedAt: string;
  meta?: {
    schemaVersion: number;
  };
};

/**
 * Creates an empty CompanyBus with defaults
 */
export function createDefaultCompanyBus(defaultSecretary: string = "executive-assistant"): CompanyBus {
  const now = new Date().toISOString().split("T")[0];
  return {
    currentIntent: "",
    currentGoal: "",
    activeDepartment: "executive",
    activeSecretary: defaultSecretary,
    previousSecretary: "",
    decisionHistory: [],
    taskPipeline: [],
    inboxQueue: [],
    updatedAt: now,
  };
}

/**
 * Creates an empty ContextBus with defaults
 */
export function createDefaultBus(): ContextBus {
  const now = new Date().toISOString().split("T")[0];
  const companyBus = createDefaultCompanyBus("company-system");
  return {
    activeCompany: "personal",
    personal: createDefaultCompanyBus("personal-note"),
    company: companyBus,
    crestix: companyBus,
    createdAt: now,
    updatedAt: now,
    meta: {
      schemaVersion: 2
    }
  };
}

/**
 * Serialize ContextBus to JSON string (for storage)
 */
export function serializeBus(bus: ContextBus): string {
  return JSON.stringify(bus, null, 2);
}

/**
 * Parse ContextBus from JSON string
 */
export function parseBus(json: string): ContextBus {
  try {
    const parsed = JSON.parse(json);
    const defaultBus = createDefaultBus();

    // Auto-migration check: schemaVersion missing or < 2
    if (!parsed.meta?.schemaVersion || parsed.meta.schemaVersion < 2) {
      if (parsed.crestix && !parsed.company) {
        parsed.company = parsed.crestix;
      }
      parsed.meta = {
        ...parsed.meta,
        schemaVersion: 2
      };
      if (parsed.activeCompany === "crestix") {
        parsed.activeCompany = "company";
      }
    }

    const personalData = parsed.personal;
    const companyData = parsed.company ?? parsed.crestix;

    const mergedCompany = {
      ...defaultBus.company,
      ...companyData,
      decisionHistory: companyData?.decisionHistory ?? [],
      taskPipeline: companyData?.taskPipeline ?? [],
      inboxQueue: companyData?.inboxQueue ?? [],
    };

    return {
      activeCompany: parsed.activeCompany ?? defaultBus.activeCompany,
      personal: {
        ...defaultBus.personal,
        ...personalData,
        decisionHistory: personalData?.decisionHistory ?? [],
        taskPipeline: personalData?.taskPipeline ?? [],
        inboxQueue: personalData?.inboxQueue ?? [],
      },
      company: mergedCompany,
      crestix: mergedCompany, // Keep crestix synchronized
      createdAt: parsed.createdAt ?? defaultBus.createdAt,
      updatedAt: parsed.updatedAt ?? defaultBus.updatedAt,
      meta: parsed.meta ?? defaultBus.meta,
    };
  } catch (e) {
    console.error("[bus] Failed to parse ContextBus JSON, using default:", e);
    return createDefaultBus();
  }
}

/**
 * Get the active CompanyBus based on activeCompany
 */
export function getActiveBus(bus: ContextBus): CompanyBus {
  return bus.activeCompany === "company" || bus.activeCompany === "crestix"
    ? (bus.company ?? bus.crestix ?? createDefaultCompanyBus("company-system"))
    : bus.personal;
}

/**
 * Update the active CompanyBus
 */
export function setActiveBus(bus: ContextBus, companyBus: CompanyBus): ContextBus {
  const now = new Date().toISOString().split("T")[0];
  const isCompany = bus.activeCompany === "company" || bus.activeCompany === "crestix";
  return {
    ...bus,
    company: isCompany ? companyBus : bus.company,
    crestix: isCompany ? companyBus : bus.crestix,
    personal: !isCompany ? companyBus : bus.personal,
    updatedAt: now,
  };
}

/**
 * Updates ContextBus parameters
 */
export function updateBus(bus: ContextBus, updates: Partial<ContextBus>): ContextBus {
  return {
    ...bus,
    ...updates,
    updatedAt: new Date().toISOString().split("T")[0],
  };
}

/**
 * Appends a new decision to the active company's decision history
 */
export function pushDecision(
  bus: ContextBus,
  decision: Omit<DecisionNode, "timestamp">
): ContextBus {
  const newNode: DecisionNode = {
    ...decision,
    timestamp: new Date().toISOString(),
  };
  const activeBus = getActiveBus(bus);
  const updatedCompanyBus: CompanyBus = {
    ...activeBus,
    decisionHistory: [...activeBus.decisionHistory, newNode],
    updatedAt: new Date().toISOString().split("T")[0],
  };
  return setActiveBus(bus, updatedCompanyBus);
}

/**
 * Registers or updates a task in the active company's task pipeline
 */
export function pushTask(bus: ContextBus, task: TaskNode): ContextBus {
  const activeBus = getActiveBus(bus);
  const pipeline = [...activeBus.taskPipeline];
  const idx = pipeline.findIndex((t) => t.id === task.id);
  if (idx !== -1) {
    pipeline[idx] = task;
  } else {
    pipeline.push(task);
  }
  const updatedCompanyBus: CompanyBus = {
    ...activeBus,
    taskPipeline: pipeline,
    updatedAt: new Date().toISOString().split("T")[0],
  };
  return setActiveBus(bus, updatedCompanyBus);
}

/**
 * Changes active secretary in the active company's bus and logs the transition
 */
export function switchSecretary(
  bus: ContextBus,
  nextSecretaryId: string,
  reason: string
): ContextBus {
  const secretaryInfo = findSecretary(nextSecretaryId);
  const departmentId = secretaryInfo ? secretaryInfo.departmentId : "executive";

  const activeBus = getActiveBus(bus);
  const newDecision: DecisionNode = {
    timestamp: new Date().toISOString(),
    from: activeBus.activeSecretary,
    to: nextSecretaryId,
    reason,
  };

  const updatedCompanyBus: CompanyBus = {
    ...activeBus,
    previousSecretary: activeBus.activeSecretary,
    activeSecretary: nextSecretaryId,
    activeDepartment: departmentId,
    decisionHistory: [...activeBus.decisionHistory, newDecision],
    updatedAt: new Date().toISOString().split("T")[0],
  };

  return setActiveBus(bus, updatedCompanyBus);
}
