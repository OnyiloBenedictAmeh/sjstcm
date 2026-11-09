-- Durable idempotency tombstones for staff profile creation.
-- Deliberately no foreign key on staffProfileId: the request key must remain
-- reserved even if the created profile is later removed.
CREATE TABLE "StaffProfileCreateRequest" (
    "id" TEXT NOT NULL,
    "actorScope" TEXT NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffProfileCreateRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffProfileCreateRequest_actorScope_keyHash_key"
    ON "StaffProfileCreateRequest"("actorScope", "keyHash");

CREATE INDEX "StaffProfileCreateRequest_staffProfileId_idx"
    ON "StaffProfileCreateRequest"("staffProfileId");
