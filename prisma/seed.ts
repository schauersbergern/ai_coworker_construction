import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orgName = process.env.SEED_ORG_NAME ?? "Pilot-Büro";
  const email = (process.env.SEED_USER_EMAIL ?? "pilot@example.com").toLowerCase();

  const org = await prisma.organization.upsert({
    where: { id: "seed-pilot-org" },
    update: { name: orgName },
    create: { id: "seed-pilot-org", name: orgName },
  });

  await prisma.user.upsert({
    where: { email },
    update: { orgId: org.id },
    create: { email, orgId: org.id },
  });

  console.log(`Seeded org "${orgName}" with user ${email}`);
}

main().finally(() => prisma.$disconnect());
