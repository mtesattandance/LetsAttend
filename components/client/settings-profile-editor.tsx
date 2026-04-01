"use client";

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Input, formFieldLabelClass } from "@/components/ui/input";

function hasEmailPasswordProvider(): boolean {
  const u = getFirebaseAuth().currentUser;
  if (!u) return false;
  return u.providerData.some((p) => p.providerId === "password");
}

export function SettingsProfileEditor() {
  const { user, loading, refresh } = useDashboardUser();
  const [name, setName] = React.useState("");
  const [designation, setDesignation] = React.useState("");
  const [nameMsg, setNameMsg] = React.useState<string | null>(null);
  const [nameBusy, setNameBusy] = React.useState(false);

  const [emailNew, setEmailNew] = React.useState("");
  const [emailPwd, setEmailPwd] = React.useState("");
  const [emailMsg, setEmailMsg] = React.useState<string | null>(null);
  const [emailBusy, setEmailBusy] = React.useState(false);

  const [pwdCurrent, setPwdCurrent] = React.useState("");
  const [pwdNew, setPwdNew] = React.useState("");
  const [pwdConfirm, setPwdConfirm] = React.useState("");
  const [pwdMsg, setPwdMsg] = React.useState<string | null>(null);
  const [pwdBusy, setPwdBusy] = React.useState(false);

  React.useEffect(() => {
    if (user?.name) setName(user.name);
    setDesignation(user?.designation ?? "");
  }, [user?.designation, user?.name]);

  const saveName = async () => {
    setNameMsg(null);
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u || !user) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameMsg("Name cannot be empty.");
      return;
    }
    setNameBusy(true);
    try {
      const db = getFirebaseDb();
      await updateDoc(doc(db, "users", u.uid), {
        name: trimmed,
        designation: designation.trim(),
      });
      refresh();
      setNameMsg("Name saved.");
    } catch {
      setNameMsg("Could not save name.");
    } finally {
      setNameBusy(false);
    }
  };

  const changeEmail = async () => {
    setEmailMsg(null);
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u || !user) return;
    if (!u.email) {
      setEmailMsg("No email on this account.");
      return;
    }
    if (!hasEmailPasswordProvider()) {
      setEmailMsg("Email change requires an email/password sign-in. Use Google account settings or contact an admin.");
      return;
    }
    const next = emailNew.trim().toLowerCase();
    if (!next || next === user.email) {
      setEmailMsg("Enter a new email different from the current one.");
      return;
    }
    if (!emailPwd) {
      setEmailMsg("Enter your current password to confirm.");
      return;
    }
    setEmailBusy(true);
    try {
      const cred = EmailAuthProvider.credential(u.email, emailPwd);
      await reauthenticateWithCredential(u, cred);
      await verifyBeforeUpdateEmail(u, next);
      setEmailMsg(
        "Verification email sent to the new address. After you confirm, sign in again; your profile email will sync automatically."
      );
      setEmailNew("");
      setEmailPwd("");
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
      setEmailMsg(
        code === "auth/wrong-password"
          ? "Wrong password."
          : code === "auth/requires-recent-login"
            ? "Please sign out and sign in again, then retry."
            : "Could not start email change. Check the new email is valid."
      );
    } finally {
      setEmailBusy(false);
    }
  };

  const changePassword = async () => {
    setPwdMsg(null);
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u || !user) return;
    if (!u.email) {
      setPwdMsg("No email on this account.");
      return;
    }
    if (!hasEmailPasswordProvider()) {
      setPwdMsg("Password change is only for email/password accounts.");
      return;
    }
    if (pwdNew.length < 8) {
      setPwdMsg("New password must be at least 8 characters.");
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdMsg("New passwords do not match.");
      return;
    }
    setPwdBusy(true);
    try {
      const cred = EmailAuthProvider.credential(u.email, pwdCurrent);
      await reauthenticateWithCredential(u, cred);
      await updatePassword(u, pwdNew);
      setPwdMsg("Password updated.");
      setPwdCurrent("");
      setPwdNew("");
      setPwdConfirm("");
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
      setPwdMsg(code === "auth/wrong-password" ? "Wrong current password." : "Could not update password.");
    } finally {
      setPwdBusy(false);
    }
  };

  if (loading || !user) {
    return (
      <Card className="md:col-span-2">
        <CardContent className="space-y-3 pt-6" aria-hidden>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="md:min-h-0">
        <CardHeader>
          <CardTitle>Edit name</CardTitle>
          <CardDescription>Updates your display name in MTESAttandance.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className={formFieldLabelClass}>Full name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className={formFieldLabelClass}>Designation</span>
            <Input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Electrician"
              autoComplete="organization-title"
            />
          </label>
          {nameMsg ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{nameMsg}</p>
          ) : null}
          <Button type="button" disabled={nameBusy} onClick={() => void saveName()}>
            {nameBusy ? "Saving…" : "Save name"}
          </Button>
        </CardContent>
      </Card>

      <Card className="md:min-h-0">
        <CardHeader>
          <CardTitle>Change email</CardTitle>
          <CardDescription>
            We send a verification link to the new address. Firebase never stores
            passwords in plain text — admins cannot “read” your password.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-zinc-500">Current: {user.email}</p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className={formFieldLabelClass}>New email</span>
            <Input
              type="email"
              value={emailNew}
              onChange={(e) => setEmailNew(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className={formFieldLabelClass}>Current password</span>
            <Input
              type="password"
              value={emailPwd}
              onChange={(e) => setEmailPwd(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {emailMsg ? (
            <p className="text-sm font-medium text-cyan-800 dark:text-cyan-300">{emailMsg}</p>
          ) : null}
          <Button type="button" variant="secondary" disabled={emailBusy} onClick={() => void changeEmail()}>
            {emailBusy ? "Sending…" : "Send verification to new email"}
          </Button>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Requires your current password. If you forgot it, use “Forgot password”
            on the login page or ask an admin for a reset link.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className={formFieldLabelClass}>Current password</span>
            <Input
              type="password"
              value={pwdCurrent}
              onChange={(e) => setPwdCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className={formFieldLabelClass}>New password</span>
            <Input
              type="password"
              value={pwdNew}
              onChange={(e) => setPwdNew(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className={formFieldLabelClass}>Confirm new password</span>
            <Input
              type="password"
              value={pwdConfirm}
              onChange={(e) => setPwdConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {pwdMsg ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{pwdMsg}</p>
          ) : null}
          <Button type="button" variant="secondary" disabled={pwdBusy} onClick={() => void changePassword()}>
            {pwdBusy ? "Updating…" : "Update password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
