"use client";

import Link from "next/link";
import { Building2, Clock, LogIn, FileWarning } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const cards = [
  {
    href: "/dashboard/employee/requests/login",
    title: "Login request",
    description: "Workspace access status after onboarding, and resubmit if needed.",
    icon: LogIn,
  },
  {
    href: "/dashboard/employee/requests/overtime",
    title: "Overtime request",
    description: "Request overtime and record approved overtime check-in and check-out.",
    icon: Clock,
  },
  {
    href: "/dashboard/employee/requests/offsite",
    title: "Off-site request",
    description: "Request and manage off-site work with admin approval.",
    icon: Building2,
  },
  {
    href: "/dashboard/employee/requests/manual",
    title: "Late request",
    description: "Request manual timeline adjustment for forgotten scans or missed working days.",
    icon: FileWarning,
  },
] as const;

export function EmployeeRequestsHub() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-3 sm:p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Login access, overtime, and off-site requests are grouped here.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-1">
        {cards.map(({ href, title, description, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="block h-full">
              <Card
                className={cn(
                  "h-full transition-colors hover:border-cyan-500/40 hover:bg-zinc-50/80",
                  "dark:hover:border-cyan-500/30 dark:hover:bg-white/[0.04]"
                )}
              >
                <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <CardTitle className="text-lg">{title}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed">
                      {description}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
