import React from "react";
import { findSecretary } from "@/app/lib/config/registry";

interface BreadcrumbsProps {
  activeSecretaryId: string;
}

export default function Breadcrumbs({ activeSecretaryId }: BreadcrumbsProps) {
  const entry = findSecretary(activeSecretaryId);

  const crumbs = ["CEO"];

  if (entry) {
    if (entry.departmentName) {
      crumbs.push(entry.departmentName);
    }
    if (entry.roomName) {
      crumbs.push(entry.roomName);
    }
    if (entry.config && entry.config.name) {
      crumbs.push(entry.config.name.replace(/\s*\(.*\)/, ""));
    }
  } else {
    crumbs.push("役員レイヤー");
  }

  return (
    <div className="flex items-center gap-1.5 text-slate-500 text-xxs tracking-wider uppercase font-medium bg-slate-900/40 px-3 py-1.5 rounded-lg border border-slate-800/60 max-w-fit">
      {crumbs.map((crumb, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span className="text-slate-700 font-semibold select-none">/</span>}
          <span
            className={
              idx === crumbs.length - 1 ? "text-blue-400 font-bold" : "hover:text-slate-300"
            }
          >
            {crumb}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
