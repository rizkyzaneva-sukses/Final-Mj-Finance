CREATE TABLE "IncomeMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeMaster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseType_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "IncomeType" ADD COLUMN "incomeMasterId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "expenseTypeId" TEXT;

CREATE UNIQUE INDEX "IncomeMaster_name_key" ON "IncomeMaster"("name");
CREATE UNIQUE INDEX "ExpenseType_name_key" ON "ExpenseType"("name");

CREATE INDEX "IncomeType_incomeMasterId_idx" ON "IncomeType"("incomeMasterId");
CREATE INDEX "Transaction_expenseTypeId_idx" ON "Transaction"("expenseTypeId");

ALTER TABLE "IncomeType" ADD CONSTRAINT "IncomeType_incomeMasterId_fkey" FOREIGN KEY ("incomeMasterId") REFERENCES "IncomeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_expenseTypeId_fkey" FOREIGN KEY ("expenseTypeId") REFERENCES "ExpenseType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
