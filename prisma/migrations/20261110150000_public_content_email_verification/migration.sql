-- Add public department imagery and verification for newly created users.
-- Existing accounts are marked verified to preserve their current access.
ALTER TABLE "Department" ADD COLUMN "imageUrl" TEXT;

ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE "emailVerifiedAt" IS NULL;

CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_userId_createdAt_idx" ON "EmailVerificationToken"("userId", "createdAt");
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
