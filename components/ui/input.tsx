import * as React from "react";
import { cn } from "@/lib/utils";

/** Label styling for auth and dashboard forms (light + dark). */
export const formFieldLabelClass =
  "text-sm font-medium text-zinc-800 dark:text-zinc-200";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-base leading-snug text-zinc-900 shadow-sm transition-[color,box-shadow,border-color]",
          "placeholder:text-zinc-400",
          "focus-visible:border-cyan-600/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus-visible:border-cyan-400/55 dark:focus-visible:ring-cyan-400/20",
          "md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
