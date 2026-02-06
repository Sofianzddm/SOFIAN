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

export class QontoClient {
  private apiKey: string;
  private baseUrl = "https://thirdparty.qonto.com/v2";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("QONTO_API_KEY is required");
    }
    this.apiKey = apiKey;
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
          Authorization: `${this.apiKey}`,
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
   */
  async getTransactions(params?: {
    settled_at_from?: string; // Format: YYYY-MM-DD
    settled_at_to?: string;
    status?: "pending" | "reversed" | "declined" | "completed";
    per_page?: number;
    page?: number;
  }): Promise<QontoTransactionsResponse> {
    const queryParams = new URLSearchParams({
      side: "credit", // Uniquement les encaissements (crédits)
      per_page: String(params?.per_page || 100),
      ...params,
    } as any);

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
   * Test de connexion à l'API Qonto
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getTransactions({ per_page: 1 });
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
    const apiKey = process.env.QONTO_API_KEY;
    if (!apiKey) {
      throw new Error("QONTO_API_KEY environment variable is not set");
    }
    qontoClient = new QontoClient(apiKey);
  }
  return qontoClient;
}
