"use client";

import * as React from "react";
import { AdminCreateSiteForm } from "@/components/client/admin-create-site-form";
import { AdminSitesPanel } from "@/components/client/admin-sites-panel";
import { cn } from "@/lib/utils";

export default function AdminSitesPage() {
  const [reloadToken, setReloadToken] = React.useState(0);
  const [tab, setTab] = React.useState<"browse" | "create">("browse");

  return (
    <div className="p-3 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sites</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Browse work locations, geofences, and live activity per site. Create new sites in a separate
          tab.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => setTab("browse")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            tab === "browse"
              ? "bg-white/10 text-white"
              : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
          )}
        >
          All sites
        </button>
        <button
          type="button"
          onClick={() => setTab("create")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            tab === "create"
              ? "bg-white/10 text-white"
              : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
          )}
        >
          Create site
        </button>
      </div>

      {tab === "browse" ? (
        <AdminSitesPanel reloadToken={reloadToken} />
      ) : (
        <AdminCreateSiteForm
          onCreated={() => {
            setReloadToken((n) => n + 1);
            setTab("browse");
          }}
        />
      )}
    </div>
  );
}
