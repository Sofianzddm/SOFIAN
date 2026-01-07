"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Building2,
  Globe,
  MapPin,
  Mail,
  Phone,
  User,
  Calendar,
  Euro,
  Loader2,
  Handshake,
  Users,
  FileText,
  ExternalLink,
  Copy,
  Check,
  CreditCard,
  Clock,
  Banknote,
} from "lucide-react";

interface MarqueDetail {
  id: string;
  nom: string;
  secteur: string | null;
  siteWeb: string | null;
  notes: string | null;
  raisonSociale: string | null;
  formeJuridique: string | null;
  siret: string | null;
  numeroTVA: string | null;
  adresseRue: string | null;
  adresseComplement: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string | null;
  delaiPaiement: number | null;
  modePaiement: string | null;
  devise: string | null;
  createdAt: string;
  contacts: {
    id: string;
    nom: string;
    email: string | null;
    telephone: string | null;
    poste: string | null;
    principal: boolean;
  }[];
  collaborations: {
    id: string;
    reference: string;
    typeContenu: string;
    montantBrut: number;
    statut: string;
    talent: {
      prenom: string;
      nom: string;
    };
  }[];
  _count: {
    collaborations: number;
  };
}

export default function MarqueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [marque, setMarque] = useState<MarqueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "contacts" | "facturation" | "collabs">("overview");
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (params.id) {
      fetchMarque();
    }
  }, [params.id]);

  const fetchMarque = async () => {
    try {
      const res = await fetch(`/api/marques/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setMarque(data);
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Supprimer cette marque ?")) return;
    try {
      await fetch(`/api/marques/${params.id}`, { method: "DELETE" });
      router.push("/marques");
    } catch (error) {
      alert("Erreur lors de la suppression");
    }
  };

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const totalCA = marque?.collaborations
    .filter((c) => c.statut !== "PERDU" && c.statut !== "NEGO")
    .reduce((acc, c) => acc + Number(c.montantBrut), 0) || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  if (!marque) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Marque non trouvée</p>
        <Link href="/marques" className="text-glowup-rose hover:underline mt-2 inline-block">
          Retour à la liste
        </Link>
      </div>
    );
  }

  const contactPrincipal = marque.contacts.find((c) => c.principal) || marque.contacts[0];

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="h-24 bg-gradient-to-br from-glowup-rose via-glowup-rose-dark to-glowup-licorice relative" />

        <div className="px-6 pb-6">
          <div className="flex flex-col md:flex-row md:items-end gap-4 -mt-12 relative">
            <div className="w-24 h-24 rounded-2xl bg-white border-4 border-white flex items-center justify-center shadow-xl">
              <span className="text-3xl font-bold text-glowup-rose">
                {marque.nom.charAt(0).toUpperCase()}
              </span>
            </div>

            <div className="flex-1 pt-4 md:pt-0">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-glowup-licorice">{marque.nom}</h1>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {marque.secteur && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-glowup-lace text-glowup-licorice font-medium">
                        {marque.secteur}
                      </span>
                    )}
                    {marque.ville && (
                      <span className="flex items-center gap-1 text-sm text-gray-500">
                        <MapPin className="w-4 h-4" />
                        {marque.ville}, {marque.pays}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      Depuis {new Date(marque.createdAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/marques/${marque.id}/edit`}
                    className="flex items-center gap-2 px-4 py-2 bg-glowup-rose text-white rounded-xl hover:bg-glowup-rose-dark transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                    Modifier
                  </Link>
                  <button
                    onClick={handleDelete}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-glowup-rose/10 rounded-lg">
                <Handshake className="w-5 h-5 text-glowup-rose" />
              </div>
              <div>
                <p className="text-xl font-bold text-glowup-licorice">{marque._count.collaborations}</p>
                <p className="text-xs text-gray-500">Collaborations</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Euro className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-glowup-licorice">{formatMoney(totalCA)}</p>
                <p className="text-xs text-gray-500">CA total</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-glowup-licorice">{marque.contacts.length}</p>
                <p className="text-xs text-gray-500">Contacts</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-glowup-licorice">{marque.delaiPaiement || 30}j</p>
                <p className="text-xs text-gray-500">Délai paiement</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-100">
          <nav className="flex gap-1 px-4">
            {[
              { id: "overview", label: "Aperçu", icon: Building2 },
              { id: "contacts", label: "Contacts", icon: Users },
              { id: "facturation", label: "Facturation", icon: CreditCard },
              { id: "collabs", label: "Collaborations", icon: Handshake },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all ${
                  activeTab === tab.id
                    ? "border-glowup-rose text-glowup-rose"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Informations</h3>
                
                {marque.siteWeb && (
                  <a
                    href={marque.siteWeb}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-gray-400" />
                      <span className="text-sm">{marque.siteWeb.replace(/^https?:\/\//, "")}</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-glowup-rose" />
                  </a>
                )}

                {(marque.adresseRue || marque.ville) && (
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div className="text-sm text-gray-600">
                        {marque.adresseRue && <p>{marque.adresseRue}</p>}
                        {marque.adresseComplement && <p>{marque.adresseComplement}</p>}
                        <p>
                          {marque.codePostal} {marque.ville}
                          {marque.pays && `, ${marque.pays}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {contactPrincipal && (
                  <>
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mt-6">Contact principal</h3>
                    <div className="p-4 bg-glowup-lace/30 border border-glowup-rose/20 rounded-xl">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-glowup-rose text-white flex items-center justify-center">
                          <span className="text-sm font-semibold">{contactPrincipal.nom.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-medium text-glowup-licorice">{contactPrincipal.nom}</p>
                          {contactPrincipal.poste && (
                            <p className="text-xs text-gray-500">{contactPrincipal.poste}</p>
                          )}
                        </div>
                      </div>
                      {contactPrincipal.email && (
                        <div className="flex items-center justify-between py-2 border-t border-glowup-rose/10">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-gray-400" />
                            <span className="text-sm">{contactPrincipal.email}</span>
                          </div>
                          <button
                            onClick={() => copyEmail(contactPrincipal.email!)}
                            className="p-1.5 hover:bg-white rounded-lg transition-colors"
                          >
                            {copiedEmail === contactPrincipal.email ? (
                              <Check className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <Copy className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                        </div>
                      )}
                      {contactPrincipal.telephone && (
                        <div className="flex items-center gap-2 py-2 border-t border-glowup-rose/10">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <span className="text-sm">{contactPrincipal.telephone}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-4">
                {marque.notes && (
                  <>
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Notes</h3>
                    <p className="text-sm text-gray-600 leading-relaxed p-3 bg-gray-50 rounded-xl">
                      {marque.notes}
                    </p>
                  </>
                )}

                {/* Dernières collabs */}
                {marque.collaborations.length > 0 && (
                  <>
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mt-6">
                      Dernières collaborations
                    </h3>
                    <div className="space-y-2">
                      {marque.collaborations.slice(0, 3).map((collab) => (
                        <Link
                          key={collab.id}
                          href={`/collaborations/${collab.id}`}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                        >
                          <div>
                            <p className="text-sm font-medium">{collab.talent.prenom} {collab.talent.nom}</p>
                            <p className="text-xs text-gray-500">{collab.typeContenu}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            collab.statut === "PAYE" ? "bg-emerald-100 text-emerald-700" :
                            collab.statut === "NEGO" ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"
                          }`}>
                            {collab.statut}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Contacts Tab */}
          {activeTab === "contacts" && (
            <div className="space-y-4">
              {marque.contacts.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Aucun contact enregistré</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {marque.contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className={`p-4 rounded-xl border-2 ${
                        contact.principal
                          ? "border-glowup-rose bg-glowup-lace/30"
                          : "border-gray-100 bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            contact.principal
                              ? "bg-glowup-rose text-white"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium text-glowup-licorice">{contact.nom}</p>
                          {contact.poste && (
                            <p className="text-xs text-gray-500">{contact.poste}</p>
                          )}
                        </div>
                        {contact.principal && (
                          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-glowup-rose text-white">
                            Principal
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {contact.email && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Mail className="w-4 h-4 text-gray-400" />
                              {contact.email}
                            </div>
                            <button
                              onClick={() => copyEmail(contact.email!)}
                              className="p-1.5 hover:bg-white rounded-lg transition-colors"
                            >
                              {copiedEmail === contact.email ? (
                                <Check className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <Copy className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                          </div>
                        )}
                        {contact.telephone && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone className="w-4 h-4 text-gray-400" />
                            {contact.telephone}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Facturation Tab */}
          {activeTab === "facturation" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Informations légales</h3>
                <div className="space-y-3">
                  {marque.raisonSociale && (
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <p className="text-xs text-gray-500 mb-1">Raison sociale</p>
                      <p className="font-medium text-glowup-licorice">{marque.raisonSociale}</p>
                    </div>
                  )}
                  {marque.formeJuridique && (
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <p className="text-xs text-gray-500 mb-1">Forme juridique</p>
                      <p className="font-medium text-glowup-licorice">{marque.formeJuridique}</p>
                    </div>
                  )}
                  {marque.siret && (
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <p className="text-xs text-gray-500 mb-1">SIRET</p>
                      <p className="font-medium text-glowup-licorice font-mono">{marque.siret}</p>
                    </div>
                  )}
                  {marque.numeroTVA && (
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <p className="text-xs text-gray-500 mb-1">N° TVA</p>
                      <p className="font-medium text-glowup-licorice font-mono">{marque.numeroTVA}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Conditions de paiement</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 bg-gray-50 rounded-xl text-center">
                    <Clock className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-glowup-licorice">{marque.delaiPaiement || 30}</p>
                    <p className="text-xs text-gray-500">jours</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl text-center">
                    <Banknote className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm font-bold text-glowup-licorice">{marque.modePaiement || "Virement"}</p>
                    <p className="text-xs text-gray-500">mode</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl text-center">
                    <Euro className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                    <p className="text-lg font-bold text-glowup-licorice">{marque.devise || "EUR"}</p>
                    <p className="text-xs text-gray-500">devise</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Collabs Tab */}
          {activeTab === "collabs" && (
            <div>
              {marque.collaborations.length === 0 ? (
                <div className="text-center py-12">
                  <Handshake className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Aucune collaboration pour l'instant</p>
                  <Link
                    href={`/collaborations/new?marque=${marque.id}`}
                    className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-glowup-rose text-white rounded-lg hover:bg-glowup-rose-dark transition-colors"
                  >
                    Créer une collab
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {marque.collaborations.map((collab) => (
                    <Link
                      key={collab.id}
                      href={`/collaborations/${collab.id}`}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                    >
                      <div>
                        <p className="font-medium text-glowup-licorice">
                          {collab.talent.prenom} {collab.talent.nom}
                        </p>
                        <p className="text-sm text-gray-500">
                          {collab.typeContenu} • {collab.reference}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-glowup-licorice">{formatMoney(collab.montantBrut)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          collab.statut === "PAYE" ? "bg-emerald-100 text-emerald-700" :
                          collab.statut === "NEGO" ? "bg-yellow-100 text-yellow-700" :
                          collab.statut === "PERDU" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {collab.statut}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
