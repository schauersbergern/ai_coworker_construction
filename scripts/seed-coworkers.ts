import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Backfill: schaltet Franz für alle bestehenden Organisationen frei.
 * Idempotent über die @@unique([orgId, coworkerId])-Constraint (skipDuplicates).
 */
async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const result = await prisma.orgModule.createMany({
    data: orgs.map((o) => ({ orgId: o.id, coworkerId: "franz", enabled: true, configVersion: 0 })),
    skipDuplicates: true,
  });
  console.log(`seeded franz for ${result.count}/${orgs.length} orgs`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
