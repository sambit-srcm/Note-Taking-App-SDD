-- to_tsvector fails above 1,048,575 bytes, and a valid note can reach 1 MiB of distinct words, which
-- would make note writes fail. Bound the indexed text; the query repeats this exact expression.
DROP INDEX "Note_searchText_fts_idx";
CREATE INDEX "Note_searchText_fts_idx" ON "Note" USING GIN (to_tsvector('english', left("searchText", 200000)));
