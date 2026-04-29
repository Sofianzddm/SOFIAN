"use client";

import { useMemo, useState } from "react";
import Modal from "./Modal";
import ContactForm from "./forms/ContactForm";
import type { CannesContact } from "../types";

const CATEGORIES = ["TOUS", "MARQUE", "AGENCE", "PRESSE", "PRODUCTION", "HOTEL", "TRANSPORT", "TALENT_EXT", "AUTRE"];

type Props = { contacts: CannesContact[]; isAdmin: boolean };

export default function ContactsView({ contacts, isAdmin }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("TOUS");
  const [creatingContact, setCreatingContact] = useState(false);
  const [editingContact, setEditingContact] = useState<CannesContact | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      const matchCategory = category === "TOUS" || c.category === category;
      if (!matchCategory) return false;
      if (!q) return true;
      const haystack = `${c.firstName} ${c.lastName} ${c.company || ""} ${c.role || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [contacts, query, category]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un contact..."
          className="w-full max-w-md rounded-lg border border-[#E5E0D8] bg-white p-2"
        />
        {isAdmin && (
          <button onClick={() => setCreatingContact(true)} className="rounded bg-[#1A1110] px-3 py-2 text-sm text-[#F5EBE0] hover:bg-[#C08B8B]">
            + Nouveau contact
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`rounded-full border px-3 py-1 text-xs ${
              category === cat ? "border-[#1A1110] bg-[#1A1110] text-[#F5EBE0]" : "border-[#E5E0D8] bg-white text-[#1A1110]"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c) => (
          <button key={c.id} onClick={() => setEditingContact(c)} className="rounded-xl border border-[#E5E0D8] bg-white p-4 text-left shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C08B8B] text-sm font-semibold text-white">
                {`${c.firstName[0] || ""}${c.lastName[0] || ""}`}
              </div>
              <span className="rounded-full bg-[#F5EBE0] px-2 py-1 text-xs text-[#1A1110]">{c.category}</span>
            </div>
            <h3 className="font-[Spectral] text-xl text-[#1A1110]">{c.firstName} {c.lastName}</h3>
            <p className="text-sm text-[#1A1110]/70">{c.company || "-"} {c.role ? `· ${c.role}` : ""}</p>
            <div className="mt-3 flex gap-3 text-sm">
              {c.phone && <a href={`tel:${c.phone}`}>Tel</a>}
              {c.email && <a href={`mailto:${c.email}`}>Email</a>}
              {c.instagram && <a href={`https://instagram.com/${c.instagram.replace("@", "")}`} target="_blank">IG</a>}
            </div>
          </button>
        ))}
      </div>

      <Modal open={creatingContact} title="Nouveau contact" onClose={() => setCreatingContact(false)}>
        <ContactForm onClose={() => setCreatingContact(false)} />
      </Modal>

      <Modal open={!!editingContact} title={isAdmin ? "Modifier contact" : "Detail contact"} onClose={() => setEditingContact(null)}>
        {editingContact && (
          isAdmin ? (
            <ContactForm initialData={editingContact} onClose={() => setEditingContact(null)} />
          ) : (
            <div className="space-y-2 text-sm text-[#1A1110]/80">
              <p className="font-[Spectral] text-2xl text-[#1A1110]">{editingContact.firstName} {editingContact.lastName}</p>
              <p>{editingContact.company || "-"} {editingContact.role ? `· ${editingContact.role}` : ""}</p>
              <p>Telephone : {editingContact.phone || "-"}</p>
              <p>Email : {editingContact.email || "-"}</p>
              <p>Instagram : {editingContact.instagram || "-"}</p>
              <p>Hotel : {editingContact.hotel || "-"}</p>
              {editingContact.notes && <p>{editingContact.notes}</p>}
            </div>
          )
        )}
      </Modal>
    </div>
  );
}
