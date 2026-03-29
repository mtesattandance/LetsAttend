import Image from "next/image";
import { cn } from "@/lib/utils";

const LOGO_LIGHT = "/branding/mtes-logo.png";
const LOGO_DARK = "/mtes-logo-red.png";

type Props = {
  className?: string;
  /** Intrinsic size hint for Next/Image (square source assets). */
  size?: number;
  priority?: boolean;
  alt?: string;
};

/**
 * MTES mark: default logo in light mode, red-on-dark mark in dark mode.
 * Wrapper keeps a square box so aspect ratio stays consistent.
 */
export function MtesThemeMark({
  className,
  size = 128,
  priority = false,
  alt = "MTES",
}: Props) {
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)}>
      <Image
        src={LOGO_LIGHT}
        alt={alt}
        width={size}
        height={size}
        priority={priority}
        className="h-full w-full object-contain dark:hidden"
      />
      <Image
        src={LOGO_DARK}
        alt={alt}
        width={size}
        height={size}
        priority={priority}
        className="hidden h-full w-full object-contain dark:block"
      />
    </span>
  );
}
