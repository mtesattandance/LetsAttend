"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDashboardUser } from "@/components/client/dashboard-user-context";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useDashboardUser();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (loading || !user) return;
    const needsOnboarding =
      user.role === "employee" &&
      (!user.designation?.trim() || !user.employeeId?.trim());
    const onOnboardingPage = pathname?.startsWith("/dashboard/onboarding") ?? false;
    if (needsOnboarding && !onOnboardingPage) {
      router.replace("/dashboard/onboarding");
      return;
    }
    if (!needsOnboarding && onOnboardingPage) {
      router.replace("/dashboard/employee/check-in");
    }
  }, [loading, pathname, router, user]);

  return <>{children}</>;
}
