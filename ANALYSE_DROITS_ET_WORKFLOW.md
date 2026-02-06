# 🔐 ANALYSE COMPLÈTE DES DROITS PAR RÔLE

## 📊 Vue d'ensemble des rôles

```
ADMIN                  → Accès complet, toutes les actions
HEAD_OF                → Validation, génération documents, lecture complète
HEAD_OF_INFLUENCE      → Idem HEAD_OF (spécialisation influence)
HEAD_OF_SALES          → Idem HEAD_OF (spécialisation sales)
TM (Talent Manager)    → Gestion de ses talents/négos, lecture limitée
CM (Community Manager) → Accès limité (peu utilisé actuellement)
TALENT                 → Accès très limité, doit pouvoir uploader sa facture ⚠️
```

---

## 🎯 PROBLÈME IDENTIFIÉ

### ❌ Ce qui manque actuellement

1. **Upload de facture par le TALENT**
   - Le talent NE PEUT PAS uploader sa facture actuellement
   - Champs existants dans la DB : `factureTalentUrl`, `factureTalentRecueAt`
   - Aucun endpoint API pour cet upload
   - Aucune interface frontend pour le talent

2. **Vue "Dossier Complet" pour l'ADMIN**
   - Pas de page centralisée montrant tout le cycle de vie d'une collaboration
   - Négociation → Devis → Collaboration → Facture client → Facture talent → Paiement
   - Les documents sont éparpillés entre plusieurs pages

---

## 📋 DROITS ACTUELS PAR RÔLE

### 👑 ADMIN (Accès Complet)

#### Pages accessibles
- ✅ Dashboard
- ✅ Talents (tous)
- ✅ Marques
- ✅ Collaborations (toutes)
- ✅ Négociations (toutes)
- ✅ Factures (toutes)
- ✅ Paramètres

#### Actions API
```typescript
✅ POST /api/talents                     // Créer talent
✅ PUT /api/talents/[id]                 // Modifier n'importe quel talent
✅ DELETE /api/talents/[id]              // Supprimer talent
✅ POST /api/negociations               // Créer négociation
✅ PUT /api/negociations/[id]           // Modifier n'importe quelle négo
✅ POST /api/negociations/[id]/valider  // Valider négociation
✅ POST /api/documents/generate         // Générer documents
✅ POST /api/documents/[id]/annuler     // Annuler documents
✅ POST /api/documents/[id]/payer       // Marquer comme payé
✅ POST /api/documents/avoir            // Créer avoir
✅ GET /api/documents/archives          // Voir archives
✅ PUT /api/collaborations/[id]         // Modifier collaboration
✅ DELETE /api/collaborations/[id]      // Supprimer collaboration
```

---

### 👥 HEAD_OF / HEAD_OF_INFLUENCE / HEAD_OF_SALES

#### Pages accessibles
- ✅ Dashboard
- ✅ Talents (tous)
- ✅ Marques
- ✅ Collaborations (toutes)
- ✅ Négociations (toutes)
- ✅ Factures (lecture seule)
- ❌ Paramètres

#### Actions API
```typescript
✅ GET /api/talents                      // Voir tous les talents
✅ POST /api/talents                     // Créer talent
✅ PUT /api/talents/[id]                 // Modifier talent
❌ DELETE /api/talents/[id]              // Supprimer talent
✅ POST /api/negociations               // Créer négociation
✅ PUT /api/negociations/[id]           // Modifier n'importe quelle négo
✅ POST /api/negociations/[id]/valider  // Valider/Refuser négociation
✅ POST /api/negociations/[id]/marquer-vu // Marquer comme vu
✅ POST /api/documents/generate         // Générer documents
✅ POST /api/documents/[id]/envoyer     // Envoyer documents
✅ POST /api/documents/[id]/avoir       // Créer avoir
❌ POST /api/documents/[id]/payer       // Marquer comme payé (ADMIN only)
❌ POST /api/documents/[id]/annuler     // Annuler document (ADMIN only)
✅ GET /api/factures                    // Voir stats factures (lecture)
✅ PUT /api/collaborations/[id]         // Modifier collaboration
❌ DELETE /api/collaborations/[id]      // Supprimer (ADMIN only)
```

---

### 🎤 TM (Talent Manager)

#### Pages accessibles
- ✅ Dashboard
- ✅ Talents (ses talents uniquement)
- ✅ Marques
- ✅ Collaborations (ses talents uniquement)
- ✅ Négociations (ses négociations uniquement)
- ❌ Factures
- ❌ Paramètres

#### Actions API
```typescript
✅ GET /api/talents                      // Voir UNIQUEMENT ses talents (filtré par managerId)
❌ POST /api/talents                     // Créer talent (HEAD_OF+ only)
✅ PUT /api/talents/[id]                 // Modifier SES talents uniquement
❌ DELETE /api/talents/[id]              // Supprimer talent
✅ POST /api/negociations               // Créer négociation
✅ PUT /api/negociations/[id]           // Modifier SES négociations uniquement
✅ POST /api/negociations/[id]/soumettre // Soumettre SA négociation
❌ POST /api/negociations/[id]/valider  // Valider (HEAD_OF+ only)
✅ POST /api/negociations/[id]/commentaires // Commenter
✅ GET /api/collaborations              // Voir collaborations de ses talents
✅ PATCH /api/collaborations/[id]       // Changer statut (PUBLIE, EN_COURS, etc.)
❌ POST /api/documents/generate         // Générer documents (HEAD_OF+ only)
✅ POST /api/upload                     // Uploader photo talent
```

**Filtrage automatique :**
```typescript
// Dans /api/talents/route.ts
if (user.role === "TM") {
  whereClause = { managerId: user.id }; // Ne voit QUE ses talents
}

// Dans /api/negociations/route.ts
if (user.role === "TM") {
  where.tmId = user.id; // Ne voit QUE ses négociations
}
```

---

### ⭐ TALENT (Actuellement très limité)

#### Pages accessibles
- ✅ Dashboard
- ✅ Collaborations (ses collaborations uniquement) ⚠️ **Lecture seule**
- ❌ Talents
- ❌ Marques
- ❌ Négociations
- ❌ Factures
- ❌ Paramètres

#### Actions API actuelles
```typescript
✅ GET /api/collaborations              // Voir SES collaborations uniquement
❌ POST /api/collaborations/[id]/upload-facture  // ❌ N'EXISTE PAS !
```

#### ⚠️ **CE QUI MANQUE POUR LE TALENT**

Le talent devrait pouvoir :
1. ✅ Voir ses collaborations
2. ❌ **Uploader sa facture quand la collaboration est PUBLIÉE** (manquant !)
3. ❌ Voir le montant qu'il doit recevoir (net talent)
4. ❌ Voir le statut de paiement de sa facture

---

## 🔧 SOLUTION PROPOSÉE

### 1. Nouveau Endpoint API : Upload Facture Talent

#### `POST /api/collaborations/[id]/upload-facture-talent`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;

    // 1. Vérifier que la collaboration existe
    const collaboration = await prisma.collaboration.findUnique({
      where: { id },
      include: {
        talent: { select: { userId: true } },
      },
    });

    if (!collaboration) {
      return NextResponse.json({ error: "Collaboration non trouvée" }, { status: 404 });
    }

    // 2. Vérifier que c'est bien le talent propriétaire
    if (collaboration.talent.userId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    // 3. Vérifier que la collaboration est au statut PUBLIE ou après
    if (!["PUBLIE", "FACTURE_RECUE", "PAYE"].includes(collaboration.statut)) {
      return NextResponse.json(
        { error: "Vous pouvez uploader votre facture uniquement après publication" },
        { status: 400 }
      );
    }

    // 4. Récupérer le fichier depuis le formData
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const montant = formData.get("montant") as string;

    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    // 5. Upload vers Cloudinary
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    const result = await cloudinary.uploader.upload(base64, {
      folder: "glowup-factures-talents",
      public_id: `${id}-${Date.now()}`,
      resource_type: "auto", // Accepte PDF, images, etc.
    });

    // 6. Mettre à jour la collaboration
    const updated = await prisma.collaboration.update({
      where: { id },
      data: {
        factureTalentUrl: result.secure_url,
        factureTalentRecueAt: new Date(),
        statut: "FACTURE_RECUE", // Passe automatiquement à FACTURE_RECUE
      },
    });

    // 7. Créer une notification pour le TM et ADMIN
    const talent = await prisma.talent.findUnique({
      where: { id: collaboration.talentId },
      include: {
        manager: { select: { id: true } },
      },
    });

    if (talent?.manager) {
      await prisma.notification.create({
        data: {
          userId: talent.manager.id,
          type: "FACTURE_RECUE",
          titre: "Facture talent reçue",
          message: `${talent.prenom} ${talent.nom} a uploadé sa facture pour ${collaboration.reference}`,
          lien: `/collaborations/${id}`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      url: result.secure_url,
      collaboration: updated,
    });
  } catch (error) {
    console.error("Erreur upload facture talent:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'upload" },
      { status: 500 }
    );
  }
}
```

---

### 2. Interface Frontend pour le TALENT

#### Modifier `/src/app/(dashboard)/collaborations/[id]/page.tsx`

Ajouter une section pour le talent :

```tsx
// Nouveau composant pour le talent
{session?.user?.role === "TALENT" && collab.statut === "PUBLIE" && !collab.factureTalentUrl && (
  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6">
    <div className="flex items-start gap-4">
      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
        <Receipt className="w-6 h-6 text-blue-600" />
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-blue-900 text-lg mb-2">
          📄 Uploadez votre facture
        </h3>
        <p className="text-sm text-blue-700 mb-4">
          La collaboration est publiée ! Vous pouvez maintenant uploader votre facture.
        </p>
        <p className="text-sm text-blue-600 font-medium mb-3">
          Montant net à facturer : {formatMoney(collab.montantNet)}
        </p>
        
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileSelect}
            className="hidden"
            id="facture-upload"
          />
          <label
            htmlFor="facture-upload"
            className="px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 cursor-pointer transition-colors flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Choisir ma facture
          </label>
          {selectedFile && (
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <FileText className="w-4 h-4" />
              <span>{selectedFile.name}</span>
              <button
                onClick={uploadFactureTalent}
                disabled={uploading}
                className="ml-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Envoyer"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
)}

{/* Si la facture est déjà uploadée */}
{collab.factureTalentUrl && (
  <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <p className="font-semibold text-green-900">Facture reçue</p>
          <p className="text-sm text-green-700">
            Envoyée le {collab.factureTalentRecueAt && new Date(collab.factureTalentRecueAt).toLocaleDateString("fr-FR")}
          </p>
        </div>
      </div>
      <a
        href={collab.factureTalentUrl}
        target="_blank"
        className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center gap-2"
      >
        <Download className="w-4 h-4" />
        Télécharger
      </a>
    </div>
  </div>
)}
```

#### Handler JS à ajouter

```typescript
const [selectedFile, setSelectedFile] = useState<File | null>(null);
const [uploading, setUploading] = useState(false);

const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.files && e.target.files[0]) {
    setSelectedFile(e.target.files[0]);
  }
};

const uploadFactureTalent = async () => {
  if (!selectedFile) return;
  
  setUploading(true);
  try {
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("montant", collab.montantNet.toString());
    
    const res = await fetch(`/api/collaborations/${collab.id}/upload-facture-talent`, {
      method: "POST",
      body: formData,
    });
    
    if (res.ok) {
      alert("Facture envoyée avec succès !");
      fetchCollab(); // Refresh la page
      setSelectedFile(null);
    } else {
      const error = await res.json();
      alert(error.error || "Erreur lors de l'upload");
    }
  } catch (error) {
    alert("Erreur lors de l'upload");
  } finally {
    setUploading(false);
  }
};
```

---

### 3. Vue "Dossier Complet" pour l'ADMIN

#### Nouvelle page : `/src/app/(dashboard)/collaborations/[id]/dossier/page.tsx`

```tsx
// Vue chronologique complète du cycle de vie de la collaboration

export default function DossierCompletPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-glowup-licorice mb-8">
        📁 Dossier Complet - {collab.reference}
      </h1>
      
      {/* Timeline chronologique */}
      <div className="space-y-6">
        {/* 1. Négociation */}
        {negociation && (
          <Card title="1. Négociation" icon={TrendingUp} color="amber">
            <div className="grid grid-cols-3 gap-4">
              <InfoBox label="Référence" value={negociation.reference} />
              <InfoBox label="TM" value={`${negociation.tm.prenom} ${negociation.tm.nom}`} />
              <InfoBox label="Statut" value={negociation.statut} />
              <InfoBox label="Budget souhaité" value={formatMoney(negociation.budgetSouhaite)} />
              <InfoBox label="Budget final" value={formatMoney(negociation.budgetFinal)} />
              <InfoBox label="Validé le" value={negociation.dateValidation} />
            </div>
            <Link href={`/negociations/${negociation.id}`} className="btn-link">
              Voir la négociation
            </Link>
          </Card>
        )}
        
        {/* 2. Devis */}
        {devis && (
          <Card title="2. Devis Client" icon={FileText} color="blue">
            <div className="grid grid-cols-4 gap-4">
              <InfoBox label="Référence" value={devis.reference} />
              <InfoBox label="Montant HT" value={formatMoney(devis.montantHT)} />
              <InfoBox label="Montant TTC" value={formatMoney(devis.montantTTC)} />
              <InfoBox label="Statut" value={devis.statut} />
            </div>
            <a href={`/api/documents/${devis.id}/pdf`} target="_blank" className="btn-primary">
              Télécharger le devis
            </a>
          </Card>
        )}
        
        {/* 3. Collaboration */}
        <Card title="3. Collaboration" icon={Handshake} color="green">
          <div className="grid grid-cols-4 gap-4">
            <InfoBox label="Référence" value={collab.reference} />
            <InfoBox label="Statut" value={collab.statut} />
            <InfoBox label="Montant brut" value={formatMoney(collab.montantBrut)} />
            <InfoBox label="Commission" value={`${collab.commissionPercent}% (${formatMoney(collab.commissionEuros)})`} />
            <InfoBox label="Net talent" value={formatMoney(collab.montantNet)} />
            <InfoBox label="Publié le" value={collab.datePublication} />
          </div>
          <Link href={`/collaborations/${collab.id}`} className="btn-link">
            Voir la collaboration
          </Link>
        </Card>
        
        {/* 4. Facture Client */}
        {factureClient && (
          <Card title="4. Facture Client (Marque → Agence)" icon={Receipt} color="emerald">
            <div className="grid grid-cols-4 gap-4">
              <InfoBox label="Référence" value={factureClient.reference} />
              <InfoBox label="Montant TTC" value={formatMoney(factureClient.montantTTC)} />
              <InfoBox label="Statut" value={factureClient.statut} />
              <InfoBox label="Date échéance" value={factureClient.dateEcheance} />
              <InfoBox label="Date paiement" value={factureClient.datePaiement || "En attente"} />
            </div>
            <a href={`/api/documents/${factureClient.id}/pdf`} target="_blank" className="btn-primary">
              Télécharger la facture
            </a>
          </Card>
        )}
        
        {/* 5. Facture Talent */}
        {collab.factureTalentUrl ? (
          <Card title="5. Facture Talent (Talent → Agence)" icon={Upload} color="violet">
            <div className="grid grid-cols-3 gap-4">
              <InfoBox label="Montant attendu" value={formatMoney(collab.montantNet)} />
              <InfoBox label="Reçue le" value={collab.factureTalentRecueAt} />
              <InfoBox label="Statut paiement" value={collab.paidAt ? "Payé" : "En attente"} />
            </div>
            <div className="flex gap-3">
              <a href={collab.factureTalentUrl} target="_blank" className="btn-primary">
                Voir la facture talent
              </a>
              {!collab.paidAt && (
                <button onClick={marquerPayeTalent} className="btn-success">
                  Marquer comme payé
                </button>
              )}
            </div>
          </Card>
        ) : (
          <Card title="5. Facture Talent (Talent → Agence)" icon={Upload} color="gray">
            <p className="text-gray-500">⏳ En attente de la facture du talent</p>
          </Card>
        )}
        
        {/* 6. Paiement Final */}
        {collab.paidAt && (
          <Card title="6. ✅ Paiement Effectué" icon={CheckCircle2} color="green">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-green-800 font-semibold">
                Talent payé le {new Date(collab.paidAt).toLocaleDateString("fr-FR")}
              </p>
              <p className="text-green-600 text-sm mt-1">
                Dossier complet et clôturé
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
```

---

## 📊 Tableau Récapitulatif des Droits

| Action | ADMIN | HEAD_OF | TM | TALENT |
|--------|-------|---------|----|----- ---|
| Voir tous les talents | ✅ | ✅ | ❌ Ses talents | ❌ |
| Créer talent | ✅ | ✅ | ❌ | ❌ |
| Supprimer talent | ✅ | ❌ | ❌ | ❌ |
| Créer négociation | ✅ | ✅ | ✅ | ❌ |
| Modifier négociation | ✅ | ✅ | ✅ Ses négos | ❌ |
| Valider négociation | ✅ | ✅ | ❌ | ❌ |
| Soumettre négociation | ✅ | ✅ | ✅ | ❌ |
| Générer documents | ✅ | ✅ | ❌ | ❌ |
| Annuler documents | ✅ | ❌ | ❌ | ❌ |
| Marquer facture payée | ✅ | ❌ | ❌ | ❌ |
| Voir collaborations | ✅ | ✅ | ✅ Ses talents | ✅ Ses collabs |
| Modifier collab statut | ✅ | ✅ | ✅ | ❌ |
| **Uploader facture talent** | ✅ | ❌ | ❌ | ✅ 🆕 |
| Voir dossier complet | ✅ 🆕 | ✅ 🆕 | ❌ | ❌ |

---

## ✅ Résumé des Améliorations Proposées

### 🆕 Nouveautés pour le TALENT
1. ✅ Endpoint API pour uploader sa facture
2. ✅ Interface dédiée dans la page collaboration
3. ✅ Notification automatique au TM quand facture uploadée
4. ✅ Passage automatique du statut PUBLIE → FACTURE_RECUE

### 🆕 Nouveautés pour l'ADMIN
1. ✅ Page "Dossier Complet" par collaboration
2. ✅ Vue chronologique complète du cycle de vie
3. ✅ Accès rapide à tous les documents (négociation, devis, factures)
4. ✅ Visibilité sur la facture talent uploadée
5. ✅ Action "Marquer talent comme payé"

### 🔒 Sécurité
- ✅ Vérification que le talent est propriétaire
- ✅ Vérification que le statut est PUBLIE ou après
- ✅ Upload vers Cloudinary sécurisé
- ✅ Notifications automatiques

---

## 🚀 Prochaines Étapes

1. **Implémenter l'endpoint d'upload facture talent**
2. **Créer l'interface frontend pour le talent**
3. **Créer la page "Dossier Complet"**
4. **Tester le workflow complet**
5. **Former les talents à l'utilisation**

Le système sera alors **complet de bout en bout** ! 🎉
