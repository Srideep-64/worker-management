-- CreateEnum
CREATE TYPE "WorkRecordSource" AS ENUM ('TIMESHEET', 'MANUAL');

-- DropForeignKey
ALTER TABLE "work_records" DROP CONSTRAINT "work_records_upload_id_fkey";

-- AlterTable
ALTER TABLE "work_records" ADD COLUMN     "source" "WorkRecordSource" NOT NULL DEFAULT 'TIMESHEET',
ALTER COLUMN "upload_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "timesheet_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
