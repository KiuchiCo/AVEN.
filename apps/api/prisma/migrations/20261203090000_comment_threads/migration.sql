ALTER TABLE "document_comments" ADD COLUMN "blockId" VARCHAR(64), ADD COLUMN "quote" VARCHAR(300), ADD COLUMN "parentId" UUID;
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "document_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "document_comments_parentId_idx" ON "document_comments"("parentId");
