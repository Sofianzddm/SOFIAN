# 🌟 Glow Up Platform

Plateforme de gestion interne pour Glow Up Agence.

## 🚀 Quick Start

### 1. Installer les dépendances

```bash
npm install
```

### 2. Configurer l'environnement

Copier le fichier `.env.example` vers `.env` et remplir les valeurs :

```bash
cp .env.example .env
```

Configurer la `DATABASE_URL` avec votre base PostgreSQL (Neon recommandé).

### 3. Initialiser la base de données

```bash
# Générer le client Prisma
npm run db:generate

# Pousser le schéma vers la DB
npm run db:push

# Seed les données initiales
npm run db:seed
```

### 4. Lancer le serveur de développement

```bash
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000)

## 📁 Structure du projet

```
glowup-platform/
├── prisma/
│   ├── schema.prisma      # Schéma de la DB
│   └── seed.ts            # Données initiales
├── src/
│   ├── app/
│   │   ├── (auth)/        # Pages d'authentification
│   │   │   └── login/
│   │   ├── (dashboard)/   # Pages de l'app (protégées)
│   │   │   ├── dashboard/
│   │   │   ├── talents/
│   │   │   ├── marques/
│   │   │   ├── collaborations/
│   │   │   └── settings/
│   │   ├── api/           # API Routes
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/            # Composants UI réutilisables
│   │   ├── forms/         # Formulaires
│   │   └── layout/        # Layout (Sidebar, Header...)
│   └── lib/
│       ├── prisma.ts      # Client Prisma
│       ├── auth.ts        # Config NextAuth
│       └── utils.ts       # Fonctions utilitaires
├── public/
│   └── logo.svg
├── .env.example
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## 👥 Comptes par défaut

Après le seed, ces comptes sont disponibles (mot de passe: `admin123`) :

| Email | Rôle |
|-------|------|
| sofian@glowup-agence.com | Admin |
| maud@glowup-agence.com | Admin |
| headof@glowup-agence.com | Head of |
| daphné@glowup-agence.com | TM |
| joey@glowup-agence.com | TM |
| alice@glowup-agence.com | TM |
| coralie@glowup-agence.com | TM |
| cinssia@glowup-agence.com | TM |

## 🎨 Palette de couleurs

| Couleur | Hex | Usage |
|---------|-----|-------|
| Licorice | `#220101` | Fond sombre (login) |
| Old Rose | `#B06F70` | Accent principal, boutons |
| Tea Green | `#E5F2B5` | Succès, badges |
| Old Lace | `#F5EDE0` | Fond clair app |

## 📝 Scripts disponibles

```bash
npm run dev          # Lancer en développement
npm run build        # Build production
npm run start        # Lancer en production
npm run lint         # Vérifier le code
npm run db:generate  # Générer le client Prisma
npm run db:push      # Pousser le schéma
npm run db:studio    # Ouvrir Prisma Studio
npm run db:seed      # Seed la DB
```

## 🔧 Stack technique

- **Framework**: Next.js 15 + React 19
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL (Neon)
- **ORM**: Prisma
- **Auth**: NextAuth.js
- **Icons**: Lucide React
