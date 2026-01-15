-- CreateTable
CREATE TABLE "ClickStat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "lastClickAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClickStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClickStat_userId_idx" ON "ClickStat"("userId");

-- CreateIndex
CREATE INDEX "ClickStat_siteId_idx" ON "ClickStat"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "ClickStat_userId_siteId_key" ON "ClickStat"("userId", "siteId");

-- AddForeignKey
ALTER TABLE "ClickStat" ADD CONSTRAINT "ClickStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
