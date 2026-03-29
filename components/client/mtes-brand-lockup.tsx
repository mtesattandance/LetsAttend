"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { APP_VENDOR } from "@/lib/constants";
import { MtesThemeMark } from "@/components/mtes-theme-mark";

/** Light: MTES in brand blue (#2A3B8F); dark: red (logo accent). “by Constcode” stays theme foreground. */
const mtesWordClasses = "font-bold text-[#2A3B8F] dark:text-red-500";

type Props = {
  variant?: "hero" | "sidebar" | "header" | "inline";
  className?: string;
  showLogo?: boolean;
  /** Show “by Constcode” under the product name (off for tight inline links). */
  showVendor?: boolean;
};

/**
 * MTES (blue) + Attandance (theme foreground) + optional centered “by Constcode”.
 */
export function MtesBrandLockup({
  variant = "hero",
  className,
  showLogo = true,
  showVendor = true,
}: Props) {
  const isHero = variant === "hero";
  const isSidebar = variant === "sidebar";
  const isHeader = variant === "header";
  const isInline = variant === "inline";

  const titleClass = cn(
    "font-semibold tracking-tight",
    isHero && "text-2xl md:text-3xl",
    isSidebar && "text-base leading-tight",
    isHeader && "text-sm font-semibold leading-tight",
    isInline && "text-sm font-semibold"
  );

  const byClass = cn(
    "text-foreground",
    isHero && "mt-1 text-xs tracking-wide md:text-sm",
    isSidebar && "mt-0.5 text-[10px] tracking-wide",
    isHeader && "mt-0 text-[10px] tracking-wide",
    isInline && "mt-0 text-[10px] tracking-wide"
  );

  const wordmark = (
    <span className={titleClass}>
      <span className={mtesWordClasses}>MTES</span>
      <span className="text-foreground">Attandance</span>
    </span>
  );

  /** Hero: centered stack. Nav (header/sidebar/inline): “by Constcode” flush under the end of “Attandance”. */
  const navStack = !isHero;
  const byline = showVendor ? (
    <p className={cn(byClass, navStack ? "text-right" : "text-center")}>by {APP_VENDOR}</p>
  ) : null;

  const stackedTitle = (
    <div
      className={cn(
        "inline-flex flex-col",
        navStack ? "items-end" : "items-center"
      )}
    >
      {wordmark}
      {byline}
    </div>
  );

  if (isInline) {
    if (!showVendor) {
      return <span className={className}>{wordmark}</span>;
    }
    return (
      <span className={cn("inline-flex flex-col items-end", className)}>
        {wordmark}
        {byline}
      </span>
    );
  }

  if (isHeader) {
    return (
      <div className={cn("flex min-w-0 items-center gap-2.5 md:gap-3", className)}>
        {showLogo ? (
          <MtesThemeMark
            className="h-10 w-10 shrink-0 sm:h-11 sm:w-11 md:h-[3.35rem] md:w-[3.35rem]"
            size={160}
          />
        ) : null}
        <div className="min-w-0">{stackedTitle}</div>
      </div>
    );
  }

  if (isSidebar) {
    return (
      <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
        {showLogo ? (
          <MtesThemeMark className="h-[3.25rem] w-[3.25rem] shrink-0 sm:h-14 sm:w-14" size={160} />
        ) : null}
        <div className="min-w-0 flex-1">{stackedTitle}</div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      {showLogo ? (
        <MtesThemeMark
          className="h-28 w-28 object-contain md:h-32 md:w-32"
          size={256}
          priority
        />
      ) : null}
      <div className={cn("mt-4")}>{stackedTitle}</div>
    </div>
  );
}

/** Home top bar: wordmark + vendor; PNG logo from `md` up only (hidden on mobile). */
export function MtesBrandHeaderLink({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("min-w-0 shrink hover:opacity-90", className)}>
      <MtesBrandLockup variant="header" showLogo />
    </Link>
  );
}
