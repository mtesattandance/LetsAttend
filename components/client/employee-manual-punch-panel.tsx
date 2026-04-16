"use client";

import * as React from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateField } from "@/components/ui/date-field";
import { getBrowserTimeZone } from "@/lib/date/time-zone";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Loader2, Send } from "lucide-react";

type Assignee = { id: string; name: string; email: string; role: string };
type Site = { id: string; name: string };
type Segment = { id: string; siteId: string; inHm: string; outHm: string };

export function EmployeeManualPunchPanel() {
  const [assignees, setAssignees] = React.useState<Assignee[]>([]);
  const [sites, setSites] = React.useState<Site[]>([]);
  const [loadingInitial, setLoadingInitial] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  const [date, setDate] = React.useState("");
  const [assigneeId, setAssigneeId] = React.useState("");
  const [reason, setReason] = React.useState("");
  
  const [segments, setSegments] = React.useState<Segment[]>([
    { id: "init", siteId: "", inHm: "09:00", outHm: "18:00" },
  ]);

  const tz = React.useMemo(() => getBrowserTimeZone(), []);

  React.useEffect(() => {
    let active = true;
    async function load() {
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) return;
        const token = await u.getIdToken();
        const hdrs = { Authorization: `Bearer ${token}` };

        const [resA, resS] = await Promise.all([
          fetch("/api/offsite-work/assignees", { headers: hdrs }),
          fetch("/api/sites", { headers: hdrs }),
        ]);
        const dataA = await resA.json();
        const dataS = await resS.json();

        if (active) {
          if (dataA.assignees) setAssignees(dataA.assignees);
          if (dataS.sites) setSites(dataS.sites);
        }
      } catch (e) {
        toast.error("Failed to load initial data");
      } finally {
        if (active) setLoadingInitial(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const handleAddSegment = () => {
    setSegments((p) => [
      ...p,
      { id: Math.random().toString(), siteId: "", inHm: "12:00", outHm: "18:00" },
    ]);
  };

  const handleRemoveSegment = (idx: number) => {
    setSegments((p) => p.filter((_, i) => i !== idx));
  };

  const handleChangeSegment = (idx: number, key: keyof Segment, val: string) => {
    setSegments((p) => {
      const copy = [...p];
      copy[idx] = { ...copy[idx], [key]: val };
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return toast.error("Select a date");
    if (!assigneeId) return toast.error("Select an admin to approve this");
    if (reason.trim().length < 3) return toast.error("Write a short reason");
    if (segments.length === 0) return toast.error("Add at least one work block");

    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (!s.siteId) return toast.error(`Select site for block ${i + 1}`);
      if (!s.inHm || !s.outHm) return toast.error(`Set in/out times for block ${i + 1}`);
    }

    setSubmitting(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const payload = {
        date,
        assigneeAdminUid: assigneeId,
        reason: reason.trim(),
        segments: segments.map((s) => ({
          siteId: s.siteId,
          inHm: s.inHm,
          outHm: s.outHm,
        })),
      };

      const res = await fetch("/api/manual-punch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit request");

      toast.success("Late request submitted!");
      setDate("");
      setReason("");
      setSegments([{ id: Math.random().toString(), siteId: "", inHm: "09:00", outHm: "18:00" }]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInitial) {
    return <div className="text-sm text-zinc-500">Loading form...</div>;
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <DateField
                id="manual-punch-date"
                label="Date of Missing Punch"
                value={date}
                onChange={setDate}
                timeZone={tz}
              />
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Assign to Admin <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  value={assigneeId}
                  onValueChange={setAssigneeId}
                  options={assignees.map((a) => ({
                    value: a.id,
                    label: a.name || a.email,
                    keywords: [a.name, a.email, a.role],
                  }))}
                  emptyLabel="Select admin..."
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Forgot to punch out because phone died."
                className="h-20 w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-white/10 dark:bg-zinc-900/50 dark:text-white"
              />
            </div>
          </CardContent>
        </Card>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Work Segments / Timeline
            </h2>
            <Button type="button" variant="outline" size="sm" onClick={handleAddSegment}>
              <Plus className="mr-1.5 size-4" /> Add Block
            </Button>
          </div>
          <div className="space-y-3">
            {segments.map((seg, i) => (
              <Card key={seg.id}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Work Site (Block {i + 1})
                    </label>
                    <SearchableSelect
                      value={seg.siteId}
                      onValueChange={(val) => handleChangeSegment(i, "siteId", val)}
                      options={sites.map((s) => ({
                        value: s.id,
                        label: s.name,
                        keywords: [s.name],
                      }))}
                      emptyLabel="Select site..."
                    />
                  </div>
                  <div className="w-full sm:w-32">
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={seg.inHm}
                      onChange={(e) => handleChangeSegment(i, "inHm", e.target.value)}
                      className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-white/10 dark:bg-zinc-900/50 dark:text-white"
                    />
                  </div>
                  <div className="w-full sm:w-32">
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={seg.outHm}
                      onChange={(e) => handleChangeSegment(i, "outHm", e.target.value)}
                      className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 dark:border-white/10 dark:bg-zinc-900/50 dark:text-white"
                    />
                  </div>
                  {segments.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveSegment(i)}
                      className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            If you switched sites, add multiple blocks in chronological order. Your final block's
            End Time counts as your Check-Out.
          </p>
        </div>

        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
          Submit Late Request
        </Button>
      </form>
    </div>
  );
}
