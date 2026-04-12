/** Same deep link as the bell “Go to Work” (assignment-focused check-in on Work). */
export function workCheckInHrefFromAssignedSiteIds(assignedSiteIds: string[]): string {
  const params = new URLSearchParams();
  params.set("fromAssignment", "1");
  if (assignedSiteIds.length > 0) {
    params.set("assignmentSites", assignedSiteIds.join(","));
  }
  return `/dashboard/employee/check-in?${params.toString()}`;
}
