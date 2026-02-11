/**
 * Claude API client pour génération des pitchs de vente
 */

import Anthropic from '@anthropic-ai/sdk';

interface TalentData {
  name: string;
  followers: number;
  platform: string;
  engagementRate: number;
  frAudience: number;
  femaleAudience: number;
  age18_34: number;
  niches: string[];
  pastCollabs: string[];
  bestFormats: string[];
}

interface BrandData {
  name: string;
  niche: string;
  description?: string;
}

export async function generateTalentPitch(
  brand: BrandData,
  talent: TalentData
): Promise<string> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const anthropic = new Anthropic({
      apiKey,
    });

    const prompt = `Tu es le directeur commercial de Glow Up Agence, une agence d'influence marketing premium.
Rédige un pitch de vente de 3 lignes maximum pour présenter ce talent à la marque ci-dessous.

MARQUE : ${brand.name} (${brand.niche}${brand.description ? `, ${brand.description}` : ''})

TALENT (données vérifiées — ne modifie AUCUN chiffre) :
- Nom : ${talent.name}
- Followers : ${talent.followers.toLocaleString('fr-FR')} sur ${talent.platform}
- Taux d'engagement : ${talent.engagementRate}%
- Audience France : ${talent.frAudience}%
- Audience 18-34 ans : ${talent.age18_34}%
- Audience féminine : ${talent.femaleAudience}%
- Niches : ${talent.niches.join(', ')}
${talent.pastCollabs.length > 0 ? `- Collaborations passées : ${talent.pastCollabs.join(', ')}` : ''}
- Formats forts : ${talent.bestFormats.join(', ')}

RÈGLES :
- Utilise UNIQUEMENT les données fournies ci-dessus
- N'invente AUCUN chiffre ou statistique
- Explique pourquoi ce profil est un match parfait pour cette marque spécifiquement
- Ton : professionnel mais chaleureux, pas corporate
- Langue : français
- Maximum 3 lignes

Réponds UNIQUEMENT avec le pitch, sans introduction ni conclusion.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const pitch = message.content[0].type === 'text' 
      ? message.content[0].text.trim()
      : '';

    return pitch;
  } catch (error) {
    console.error('Claude API error:', error);
    throw error;
  }
}
