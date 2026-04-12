import { Suspense } from "react";
import { AdminRequestsClient } from "@/components/client/admin-requests-client";

export default function AdminRequestsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400" aria-live="polite">
          Loading requests…
        </div>
      }
    >
      <AdminRequestsClient />
    </Suspense>
  );
}
