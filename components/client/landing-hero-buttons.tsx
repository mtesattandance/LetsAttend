"use client";

import Link from "next/link";
import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";

export function LandingHeroButtons() {
  const [signedIn, setSignedIn] = React.useState(false);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => setSignedIn(!!u));
    return () => unsub();
  }, []);

  if (signedIn) {
    return (
      <Button asChild size="lg">
        <Link href="/dashboard/employee">Open dashboard</Link>
      </Button>
    );
  }

  return (
    <Button asChild size="lg">
      <Link href="/signup">Get started</Link>
    </Button>
  );
}

