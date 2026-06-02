/**
 * Zugriffs-Allowlist aus der Umgebung. Nur E-Mails in ALLOWED_EMAILS (kommasepariert)
 * dürfen sich via Google anmelden. Ersetzt das frühere DB-Provisioning.
 */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.toLowerCase());
}
