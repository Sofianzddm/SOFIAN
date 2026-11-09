"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  ScanSearch,
  X,
  AlertTriangle,
} from "lucide-react";

type Contact = {
  id: string;
  prenom?: string | null;
  nom?: string | null;
  email?: string | null;
  emailSuggested?: string | null;
  poste?: string | null;
  /** "AO" = Achats / appel d'offre — exclus du gift */
  source?: string | null;
  /** Fiche CRM : fr | en — pilote la langue du mail */
  language?: string | null;
};

type MarqueRow = {
  id: string;
  nom: string;
  contacts?: Contact[];
  awaitingEnrichissement?: boolean;
  emailableCount?: number;
  statutContact?: string;
  contactNom?: string | null;
  contactEmail?: string | null;
  contactedAt?: string | null;
};

type RecipientKey = string; // `${marqueId}:${contactId}`

const STEPS = [
  { key: "marques", label: "Marques" },
  { key: "contacts", label: "Contacts" },
  { key: "message", label: "Message" },
  { key: "envoi", label: "Envoi" },
  { key: "suivi", label: "Suivi" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const STATUT_CONTACT_STYLE: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  A_CONTACTER: { label: "À contacter", color: "#a16207", bg: "#fef9c3" },
  CONTACTEE: { label: "Contactée", color: "#6d28d9", bg: "#f5f3ff" },
  RELANCEE: { label: "Relancée", color: "#1d4ed8", bg: "#dbeafe" },
  ACCEPTEE: { label: "Acceptée", color: "#15803d", bg: "#f0fdf4" },
  REFUSEE: { label: "Refusée", color: "#b91c1c", bg: "#fef2f2" },
  SANS_REPONSE: { label: "Sans réponse", color: "#52525b", bg: "#f4f4f5" },
};

function isAoContact(c: Contact) {
  return (c.source || "").toUpperCase() === "AO";
}

function contactLang(c: Contact): "fr" | "en" {
  const v = String(c.language || "")
    .trim()
    .toLowerCase();
  return v === "en" || v.startsWith("en") ? "en" : "fr";
}

function isEmailable(c: Contact) {
  if (isAoContact(c)) return false;
  const email = (c.email || "").trim();
  return email.includes("@") && !email.includes(" ");
}

/** Contacts visibles dans le wizard gift (hors Achats/AO). */
function giftVisibleContacts(contacts: Contact[] | undefined) {
  return (contacts || []).filter((c) => !isAoContact(c));
}

function contactLabel(c: Contact) {
  return (
    [c.prenom, c.nom].filter(Boolean).join(" ") ||
    c.email ||
    c.emailSuggested ||
    "Contact"
  );
}

function recipientKey(marqueId: string, contactId: string): RecipientKey {
  return `${marqueId}:${contactId}`;
}

export function GiftContactWizard({
  open,
  onClose,
  onDone,
  giftId,
  reference,
  talentName,
  talentPhoto,
  marques,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  giftId: string;
  reference: string;
  talentName: string;
  talentPhoto?: string | null;
  marques: MarqueRow[];
}) {
  const [step, setStep] = useState<StepKey>("marques");
  const [selectedMarqueIds, setSelectedMarqueIds] = useState<Set<string>>(
    () => new Set(marques.map((m) => m.id))
  );
  const [selectedRecipients, setSelectedRecipients] = useState<
    Set<RecipientKey>
  >(new Set());
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  /** Drafts personnalisés par marque (research + rédaction). */
  const [draftsByMarque, setDraftsByMarque] = useState<
    Record<string, { subject: string; bodyText: string; marqueNom: string }>
  >({});
  const [activeDraftMarqueId, setActiveDraftMarqueId] = useState<string | null>(
    null
  );
  const [fromEmail, setFromEmail] = useState<string | null>(null);
  const [fromName, setFromName] = useState<string | null>(null);
  const [senderPrenom, setSenderPrenom] = useState<string | null>(null);
  const [gmailConnected, setGmailConnected] = useState(true);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{
    sent: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const pathname = usePathname();
  const gmailConnectHref = `/api/auth/gmail?returnTo=${encodeURIComponent(
    pathname || `/gifts/${giftId}`
  )}`;

  useEffect(() => {
    if (!open) return;
    setStep("marques");
    setSelectedMarqueIds(new Set(marques.map((m) => m.id)));
    setSelectedRecipients(new Set());
    setDraftsByMarque({});
    setActiveDraftMarqueId(null);
    setError(null);
    setSendResult(null);
    setLoadingDraft(true);
    let cancelled = false;

    // Retour OAuth Gmail → nettoie le query param
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("gmail") === "connected") {
        url.searchParams.delete("gmail");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    }

    fetch(`/api/gifts/${giftId}/contact-marques`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Erreur draft");
        if (cancelled) return;
        setSubject(data.draft?.subject || "");
        setBodyText(data.draft?.bodyText || "");
        setFromEmail(data.fromEmail || null);
        setFromName(data.fromName || null);
        setSenderPrenom(data.senderPrenom || null);
        setGmailConnected(Boolean(data.gmailConnected));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur chargement");
      })
      .finally(() => {
        if (!cancelled) setLoadingDraft(false);
      });
    return () => {
      cancelled = true;
    };
    // Intentionnel : reset uniquement à l'ouverture / changement de gift
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, giftId]);

  const selectedMarques = useMemo(
    () => marques.filter((m) => selectedMarqueIds.has(m.id)),
    [marques, selectedMarqueIds]
  );

  const recipientCount = selectedRecipients.size;
  const canContinueContacts = recipientCount > 0;

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  function toggleMarque(id: string) {
    setSelectedMarqueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setSelectedRecipients((recs) => {
          const cleaned = new Set(recs);
          for (const key of recs) {
            if (key.startsWith(`${id}:`)) cleaned.delete(key);
          }
          return cleaned;
        });
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleRecipient(marqueId: string, contact: Contact) {
    if (!isEmailable(contact)) return;
    const key = recipientKey(marqueId, contact.id);
    setSelectedRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function syncActiveDraft(
    marqueId: string,
    next: { subject: string; bodyText: string; marqueNom: string }
  ) {
    setDraftsByMarque((prev) => ({ ...prev, [marqueId]: next }));
    setSubject(next.subject);
    setBodyText(next.bodyText);
    setActiveDraftMarqueId(marqueId);
  }

  function switchDraftMarque(marqueId: string) {
    // Sauve l'édition en cours avant de switcher
    if (activeDraftMarqueId) {
      setDraftsByMarque((prev) => ({
        ...prev,
        [activeDraftMarqueId]: {
          subject,
          bodyText,
          marqueNom:
            prev[activeDraftMarqueId]?.marqueNom ||
            marques.find((m) => m.id === activeDraftMarqueId)?.nom ||
            "",
        },
      }));
    }
    const draft = draftsByMarque[marqueId];
    if (draft) {
      setSubject(draft.subject);
      setBodyText(draft.bodyText);
      setActiveDraftMarqueId(marqueId);
    }
  }

  async function generateAiMessage() {
    setGeneratingAi(true);
    setError(null);
    try {
      const prenomsByMarque: Record<string, string> = {};
      const languagesByMarque: Record<string, string> = {};
      for (const key of selectedRecipients) {
        const [marqueId, contactId] = key.split(":");
        const marque = marques.find((m) => m.id === marqueId);
        const contact = giftVisibleContacts(marque?.contacts).find(
          (c) => c.id === contactId
        );
        if (!contact) continue;
        if (contact.prenom?.trim() && !prenomsByMarque[marqueId]) {
          prenomsByMarque[marqueId] = contact.prenom.trim();
        }
        // 1er contact coché = langue du draft marque
        if (!languagesByMarque[marqueId]) {
          languagesByMarque[marqueId] = contactLang(contact);
        }
      }
      // Uniquement les marques qui ont au moins 1 destinataire coché
      const marqueIdsWithRecipients = Array.from(
        new Set(
          Array.from(selectedRecipients).map((k) => k.split(":")[0]).filter(Boolean)
        )
      );
      const res = await fetch(
        `/api/gifts/${giftId}/contact-marques/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marqueIds: marqueIdsWithRecipients,
            prenomsByMarque,
            languagesByMarque,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur rédaction IA");

      const drafts: Array<{
        marqueId: string;
        marqueNom: string;
        subject: string;
        bodyText: string;
        ai?: boolean;
        error?: string | null;
      }> = Array.isArray(data.drafts) ? data.drafts : [];

      if (drafts.length > 0) {
        const map: Record<
          string,
          { subject: string; bodyText: string; marqueNom: string }
        > = {};
        for (const d of drafts) {
          map[d.marqueId] = {
            subject: d.subject,
            bodyText: d.bodyText,
            marqueNom: d.marqueNom,
          };
        }
        setDraftsByMarque(map);
        syncActiveDraft(drafts[0].marqueId, map[drafts[0].marqueId]);
        const warns: string[] = [];
        const fails = drafts.filter((d) => d.error);
        if (fails.length) {
          warns.push(
            `Draft de secours : ${fails.map((f) => f.marqueNom).join(", ")}`
          );
        }
        if (data.truncated) {
          warns.push(
            "Max 4 marques générées d’un coup — régénère pour les autres."
          );
        }
        if (warns.length) setError(warns.join(" · "));
      } else {
        if (data.subject) setSubject(data.subject);
        if (data.bodyText) setBodyText(data.bodyText);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de générer le message IA"
      );
    } finally {
      setGeneratingAi(false);
    }
  }

  async function goNext() {
    setError(null);
    if (step === "marques") {
      if (selectedMarqueIds.size === 0) {
        setError("Sélectionnez au moins une marque.");
        return;
      }
      setStep("contacts");
      return;
    }
    if (step === "contacts") {
      if (!canContinueContacts) {
        setError(
          "Cochez au moins un contact avec email enrichi. Sinon passez par Enrichir."
        );
        return;
      }
      setStep("message");
      void generateAiMessage();
      return;
    }
    if (step === "message") {
      if (generatingAi) return;
      if (!subject.trim() || !bodyText.trim()) {
        setError("Sujet et message requis.");
        return;
      }
      // Flush l'édition courante dans le map avant envoi
      if (activeDraftMarqueId) {
        setDraftsByMarque((prev) => ({
          ...prev,
          [activeDraftMarqueId]: {
            subject,
            bodyText,
            marqueNom:
              prev[activeDraftMarqueId]?.marqueNom ||
              marques.find((m) => m.id === activeDraftMarqueId)?.nom ||
              "",
          },
        }));
      }
      setStep("envoi");
      return;
    }
  }

  function goBack() {
    setError(null);
    if (step === "contacts") setStep("marques");
    else if (step === "message") setStep("contacts");
    else if (step === "envoi") setStep("message");
  }

  async function handleSend() {
    setError(null);
    if (!gmailConnected) {
      setError(
        "Aucune boîte mail connectée. Clique sur « Connecter ma boîte mail »."
      );
      return;
    }
    const recipients: Array<{
      marqueId: string;
      contactId: string;
      email: string;
      nom: string;
    }> = [];
    for (const key of selectedRecipients) {
      const [marqueId, contactId] = key.split(":");
      const marque = marques.find((m) => m.id === marqueId);
      const contact = marque?.contacts?.find((c) => c.id === contactId);
      if (!marque || !contact || !isEmailable(contact)) continue;
      recipients.push({
        marqueId,
        contactId,
        email: (contact.email || "").trim(),
        nom: contactLabel(contact),
      });
    }
    if (recipients.length === 0) {
      setError("Aucun destinataire valide.");
      return;
    }

    setSending(true);
    try {
      // Inclure l'édition active dans le payload
      const draftsPayload: Record<
        string,
        { subject: string; bodyText: string }
      > = {};
      for (const [mid, d] of Object.entries(draftsByMarque)) {
        draftsPayload[mid] = { subject: d.subject, bodyText: d.bodyText };
      }
      if (activeDraftMarqueId) {
        draftsPayload[activeDraftMarqueId] = {
          subject: subject.trim(),
          bodyText: bodyText.trim(),
        };
      }
      const res = await fetch(`/api/gifts/${giftId}/contact-marques`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients,
          subject: subject.trim(),
          bodyText: bodyText.trim(),
          draftsByMarque: draftsPayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec d'envoi");
      setSendResult({
        sent: data.sent || recipients.length,
        failed: data.failed || 0,
        errors: data.errors || [],
      });
      setStep("suivi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'envoi");
    } finally {
      setSending(false);
    }
  }

  async function patchStatut(
    marqueId: string,
    statutContact: string,
    updateGiftStatut = false
  ) {
    setActionBusy(`${marqueId}:${statutContact}`);
    setError(null);
    try {
      const res = await fetch(`/api/gifts/${giftId}/marques/${marqueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statutContact, updateGiftStatut }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur mise à jour");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setActionBusy(null);
    }
  }

  async function relancer(marqueId: string) {
    setActionBusy(`${marqueId}:relance`);
    setError(null);
    try {
      const res = await fetch(`/api/gifts/${giftId}/contact-marques/relance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marqueId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec relance");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur relance");
    } finally {
      setActionBusy(null);
    }
  }

  if (!open) return null;

  const recapRecipients = Array.from(selectedRecipients).map((key) => {
    const [marqueId, contactId] = key.split(":");
    const marque = marques.find((m) => m.id === marqueId);
    const contact = marque?.contacts?.find((c) => c.id === contactId);
    return {
      key,
      marqueNom: marque?.nom || "Marque",
      contactLabel: contact ? contactLabel(contact) : "—",
      email: contact?.email || "",
    };
  });

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-zinc-950/40 px-4 py-8 backdrop-blur-[2px]">
      <div className="relative w-full max-w-[760px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
        {/* Header sticky */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {talentPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={talentPhoto}
                alt=""
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                {talentName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold tracking-tight text-zinc-900">
                Contacter les marques
              </p>
              <p className="truncate text-xs text-zinc-500">
                {reference} · {talentName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              if (step === "suivi") onDone();
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex gap-2 border-b border-zinc-100 px-6 py-4">
          {STEPS.map((s, i) => {
            const active = s.key === step;
            const done = i < stepIndex;
            return (
              <div key={s.key} className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div
                  className={`h-1 rounded-full transition ${
                    active || done ? "bg-violet-700" : "bg-zinc-200"
                  }`}
                />
                <span
                  className={`truncate text-[11px] font-medium ${
                    active
                      ? "text-violet-700"
                      : done
                        ? "text-zinc-700"
                        : "text-zinc-400"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="max-h-[min(70vh,640px)] overflow-y-auto px-6 py-5">
          {loadingDraft && step !== "suivi" ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Préparation du message…
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                  <span>{error}</span>
                </div>
              )}

              {step !== "suivi" && (
                <div
                  className={`mb-4 flex flex-col gap-2 rounded-lg border px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between ${
                    gmailConnected
                      ? "border-emerald-200 bg-emerald-50/60"
                      : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <div className="min-w-0 text-sm">
                    {gmailConnected ? (
                      <>
                        <p className="font-medium text-emerald-900">
                          Connectée
                          {senderPrenom ? ` · ${senderPrenom}` : fromName ? ` · ${fromName}` : ""}
                        </p>
                        <p className="truncate text-emerald-800/80">
                          Envoi depuis {fromEmail}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-amber-950">
                          Connecte ta propre boîte mail pour envoyer
                        </p>
                        <p className="text-amber-900/80">
                          Chaque AM envoie depuis son Gmail (Ambre → Ambre, pas
                          celle d&apos;un autre).
                        </p>
                      </>
                    )}
                  </div>
                  {gmailConnected ? (
                    <a
                      href={gmailConnectHref}
                      className="inline-flex h-9 flex-none items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-medium text-emerald-900 hover:bg-emerald-50"
                    >
                      Changer de boîte
                    </a>
                  ) : (
                    <a
                      href={gmailConnectHref}
                      className="inline-flex h-9 flex-none items-center justify-center gap-1.5 rounded-lg bg-violet-700 px-3.5 text-sm font-medium text-white hover:bg-violet-800"
                    >
                      <Mail className="h-4 w-4" />
                      Connecter ma boîte mail
                    </a>
                  )}
                </div>
              )}

              {step === "marques" && (
                <div className="flex flex-col gap-1">
                  <p className="mb-3 text-sm text-zinc-600">
                    Sélectionnez les marques à contacter pour cette demande.
                  </p>
                  {marques.length === 0 ? (
                    <p className="py-8 text-center text-sm text-zinc-500">
                      Aucune marque liée. Ajoutez-en depuis la fiche gift.
                    </p>
                  ) : (
                    marques.map((m) => {
                      const checked = selectedMarqueIds.has(m.id);
                      const emailable = giftVisibleContacts(m.contacts).filter(
                        isEmailable
                      ).length;
                      return (
                        <label
                          key={m.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 transition ${
                            checked
                              ? "border-violet-300 bg-violet-50/40"
                              : "border-zinc-200 hover:bg-zinc-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMarque(m.id)}
                            className="h-4 w-4 rounded border-zinc-300 text-violet-700 focus:ring-violet-600"
                          />
                          <div className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-zinc-100 text-xs font-semibold text-zinc-600">
                            {m.nom.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-zinc-900">
                              {m.nom}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {emailable > 0
                                ? `${emailable} contact${emailable > 1 ? "s" : ""} emailable${emailable > 1 ? "s" : ""}`
                                : m.awaitingEnrichissement
                                  ? "Enrichissement en cours"
                                  : "Aucun email enrichi"}
                            </p>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              )}

              {step === "contacts" && (
                <div className="flex flex-col gap-5">
                  <p className="text-sm text-zinc-600">
                    Choisissez les destinataires. Seuls les contacts avec un
                    email enrichi sont cochables (hors Achats / AO).
                  </p>
                  {selectedMarques.map((m) => {
                    const contacts = giftVisibleContacts(m.contacts);
                    return (
                      <div key={m.id}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h3 className="text-[13px] font-semibold text-zinc-900">
                            {m.nom}
                          </h3>
                          {contacts.every((c) => !isEmailable(c)) && (
                            <Link
                              href="/enrichissement?tab=attente"
                              className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:underline"
                            >
                              <ScanSearch className="h-3 w-3" />
                              Enrichir
                            </Link>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          {contacts.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-500">
                              Aucun contact CRM —{" "}
                              <Link
                                href={`/marques/${m.id}`}
                                className="text-violet-700 hover:underline"
                              >
                                fiche marque
                              </Link>
                            </p>
                          ) : (
                            contacts.map((c) => {
                              const ok = isEmailable(c);
                              const key = recipientKey(m.id, c.id);
                              const checked = selectedRecipients.has(key);
                              return (
                                <label
                                  key={c.id}
                                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${
                                    !ok
                                      ? "cursor-not-allowed border-zinc-100 bg-zinc-50 opacity-70"
                                      : checked
                                        ? "cursor-pointer border-violet-300 bg-violet-50/40"
                                        : "cursor-pointer border-zinc-200 hover:bg-zinc-50"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={!ok}
                                    checked={checked}
                                    onChange={() => toggleRecipient(m.id, c)}
                                    className="h-4 w-4 rounded border-zinc-300 text-violet-700 focus:ring-violet-600 disabled:opacity-40"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium text-zinc-900">
                                      {contactLabel(c)}
                                      {contactLang(c) === "en" ? (
                                        <span
                                          className="ml-1.5 inline-flex rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700"
                                          title="Contact anglophone — mail généré/envoyé en anglais"
                                        >
                                          EN
                                        </span>
                                      ) : null}
                                      {c.poste ? (
                                        <span className="font-normal text-zinc-500">
                                          {" "}
                                          · {c.poste}
                                        </span>
                                      ) : null}
                                    </p>
                                    <p className="truncate text-xs text-zinc-500">
                                      {ok
                                        ? c.email
                                        : c.emailSuggested || "Pas d'email"}
                                    </p>
                                  </div>
                                  {!ok && (
                                    <span className="flex-none rounded-full bg-amber-50 px-2 py-[2px] text-[11px] font-medium text-amber-800">
                                      À enrichir
                                    </span>
                                  )}
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {step === "message" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={generatingAi}
                      onClick={() => void generateAiMessage()}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                    >
                      {generatingAi ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      {generatingAi ? "Rédaction…" : "Régénérer"}
                    </button>
                  </div>
                  {generatingAi ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 py-10 text-sm text-zinc-500">
                      <Loader2 className="h-4 w-4 animate-spin text-violet-700" />
                      <span>Rédaction en cours…</span>
                      <span className="text-xs text-zinc-400">
                        Ça peut prendre 1–2 min.
                      </span>
                    </div>
                  ) : (
                    <>
                      {Object.keys(draftsByMarque).length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(draftsByMarque).map(
                            ([mid, draft]) => {
                              const on = activeDraftMarqueId === mid;
                              return (
                                <button
                                  key={mid}
                                  type="button"
                                  onClick={() => switchDraftMarque(mid)}
                                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                                    on
                                      ? "border-violet-300 bg-violet-50 text-violet-800"
                                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                                  }`}
                                >
                                  {draft.marqueNom}
                                </button>
                              );
                            }
                          )}
                        </div>
                      )}
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                          Sujet
                          {activeDraftMarqueId &&
                          draftsByMarque[activeDraftMarqueId]
                            ? ` · ${draftsByMarque[activeDraftMarqueId].marqueNom}`
                            : ""}
                        </label>
                        <input
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          className="h-[38px] w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-violet-600 focus:ring-[3px] focus:ring-violet-600/15"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                          Message
                        </label>
                        <textarea
                          value={bodyText}
                          onChange={(e) => setBodyText(e.target.value)}
                          rows={12}
                          className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm leading-relaxed text-zinc-900 outline-none transition focus:border-violet-600 focus:ring-[3px] focus:ring-violet-600/15"
                        />
                        <p className="mt-1.5 text-[11px] text-zinc-400">
                          Chaque marque reçoit sa version à l&apos;envoi. La
                          signature de ta boîte Gmail est ajoutée automatiquement.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {step === "envoi" && (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-zinc-600">
                    {gmailConnected ? (
                      <>
                        Vérifie le récap — envoi depuis{" "}
                        <span className="font-medium text-zinc-900">
                          {fromEmail}
                        </span>
                        . Signature Gmail ajoutée auto (meilleure délivrabilité).
                      </>
                    ) : (
                      <>
                        Connecte ta boîte mail ci-dessus avant d&apos;envoyer.
                      </>
                    )}
                  </p>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <p className="text-xs font-medium text-zinc-500">Sujet</p>
                    <p className="mt-0.5 text-sm font-medium text-zinc-900">
                      {subject}
                    </p>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-zinc-200">
                    <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-500">
                      Destinataires ({recapRecipients.length})
                    </div>
                    {recapRecipients.map((r) => (
                      <div
                        key={r.key}
                        className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-2.5 text-sm last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-zinc-900">
                            {r.marqueNom}
                          </p>
                          <p className="truncate text-xs text-zinc-500">
                            {r.contactLabel}
                          </p>
                        </div>
                        <span className="flex-none text-xs text-zinc-500">
                          {r.email}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step === "suivi" && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <CheckCircle className="mt-0.5 h-5 w-5 flex-none text-emerald-700" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">
                        {sendResult?.sent || 0} mail
                        {(sendResult?.sent || 0) > 1 ? "s" : ""} envoyé
                        {(sendResult?.sent || 0) > 1 ? "s" : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-emerald-800">
                        La demande passe en Attente marque. Suivez les réponses
                        ci-dessous.
                      </p>
                      {(sendResult?.failed || 0) > 0 && (
                        <p className="mt-1 text-xs text-amber-800">
                          {sendResult?.failed} échec(s) :{" "}
                          {sendResult?.errors.join(" / ")}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-zinc-200">
                    {selectedMarques.map((m) => {
                      const style =
                        STATUT_CONTACT_STYLE.CONTACTEE;
                      const busy = actionBusy?.startsWith(m.id);
                      return (
                        <div
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 last:border-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-zinc-900">
                              {m.nom}
                            </p>
                            <span
                              className="mt-1 inline-flex rounded-full px-2 py-[2px] text-[11px] font-medium"
                              style={{
                                color: style.color,
                                background: style.bg,
                              }}
                            >
                              {style.label}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => relancer(m.id)}
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                            >
                              {actionBusy === `${m.id}:relance` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Mail className="h-3 w-3" />
                              )}
                              Relancer
                            </button>
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() =>
                                patchStatut(m.id, "ACCEPTEE", true)
                              }
                              className="inline-flex h-8 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              Acceptée
                            </button>
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => patchStatut(m.id, "REFUSEE")}
                              className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                            >
                              Refusée
                            </button>
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() =>
                                patchStatut(m.id, "SANS_REPONSE")
                              }
                              className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                            >
                              Sans réponse
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-white px-6 py-3.5">
          {step === "suivi" ? (
            <>
              <span className="text-xs text-zinc-500">
                Relance auto J+2 (jours ouvrés, IA) si pas de réponse — stoppable
                depuis l&apos;onglet Marques. Langue = fiche contact (EN → mail EN).
              </span>
              <button
                type="button"
                onClick={() => {
                  onDone();
                  onClose();
                }}
                className="inline-flex h-9 items-center rounded-lg bg-violet-700 px-4 text-sm font-medium text-white hover:bg-violet-800"
              >
                Terminer
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={step === "marques" ? onClose : goBack}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                <ChevronLeft className="h-4 w-4" />
                {step === "marques" ? "Annuler" : "Retour"}
              </button>
              {step === "envoi" ? (
                gmailConnected ? (
                  <button
                    type="button"
                    disabled={sending || loadingDraft}
                    onClick={handleSend}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-700 px-4 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    Envoyer
                    {senderPrenom ? ` (${senderPrenom})` : ""} (
                    {recipientCount})
                  </button>
                ) : (
                  <a
                    href={gmailConnectHref}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-700 px-4 text-sm font-medium text-white hover:bg-violet-800"
                  >
                    <Mail className="h-4 w-4" />
                    Connecter ma boîte mail
                  </a>
                )
              ) : (
                <button
                  type="button"
                  disabled={
                    loadingDraft ||
                    generatingAi ||
                    (step === "contacts" && !canContinueContacts) ||
                    (step === "marques" && selectedMarqueIds.size === 0)
                  }
                  onClick={() => void goNext()}
                  className="inline-flex h-9 items-center gap-1 rounded-lg bg-violet-700 px-4 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
                >
                  Continuer
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
