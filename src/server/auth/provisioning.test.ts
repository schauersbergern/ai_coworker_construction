import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { isProvisionedEmail } from "./provisioning";

describe("isProvisionedEmail", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  });

  it("returns false for an unknown email (kein Link)", async () => {
    expect(await isProvisionedEmail("unknown@example.com")).toBe(false);
  });

  it("returns false for a user without an org", async () => {
    await prisma.user.create({ data: { email: "no-org@example.com" } });
    expect(await isProvisionedEmail("no-org@example.com")).toBe(false);
  });

  it("returns true for a user assigned to an org", async () => {
    const org = await prisma.organization.create({ data: { name: "Büro" } });
    await prisma.user.create({ data: { email: "ok@example.com", orgId: org.id } });
    expect(await isProvisionedEmail("ok@example.com")).toBe(true);
  });

  it("is case-insensitive on the email", async () => {
    const org = await prisma.organization.create({ data: { name: "Büro" } });
    await prisma.user.create({ data: { email: "mix@example.com", orgId: org.id } });
    expect(await isProvisionedEmail("MIX@example.com")).toBe(true);
  });
});
