import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

// Readiness: prüft, ob die DB erreichbar ist (im Gegensatz zu /health = reine Liveness).
// Wird vom Deploy-Smoke-Test genutzt, um zu belegen, dass die App nach dem Deploy
// tatsächlich nutzbar ist. 503, wenn die DB nicht antwortet.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ready" });
  } catch {
    return NextResponse.json({ status: "not-ready" }, { status: 503 });
  }
}
