-- Full-text index for GET /search. The query must repeat this exact expression to use it.
-- CreateIndex
CREATE INDEX "Note_searchText_fts_idx" ON "Note" USING GIN (to_tsvector('english', "searchText"));
