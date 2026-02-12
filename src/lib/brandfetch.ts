/**
 * Brandfetch API client v5
 * Récupère le logo, les couleurs et la description d'une marque depuis son domaine
 * Avec sélection intelligente du meilleur format de logo et correction automatique des couleurs
 */

interface BrandfetchResult {
  logo: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  description: string | null;
}

/**
 * Convertit une URL Brandfetch en version haute résolution (2000px)
 */
function upgradeTo4K(url: string): string {
  // Si c'est une URL Brandfetch avec des paramètres de taille
  if (url.includes('cdn.brandfetch.io') && url.match(/\/w\/\d+\/h\/\d+\//)) {
    // Remplacer w/XXX/h/YYY par w/2000
    return url.replace(/\/w\/\d+\/h\/\d+\//, '/w/2000/h/2000/');
  }
  return url;
}

/**
 * Sélectionne le meilleur format de logo depuis Brandfetch
 * Priorité : SVG > PNG transparent haute résolution > Fallback
 */
function getBestLogo(logos: any[]): string | null {
  if (!logos || logos.length === 0) return null;

  // 1. Chercher un SVG en priorité (meilleur format, vectoriel)
  for (const logo of logos) {
    if (logo.type === 'logo' || logo.type === 'symbol' || logo.type === 'icon') {
      for (const format of logo.formats || []) {
        if (format.format === 'svg') {
          return format.src;
        }
      }
    }
  }

  // 2. Si pas de SVG, chercher logo "logo" en PNG fond transparent
  for (const logo of logos) {
    if (logo.type === 'logo') {
      for (const format of logo.formats || []) {
        if (format.format === 'png' && format.background === 'transparent') {
          return upgradeTo4K(format.src);
        }
      }
    }
  }

  // 3. Chercher logo "symbol" ou "icon" en PNG fond transparent
  for (const logo of logos) {
    if (logo.type === 'symbol' || logo.type === 'icon') {
      for (const format of logo.formats || []) {
        if (format.format === 'png' && format.background === 'transparent') {
          return upgradeTo4K(format.src);
        }
      }
    }
  }

  // 4. Chercher n'importe quel logo en PNG transparent
  for (const logo of logos) {
    for (const format of logo.formats || []) {
      if (format.format === 'png' && format.background === 'transparent') {
        return upgradeTo4K(format.src);
      }
    }
  }

  // 5. Fallback : premier logo disponible
  const fallbackUrl = logos[0]?.formats?.[0]?.src || null;
  return fallbackUrl ? upgradeTo4K(fallbackUrl) : null;
}

/**
 * Corrige une couleur pour garantir un bon contraste sur fond crème (#F5EBE0)
 * Assombrit les couleurs trop claires, remplace noir/blanc par le marron Glow Up
 */
function getUsableColor(hexColor: string | null): string {
  const FALLBACK_COLOR = '#5C2A30'; // Marron Glow Up
  
  if (!hexColor) return FALLBACK_COLOR;

  const hex = hexColor.replace('#', '');
  
  // Validation du format hex
  if (hex.length !== 6) return FALLBACK_COLOR;

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculer la luminosité (0 = noir, 255 = blanc)
  const luminosity = 0.299 * r + 0.587 * g + 0.114 * b;

  // Noir pur ou blanc pur → marron Glow Up
  if (
    hexColor === '#000000' ||
    hexColor === '#000' ||
    hexColor === '#ffffff' ||
    hexColor === '#fff' ||
    hexColor === '#0f0f0f'
  ) {
    return FALLBACK_COLOR;
  }

  // Trop sombre (quasi noir) → marron Glow Up
  if (luminosity < 30) {
    return FALLBACK_COLOR;
  }

  // Trop clair pour le fond crème → assombrir de 40%
  if (luminosity > 180) {
    const darken = (c: number) => Math.max(0, Math.round(c * 0.6));
    const darkR = darken(r).toString(16).padStart(2, '0');
    const darkG = darken(g).toString(16).padStart(2, '0');
    const darkB = darken(b).toString(16).padStart(2, '0');
    return `#${darkR}${darkG}${darkB}`;
  }

  // Couleur correcte
  return hexColor;
}

export async function fetchBrandData(domain: string): Promise<BrandfetchResult> {
  try {
    const apiKey = process.env.BRANDFETCH_API_KEY;
    
    if (!apiKey) {
      console.warn('❌ BRANDFETCH_API_KEY not configured');
      return {
        logo: null,
        primaryColor: null,
        secondaryColor: null,
        description: null,
      };
    }

    // Nettoyer le domaine (enlever https://, www., etc.)
    const cleanDomain = domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];

    console.log(`🎨 Brandfetch: ${cleanDomain}`);

    // Appel à l'API Brandfetch
    const response = await fetch(`https://api.brandfetch.io/v2/brands/${cleanDomain}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      console.warn(`⚠️  Brandfetch API error ${response.status}`);
      return {
        logo: null,
        primaryColor: null,
        secondaryColor: null,
        description: null,
      };
    }

    const data = await response.json();

    // Logo : sélection intelligente du meilleur format
    const logo = getBestLogo(data.logos || []);

    // Couleurs : prendre la première qui n'est ni noir ni blanc
    const colors = data.colors || [];
    const brandColor = colors.find((c: any) => {
      const hex = c.hex?.toLowerCase();
      return hex && hex !== '#000000' && hex !== '#ffffff' && hex !== '#000' && hex !== '#fff';
    });

    // Valider et nettoyer le hex (doit avoir 6 caractères)
    let rawColor = brandColor?.hex || null;
    if (rawColor) {
      const cleanHex = rawColor.replace('#', '');
      // Si le hex est incomplet, on le complète avec des 0
      if (cleanHex.length === 3) {
        // Format court #RGB -> #RRGGBB
        rawColor = `#${cleanHex[0]}${cleanHex[0]}${cleanHex[1]}${cleanHex[1]}${cleanHex[2]}${cleanHex[2]}`;
      } else if (cleanHex.length === 5) {
        // Compléter avec un 0
        rawColor = `#${cleanHex}0`;
      } else if (cleanHex.length < 6 || cleanHex.length > 6) {
        console.warn(`⚠️  Hex invalide: ${rawColor}, ignoré`);
        rawColor = null;
      } else {
        rawColor = `#${cleanHex}`;
      }
    }

    // Corriger la couleur pour garantir un bon contraste
    const primaryColor = getUsableColor(rawColor);
    
    const secondaryColor = colors[1]?.hex || null;

    const description = data.description || null;

    console.log(`  ✅ Logo: ${logo ? '✓' : '✗'}, Couleur: ${primaryColor} (brut: ${rawColor || 'aucune'})`);

    return {
      logo,
      primaryColor,
      secondaryColor,
      description,
    };
  } catch (error) {
    console.error('❌ Brandfetch error:', error);
    return {
      logo: null,
      primaryColor: null,
      secondaryColor: null,
      description: null,
    };
  }
}
