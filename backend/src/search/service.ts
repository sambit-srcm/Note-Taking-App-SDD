import type { SearchHighlight } from '@notes/shared';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import {
  HIGHLIGHT_START,
  HIGHLIGHT_STOP,
  parseHeadline,
  TAG_CLOSE_PLACEHOLDER,
  TAG_OPEN_PLACEHOLDER,
} from './snippet.js';

// Must match the expression of the GIN index (migration add_note_search_index), literally: a bound
// parameter would stop the planner from using the index. It is a code constant, never user input.
const CONFIG = Prisma.raw(`'english'`);
// Only this many leading characters are searchable: to_tsvector errors above 1 MiB, and an unbounded
// index would make writes of large (but valid) notes fail. Same literal as the index expression.
export const SEARCH_INDEX_MAX_CHARS = 200_000;
const TEXT = Prisma.raw(`left("searchText", ${SEARCH_INDEX_MAX_CHARS})`);
const HEADLINE_OPTIONS = `StartSel=${HIGHLIGHT_START}, StopSel=${HIGHLIGHT_STOP}, MaxFragments=1, MaxWords=35, MinWords=15, ShortWord=0`;
// Characters removed from the source before `ts_headline`, so note text can never forge a range or a tag.
const RESERVED = HIGHLIGHT_START + HIGHLIGHT_STOP + TAG_OPEN_PLACEHOLDER + TAG_CLOSE_PLACEHOLDER;
const TAG_CHARS = '<>';
const TAG_PLACEHOLDERS = TAG_OPEN_PLACEHOLDER + TAG_CLOSE_PLACEHOLDER;

export interface SearchResultDto {
  id: string;
  title: string;
  snippet: string;
  highlights: SearchHighlight[];
  updatedAt: Date;
}
export interface SearchPage {
  items: SearchResultDto[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface SearchService {
  /** `q` is already validated and trimmed by `searchQuerySchema`. */
  search(
    ownerId: string,
    input: { q: string; page: number; pageSize: number },
  ): Promise<SearchPage>;
}

interface Deps {
  prisma: PrismaClient;
}

interface Row {
  id: string;
  title: string;
  updatedAt: Date;
  headline: string;
}

export function createSearchService({ prisma }: Deps): SearchService {
  return {
    async search(ownerId, { q, page, pageSize }) {
      const offset = (page - 1) * pageSize;
      // Owner and trash filters sit in the same statement as the match, so no other user's row is read.
      const [rows, counts] = await Promise.all([
        prisma.$queryRaw<Row[]>`
          WITH query AS (SELECT websearch_to_tsquery(${CONFIG}, ${q}::text) AS tsq),
          page AS (
            SELECT n."id", n."title", n."updatedAt", n."searchText",
                   ts_rank(to_tsvector(${CONFIG}, ${TEXT}), query.tsq) AS rank
            FROM "Note" n, query
            WHERE n."ownerId" = ${ownerId}::uuid
              AND n."deletedAt" IS NULL
              AND to_tsvector(${CONFIG}, ${TEXT}) @@ query.tsq
            ORDER BY rank DESC, n."id" ASC
            LIMIT ${pageSize} OFFSET ${offset}
          )
          SELECT page."id", page."title", page."updatedAt",
                 ts_headline(
                   ${CONFIG},
                   translate(
                     translate(left(page."searchText", ${SEARCH_INDEX_MAX_CHARS}::int), ${RESERVED}::text, ''),
                     ${TAG_CHARS}::text, ${TAG_PLACEHOLDERS}::text
                   ),
                   query.tsq,
                   ${HEADLINE_OPTIONS}::text
                 ) AS headline
          FROM page, query
          ORDER BY page.rank DESC, page."id" ASC`,
        prisma.$queryRaw<{ total: bigint }[]>`
          SELECT count(*) AS total
          FROM "Note" n
          WHERE n."ownerId" = ${ownerId}::uuid
            AND n."deletedAt" IS NULL
            AND to_tsvector(${CONFIG}, ${TEXT}) @@ websearch_to_tsquery(${CONFIG}, ${q}::text)`,
      ]);
      return {
        items: rows.map((row) => ({
          id: row.id,
          title: row.title,
          updatedAt: row.updatedAt,
          ...parseHeadline(row.headline),
        })),
        pagination: { page, pageSize, total: Number(counts[0]?.total ?? 0) },
      };
    },
  };
}
