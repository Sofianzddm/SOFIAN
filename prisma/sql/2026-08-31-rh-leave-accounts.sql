-- Comptes d'absence Lucca non couverts par le cœur RH.
ALTER TYPE "RhLeaveAccount" ADD VALUE IF NOT EXISTS 'SCHOOL';
ALTER TYPE "RhLeaveAccount" ADD VALUE IF NOT EXISTS 'AUTHORIZED';
