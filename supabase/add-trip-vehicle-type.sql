-- Add vehicle type per trip for route price suggestions.
-- Run once in Supabase SQL Editor. Safe to repeat.

ALTER TABLE "Trip"
  ADD COLUMN IF NOT EXISTS "vehicleType" TEXT;

CREATE INDEX IF NOT EXISTS "Trip_route_vehicle_idx"
  ON "Trip" ("startPoint", "endPoint", "vehicleType");
