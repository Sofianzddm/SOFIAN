-- Nouveau rôle COMMUNITY_MANAGER.
-- À appliquer sur Neon (idempotent : peut être relancé sans risque).
--
-- Rôle dédié à la community manager : accès en lecture seule à son espace
-- /community listant uniquement les collaborations publiées + leurs liens de
-- publication (ou marqueur "Story"). Aucun autre module accessible.
--
-- Remarque : ALTER TYPE ... ADD VALUE ne peut pas s'exécuter dans une
-- transaction ; ce fichier doit donc être lancé seul (db execute le fait).

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COMMUNITY_MANAGER';
