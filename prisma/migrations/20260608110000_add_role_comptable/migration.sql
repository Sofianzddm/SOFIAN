-- Ajoute le rôle Expert-Comptable à l'énumération Role
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COMPTABLE';
