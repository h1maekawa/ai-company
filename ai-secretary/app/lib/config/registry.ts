import { DEPARTMENTS, Secretary, Department } from "./departments";

export interface RegistryEntry {
  departmentId: string;
  departmentName: string;
  roomId?: string;
  roomName?: string;
  config: Secretary;
}

export const SECRETARY_REGISTRY: Record<string, RegistryEntry> = {};

/**
 * Dynamically builds the flat lookup registry of all secretaries
 */
export function buildRegistry(): Record<string, RegistryEntry> {
  // Clear registry first to allow re-builds if needed
  for (const key in SECRETARY_REGISTRY) {
    delete SECRETARY_REGISTRY[key];
  }

  DEPARTMENTS.forEach(dept => {
    if (dept.secretaries) {
      dept.secretaries.forEach(sec => {
        SECRETARY_REGISTRY[sec.id] = {
          departmentId: dept.id,
          departmentName: dept.name,
          config: sec
        };
      });
    }

    if (dept.rooms) {
      dept.rooms.forEach(room => {
        room.secretaries.forEach(sec => {
          SECRETARY_REGISTRY[sec.id] = {
            departmentId: dept.id,
            departmentName: dept.name,
            roomId: room.id,
            roomName: room.name,
            config: sec
          };
        });
      });
    }
  });

  return SECRETARY_REGISTRY;
}

// Build once on startup
buildRegistry();

/**
 * Find secretary by ID
 */
export function findSecretary(secretaryId: string): RegistryEntry | undefined {
  return SECRETARY_REGISTRY[secretaryId];
}

/**
 * Find all secretaries belonging to a specific department
 */
export function findByDepartment(departmentId: string): RegistryEntry[] {
  return Object.values(SECRETARY_REGISTRY).filter(
    entry => entry.departmentId === departmentId
  );
}



/**
 * Find all secretaries belonging to a specific room
 */
export function findByRoom(roomId: string): RegistryEntry[] {
  return Object.values(SECRETARY_REGISTRY).filter(
    entry => entry.roomId === roomId
  );
}
