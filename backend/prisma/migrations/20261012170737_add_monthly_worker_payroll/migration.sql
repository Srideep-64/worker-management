/*
  Warnings:

  - You are about to drop the column `hourly_rate` on the `workers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "workers" DROP COLUMN "hourly_rate";

-- CreateTable
CREATE TABLE "worker_payrolls" (
    "id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "payroll_month" DATE NOT NULL,
    "hourly_rate" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worker_payrolls_worker_id_payroll_month_key" ON "worker_payrolls"("worker_id", "payroll_month");

-- AddForeignKey
ALTER TABLE "worker_payrolls" ADD CONSTRAINT "worker_payrolls_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
