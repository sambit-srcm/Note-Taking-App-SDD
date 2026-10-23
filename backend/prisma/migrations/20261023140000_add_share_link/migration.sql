-- Share tokens are stored only as SHA-256. The raw token is never written here.
CREATE TABLE "ShareLink" (
    "id" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");
CREATE INDEX "ShareLink_noteId_createdAt_idx" ON "ShareLink"("noteId", "createdAt");

ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ShareView" (
    "shareLinkId" UUID NOT NULL,
    "viewerHash" TEXT NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareView_pkey" PRIMARY KEY ("shareLinkId", "viewerHash")
);

ALTER TABLE "ShareView" ADD CONSTRAINT "ShareView_shareLinkId_fkey"
    FOREIGN KEY ("shareLinkId") REFERENCES "ShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
