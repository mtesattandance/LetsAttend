"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { formFieldLabelClass } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmployeeCustomSiteModal } from "@/components/client/employee-custom-site-modal";

type Site = { id: string; name?: string };

type Props = {
  label: string;
  sites: Site[];
  value: string;
  onChange: (siteId: string) => void;
  /** Reload sites from `/api/sites` after a custom site is created. */
  onRefreshSites: () => void | Promise<void>;
  /** First `<option value="">` label (default “Select…”). */
  blankOptionLabel?: string;
  selectId?: string;
  selectClassName?: string;
  /** When false, hide “Custom site +” (e.g. employee has no admin-assigned sites yet). */
  showCustomSiteButton?: boolean;
  /** Lock site picker (e.g. single site from assignment deep link). */
  selectDisabled?: boolean;
};

/**
 * Site dropdown with “Custom site +” opening the full-screen create flow.
 */
export function SiteSelectWithCustomRow({
  label,
  sites,
  value,
  onChange,
  onRefreshSites,
  blankOptionLabel = "Select…",
  selectId,
  selectClassName =
    "rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-zinc-900 dark:border-white/10 dark:bg-black/40 dark:text-foreground",
  showCustomSiteButton = true,
  selectDisabled = false,
}: Props) {
  const [modalOpen, setModalOpen] = React.useState(false);

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
          <span className={formFieldLabelClass}>{label}</span>
          <SearchableSelect
            id={selectId}
            value={value}
            onValueChange={onChange}
            disabled={selectDisabled}
            options={sites.map((s) => ({
              value: s.id,
              label: s.name?.trim() ? s.name : s.id,
              keywords: [s.name ?? "", s.id],
            }))}
            emptyLabel={blankOptionLabel}
            searchPlaceholder="Search sites…"
            triggerClassName={selectClassName}
            listClassName="max-h-[min(320px,50vh)]"
          />
        </label>
        {showCustomSiteButton ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full shrink-0 sm:w-auto"
            onClick={() => setModalOpen(true)}
          >
            Custom site +
          </Button>
        ) : null}
      </div>
      {showCustomSiteButton ? (
        <EmployeeCustomSiteModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          onCreated={async (siteId) => {
            await onRefreshSites();
            onChange(siteId);
          }}
        />
      ) : null}
    </>
  );
}
