CREATE TYPE "DatabaseViewLayout" AS ENUM ('TABLE', 'BOARD');

ALTER TABLE "database_views"
ADD COLUMN "layout" "DatabaseViewLayout" NOT NULL DEFAULT 'TABLE',
ADD COLUMN "groupByPropertyId" VARCHAR(80) NOT NULL DEFAULT 'status';
