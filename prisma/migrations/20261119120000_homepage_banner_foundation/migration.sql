-- Create the standalone homepage banner content table.
CREATE TABLE "HomepageBanner" (
    "id" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "imageAlt" TEXT NOT NULL,
    "buttonText" TEXT,
    "buttonUrl" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HomepageBanner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HomepageBanner_isPublished_displayOrder_idx" ON "HomepageBanner"("isPublished", "displayOrder");