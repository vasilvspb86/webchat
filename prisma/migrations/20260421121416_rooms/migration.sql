-- DropIndex
DROP INDEX "Room_name_key";

-- AlterTable: add nullable first so we can backfill
ALTER TABLE "Room" ADD COLUMN "nameNormalized" TEXT;
ALTER TABLE "Room" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- Backfill nameNormalized for existing rooms (may be empty on fresh DBs)
UPDATE "Room" SET "nameNormalized" = lower(trim("name"));

-- Enforce NOT NULL + uniqueness after backfill
ALTER TABLE "Room" ALTER COLUMN "nameNormalized" SET NOT NULL;
CREATE UNIQUE INDEX "Room_nameNormalized_key" ON "Room"("nameNormalized");

-- Drop the temporary DEFAULT on updatedAt; Prisma manages it from here
ALTER TABLE "Room" ALTER COLUMN "updatedAt" DROP DEFAULT;
