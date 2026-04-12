"use client";

import { EmployeeAssignmentBanner } from "@/components/client/employee-assignment-banner";
import { EmployeeDesignationCard } from "@/components/client/employee-designation-card";
import {
  EmployeeWorkPanels,
  type EmployeeWorkSection,
} from "@/components/client/employee-work-panels";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description: string;
  section: Exclude<EmployeeWorkSection, "full">;
};

/**
 * Single-step employee routes: tight vertical rhythm so the main panel + header
 * usually fits one viewport without stacking duplicate panels (see Work panels).
 */
export function EmployeeWorkRouteShell({ title, description, section }: Props) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-2xl flex-col gap-3 p-3 sm:gap-4 sm:p-4 md:px-6 md:pb-5 md:pt-4"
      )}
    >
      <EmployeeAssignmentBanner />
      <header className="shrink-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400 sm:text-sm">{description}</p>
      </header>
      <div className="shrink-0">
        <EmployeeDesignationCard />
      </div>
      <div className="min-h-0 flex-1">
        <EmployeeWorkPanels section={section} />
      </div>
    </div>
  );
}
