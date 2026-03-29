import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[88px] w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-zinc-900 shadow-sm transition-[color,box-shadow,border-color]",
          "placeholder:text-zinc-400",
          "focus-visible:border-cyan-600/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus-visible:border-cyan-400/55 dark:focus-visible:ring-cyan-400/20",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
