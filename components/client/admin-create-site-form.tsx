"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SiteCreateFormInner } from "@/components/client/site-create-form-inner";

export function AdminCreateSiteForm({
  onCreated,
}: {
  /** Called after a site is created successfully (e.g. refresh list). */
  onCreated?: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create site</CardTitle>
        <CardDescription>
          Search for an address or place, use <strong>Locate me</strong> while on-site, then fine-tune
          the pin on the map (street or satellite). Set radius in meters (e.g. 50–100). Times use{" "}
          <strong>12-hour AM/PM (site local wall time)</strong> in the picker — used for display and
          automatic check-out if someone forgets to check out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SiteCreateFormInner
          appearance="light"
          submitPath="/api/admin/sites"
          onCreated={() => onCreated?.()}
        />
      </CardContent>
    </Card>
  );
}
