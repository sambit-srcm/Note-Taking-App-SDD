-- CreateIndex
CREATE INDEX "Note_ownerId_deletedAt_createdAt_id_idx" ON "Note"("ownerId", "deletedAt", "createdAt" DESC, "id");
