# 🏢 Système de Marques avec API Recherche d'entreprises

## 📋 Vue d'ensemble

Le système de création de marques a été simplifié en **2 étapes** :

1. **Création rapide** : Juste le nom + secteur (optionnel)
2. **Complétion automatique** : Recherche via API Recherche d'entreprises (api.gouv.fr) pour auto-remplir les données légales

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

### Auto-complétion via API Recherche d'entreprises (`/marques/[id]/edit`)

Sur la page d'édition (Step 2: "Adresse & Légal") et dans le modal "Compléter les infos marque" (génération devis/facture), un module de recherche apparaît :

- **Recherche par** :
  - Nom de l'entreprise
  - Numéro SIRET

- **Données importées automatiquement** :
  - Raison sociale
  - Forme juridique (code)
  - SIRET
  - Numéro TVA intracommunautaire (calculé à partir du SIREN pour les sociétés françaises)
  - Adresse complète du siège
  - Code postal, ville, pays

---

## 🔧 Configuration

### API Recherche d'entreprises — Gratuite, sans clé

- **Aucune clé API requise** : l'API est publique et gratuite
- **Limite** : 7 requêtes par seconde par utilisateur
- **Documentation** : https://recherche-entreprises.api.gouv.fr/docs/

Aucune variable d'environnement à configurer.

---

## 🚀 Endpoints API

### `GET /api/recherche-entreprise?query=Nike`

**Paramètres** :
- `query` (required) : Nom ou SIRET de l'entreprise (min 2 caractères)

**Réponse** :

```json
{
  "success": true,
  "count": 5,
  "results": [
    {
      "nom_entreprise": "NIKE FRANCE",
      "siret": "12345678900012",
      "numero_tva_intracommunautaire": "FR19356000000",
      "forme_juridique": "5510",
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
   → Module de recherche API Recherche d'entreprises visible
   
3. Recherche "Nike France"
   → Liste de résultats apparaît
   → Clic sur un résultat pour importer
   
4. ✅ Tous les champs légaux sont auto-remplis
   → SIRET, TVA (calculée), adresse, etc.
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
- Données officielles (api.gouv.fr)
- **Gratuit, sans quota**
- **30 secondes par marque** ⚡

---

## 🛠️ Fichiers modifiés

### Frontend

- **`src/app/(dashboard)/marques/new/page.tsx`**
  - Formulaire simplifié (1 page, 4 champs)
  - Redirection vers edit avec `?complete=true`

- **`src/app/(dashboard)/marques/[id]/edit/page.tsx`**
  - Module de recherche sur Step 2
  - Auto-remplissage des champs

- **`src/app/(dashboard)/collaborations/[id]/page.tsx`**
  - Modal "Compléter les infos marque" avec recherche à la génération devis/facture

### Backend

- **`src/app/api/recherche-entreprise/route.ts`**
  - Appel à API Recherche d'entreprises (recherche-entreprises.api.gouv.fr)
  - Calcul du numéro TVA français à partir du SIREN
  - Transformation des données au format attendu par le frontend

---

## 🧪 Tests

### 1. Tester la création rapide

```
1. Aller sur /marques/new
2. Entrer juste "Nike"
3. Cliquer "Créer"
4. Vérifier redirection vers /marques/[id]/edit
```

### 2. Tester la recherche

```
1. Sur la page d'édition, aller au Step 2
2. Voir le module "API Recherche d'entreprises"
3. Rechercher "Nike France" ou "La Poste"
4. Cliquer sur un résultat
5. Vérifier que les champs sont remplis
```

### 3. Tester à la génération devis

```
1. Ouvrir une collaboration dont la marque n'a pas d'adresse
2. Cliquer "Générer devis"
3. Le modal "Informations manquantes" s'ouvre
4. Rechercher l'entreprise par nom ou SIRET
5. Sélectionner un résultat et enregistrer
```

---

## 🔐 Sécurité

- ✅ Authentification requise (NextAuth)
- ✅ Validation des inputs
- ✅ Gestion des erreurs API
- ✅ User-Agent explicite dans les requêtes (recommandé par api.gouv.fr)

---

## 📈 Évolutions possibles

### Court terme
- [ ] Recherche par SIREN (9 chiffres)
- [ ] Import contact dirigeant principal
- [ ] Afficher date de création entreprise

### Moyen terme
- [ ] Cache des recherches fréquentes
- [ ] Support entreprises internationales (hors France)

---

## 📞 Support

**API Recherche d'entreprises** : https://recherche-entreprises.api.gouv.fr/docs/  
**Fiche métier** : https://api.gouv.fr/les-api/api-recherche-entreprises

---

## ✅ Checklist déploiement

- [x] Aucune clé API à configurer
- [ ] Tester la recherche en production
- [ ] Former les utilisateurs au workflow

---

Créé le : **26 janvier 2026**  
Dernière mise à jour : **17 février 2026** — Migration vers API Recherche d'entreprises (gratuite)
