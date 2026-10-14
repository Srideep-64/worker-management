-- AlterTable
ALTER TABLE "workers" ADD COLUMN     "hourly_rate" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "advance_payments" (
    "id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "payroll_month" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advance_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "advance_payments_worker_id_payroll_month_idx" ON "advance_payments"("worker_id", "payroll_month");

-- AddForeignKey
ALTER TABLE "advance_payments" ADD CONSTRAINT "advance_payments_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
