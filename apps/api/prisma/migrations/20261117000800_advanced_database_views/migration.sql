ALTER TYPE "DatabaseViewLayout" ADD VALUE 'LIST';
ALTER TYPE "DatabaseViewLayout" ADD VALUE 'TIMELINE';
ALTER TYPE "DatabaseViewLayout" ADD VALUE 'CHART';

ALTER TABLE "database_views"
ADD COLUMN "chartPropertyId" VARCHAR(80) NOT NULL DEFAULT '';
