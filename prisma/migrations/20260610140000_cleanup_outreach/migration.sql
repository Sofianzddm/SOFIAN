-- Nettoyage du module Outreach :
--  - purge des données de test (targets + touches)
--  - suppression de la connexion de liste HubSpot (entrée des clients
--    uniquement à la main ou via l'import d'une carto Excel)
DELETE FROM "outreach_touches";
DELETE FROM "outreach_targets";
DROP TABLE IF EXISTS "outreach_list_configs";
