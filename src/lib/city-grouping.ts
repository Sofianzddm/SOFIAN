// Regroupement géographique des villes de talents.
//
// La ville est saisie en texte libre : on « arrondit » chaque commune à la
// grande métropole (FR/BE) la plus proche, uniquement pour alimenter le filtre
// déroulant des books (la fiche talent conserve la vraie ville).
//
// Fonctionnement : géocodage via geo.api.gouv.fr (France) avec repli
// OpenStreetMap/Nominatim (Belgique + communes introuvables), puis distance de
// Haversine vers la liste des métropoles ci-dessous. Résultats mis en cache en
// mémoire pour éviter de re-géocoder à chaque requête.

type MajorCity = { name: string; lat: number; lon: number };

// Grandes métropoles FR + BE (liste volontairement resserrée)
export const MAJOR_CITIES: MajorCity[] = [
  // France
  { name: "Paris", lat: 48.8566, lon: 2.3522 },
  { name: "Marseille", lat: 43.2965, lon: 5.3698 },
  { name: "Lyon", lat: 45.764, lon: 4.8357 },
  { name: "Toulouse", lat: 43.6045, lon: 1.444 },
  { name: "Nice", lat: 43.7102, lon: 7.262 },
  { name: "Nantes", lat: 47.2184, lon: -1.5536 },
  { name: "Montpellier", lat: 43.6108, lon: 3.8767 },
  { name: "Strasbourg", lat: 48.5734, lon: 7.7521 },
  { name: "Bordeaux", lat: 44.8378, lon: -0.5792 },
  { name: "Lille", lat: 50.6292, lon: 3.0573 },
  { name: "Rennes", lat: 48.1173, lon: -1.6778 },
  { name: "Grenoble", lat: 45.1885, lon: 5.7245 },
  { name: "Rouen", lat: 49.4432, lon: 1.0999 },
  { name: "Clermont-Ferrand", lat: 45.7772, lon: 3.087 },
  // Belgique
  { name: "Bruxelles", lat: 50.8503, lon: 4.3517 },
  { name: "Anvers", lat: 51.2194, lon: 4.4025 },
  { name: "Gand", lat: 51.0543, lon: 3.7174 },
  { name: "Liège", lat: 50.6326, lon: 5.5797 },
];

// Corrections manuelles : fautes de frappe / communes introuvables au géocodage.
// Clé = ville saisie normalisée (minuscules, sans accents), valeur = métropole.
const CITY_GROUP_OVERRIDES: Record<string, string> = {
  blaussac: "Nice", // faute de frappe pour « Blausasc » (Alpes-Maritimes)
};

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const cache = new Map<string, string | null>();

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestMajorCity(lat: number, lon: number): string {
  let best = MAJOR_CITIES[0];
  let bestDist = Infinity;
  for (const city of MAJOR_CITIES) {
    const d = haversineKm(lat, lon, city.lat, city.lon);
    if (d < bestDist) {
      bestDist = d;
      best = city;
    }
  }
  return best.name;
}

async function geocodeFr(
  name: string
): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(
      name
    )}&fields=centre&boost=population&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      centre?: { coordinates?: [number, number] };
    }>;
    const coords = data?.[0]?.centre?.coordinates;
    if (!coords) return null;
    return { lat: coords[1], lon: coords[0] };
  } catch {
    return null;
  }
}

async function geocodeOsm(
  name: string,
  countryCode?: string
): Promise<{ lat: number; lon: number } | null> {
  try {
    const params = new URLSearchParams({
      q: name,
      format: "json",
      limit: "1",
    });
    if (countryCode) params.set("countrycodes", countryCode);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { headers: { "User-Agent": "glowup-platform/1.0 (contact@glowupagence.fr)" } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    const first = data?.[0];
    if (!first) return null;
    return { lat: parseFloat(first.lat), lon: parseFloat(first.lon) };
  } catch {
    return null;
  }
}

/**
 * Renvoie la grande métropole la plus proche pour une ville donnée.
 * Renvoie la ville d'origine si le géocodage échoue (rien n'est perdu).
 */
export async function getCityGroup(
  ville: string | null | undefined,
  pays?: string | null
): Promise<string | null> {
  const raw = (ville || "").trim();
  if (!raw) return null;

  // Corrections manuelles prioritaires (fautes de frappe, cas introuvables)
  const override = CITY_GROUP_OVERRIDES[normalizeKey(raw)];
  if (override) return override;

  const isBelgium = (pays || "").trim().toLowerCase() === "belgique";
  const key = `${isBelgium ? "be" : "fr"}:${raw.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key) ?? raw;

  let coords: { lat: number; lon: number } | null = null;
  if (isBelgium) {
    coords = await geocodeOsm(raw, "be");
  } else {
    coords = (await geocodeFr(raw)) || (await geocodeOsm(raw, "fr"));
  }

  const group = coords ? nearestMajorCity(coords.lat, coords.lon) : null;
  cache.set(key, group);
  return group ?? raw;
}

/**
 * Regroupe une liste de villes en une seule passe (dédupliquée).
 * Renvoie une Map ville d'origine -> métropole.
 */
export async function buildCityGroupMap(
  entries: Array<{ ville: string | null; pays?: string | null }>
): Promise<Map<string, string>> {
  const unique = new Map<string, { ville: string; pays?: string | null }>();
  for (const e of entries) {
    const v = (e.ville || "").trim();
    if (v) unique.set(v.toLowerCase(), { ville: v, pays: e.pays });
  }

  const result = new Map<string, string>();
  await Promise.all(
    [...unique.values()].map(async ({ ville, pays }) => {
      const group = await getCityGroup(ville, pays);
      if (group) result.set(ville, group);
    })
  );
  return result;
}
