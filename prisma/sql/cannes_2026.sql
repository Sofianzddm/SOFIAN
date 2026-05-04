-- Enums
DO $$ BEGIN
  CREATE TYPE "CannesEventType" AS ENUM ('SOIREE','DINER','BRUNCH','COCKTAIL','CONFERENCE','PROJECTION','SHOOTING','AUTRE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CannesContactCategory" AS ENUM ('MARQUE','AGENCE','PRESSE','PRODUCTION','HOTEL','TRANSPORT','TALENT_EXT','AUTRE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CannesEvent
CREATE TABLE IF NOT EXISTS "CannesEvent" (
  "id" TEXT PRIMARY KEY,
  "date" TIMESTAMP(3) NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT,
  "title" TEXT NOT NULL,
  "type" "CannesEventType" NOT NULL DEFAULT 'SOIREE',
  "location" TEXT NOT NULL,
  "address" TEXT,
  "organizer" TEXT,
  "contactInfo" TEXT,
  "dressCode" TEXT,
  "invitationLink" TEXT,
  "description" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT
);
CREATE INDEX IF NOT EXISTS "CannesEvent_date_idx" ON "CannesEvent"("date");

-- CannesContact
CREATE TABLE IF NOT EXISTS "CannesContact" (
  "id" TEXT PRIMARY KEY,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "company" TEXT,
  "role" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "instagram" TEXT,
  "hotel" TEXT,
  "arrivalDate" TIMESTAMP(3),
  "departureDate" TIMESTAMP(3),
  "category" "CannesContactCategory" NOT NULL DEFAULT 'AUTRE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "CannesContact_category_idx" ON "CannesContact"("category");

-- CannesPresence
CREATE TABLE IF NOT EXISTS "CannesPresence" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT,
  "talentId" TEXT,
  "arrivalDate" TIMESTAMP(3) NOT NULL,
  "departureDate" TIMESTAMP(3) NOT NULL,
  "hotel" TEXT,
  "hotelAddress" TEXT,
  "flightArrival" TEXT,
  "flightDeparture" TEXT,
  "roomNumber" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CannesPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "CannesPresence_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "CannesPresence_userId_idx" ON "CannesPresence"("userId");
CREATE INDEX IF NOT EXISTS "CannesPresence_talentId_idx" ON "CannesPresence"("talentId");

-- CannesEventAttendee
CREATE TABLE IF NOT EXISTS "CannesEventAttendee" (
  "id" TEXT PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "presenceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CannesEventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CannesEvent"("id") ON DELETE CASCADE,
  CONSTRAINT "CannesEventAttendee_presenceId_fkey" FOREIGN KEY ("presenceId") REFERENCES "CannesPresence"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CannesEventAttendee_eventId_presenceId_key" ON "CannesEventAttendee"("eventId","presenceId");
CREATE INDEX IF NOT EXISTS "CannesEventAttendee_eventId_idx" ON "CannesEventAttendee"("eventId");
CREATE INDEX IF NOT EXISTS "CannesEventAttendee_presenceId_idx" ON "CannesEventAttendee"("presenceId");

-- Indisponibilités planning équipe (liées à une présence collaborateur)
CREATE TABLE IF NOT EXISTS "CannesTeamUnavailability" (
  "id" TEXT PRIMARY KEY,
  "presenceId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CannesTeamUnavailability_presenceId_fkey" FOREIGN KEY ("presenceId") REFERENCES "CannesPresence"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "CannesTeamUnavailability_presenceId_idx" ON "CannesTeamUnavailability"("presenceId");
