import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COWORKER_IDS = ["franz", "bodo"] as const;

/**
 * Backfill: schaltet Franz und Bodo für alle bestehenden Organisationen frei.
 * Idempotent über die @@unique([orgId, coworkerId])-Constraint (skipDuplicates).
 */
async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const data = orgs.flatMap((o) =>
    COWORKER_IDS.map((coworkerId) => ({ orgId: o.id, coworkerId, enabled: true, configVersion: 0 })),
  );
  const result = await prisma.orgModule.createMany({ data, skipDuplicates: true });
  console.log(`seeded ${COWORKER_IDS.join(", ")} across ${orgs.length} orgs (${result.count} new rows)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
