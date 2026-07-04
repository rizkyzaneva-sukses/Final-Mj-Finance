ALTER TYPE "ImportStatus" ADD VALUE 'REVIEW';

ALTER TABLE "ImportBatch"
ADD COLUMN "accountHolder" TEXT,
ADD COLUMN "accountNumber" TEXT;

ALTER TABLE "Transaction"
ADD COLUMN "accountHolder" TEXT,
ADD COLUMN "accountNumber" TEXT,
ADD COLUMN "isDraft" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Transaction_isDraft_idx" ON "Transaction"("isDraft");
