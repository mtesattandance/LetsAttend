"use client";

import Link from "next/link";
import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  ArrowRight,
  ArrowRightLeft,
  Building2,
  ClipboardList,
  Clock,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const actionBtn =
  "min-h-11 min-w-[9.5rem] justify-center gap-2 font-semibold tracking-tight md:min-w-[10.25rem]";

export function LandingHeroButtons() {
  const [signedIn, setSignedIn] = React.useState(false);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => setSignedIn(!!u));
    return () => unsub();
  }, []);

  if (signedIn) {
    return (
      <div className="flex w-full max-w-3xl flex-col items-center gap-4">
        <div className="flex w-full flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className={cn(actionBtn, "shadow-lg shadow-violet-500/25")}>
            <Link href="/dashboard/employee#employee-check-in">
              <LogIn className="size-[1.05rem]" aria-hidden />
              Check in
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className={actionBtn}>
            <Link href="/dashboard/employee#employee-check-out">
              <LogOut className="size-[1.05rem]" aria-hidden />
              Check out
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="lg" variant="outline" className={actionBtn}>
                <Menu className="size-[1.05rem]" aria-hidden />
                Others
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-52">
              <DropdownMenuItem asChild>
                <Link href="/dashboard/employee/overtime" className="flex items-center gap-2">
                  <Clock className="size-4" aria-hidden />
                  Overtime
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/employee#employee-site-switch" className="flex items-center gap-2">
                  <ArrowRightLeft className="size-4" aria-hidden />
                  Switch site
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/employee/offsite" className="flex items-center gap-2">
                  <Building2 className="size-4" aria-hidden />
                  Off-site work
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/employee/friend" className="flex items-center gap-2">
                  <UserPlus className="size-4" aria-hidden />
                  Friend check-in
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/employee/assigned" className="flex items-center gap-2">
                  <ClipboardList className="size-4" aria-hidden />
                  Assigned
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          asChild
          variant="secondary"
          size="sm"
          className="gap-1.5 rounded-full border-zinc-300 px-5 text-zinc-700 dark:text-zinc-200"
        >
          <Link href="/dashboard/employee">
            <LayoutDashboard className="size-3.5 opacity-80" aria-hidden />
            Open full dashboard
            <ArrowRight className="size-3.5 opacity-70" aria-hidden />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <Button asChild size="lg" className={cn(actionBtn, "gap-2 px-10 shadow-lg shadow-violet-500/25")}>
        <Link href="/signup">
          <Sparkles className="size-[1.05rem]" aria-hidden />
          Get started
          <ArrowRight className="size-4 opacity-90" aria-hidden />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className={cn(actionBtn, "px-8")}>
        <Link href="/login">Sign in</Link>
      </Button>
    </div>
  );
}
