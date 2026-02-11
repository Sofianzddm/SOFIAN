/**
 * Brandfetch API client
 * Récupère le logo et les couleurs d'une marque depuis son domaine
 */

interface BrandfetchResponse {
  logo: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}

export async function fetchBrandAssets(domain: string): Promise<BrandfetchResponse> {
  try {
    const apiKey = process.env.BRANDFETCH_API_KEY;
    
    if (!apiKey) {
      console.warn('BRANDFETCH_API_KEY not configured');
      return {
        logo: null,
        primaryColor: null,
        secondaryColor: null,
      };
    }

    // Nettoyer le domaine (enlever https://, www., etc.)
    const cleanDomain = domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];

    // Appel à l'API Brandfetch
    const response = await fetch(`https://api.brandfetch.io/v2/brands/${cleanDomain}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      console.warn(`Brandfetch API error: ${response.status}`);
      return {
        logo: null,
        primaryColor: null,
        secondaryColor: null,
      };
    }

    const data = await response.json();

    // Extraire le logo
    const logo = data.logos?.[0]?.formats?.find((f: any) => f.format === 'png')?.src 
      || data.logos?.[0]?.formats?.[0]?.src
      || null;

    // Extraire les couleurs
    const colors = data.colors || [];
    const primaryColor = colors[0]?.hex || null;
    const secondaryColor = colors[1]?.hex || null;

    return {
      logo,
      primaryColor,
      secondaryColor,
    };
  } catch (error) {
    console.error('Brandfetch error:', error);
    return {
      logo: null,
      primaryColor: null,
      secondaryColor: null,
    };
  }
}
