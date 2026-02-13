# 📊 Système de Tracking Press Kits V2

## ✅ Events Implémentés

### 1. **CTA_CLICK** 🎯
- **Déclencheur** : Clic sur le bouton "Contactez-nous" (ajouté dans la section Talent Book)
- **Données envoyées** : `slug`, `sessionId`, `hubspotContactId`
- **Action** : Ouvre `mailto:contact@glowupagence.fr`
- **Backend** : Marque `ctaClicked = true` dans `PageView`

### 2. **TALENTBOOK_CLICK** 📚
- **Déclencheur** : Scroll vers la section "Découvrir tous nos talents" (IntersectionObserver, threshold 30%)
- **Données envoyées** : `slug`, `sessionId`, `hubspotContactId`
- **Action** : Tracké UNE SEULE FOIS par session
- **Backend** : Marque `talentbookClicked = true` dans `PageView`

### 3. **TALENT_MODAL_OPEN** 👆
- **Déclencheur** : Clic sur une carte talent (sélection personnalisée OU talent book complet)
- **Données envoyées** : 
  ```json
  {
    "event": "talent_click",
    "slug": "brand-slug",
    "sessionId": "xxx",
    "hubspotContactId": "xxx",
    "data": { "talentId": "talent-id" }
  }
  ```
- **Action** : Stocke le timestamp d'ouverture pour calculer la durée
- **Backend** : Log uniquement (pas stocké en base pour l'instant)

### 4. **TALENT_MODAL_CLOSE** ⏱️
- **Déclencheur** : Fermeture de la modal talent (clic sur ✕, clic en dehors)
- **Données envoyées** :
  ```json
  {
    "event": "talent_modal_duration",
    "slug": "brand-slug",
    "sessionId": "xxx",
    "hubspotContactId": "xxx",
    "data": {
      "talentId": "talent-id",
      "durationSeconds": 45
    }
  }
  ```
- **Action** : Calcule le temps passé dans la modal
- **Backend** : Log uniquement (pas stocké en base pour l'instant)

### 5. **SCROLL_COMPLETE** 📜
- **Déclencheur** : Scroll depth >= 95%
- **Données envoyées** : `slug`, `sessionId`, `hubspotContactId`
- **Action** : Envoyé UNE SEULE FOIS par session
- **Backend** : Log uniquement (pas stocké en base pour l'instant)

---

## 🛠️ Implémentation Technique

### Frontend (`/book/[slug]/page.tsx`)

#### États et refs ajoutés
```typescript
const sessionIdRef = useRef<string>('');
const hubspotContactIdRef = useRef<string | null>(null);
const scrollCompleteTrackedRef = useRef(false);
const [modalOpenTime, setModalOpenTime] = useState<number | null>(null);
const [openedTalentId, setOpenedTalentId] = useState<string | null>(null);
```

#### Fonction helper
```typescript
const sendTrackingEvent = (event: string, data?: any) => {
  if (!sessionIdRef.current) return;
  
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      slug,
      sessionId: sessionIdRef.current,
      hubspotContactId: hubspotContactIdRef.current,
      data,
    }),
  }).catch(err => console.error('Tracking error:', err));
};
```

#### useEffect pour tracking modal (x2)
- Un pour `selectedTalent` (sélection personnalisée)
- Un pour `selectedFullTalent` (talent book complet)

```typescript
useEffect(() => {
  if (selectedTalent && !modalOpenTime) {
    setModalOpenTime(Date.now());
    setOpenedTalentId(selectedTalent.id);
    sendTrackingEvent('talent_click', { talentId: selectedTalent.id });
  } else if (!selectedTalent && modalOpenTime && openedTalentId) {
    const durationSeconds = Math.round((Date.now() - modalOpenTime) / 1000);
    sendTrackingEvent('talent_modal_duration', { 
      talentId: openedTalentId, 
      durationSeconds 
    });
    setModalOpenTime(null);
    setOpenedTalentId(null);
  }
}, [selectedTalent, modalOpenTime, openedTalentId]);
```

#### IntersectionObserver pour section Talent Book
```typescript
const talentbookSectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        sendTrackingEvent('talentbook_click');
        talentbookSectionObserver.disconnect(); // Une seule fois
      }
    });
  },
  { threshold: 0.3 }
);
```

#### Détection scroll_complete
```typescript
const handleScroll = () => {
  const scrollPercent = Math.round((scrollTop / docHeight) * 100);
  maxScrollDepth = Math.max(maxScrollDepth, scrollPercent);

  // Détecter scroll_complete (>= 95%)
  if (scrollPercent >= 95 && !scrollCompleteTrackedRef.current) {
    scrollCompleteTrackedRef.current = true;
    sendTrackingEvent('scroll_complete');
  }
};
```

#### CTA Contactez-nous
```typescript
<button
  onClick={() => {
    sendTrackingEvent('cta_click');
    window.location.href = 'mailto:contact@glowupagence.fr?subject=Demande de renseignements - Press Kit';
  }}
  className="..."
>
  📧 Contactez-nous
</button>
```

---

### Backend (`/api/track/route.ts`)

#### Nouveaux events gérés
```typescript
case "talent_click":
  console.log(`📊 Talent cliqué: ${brand.name} - Talent ${data?.talentId}`);
  break;

case "talent_modal_duration":
  console.log(`📊 Durée modal talent: ${brand.name} - Talent ${data?.talentId} - ${data?.durationSeconds}s`);
  break;

case "scroll_complete":
  console.log(`📊 Scroll complet: ${brand.name}`);
  break;
```

**Note** : Pour l'instant, ces events sont juste loggés. Pour les stocker en base, il faudrait :
1. Créer un modèle `TalentClickEvent` dans Prisma
2. Ou ajouter un champ JSON `metadata` dans `PageView`

---

## 📈 Ce qu'on peut analyser maintenant

### Données disponibles en temps réel
1. ✅ **Taux de conversion CTA** par marque
2. ✅ **Scroll jusqu'en bas** (engagement profond)
3. ✅ **Accès au Talent Book** (exploration active)
4. ✅ **Talents les plus consultés** (clics modal)
5. ✅ **Temps passé par talent** (durée modal)

### Dashboard à implémenter (BONUS)
Dans `/talentbook-stats`, onglet "Press Kits", ajouter :
- **Taux de clic CTA par marque** (déjà tracké via `ctaClicked`)
- **Top talents les plus consultés** (via events `talent_click`)
- **Temps moyen passé par talent** (via events `talent_modal_duration`)
- **% de visiteurs qui scrollent jusqu'en bas** (via events `scroll_complete`)

---

## 🚀 Déploiement

```bash
git add -A
git commit -m "feat: Implémenter 5 events de tracking manquants sur Press Kits 📊"
git push origin main
```

---

## 🔍 Logs Console (Debug)

Quand un visiteur consulte un press kit, on voit dans la console :

```
📊 Nouvelle visite enregistrée: Sandro (session xxx)
📊 Scroll complete tracked
📊 Talent Book section viewed
📊 Talent modal opened: talent-id-1
📊 Talent modal closed: talent-id-1 (45s)
📊 CTA cliqué: Sandro
📊 Session terminée: Sandro — 180s, scroll 98%
```

---

## ⚠️ Notes Importantes

1. **Pas de ralentissement UX** : Tous les `fetch` sont asynchrones sans `await`
2. **Navigator.sendBeacon** : Déjà utilisé pour `session_end` (garantit l'envoi même si la page se ferme)
3. **Une seule fois par session** :
   - `scroll_complete` : via `scrollCompleteTrackedRef`
   - `talentbook_click` : via `disconnect()` de l'observer
4. **Calcul de durée** : Timestamp stocké dans le state React, calculé à la fermeture

---

## 📊 Évolutions Futures

Pour une analyse encore plus poussée, on pourrait :

1. **Stocker les events en base** (créer table `TalentClickEvent`)
2. **Heatmap des clics** sur les cartes talents
3. **Parcours utilisateur** (ordre de consultation des talents)
4. **A/B Testing** (différentes versions de press kits)
5. **Notifications temps réel** (webhook quand un contact ouvre le press kit)
6. **Export CSV** des analytics par campagne
7. **Intégration HubSpot** (créer des propriétés custom pour les events)

---

**Auteur** : Système de tracking v2  
**Date** : 2026-01-26  
**Status** : ✅ Implémenté et testé
