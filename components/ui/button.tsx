import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-400/40",
        secondary:
          "border border-zinc-300 bg-white text-zinc-900 shadow-sm hover:bg-zinc-50 hover:border-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-foreground dark:hover:bg-white/10 dark:hover:border-cyan-400/35",
        outline:
          "border-2 border-zinc-300 bg-white text-zinc-900 shadow-sm hover:border-cyan-500/60 hover:bg-zinc-50 hover:shadow-md dark:border-white/15 dark:bg-zinc-950/40 dark:text-foreground dark:hover:border-cyan-400/45 dark:hover:bg-white/10",
        ghost:
          "text-zinc-800 hover:bg-zinc-100 dark:text-foreground dark:hover:bg-white/5",
        destructive: "bg-red-600 text-white hover:bg-red-500",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-xl px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
