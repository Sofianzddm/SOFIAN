/**
 * HubSpot API client v4
 * Gestion des listes de contacts et mise à jour des propriétés
 */

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

export interface HubSpotList {
  id: string;
  name: string;
  contactCount: number | null;
}

export interface HubSpotContact {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  companyName: string;
  domain: string;
}

/**
 * Récupérer les listes de contacts depuis HubSpot (avec pagination)
 */
export async function getLists(): Promise<HubSpotList[]> {
  if (!HUBSPOT_API_KEY) {
    console.warn('❌ HUBSPOT_API_KEY not configured');
    return [];
  }

  try {
    const allLists: HubSpotList[] = [];
    let hasMore = true;
    let offset = 0;
    const limit = 250; // Maximum autorisé par HubSpot

    while (hasMore) {
      const response = await fetch(
        `${HUBSPOT_BASE_URL}/contacts/v1/lists?count=${limit}&offset=${offset}`,
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
          },
        }
      );

      if (!response.ok) {
        console.error(`❌ HubSpot getLists error: ${response.status}`);
        break;
      }

      const data = await response.json();
      
      const lists: HubSpotList[] = (data.lists || []).map((list: any) => ({
        id: list.listId?.toString() || '',
        name: list.name || 'Liste sans nom',
        contactCount: list.metaData?.size || null,
      }));

      allLists.push(...lists);

      // Vérifier s'il y a d'autres pages
      hasMore = data['has-more'] || false;
      offset = data.offset || (offset + limit);
    }

    console.log(`✅ ${allLists.length} listes HubSpot récupérées`);
    return allLists;
  } catch (error) {
    console.error('❌ HubSpot getLists error:', error);
    return [];
  }
}

/**
 * Récupérer les contacts d'une liste HubSpot
 * Récupère les propriétés company name et website
 */
export async function getContactsFromList(listId: string): Promise<HubSpotContact[]> {
  if (!HUBSPOT_API_KEY) {
    console.warn('❌ HUBSPOT_API_KEY not configured');
    return [];
  }

  try {
    const contacts: HubSpotContact[] = [];
    let hasMore = true;
    let offset = 0;
    const limit = 100;

    while (hasMore) {
      // API v1 pour récupérer les contacts d'une liste avec propriétés spécifiques
      const response = await fetch(
        `${HUBSPOT_BASE_URL}/contacts/v1/lists/${listId}/contacts/all?count=${limit}&vidOffset=${offset}&property=firstname&property=lastname&property=email&property=company&property=website`,
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
          },
        }
      );

      if (!response.ok) {
        console.error(`❌ HubSpot getContacts error: ${response.status}`);
        break;
      }

      const data = await response.json();

      // Traiter TOUS les contacts (sans filtre)
      (data.contacts || []).forEach((contact: any) => {
        const properties = contact.properties || {};
        const firstname = properties.firstname?.value || '';
        const lastname = properties.lastname?.value || '';
        const email = properties.email?.value || '';
        const company = properties.company?.value || ''; // Nom de l'entreprise depuis HubSpot
        const website = properties.website?.value || '';

        // Extraction intelligente du domaine
        let domain = '';
        
        // 1. Priorité : champ website
        if (website && website.trim() !== '') {
          domain = website.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        }
        // 2. Sinon : extraire depuis l'email
        else if (email && email.includes('@')) {
          const emailDomain = email.split('@')[1];
          domain = emailDomain;
        }
        // 3. Sinon : slugifier le company name
        else if (company && company.trim() !== '') {
          const slug = company
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          domain = slug ? `${slug}.com` : '';
        }

        // Déterminer le nom de l'entreprise à afficher
        let companyName = company || ''; // Utiliser le champ company s'il existe
        
        if (!companyName && domain) {
          // Extraire le nom depuis le domaine
          const domainName = domain.replace(/\.(com|fr|co|io|net|org)$/i, '');
          
          // Vérifier si c'est un email générique
          const genericDomains = ['gmail', 'hotmail', 'yahoo', 'outlook', 'icloud', 'wanadoo', 'orange', 'free', 'sfr'];
          if (genericDomains.includes(domainName.toLowerCase())) {
            companyName = '⚠️ Entreprise inconnue';
          } else {
            // Capitaliser la première lettre
            companyName = domainName.charAt(0).toUpperCase() + domainName.slice(1);
          }
        }

        // Si toujours pas de nom, utiliser le nom du contact comme fallback
        if (!companyName) {
          companyName = (firstname || lastname ? `${firstname} ${lastname}`.trim() : '') || email || 'Contact sans nom';
        }

        // Ajouter TOUS les contacts
        contacts.push({
          id: contact.vid?.toString() || '',
          firstname,
          lastname,
          email,
          companyName,
          domain,
        });
      });

      // Pagination
      hasMore = data['has-more'] || false;
      offset = data['vid-offset'] || 0;
    }

    console.log(`✅ ${contacts.length} contacts récupérés de la liste ${listId}`);
    
    // Debug: afficher les 3 premiers contacts pour vérification
    if (contacts.length > 0) {
      console.log('Exemple de contacts récupérés:');
      contacts.slice(0, 3).forEach((c) => {
        console.log(`  - ${c.companyName} | ${c.email} | domain: ${c.domain}`);
      });
    }
    
    return contacts;
  } catch (error) {
    console.error('❌ HubSpot getContactsFromList error:', error);
    return [];
  }
}

/**
 * Mettre à jour le champ press_kit_url d'un contact HubSpot
 */
export async function updateContactPresskitUrl(
  contactId: string,
  url: string
): Promise<boolean> {
  if (!HUBSPOT_API_KEY) {
    console.warn('❌ HUBSPOT_API_KEY not configured');
    return false;
  }

  try {
    // API v1 pour mettre à jour les propriétés d'un contact
    const response = await fetch(
      `${HUBSPOT_BASE_URL}/contacts/v1/contact/vid/${contactId}/profile`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: [
            {
              property: 'press_kit_url',
              value: url,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      console.error(`❌ HubSpot updateContact error ${response.status}`);
      return false;
    }

    console.log(`  ✅ Contact ${contactId} mis à jour avec URL: ${url}`);
    return true;
  } catch (error) {
    console.error('❌ HubSpot updateContactPresskitUrl error:', error);
    return false;
  }
}
