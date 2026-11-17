ALTER TYPE "DatabaseViewLayout" ADD VALUE 'CALENDAR';

ALTER TABLE "database_views"
ADD COLUMN "datePropertyId" VARCHAR(80) NOT NULL DEFAULT '';
