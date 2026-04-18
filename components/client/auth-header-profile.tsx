"use client";

import Link from "next/link";
import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { nameToInitials } from "@/lib/profile/initials";
import { cn } from "@/lib/utils";

export function AuthHeaderProfile() {
  const [name, setName] = React.useState<string | null>(null);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (u) => {
      setName(u?.displayName || u?.email?.split("@")[0] || null);
    });
  }, []);

  if (!name) return null;

  return (
    <Link
      href="/dashboard/settings"
      className={cn(
        "mr-2 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-sm",
        "hover:bg-white/10"
      )}
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-xs font-semibold text-white">
        {nameToInitials(name)}
      </span>
      <span className="hidden max-w-[100px] truncate sm:inline">{name}</span>
      <span className="sm:hidden ml-1 max-w-[60px] truncate text-xs">{name.split(" ")[0]?.slice(0, 6)}</span>
    </Link>
  );
}
