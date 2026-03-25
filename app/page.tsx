import { ThemeToggle } from "@/components/client/theme-toggle";
import { APP_NAME } from "@/lib/constants";
import { LandingHeaderActions } from "@/components/client/landing-header-actions";
import { LandingHeroButtons } from "@/components/client/landing-hero-buttons";

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 hero-mesh opacity-90 dark:opacity-100" />
      <header className="relative z-10 flex items-center justify-between px-3 py-4 md:px-6 md:py-5">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          {APP_NAME}
        </span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LandingHeaderActions />
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-3 pb-20 pt-8 text-center md:px-6 md:pb-24 md:pt-12">
        <p className="mb-4 text-xs uppercase tracking-[0.35em] text-violet-500 dark:text-cyan-400">
          Worker attendance
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Selfie + GPS verification, built for real job sites.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Check-in inside the geofence, capture proof, stream live location to
          admins — server-validated, Vercel Blob storage, Firebase backend.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <LandingHeroButtons />
        </div>

        <div className="mt-20 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
          {[
            { t: "Geofenced check-in", d: "Haversine radius enforced on the server." },
            { t: "Selfie pipeline", d: "WebP compression, Blob URLs in Firestore." },
            { t: "Live tracking", d: "Periodic GPS pings after check-in." },
          ].map((x) => (
            <div
              key={x.t}
              className="glass-panel rounded-2xl p-5 text-left shadow-[0_0_40px_-20px_rgba(139,92,246,0.5)]"
            >
              <p className="font-medium text-foreground">{x.t}</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{x.d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
