-- ALTER TYPE ... ADD VALUE cannot run in a transaction on some Postgres setups;
-- Prisma db execute may wrap — use IF NOT EXISTS where supported (PG 15+).
ALTER TYPE "ProspectingPrestataireCategorie" ADD VALUE IF NOT EXISTS 'DECORATEUR';
ALTER TYPE "ProspectingPrestataireCategorie" ADD VALUE IF NOT EXISTS 'FLEURISTE';
