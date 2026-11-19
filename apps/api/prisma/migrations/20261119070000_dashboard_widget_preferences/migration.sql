-- Widgets a member has hidden on their Home dashboard. Empty means all widgets are shown.
ALTER TABLE "users" ADD COLUMN "dashboardHiddenWidgets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
