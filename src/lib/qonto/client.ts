/**
 * 🏦 CLIENT API QONTO
 * Intégration complète pour réconciliation bancaire
 */

export interface QontoTransaction {
  id: string;
  amount: number; // En centimes
  amount_cents: number;
  local_amount: number;
  local_currency: string;
  currency: string;
  label: string;
  reference: string;
  settled_at: string | null;
  emitted_at: string;
  updated_at: string;
  status: "pending" | "reversed" | "declined" | "completed";
  side: "credit" | "debit";
  operation_type: string;
  note: string | null;
  counterparty: {
    name: string;
    iban: string;
  } | null;
}

export interface QontoTransactionsResponse {
  transactions: QontoTransaction[];
  meta: {
    current_page: number;
    next_page: number | null;
    prev_page: number | null;
    total_pages: number;
    total_count: number;
    per_page: number;
  };
}

export interface QontoBankAccount {
  id: string;
  slug: string;
  iban: string;
  bic?: string;
  currency: string;
  balance: number;
  balance_cents: number;
  authorized_balance: number;
  authorized_balance_cents: number;
  name?: string;
  status: "active" | "closed";
  main: boolean;
}

export interface QontoOrganizationResponse {
  organization: {
    id: string;
    slug: string;
    legal_name: string;
    bank_accounts: QontoBankAccount[];
  };
}

/**
 * Construit la valeur du header Authorization attendue par Qonto : `{login}:{secret}`
 * (sans préfixe Bearer/Basic, sans encodage Base64).
 */
export function buildQontoAuthorization(): string {
  const rawKey = process.env.QONTO_API_KEY?.trim();
  const login =
    process.env.QONTO_ORGANIZATION_SLUG?.trim() ||
    process.env.QONTO_LOGIN?.trim();
  const secret =
    process.env.QONTO_SECRET_KEY?.trim() ||
    process.env.QONTO_SECRET?.trim();

  const normalize = (value: string) =>
    value
      .replace(/^["']|["']$/g, "")
      .replace(/^(Bearer|Basic)\s+/i, "")
      .trim();

  if (rawKey) {
    const normalized = normalize(rawKey);
    if (normalized.includes(":")) {
      return normalized;
    }
    if (login && secret) {
      return `${normalize(login)}:${normalize(secret)}`;
    }
    if (login) {
      return `${normalize(login)}:${normalized}`;
    }
    throw new Error(
      "QONTO_API_KEY doit être au format login:secret, ou définir QONTO_ORGANIZATION_SLUG + QONTO_SECRET_KEY"
    );
  }

  if (login && secret) {
    return `${normalize(login)}:${normalize(secret)}`;
  }

  throw new Error(
    "Variables Qonto manquantes : définir QONTO_API_KEY (login:secret) ou QONTO_ORGANIZATION_SLUG + QONTO_SECRET_KEY"
  );
}

export class QontoClient {
  private authorization: string;
  private baseUrl = "https://thirdparty.qonto.com/v2";
  private cachedBankAccountId: string | null = null;

  constructor(authorization: string) {
    if (!authorization?.includes(":")) {
      throw new Error(
        "Authorization Qonto invalide : format attendu login:secret"
      );
    }
    this.authorization = authorization;
  }

  /**
   * Récupère l'organisation + ses comptes bancaires.
   */
  async getOrganization(): Promise<QontoOrganizationResponse> {
    return this.request<QontoOrganizationResponse>("/organization");
  }

  /**
   * Récupère l'ID du compte bancaire principal (ou le premier actif).
   * Utilisé automatiquement par getTransactions().
   */
  async getMainBankAccountId(): Promise<string> {
    if (this.cachedBankAccountId) return this.cachedBankAccountId;

    const envBankId = process.env.QONTO_BANK_ACCOUNT_ID?.trim();
    if (envBankId) {
      this.cachedBankAccountId = envBankId;
      return envBankId;
    }

    const { organization } = await this.getOrganization();
    const accounts = organization?.bank_accounts ?? [];
    const main =
      accounts.find((a) => a.main && a.status === "active") ||
      accounts.find((a) => a.status === "active") ||
      accounts[0];

    if (!main?.id) {
      throw new Error("Aucun compte bancaire Qonto trouvé pour l'organisation");
    }

    this.cachedBankAccountId = main.id;
    return main.id;
  }

  /**
   * Requête HTTP vers l'API Qonto
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: this.authorization,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Qonto API Error ${response.status}: ${errorText}`);
      }

      return response.json();
    } catch (error) {
      console.error("Erreur requête Qonto:", error);
      throw error;
    }
  }

  /**
   * Récupérer les transactions (encaissements uniquement)
   * Le bank_account_id (requis par l'API Qonto v2) est résolu automatiquement.
   */
  async getTransactions(params?: {
    settled_at_from?: string; // Format: YYYY-MM-DD
    settled_at_to?: string;
    status?: "pending" | "reversed" | "declined" | "completed";
    per_page?: number;
    page?: number;
    bank_account_id?: string;
  }): Promise<QontoTransactionsResponse> {
    const bankAccountId =
      params?.bank_account_id || (await this.getMainBankAccountId());

    const queryParams = new URLSearchParams();
    queryParams.set("bank_account_id", bankAccountId);
    queryParams.set("side", "credit");
    queryParams.set("per_page", String(params?.per_page || 100));
    if (params?.settled_at_from)
      queryParams.set("settled_at_from", params.settled_at_from);
    if (params?.settled_at_to)
      queryParams.set("settled_at_to", params.settled_at_to);
    if (params?.status) queryParams.set("status[]", params.status);
    if (params?.page) queryParams.set("page", String(params.page));

    return this.request<QontoTransactionsResponse>(
      `/transactions?${queryParams.toString()}`
    );
  }

  /**
   * Récupérer une transaction par ID
   */
  async getTransaction(id: string): Promise<{ transaction: QontoTransaction }> {
    return this.request<{ transaction: QontoTransaction }>(`/transactions/${id}`);
  }

  /**
   * Synchroniser les transactions récentes
   * @param daysBack Nombre de jours en arrière (défaut: 30)
   */
  async syncRecentTransactions(daysBack: number = 30): Promise<QontoTransaction[]> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - daysBack);

    const dateTo = new Date();

    const params = {
      settled_at_from: dateFrom.toISOString().split("T")[0],
      settled_at_to: dateTo.toISOString().split("T")[0],
      status: "completed" as const,
      per_page: 100,
    };

    const response = await this.getTransactions(params);
    return response.transactions;
  }

  /**
   * Test de connexion à l'API Qonto (ping /organization)
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getOrganization();
      return true;
    } catch (error) {
      console.error("Erreur test connexion Qonto:", error);
      return false;
    }
  }
}

// Instance singleton (optionnelle si API key dispo)
let qontoClient: QontoClient | null = null;

export function getQontoClient(): QontoClient {
  if (!qontoClient) {
    qontoClient = new QontoClient(buildQontoAuthorization());
  }
  return qontoClient;
}
