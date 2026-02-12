/**
 * Module de récupération des profils Instagram publics
 * Extrait : bio, followers, posts récents pour analyse par Claude
 */

interface InstagramProfile {
  handle: string;
  fullName: string;
  bio: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isVerified: boolean;
  profilePicUrl: string;
  recentPosts: Array<{
    caption: string;
    likes: number;
    comments: number;
    timestamp: string;
  }>;
}

/**
 * Récupère les données d'un profil Instagram public
 * Utilise les meta tags et JSON-LD embarqués dans la page HTML
 */
export async function fetchInstagramProfile(handle: string): Promise<InstagramProfile | null> {
  try {
    // Nettoyer le handle (enlever @ si présent)
    const cleanHandle = handle.replace('@', '');
    const url = `https://www.instagram.com/${cleanHandle}/`;

    console.log(`📸 Récupération profil Instagram: @${cleanHandle}`);

    // Fetch la page HTML publique
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      console.warn(`⚠️  Erreur HTTP ${response.status} pour @${cleanHandle}`);
      return null;
    }

    const html = await response.text();

    // Extraire les données JSON embarquées dans la page
    // Instagram met les données dans un script tag avec type="application/ld+json"
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/);
    const sharedDataMatch = html.match(/window\._sharedData = (.+?);<\/script>/);

    let profile: Partial<InstagramProfile> = {
      handle: cleanHandle,
      recentPosts: [],
    };

    // Parser JSON-LD (meta tags)
    if (jsonLdMatch) {
      try {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        if (jsonLd['@type'] === 'ProfilePage') {
          profile.fullName = jsonLd.name || cleanHandle;
          profile.bio = jsonLd.description || '';
        }
      } catch (e) {
        console.warn('Erreur parsing JSON-LD:', e);
      }
    }

    // Parser sharedData (données complètes du profil)
    if (sharedDataMatch) {
      try {
        const sharedData = JSON.parse(sharedDataMatch[1]);
        const userData = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user;

        if (userData) {
          profile.fullName = userData.full_name || cleanHandle;
          profile.bio = userData.biography || '';
          profile.followersCount = userData.edge_followed_by?.count || 0;
          profile.followingCount = userData.edge_follow?.count || 0;
          profile.postsCount = userData.edge_owner_to_timeline_media?.count || 0;
          profile.isVerified = userData.is_verified || false;
          profile.profilePicUrl = userData.profile_pic_url_hd || userData.profile_pic_url || '';

          // Récupérer les 3 derniers posts
          const edges = userData.edge_owner_to_timeline_media?.edges || [];
          profile.recentPosts = edges.slice(0, 3).map((edge: any) => ({
            caption: edge.node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
            likes: edge.node.edge_liked_by?.count || 0,
            comments: edge.node.edge_media_to_comment?.count || 0,
            timestamp: new Date(edge.node.taken_at_timestamp * 1000).toISOString(),
          }));
        }
      } catch (e) {
        console.warn('Erreur parsing sharedData:', e);
      }
    }

    // Fallback : extraire depuis les meta tags
    if (!profile.bio) {
      const metaDescMatch = html.match(/<meta property="og:description" content="(.+?)">/);
      if (metaDescMatch) {
        // Format: "X Followers, Y Following, Z Posts - See Instagram photos..."
        profile.bio = metaDescMatch[1].split(' - ')[0] || '';
      }
    }

    console.log(`✅ Profil @${cleanHandle} récupéré:`, {
      fullName: profile.fullName,
      bio: profile.bio?.substring(0, 50) + '...',
      posts: profile.postsCount,
      recentPosts: profile.recentPosts?.length || 0,
    });

    return profile as InstagramProfile;
  } catch (error) {
    console.error(`❌ Erreur récupération profil @${handle}:`, error);
    return null;
  }
}

/**
 * Formatte les données Instagram pour le prompt Claude
 */
export function formatInstagramDataForClaude(profile: InstagramProfile): string {
  let formatted = `@${profile.handle} (${profile.fullName})`;

  if (profile.bio) {
    formatted += `\nBio: "${profile.bio}"`;
  }

  if (profile.isVerified) {
    formatted += `\n✓ Compte vérifié`;
  }

  formatted += `\n${profile.postsCount} posts | ${profile.followersCount.toLocaleString('fr-FR')} followers`;

  if (profile.recentPosts && profile.recentPosts.length > 0) {
    formatted += `\n\nDerniers posts:`;
    profile.recentPosts.forEach((post, i) => {
      if (post.caption) {
        const shortCaption = post.caption.substring(0, 100).replace(/\n/g, ' ');
        formatted += `\n${i + 1}. "${shortCaption}${post.caption.length > 100 ? '...' : ''}"`;
        formatted += ` (${post.likes.toLocaleString('fr-FR')} likes)`;
      }
    });
  }

  return formatted;
}
