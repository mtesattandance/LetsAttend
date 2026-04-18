import { BrowserTimeZoneSync } from "@/components/client/browser-timezone-sync";
import { DashboardUserProvider } from "@/components/client/dashboard-user-context";
import { LandingTopBar } from "@/components/client/landing-top-bar";
import { LandingHeroButtons } from "@/components/client/landing-hero-buttons";
import { LocalTimezoneClock } from "@/components/client/local-timezone-clock";
import { MtesBrandHeaderLink } from "@/components/client/mtes-brand-lockup";
import { MtesThemeMark } from "@/components/mtes-theme-mark";

export default function HomePage() {
  return (
    <DashboardUserProvider>
      <BrowserTimeZoneSync />
      <div className="relative flex h-screen flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 hero-mesh opacity-90 dark:opacity-100" />
        <header className="relative z-10 flex items-center justify-between gap-3 px-3 py-4 md:px-6 md:py-5">
          <MtesBrandHeaderLink className="max-w-[min(100%,16rem)] md:max-w-lg" />
          <LandingTopBar />
        </header>

        <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-3 pb-20 pt-2 text-center md:px-6 md:pb-24 md:pt-6">
          <div className="mb-8 flex w-full max-w-lg flex-col items-center md:mb-10">
            <MtesThemeMark
              className="hidden md:block md:h-28 md:w-28 object-contain"
              size={256}
              priority
            />
            <div className="mt-4 w-full max-w-md space-y-1.5 px-1">
              <p className="text-center text-[10px] font-semibold uppercase leading-snug tracking-[0.14em] text-zinc-600 dark:text-zinc-400 md:text-xs md:tracking-[0.2em]">
                Mass Technology and Engineering
              </p>
              <p className="text-center text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-500 md:text-[11px] md:tracking-[0.28em]">
                Solution Pvt Ltd
              </p>
            </div>
          </div>

          <p className="mb-3 text-[10px] uppercase tracking-[0.28em] text-violet-500 dark:text-cyan-400 md:mb-4 md:text-xs md:tracking-[0.35em]">
            Workplace attendance
          </p>
          <h1 className="max-w-3xl text-balance text-xl font-semibold leading-snug tracking-tight text-zinc-900 sm:text-2xl sm:leading-snug md:text-4xl md:leading-tight lg:text-5xl dark:text-zinc-50">
            <span className="md:hidden">
            Track Site Work.
            </span>
            <span className="hidden md:block">
            Track Site Work
            </span>
          </h1>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <LandingHeroButtons />
          </div>

          <LocalTimezoneClock className="mt-14 max-w-lg" />


        </main>
      </div>
    </DashboardUserProvider>
  );
}
