CREATE TABLE "_TaskDependencies" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,
    CONSTRAINT "_TaskDependencies_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX "_TaskDependencies_B_index" ON "_TaskDependencies"("B");

ALTER TABLE "_TaskDependencies"
ADD CONSTRAINT "_TaskDependencies_A_fkey"
FOREIGN KEY ("A") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_TaskDependencies"
ADD CONSTRAINT "_TaskDependencies_B_fkey"
FOREIGN KEY ("B") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
