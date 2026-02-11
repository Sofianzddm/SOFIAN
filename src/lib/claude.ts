/**
 * Claude API client pour sélection et génération des pitchs de vente
 */

import Anthropic from '@anthropic-ai/sdk';

interface TalentForSelection {
  id: string;
  name: string;
  instagram: string | null;
  tiktok: string | null;
  niches: string[];
  selectedClients: string[];
  stats: {
    igFollowers: number | null;
    igEngagement: number | null;
    igGenreFemme: number | null;
    igAge18_24: number | null;
    igAge25_34: number | null;
    igLocFrance: number | null;
    ttFollowers: number | null;
    ttEngagement: number | null;
    ttGenreFemme: number | null;
    ttLocFrance: number | null;
  } | null;
}

interface BrandForSelection {
  name: string;
  domain: string;
  niche: string;
  description?: string;
}

interface ClaudeSelectionResult {
  talents: Array<{
    id: string;
    pitch: string;
  }>;
}

/**
 * Claude sélectionne intelligemment les 5 meilleurs talents pour une marque
 */
export async function selectTalentsWithClaude(
  brand: BrandForSelection,
  allTalents: TalentForSelection[]
): Promise<ClaudeSelectionResult> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const anthropic = new Anthropic({ apiKey });

    // Construire la liste des talents
    const talentsList = allTalents.map((t, index) => {
      const stats = t.stats;
      return `
${index + 1}. TALENT ID: ${t.id}
   - Nom: ${t.name}
   - Instagram: ${t.instagram || 'N/A'}
   - TikTok: ${t.tiktok || 'N/A'}
   - Niches: ${t.niches.join(', ')}
   - Followers IG: ${stats?.igFollowers?.toLocaleString('fr-FR') || 'N/A'}
   - Engagement IG: ${stats?.igEngagement || 'N/A'}%
   - Followers TikTok: ${stats?.ttFollowers?.toLocaleString('fr-FR') || 'N/A'}
   - Engagement TikTok: ${stats?.ttEngagement || 'N/A'}%
   - Audience femmes: ${stats?.igGenreFemme || 'N/A'}%
   - Audience 18-24: ${stats?.igAge18_24 || 'N/A'}%
   - Audience 25-34: ${stats?.igAge25_34 || 'N/A'}%
   - Audience France: ${stats?.igLocFrance || 'N/A'}%
   - Collabs passées: ${t.selectedClients.length > 0 ? t.selectedClients.join(', ') : 'Aucune'}`;
    }).join('\n');

    const prompt = `Tu es le directeur commercial de Glow Up Agence, une agence d'influence marketing premium en France.

MARQUE À PROSPECTER :
- Nom : ${brand.name}
- Secteur : ${brand.niche}
- Description : ${brand.description || 'Non fournie'}
- Site web : ${brand.domain}

VOICI TOUS NOS TALENTS :
${talentsList}

MISSION :
Choisis les 5 talents les plus pertinents pour cette marque. Pour chaque talent choisi, écris UNE seule phrase de vente percutante avec les stats réelles.

CRITÈRES DE SÉLECTION :
- Cohérence entre la marque et l'univers du talent
- Taux d'engagement (privilégier les hauts)
- % audience France (privilégier > 60%)
- % audience dans la tranche d'âge cible de la marque
- Collabs passées avec des marques similaires
- Mix de profils (pas 5 talents identiques)

RÈGLES STRICTES :
- N'invente AUCUN chiffre
- Utilise UNIQUEMENT les données fournies ci-dessus
- UNE phrase par talent maximum, factuelle, pas de superlatif excessif
- Ton professionnel mais chaleureux
- Langue : français

RÉPONDS UNIQUEMENT EN JSON (sans markdown, sans \`\`\`json) :
{
  "talents": [
    {
      "id": "talent_id_exact",
      "pitch": "La phrase de vente avec stats réelles"
    }
  ]
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 2000,
      temperature: 0, // Résultats stables
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' 
      ? message.content[0].text.trim()
      : '';

    console.log('\n🤖 Claude response:', responseText.substring(0, 200) + '...\n');

    // Parser le JSON
    let parsed: ClaudeSelectionResult;
    
    // Nettoyer la réponse (enlever les markdown si présents)
    const cleanedResponse = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    try {
      parsed = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('❌ JSON parsing failed:', parseError);
      console.log('Raw response:', responseText);
      throw new Error('Failed to parse Claude response as JSON');
    }

    if (!parsed.talents || !Array.isArray(parsed.talents)) {
      throw new Error('Invalid Claude response format');
    }

    console.log(`✅ Claude a sélectionné ${parsed.talents.length} talents`);

    return parsed;
  } catch (error) {
    console.error('Claude selection error:', error);
    throw error;
  }
}

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
