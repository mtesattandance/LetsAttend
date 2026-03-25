/** Must match the email you set in Firestore rules for super admin. */
export const APP_NAME = "LetsAttend";

export function getSuperAdminEmail(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;
}
