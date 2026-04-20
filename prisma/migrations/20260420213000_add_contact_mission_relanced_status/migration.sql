-- Add RELANCED status for contact mission follow-ups
ALTER TYPE "ContactMissionStatus" ADD VALUE IF NOT EXISTS 'RELANCED';
