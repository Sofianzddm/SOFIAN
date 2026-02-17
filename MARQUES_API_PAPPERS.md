# 🏢 Système de Marques avec API Pappers

## 📋 Vue d'ensemble

Le système de création de marques a été simplifié en **2 étapes** :

1. **Création rapide** : Juste le nom + secteur (optionnel)
2. **Complétion automatique** : Recherche via API Pappers pour auto-remplir les données légales

---

## 🎯 Fonctionnalités

### Création de marque simplifiée (`/marques/new`)

- **Champs obligatoires** :
  - Nom de la marque
  
- **Champs optionnels** :
  - Secteur d'activité
  - Site web
  - Notes internes

Après création, l'utilisateur est redirigé vers `/marques/[id]/edit?complete=true` pour compléter les infos.

### Auto-complétion via API Pappers (`/marques/[id]/edit`)

Sur la page d'édition (Step 2: "Adresse & Légal"), un module de recherche apparaît :

- **Recherche par** :
  - Nom de l'entreprise
  - Numéro SIRET

- **Données importées automatiquement** :
  - Raison sociale
  - Forme juridique (SAS, SARL, etc.)
  - SIRET
  - Numéro TVA intracommunautaire
  - Adresse complète du siège
  - Code postal, ville, pays

---

## 🔧 Configuration

### 1. Obtenir une clé API Pappers

1. Créer un compte sur [Pappers.fr](https://www.pappers.fr)
2. Aller dans l'onglet [API](https://www.pappers.fr/api)
3. Copier votre clé API
4. Ajouter dans `.env` :

```bash
PAPPERS_API_KEY=votre_cle_api_ici
```

### 2. Plan gratuit Pappers

- **250 recherches/mois** gratuites
- Idéal pour tester et petites structures
- Plans payants disponibles pour volumes supérieurs

---

## 🚀 Endpoints API

### `GET /api/recherche-entreprise?query=Nike`

**Paramètres** :
- `query` (required) : Nom ou SIRET de l'entreprise

**Réponse** :

```json
{
  "success": true,
  "count": 5,
  "results": [
    {
      "nom_entreprise": "NIKE FRANCE",
      "siret": "123456789000 12",
      "numero_tva_intracommunautaire": "FR12345678901",
      "forme_juridique": "SAS",
      "adresse": "123 Rue de la Paix",
      "code_postal": "75001",
      "ville": "PARIS",
      "pays": "France"
    }
  ]
}
```

---

## 📊 Workflow utilisateur

```
1. Créer marque (/marques/new)
   → Nom: "Nike"
   → Secteur: "Sport"
   → Clic sur "Créer"
   
2. Redirection vers /marques/[id]/edit?complete=true
   → Step 2 : "Adresse & Légal"
   → Module de recherche Pappers visible
   
3. Recherche "Nike France"
   → Liste de résultats apparaît
   → Clic sur "Importer"
   
4. ✅ Tous les champs légaux sont auto-remplis
   → SIRET, TVA, adresse, etc.
   → L'utilisateur peut modifier si besoin
   
5. Clic sur "Enregistrer"
   → Marque complète prête à l'emploi
```

---

## 💡 Avantages

### Avant
- 3 steps obligatoires
- Remplissage manuel de tous les champs
- Risque d'erreurs de saisie
- 5-10 minutes par marque

### Après
- 1 champ obligatoire (nom)
- Auto-complétion en 1 clic
- Données officielles certifiées
- **30 secondes par marque** ⚡

---

## 🛠️ Fichiers modifiés

### Frontend

- **`src/app/(dashboard)/marques/new/page.tsx`**
  - Formulaire simplifié (1 page, 4 champs)
  - Redirection vers edit avec `?complete=true`

- **`src/app/(dashboard)/marques/[id]/edit/page.tsx`**
  - Module de recherche Pappers sur Step 2
  - Auto-remplissage des champs
  - UI avec résultats de recherche

### Backend

- **`src/app/api/recherche-entreprise/route.ts`** (nouveau)
  - Endpoint de recherche via API Pappers
  - Transformation des données
  - Gestion des erreurs

- **`src/app/api/marques/route.ts`**
  - Déjà compatible : tous les champs sont optionnels sauf `nom`
  - Aucune modification nécessaire

### Configuration

- **`.env`**
  - Ajout de `PAPPERS_API_KEY`

---

## 🧪 Tests

### 1. Tester la création rapide

```
1. Aller sur /marques/new
2. Entrer juste "Nike"
3. Cliquer "Créer"
4. Vérifier redirection vers /marques/[id]/edit
```

### 2. Tester la recherche Pappers

```
1. Sur la page d'édition, aller au Step 2
2. Voir le module violet "API Pappers"
3. Rechercher "Nike France"
4. Cliquer sur un résultat
5. Vérifier que les champs sont remplis
```

### 3. Tester sans clé API

```
1. Supprimer PAPPERS_API_KEY du .env
2. Relancer le serveur
3. Tenter une recherche
4. Message d'erreur : "API Pappers non configurée"
```

---

## 🔐 Sécurité

- ✅ Clé API stockée côté serveur uniquement
- ✅ Authentification requise (NextAuth)
- ✅ Validation des inputs
- ✅ Gestion des erreurs API

---

## 📈 Évolutions possibles

### Court terme
- [ ] Recherche par SIREN (9 chiffres au lieu de 14)
- [ ] Import contact dirigeant principal
- [ ] Afficher date de création entreprise

### Moyen terme
- [ ] Cache des recherches fréquentes
- [ ] Historique des imports
- [ ] Support entreprises internationales (API alternative)

### Long terme
- [ ] Veille automatique sur les entreprises
- [ ] Notifications si changement (adresse, dirigeant)
- [ ] Suggestions de marques similaires

---

## 📞 Support

**API Pappers** : [support@pappers.fr](mailto:support@pappers.fr)  
**Documentation** : https://www.pappers.fr/api/documentation

---

## ✅ Checklist déploiement

- [ ] Ajouter `PAPPERS_API_KEY` dans Vercel Environment Variables
- [ ] Tester la recherche en production
- [ ] Vérifier le quota API (250/mois gratuit)
- [ ] Former les utilisateurs au nouveau workflow
- [ ] Mettre à jour la doc interne

---

Créé le : **26 janvier 2026**  
Dernière mise à jour : **26 janvier 2026**
