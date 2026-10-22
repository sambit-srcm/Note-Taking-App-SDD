export const NOTE_TITLE_MAX_CODE_POINTS = 200;
export const NOTE_CONTENT_MAX_BYTES = 1_048_576;
export const NOTE_CONTENT_MAX_DEPTH = 20;
export const NOTE_CONTENT_MAX_NODES = 10_000;
export const NOTE_TRASH_RETENTION_DAYS = 30;
export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;
/** HTTP body cap for note writes: 1 MiB document plus a bounded envelope. */
export const NOTE_BODY_MAX_BYTES = NOTE_CONTENT_MAX_BYTES + 64 * 1024;
