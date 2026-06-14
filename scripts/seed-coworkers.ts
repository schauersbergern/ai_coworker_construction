import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COWORKER_IDS = ["franz"] as const;

/**
 * Backfill: schaltet Franz für alle bestehenden Organisationen frei.
 * Idempotent über die @@unique([orgId, coworkerId])-Constraint (skipDuplicates).
 *
 * Bodo ist bewusst NICHT enthalten: enabledByDefault=false, bis die Risiko-Endpoints live
 * verifiziert sind. Bodo wird pro Org gezielt freigeschaltet (eigene OrgModule-Row mit
 * coworkerId "bodo", enabled: true), erst nach Verifizierung.
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
