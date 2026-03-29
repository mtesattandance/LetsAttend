import * as React from "react";
import { cn } from "@/lib/utils";

function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-zinc-200/90 bg-white/90 p-3 shadow-[0_0_36px_-14px_rgba(34,211,238,0.22)] backdrop-blur-md md:p-6",
        "dark:border-white/10 dark:bg-white/[0.03] dark:shadow-[0_0_40px_-12px_rgba(34,211,238,0.25)]",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 pb-4", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-lg font-semibold leading-none tracking-tight text-zinc-900 dark:text-zinc-50",
        className
      )}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-zinc-500 dark:text-zinc-400", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("pt-0", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
