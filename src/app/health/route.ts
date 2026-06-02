import { NextResponse } from "next/server";

// Öffentlicher Health-Endpoint für Deploy-Smoke-Tests + Container-Healthcheck.
// Bewusst ohne Auth/DB-Zugriff, damit er auch bei DB-Problemen schnell antwortet.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
