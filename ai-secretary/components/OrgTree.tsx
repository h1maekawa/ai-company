import React, { useState } from "react";
import { getDepartmentsByCompany, Department, Room, Secretary } from "@/app/lib/config/departments";
import { TaskNode, CompanyType } from "@/app/lib/context/bus";

interface OrgTreeProps {
  activeCompany: CompanyType;
  onChangeCompany: (company: CompanyType) => void;
  activeSecretaryId: string;
  taskPipeline: TaskNode[];
  onSelectSecretary: (id: string) => void;
}

export default function OrgTree({
  activeCompany,
  onChangeCompany,
  activeSecretaryId,
  taskPipeline,
  onSelectSecretary
}: OrgTreeProps) {
  // Expanded departments
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({
    executive: true,
    personal: true,
    crestix: true
  });

  // Expanded rooms (unused in current minimal structure, but kept for compatibility)
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({
    planning: true,
    writing: true,
    marketing: false,
    monetize: false
  });

  const toggleDept = (deptId: string) => {
    setExpandedDepts(prev => ({ ...prev, [deptId]: !prev[deptId] }));
  };

  const toggleRoom = (roomId: string) => {
    setExpandedRooms(prev => ({ ...prev, [roomId]: !prev[roomId] }));
  };

  // Determine status dot dynamically
  const getStatusColor = (secId: string) => {
    if (activeSecretaryId === secId) {
      return { dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]", text: "text-emerald-400 font-semibold" };
    }
    const matchingTasks = taskPipeline.filter(t => t.owner === secId);
    if (matchingTasks.length > 0) {
      if (matchingTasks.some(t => t.status === "blocked")) {
        return { dot: "bg-rose-500 animate-pulse", text: "text-rose-400" };
      }
      if (matchingTasks.some(t => t.status === "in_progress")) {
        return { dot: "bg-amber-500 animate-pulse", text: "text-amber-400" };
      }
      if (matchingTasks.every(t => t.status === "done")) {
        return { dot: "bg-blue-500", text: "text-blue-400" };
      }
    }
    return { dot: "bg-slate-600", text: "text-slate-400 hover:text-slate-300" };
  };

  const visibleDepartments = getDepartmentsByCompany(activeCompany);

  return (
    <div className="w-64 bg-slate-950 border-r border-slate-900 flex flex-col h-full overflow-y-auto">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-slate-900/60">
        <h2 className="text-sm font-bold text-slate-200 tracking-wider uppercase">
          🚀 AI Company OS
        </h2>
        <p className="text-xxs text-slate-500 mt-1">組織図 & 専門秘書一覧</p>
      </div>

      {/* Company Switcher */}
      <div className="px-3 py-2 border-b border-slate-900/60 shrink-0">
        <div className="flex bg-[#0f111a] p-1 rounded-lg border border-slate-900">
          <button
            onClick={() => onChangeCompany("personal")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xxs font-bold transition-all duration-200 ${
              activeCompany === "personal"
                ? "bg-slate-900 text-blue-400 shadow-sm border border-slate-800"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <span>👤</span> Personal
          </button>
          <button
            onClick={() => onChangeCompany("crestix")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xxs font-bold transition-all duration-200 ${
              activeCompany === "crestix"
                ? "bg-slate-900 text-teal-400 shadow-sm border border-slate-800"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <span>🏢</span> Crestix
          </button>
        </div>
      </div>

      {/* Departments List */}
      <div className="flex-1 py-3 px-2 space-y-2">
        {visibleDepartments.map(dept => {
          const isDeptExpanded = expandedDepts[dept.id] ?? true;
          const hasRooms = !!dept.rooms;

          return (
            <div key={dept.id} className="space-y-1">
              {/* Department Header */}
              <button
                onClick={() => toggleDept(dept.id)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-900 transition-colors text-left text-xs font-semibold text-slate-300"
              >
                <div className="flex items-center gap-2">
                  <span>{dept.icon}</span>
                  <span>{dept.name}</span>
                </div>
                <span className="text-slate-500 text-xxs font-normal">
                  {isDeptExpanded ? "▼" : "▶"}
                </span>
              </button>

              {/* Department Contents */}
              {isDeptExpanded && (
                <div className="pl-4 space-y-1 border-l border-slate-900 ml-3">
                  {/* Flat Secretaries (no rooms) */}
                  {dept.secretaries?.map(sec => {
                    const status = getStatusColor(sec.id);
                    const isActive = activeSecretaryId === sec.id;

                    return (
                      <button
                        key={sec.id}
                        onClick={() => onSelectSecretary(sec.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-left text-xs transition-colors ${
                          isActive
                            ? "bg-blue-600/20 text-blue-400 border-l-2 border-blue-500 font-semibold"
                            : "hover:bg-slate-900 text-slate-400"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>
                        <span className="truncate">{sec.name.replace(/\s*\(.*\)/, "")}</span>
                      </button>
                    );
                  })}

                  {/* Rooms */}
                  {hasRooms &&
                    dept.rooms?.map(room => {
                      const isRoomExpanded = expandedRooms[room.id];
                      return (
                        <div key={room.id} className="space-y-1 mt-1">
                          <button
                            onClick={() => toggleRoom(room.id)}
                            className="w-full flex items-center justify-between px-2 py-1 rounded-md hover:bg-slate-900/60 transition-colors text-left text-xxs font-medium text-slate-400"
                          >
                            <span>📁 {room.name}</span>
                            <span className="text-slate-600 text-xxs">
                              {isRoomExpanded ? "▼" : "▶"}
                            </span>
                          </button>

                          {/* Room Secretaries */}
                          {isRoomExpanded && (
                            <div className="pl-3 space-y-1 border-l border-slate-900/60 ml-2">
                              {room.secretaries.map(sec => {
                                const status = getStatusColor(sec.id);
                                const isActive = activeSecretaryId === sec.id;

                                return (
                                  <button
                                    key={sec.id}
                                    onClick={() => onSelectSecretary(sec.id)}
                                    className={`w-full flex items-center gap-2 px-2 py-0.5 rounded text-left text-xxs transition-colors ${
                                      isActive
                                        ? "bg-blue-600/20 text-blue-400 border-l-2 border-blue-500 font-semibold"
                                        : "hover:bg-slate-900 text-slate-400"
                                    }`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${status.dot}`}
                                    ></span>
                                    <span className="truncate">
                                      {sec.name.replace(/\s*\(.*\)/, "")}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
