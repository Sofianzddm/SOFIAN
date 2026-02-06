# 🏦 INTÉGRATION QONTO - RÉCONCILIATION BANCAIRE

Date : 27 Janvier 2026

---

## 🎯 OBJECTIF

Intégrer **Qonto** pour permettre à Maud (ADMIN) d'associer automatiquement les paiements bancaires aux factures clients.

---

## 📋 WORKFLOW COMPLET

### **Scénario type :**

```
1. 📄 Facture FACT-2026-001 envoyée au client (1 500€)
   Statut : ENVOYÉ

2. 💶 Client effectue un virement sur Qonto (1 500€)
   → Qonto reçoit le paiement

3. 📡 Qonto envoie webhook à l'app
   → Nouvelle transaction enregistrée

4. 🔔 Maud reçoit notification
   "Nouveau paiement Qonto : 1 500€"

5. 👀 Maud ouvre /reconciliation
   Voit : Transaction 1 500€ (non associée)
   Suggestions : FACT-2026-001 (1 500€) ✓

6. ✅ Maud clique "Associer"
   → Facture passe en statut PAYÉ
   → Transaction liée à la facture
   → Notification envoyée au client
```

---

## 🔧 ÉTAPE 1 : SETUP API QONTO

### **Prérequis**

1. **Compte Qonto Business**
2. **API Key Qonto** (dans les paramètres Qonto)
3. **Organization ID** et **Bank Account ID**

### **Documentation Qonto**

```
Base URL : https://thirdparty.qonto.com/v2
Auth : Bearer YOUR_API_KEY

Endpoints :
- GET /transactions : Récupérer les transactions
- GET /transactions/:id : Détail d'une transaction
- Webhooks : transaction.created, transaction.updated
```

### **Configuration dans l'app**

Créer `.env.local` (ou variables d'environnement) :

```env
QONTO_API_KEY=your_qonto_api_key_here
QONTO_ORGANIZATION_ID=your_org_id
QONTO_BANK_ACCOUNT_ID=your_bank_account_id
QONTO_WEBHOOK_SECRET=your_webhook_secret
```

---

## 💾 ÉTAPE 2 : SCHEMA PRISMA

Ajouter les modèles pour stocker les transactions Qonto :

```prisma
model TransactionQonto {
  id                String   @id @default(cuid())
  qontoId           String   @unique // ID Qonto de la transaction
  montant           Decimal  @db.Decimal(10, 2)
  devise            String   @default("EUR")
  libelle           String? // Libellé du virement
  reference         String? // Référence bancaire
  dateTransaction   DateTime
  emetteur          String? // Nom de l'émetteur
  emetteurIban      String? // IBAN de l'émetteur
  statut            String   @default("PENDING") // PENDING, SETTLED, DECLINED
  
  // Association
  associe           Boolean  @default(false)
  documentId        String?
  document          Document? @relation(fields: [documentId], references: [id], onDelete: SetNull)
  
  // Métadonnées
  metadata          Json? // Données brutes Qonto
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([documentId])
  @@index([associe])
  @@index([dateTransaction])
  @@map("transactions_qonto")
}

// Ajouter relation dans Document
model Document {
  // ... champs existants ...
  transactionsQonto TransactionQonto[]
}
```

**Migration SQL :**

```sql
CREATE TABLE "transactions_qonto" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "qontoId" TEXT NOT NULL UNIQUE,
  "montant" DECIMAL(10,2) NOT NULL,
  "devise" TEXT NOT NULL DEFAULT 'EUR',
  "libelle" TEXT,
  "reference" TEXT,
  "dateTransaction" TIMESTAMP(3) NOT NULL,
  "emetteur" TEXT,
  "emetteurIban" TEXT,
  "statut" TEXT NOT NULL DEFAULT 'PENDING',
  "associe" BOOLEAN NOT NULL DEFAULT false,
  "documentId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fk_document" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL
);

CREATE INDEX "idx_qonto_document" ON "transactions_qonto"("documentId");
CREATE INDEX "idx_qonto_associe" ON "transactions_qonto"("associe");
CREATE INDEX "idx_qonto_date" ON "transactions_qonto"("dateTransaction");
```

---

## 📡 ÉTAPE 3 : LIB QONTO CLIENT

Créer `/src/lib/qonto/client.ts` :

```typescript
/**
 * Client Qonto API
 */

interface QontoTransaction {
  id: string;
  amount: number;
  currency: string;
  label: string;
  reference: string;
  settled_at: string;
  emitter_name: string;
  emitter_iban: string;
  status: "pending" | "settled" | "declined";
  side: "credit" | "debit";
}

export class QontoClient {
  private apiKey: string;
  private baseUrl = "https://thirdparty.qonto.com/v2";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Qonto API Error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Récupérer les transactions (crédits uniquement = encaissements)
   */
  async getTransactions(params?: {
    settled_at_from?: string;
    settled_at_to?: string;
    status?: string;
  }) {
    const queryParams = new URLSearchParams({
      side: "credit", // Uniquement les encaissements
      per_page: "100",
      ...params,
    });

    const data = await this.request(`/transactions?${queryParams}`);
    return data.transactions as QontoTransaction[];
  }

  /**
   * Récupérer une transaction par ID
   */
  async getTransaction(id: string) {
    const data = await this.request(`/transactions/${id}`);
    return data.transaction as QontoTransaction;
  }

  /**
   * Sync : Importer les transactions récentes
   */
  async syncRecentTransactions(daysBack: number = 30) {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - daysBack);

    return this.getTransactions({
      settled_at_from: dateFrom.toISOString().split("T")[0],
      status: "settled",
    });
  }
}

export const qontoClient = new QontoClient(process.env.QONTO_API_KEY!);
```

---

## 🔄 ÉTAPE 4 : WEBHOOK QONTO

Créer `/src/app/api/webhooks/qonto/route.ts` :

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * Webhook Qonto : Nouvelle transaction
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Vérifier signature webhook
    const signature = request.headers.get("x-qonto-signature");
    const body = await request.text();

    if (!verifyQontoSignature(body, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(body);

    // 2. Gérer événement
    if (payload.event_name === "transaction.created") {
      const transaction = payload.transaction;

      // Enregistrer uniquement les crédits (encaissements)
      if (transaction.side === "credit" && transaction.status === "settled") {
        await prisma.transactionQonto.create({
          data: {
            qontoId: transaction.id,
            montant: transaction.amount / 100, // Qonto envoie en centimes
            devise: transaction.currency,
            libelle: transaction.label,
            reference: transaction.reference,
            dateTransaction: new Date(transaction.settled_at),
            emetteur: transaction.emitter_name,
            emetteurIban: transaction.emitter_iban,
            statut: "SETTLED",
            metadata: transaction,
          },
        });

        // Créer notification pour ADMIN (Maud)
        const admins = await prisma.user.findMany({
          where: { role: "ADMIN", actif: true },
        });

        for (const admin of admins) {
          await prisma.notification.create({
            data: {
              userId: admin.id,
              type: "PAIEMENT_RECU",
              titre: "💰 Nouveau paiement Qonto",
              message: `Encaissement de ${(transaction.amount / 100).toFixed(2)}€ - ${transaction.label}`,
              lien: "/reconciliation",
            },
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur webhook Qonto:", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}

function verifyQontoSignature(body: string, signature: string | null): boolean {
  if (!signature) return false;

  const secret = process.env.QONTO_WEBHOOK_SECRET!;
  const hash = crypto.createHmac("sha256", secret).update(body).digest("hex");

  return hash === signature;
}
```

**Configurer le webhook dans Qonto :**
```
URL : https://votre-domaine.com/api/webhooks/qonto
Événements : transaction.created, transaction.updated
Secret : [généré par Qonto]
```

---

## 🎨 ÉTAPE 5 : PAGE RÉCONCILIATION

Créer `/src/app/(dashboard)/reconciliation/page.tsx` :

```typescript
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Link2, CheckCircle2, AlertCircle, Banknote } from "lucide-react";

interface TransactionQonto {
  id: string;
  qontoId: string;
  montant: number;
  libelle: string;
  reference: string;
  dateTransaction: string;
  emetteur: string;
  associe: boolean;
  document?: {
    id: string;
    reference: string;
    type: string;
  };
}

interface FactureNonPayee {
  id: string;
  reference: string;
  montantTTC: number;
  marque: { nom: string };
  dateEmission: string;
  dateEcheance: string;
}

export default function ReconciliationPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<TransactionQonto[]>([]);
  const [facturesNonPayees, setFacturesNonPayees] = useState<FactureNonPayee[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [transactionsRes, facturesRes] = await Promise.all([
        fetch("/api/qonto/transactions"),
        fetch("/api/documents?type=FACTURE&statut=ENVOYÉ,EN_ATTENTE"),
      ]);

      if (transactionsRes.ok) {
        const data = await transactionsRes.json();
        setTransactions(data.transactions);
      }

      if (facturesRes.ok) {
        const data = await facturesRes.json();
        setFacturesNonPayees(data.documents);
      }
    } catch (error) {
      console.error("Erreur fetch:", error);
    } finally {
      setLoading(false);
    }
  };

  const syncQonto = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/qonto/sync", { method: "POST" });
      if (res.ok) {
        await fetchData();
        alert("✅ Synchronisation réussie !");
      }
    } catch (error) {
      alert("❌ Erreur de synchronisation");
    } finally {
      setSyncing(false);
    }
  };

  const associer = async (transactionId: string, factureId: string) => {
    try {
      const res = await fetch("/api/qonto/associate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, documentId: factureId }),
      });

      if (res.ok) {
        await fetchData();
        alert("✅ Paiement associé !");
      }
    } catch (error) {
      alert("❌ Erreur d'association");
    }
  };

  const getSuggestions = (transaction: TransactionQonto) => {
    return facturesNonPayees.filter(
      (facture) =>
        Math.abs(Number(facture.montantTTC) - transaction.montant) < 1 // Tolérance 1€
    );
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  const transactionsNonAssociees = transactions.filter((t) => !t.associe);

  return (
    <div className="min-h-screen bg-gradient-to-br from-glowup-lace via-white to-glowup-lace/30 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-glowup-licorice mb-2">
              🏦 Réconciliation Bancaire
            </h1>
            <p className="text-gray-600">
              Associez les paiements Qonto aux factures clients
            </p>
          </div>

          <button
            onClick={syncQonto}
            disabled={syncing}
            className="px-6 py-3 bg-gradient-to-r from-glowup-rose to-purple-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
          >
            {syncing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                Synchronisation...
              </>
            ) : (
              "🔄 Sync Qonto"
            )}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">À réconcilier</p>
                <p className="text-2xl font-bold text-glowup-licorice">
                  {transactionsNonAssociees.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Réconciliés</p>
                <p className="text-2xl font-bold text-glowup-licorice">
                  {transactions.filter((t) => t.associe).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                <Banknote className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Factures en attente</p>
                <p className="text-2xl font-bold text-glowup-licorice">
                  {facturesNonPayees.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Transactions non associées */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-xl font-bold text-glowup-licorice mb-6">
            💰 Transactions Qonto non associées
          </h2>

          {transactionsNonAssociees.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <p className="text-gray-600">
                ✅ Toutes les transactions sont réconciliées !
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {transactionsNonAssociees.map((transaction) => {
                const suggestions = getSuggestions(transaction);

                return (
                  <div
                    key={transaction.id}
                    className="border border-gray-200 rounded-xl p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-2xl font-bold text-green-600">
                            {transaction.montant.toFixed(2)}€
                          </span>
                          <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
                            Non associé
                          </span>
                        </div>
                        <p className="text-gray-700 font-medium mb-1">
                          {transaction.libelle}
                        </p>
                        <p className="text-sm text-gray-500">
                          De : {transaction.emetteur} •{" "}
                          {new Date(transaction.dateTransaction).toLocaleDateString("fr-FR")}
                        </p>
                        {transaction.reference && (
                          <p className="text-xs text-gray-400 mt-1">
                            Réf : {transaction.reference}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Suggestions */}
                    {suggestions.length > 0 && (
                      <div className="bg-blue-50 rounded-lg p-4 mt-4">
                        <p className="text-sm font-medium text-blue-900 mb-3">
                          💡 Suggestions ({suggestions.length})
                        </p>
                        <div className="space-y-2">
                          {suggestions.map((facture) => (
                            <div
                              key={facture.id}
                              className="flex items-center justify-between bg-white rounded-lg p-3"
                            >
                              <div>
                                <p className="font-medium text-gray-900">
                                  {facture.reference}
                                </p>
                                <p className="text-sm text-gray-600">
                                  {facture.marque.nom} •{" "}
                                  {Number(facture.montantTTC).toFixed(2)}€
                                </p>
                              </div>
                              <button
                                onClick={() =>
                                  associer(transaction.id, facture.id)
                                }
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                              >
                                <Link2 className="w-4 h-4" />
                                Associer
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Association manuelle */}
                    <details className="mt-4">
                      <summary className="text-sm text-gray-600 cursor-pointer hover:text-glowup-rose">
                        Associer manuellement...
                      </summary>
                      <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                        {facturesNonPayees.map((facture) => (
                          <div
                            key={facture.id}
                            className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                          >
                            <div>
                              <p className="font-medium text-gray-900 text-sm">
                                {facture.reference}
                              </p>
                              <p className="text-xs text-gray-600">
                                {facture.marque.nom} •{" "}
                                {Number(facture.montantTTC).toFixed(2)}€
                              </p>
                            </div>
                            <button
                              onClick={() =>
                                associer(transaction.id, facture.id)
                              }
                              className="px-3 py-1 bg-glowup-rose hover:bg-glowup-rose-dark text-white rounded-lg text-xs font-medium transition-colors"
                            >
                              Associer
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 🔗 ÉTAPE 6 : APIs

### **GET /api/qonto/transactions**

```typescript
// Récupérer transactions Qonto (depuis DB)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const transactions = await prisma.transactionQonto.findMany({
    orderBy: { dateTransaction: "desc" },
    include: { document: true },
  });

  return NextResponse.json({ transactions });
}
```

### **POST /api/qonto/sync**

```typescript
// Synchroniser avec Qonto (importer nouvelles transactions)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const qontoTransactions = await qontoClient.syncRecentTransactions(30);

  for (const transaction of qontoTransactions) {
    await prisma.transactionQonto.upsert({
      where: { qontoId: transaction.id },
      create: {
        qontoId: transaction.id,
        montant: transaction.amount / 100,
        // ... autres champs
      },
      update: {
        statut: transaction.status,
      },
    });
  }

  return NextResponse.json({ success: true, count: qontoTransactions.length });
}
```

### **POST /api/qonto/associate**

```typescript
// Associer transaction Qonto à une facture
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { transactionId, documentId } = await request.json();

  // Associer
  await prisma.transactionQonto.update({
    where: { id: transactionId },
    data: { associe: true, documentId },
  });

  // Marquer facture comme PAYÉ
  await prisma.document.update({
    where: { id: documentId },
    data: { statut: "PAYE", datePaiement: new Date() },
  });

  // Notifier client (optionnel)
  // ...

  return NextResponse.json({ success: true });
}
```

---

## ✅ AVANTAGES

- ✅ **Automatisation** : Plus besoin de vérifier manuellement les virements
- ✅ **Matching intelligent** : Suggestions automatiques par montant
- ✅ **Traçabilité** : Chaque paiement est lié à sa facture
- ✅ **Notifications** : Maud est prévenue en temps réel
- ✅ **Audit** : Historique complet des transactions
- ✅ **Export comptable** : Données prêtes pour l'expert-comptable

---

## 🚀 PROCHAINES ÉTAPES

1. ✅ Créer compte Qonto API
2. ✅ Récupérer API Key
3. ✅ Configurer webhook Qonto
4. ✅ Ajouter table `TransactionQonto` à Prisma
5. ✅ Créer page `/reconciliation`
6. ✅ Tester l'intégration

**C'est une fonctionnalité PRO qui va faire gagner un temps fou à Maud ! 💰🚀**
