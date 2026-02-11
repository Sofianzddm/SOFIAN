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
      console.warn('❌ BRANDFETCH_API_KEY not configured');
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

    console.log(`\n🎨 Brandfetch API call for: ${cleanDomain}`);

    // Appel à l'API Brandfetch
    const response = await fetch(`https://api.brandfetch.io/v2/brands/${cleanDomain}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    console.log(`📡 Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`❌ Brandfetch API error ${response.status}:`, errorText);
      return {
        logo: null,
        primaryColor: null,
        secondaryColor: null,
      };
    }

    const data = await response.json();
    console.log('📦 Brandfetch response:', JSON.stringify(data, null, 2));

    // Extraire le logo - chercher d'abord un logo de type "logo" (pas "icon")
    let logo = null;
    
    if (data.logos && Array.isArray(data.logos)) {
      console.log(`🖼️  Logos disponibles: ${data.logos.length}`);
      
      // Chercher un logo de type "logo"
      const mainLogo = data.logos.find((l: any) => l.type === 'logo');
      
      if (mainLogo) {
        console.log('✅ Logo de type "logo" trouvé');
        // Prendre le format PNG en priorité, sinon le premier format disponible
        const pngFormat = mainLogo.formats?.find((f: any) => f.format === 'png');
        logo = pngFormat?.src || mainLogo.formats?.[0]?.src || null;
      } else {
        console.log('⚠️  Pas de logo de type "logo", utilisation du premier disponible');
        // Fallback : prendre le premier logo disponible
        const firstLogo = data.logos[0];
        const pngFormat = firstLogo?.formats?.find((f: any) => f.format === 'png');
        logo = pngFormat?.src || firstLogo?.formats?.[0]?.src || null;
      }
    }

    console.log(`🖼️  Logo sélectionné: ${logo || 'AUCUN'}`);

    // Extraire les couleurs
    const colors = data.colors || [];
    const primaryColor = colors[0]?.hex || null;
    const secondaryColor = colors[1]?.hex || null;

    console.log(`🎨 Couleurs: primary=${primaryColor}, secondary=${secondaryColor}\n`);

    return {
      logo,
      primaryColor,
      secondaryColor,
    };
  } catch (error) {
    console.error('❌ Brandfetch error:', error);
    return {
      logo: null,
      primaryColor: null,
      secondaryColor: null,
    };
  }
}
