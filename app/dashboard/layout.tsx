import { BrowserTimeZoneSync } from "@/components/client/browser-timezone-sync";
import { DashboardChrome } from "@/components/client/dashboard-chrome";
import { CalendarModeProvider } from "@/components/client/calendar-mode-context";
import { DashboardUserProvider } from "@/components/client/dashboard-user-context";
import { OnboardingGate } from "@/components/client/onboarding-gate";
import { RequireAuth } from "@/components/client/require-auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <DashboardUserProvider>
        <CalendarModeProvider>
          <OnboardingGate>
            <BrowserTimeZoneSync />
            <DashboardChrome>{children}</DashboardChrome>
          </OnboardingGate>
        </CalendarModeProvider>
      </DashboardUserProvider>
    </RequireAuth>
  );
}
