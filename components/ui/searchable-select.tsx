"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = { value: string; label: string };

export type SearchableSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  /** Adds a first row with empty value (default true for most pickers). */
  includeEmpty?: boolean;
  emptyLabel?: string;
  searchPlaceholder?: string;
  emptySearchMessage?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  /** Extra classes on PopoverContent (e.g. z-[2000] above Leaflet). */
  popoverContentClassName?: string;
  /** Override list max-height inside CommandList */
  listClassName?: string;
  /** Set false for overlays (e.g. map) so focus isn’t trapped. */
  popoverModal?: boolean;
  /** Hide chevron (e.g. compact time pickers). */
  showChevron?: boolean;
  /** When true, do not move focus into the popover on open (e.g. map overlays). Default: focus search for reliable selection. */
  suppressInitialFocus?: boolean;
  /** Forward to cmdk `Command` — set false for small fixed lists (e.g. hour/minute). */
  shouldFilter?: boolean;
};

export function SearchableSelect({
  value,
  onValueChange,
  options,
  includeEmpty = true,
  emptyLabel = "Select…",
  searchPlaceholder = "Search…",
  emptySearchMessage = "No matches.",
  disabled,
  id,
  "aria-label": ariaLabel,
  className,
  triggerClassName,
  contentClassName,
  align = "start",
  side = "bottom",
  sideOffset = 6,
  popoverContentClassName,
  listClassName,
  popoverModal = true,
  showChevron = true,
  suppressInitialFocus = false,
  shouldFilter = true,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);

  const rows = React.useMemo(() => {
    const base = includeEmpty ? [{ value: "", label: emptyLabel }, ...options] : [...options];
    return base;
  }, [includeEmpty, emptyLabel, options]);

  const selectedLabel = React.useMemo(() => {
    const hit = rows.find((r) => r.value === value);
    return hit?.label ?? emptyLabel;
  }, [rows, value, emptyLabel]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={popoverModal}>
      <div className={cn("w-full", className)}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="secondary"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              "h-auto min-h-10 w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2 font-normal text-zinc-900 hover:bg-zinc-50",
              "dark:border-white/10 dark:bg-zinc-950/80 dark:text-zinc-50 dark:hover:bg-zinc-900/80",
              showChevron ? "justify-between" : "justify-center",
              !value && includeEmpty && "text-zinc-500 dark:text-zinc-400",
              triggerClassName
            )}
          >
            <span
              className={cn(
                "line-clamp-2 min-w-0 text-sm",
                showChevron ? "flex-1 text-left" : "text-center"
              )}
            >
              {selectedLabel}
            </span>
            {showChevron ? (
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
            ) : null}
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn("p-0", contentClassName, popoverContentClassName)}
        onOpenAutoFocus={suppressInitialFocus ? (e) => e.preventDefault() : undefined}
      >
        <Command shouldFilter={shouldFilter}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className={listClassName}>
            <CommandEmpty>{emptySearchMessage}</CommandEmpty>
            <CommandGroup>
              {rows.map((opt) => (
                <CommandItem
                  key={opt.value === "" ? "__empty__" : opt.value}
                  value={`${opt.label} ${opt.value}`}
                  onSelect={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4 shrink-0",
                      value === opt.value ? "opacity-100" : "opacity-0"
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
