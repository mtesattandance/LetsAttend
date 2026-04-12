import { BrowserTimeZoneSync } from "@/components/client/browser-timezone-sync";
import { DashboardChrome } from "@/components/client/dashboard-chrome";
import { CalendarModeProvider } from "@/components/client/calendar-mode-context";
import { DashboardUserProvider } from "@/components/client/dashboard-user-context";
import { OnboardingGate } from "@/components/client/onboarding-gate";
import { WorkspaceAccessGate } from "@/components/client/workspace-access-gate";
import { RequireAuth } from "@/components/client/require-auth";
import { LiveTrackingProvider } from "@/components/client/live-tracking-provider";

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
            <WorkspaceAccessGate>
              <BrowserTimeZoneSync />
              <LiveTrackingProvider>
                <DashboardChrome>{children}</DashboardChrome>
              </LiveTrackingProvider>
            </WorkspaceAccessGate>
          </OnboardingGate>
        </CalendarModeProvider>
      </DashboardUserProvider>
    </RequireAuth>
  );
}
