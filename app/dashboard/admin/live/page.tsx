import { LiveWorkersMap } from "@/components/client/map/live-workers-map";

export default function AdminLivePage() {
  return (
    <div className="p-3 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Live map</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Worker GPS from the last few minutes (refreshes automatically).
        </p>
      </div>
      <LiveWorkersMap />
    </div>
  );
}
