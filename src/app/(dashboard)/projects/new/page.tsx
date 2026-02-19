"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, Plus, X } from "lucide-react";

interface Talent {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
}

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    coverImage: "",
    videoUrl: "",
    category: "",
    date: "",
    location: "",
    order: 0,
    isActive: true,
  });
  const [images, setImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [selectedTalents, setSelectedTalents] = useState<string[]>([]);

  useEffect(() => {
    fetchTalents();
  }, []);

  async function fetchTalents() {
    try {
      const res = await fetch("/api/talents");
      if (res.ok) {
        const data = await res.json();
        setTalents(data.talents || data);
      }
    } catch (error) {
      console.error("Erreur:", error);
    }
  }

  function addImage() {
    if (newImageUrl.trim()) {
      setImages([...images, newImageUrl.trim()]);
      setNewImageUrl("");
    }
  }

  function removeImage(index: number) {
    setImages(images.filter((_, i) => i !== index));
  }

  function toggleTalent(talentId: string) {
    setSelectedTalents((prev) =>
      prev.includes(talentId) ? prev.filter((id) => id !== talentId) : [...prev, talentId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          images: images.length > 0 ? images : null,
          date: formData.date || null,
          talentIds: selectedTalents,
        }),
      });
      if (res.ok) {
        router.push("/projects");
      } else {
        const error = await res.json();
        alert(error.error || "Erreur lors de la création");
      }
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur lors de la création");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link href="/projects" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" />
        Retour à la liste
      </Link>

      <h1 className="text-3xl font-bold mb-8">Nouveau projet</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Titre du projet *</label>
          <input
            type="text"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="Ex: Campagne Printemps 2025..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
            rows={4}
            placeholder="Description du projet..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Image de couverture (URL Cloudinary)</label>
            <input
              type="text"
              value={formData.coverImage}
              onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
              placeholder="https://res.cloudinary.com/..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Catégorie</label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
              placeholder="Ex: Campagne, Événement..."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Lieu</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
              placeholder="Ex: Paris, France..."
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">URL Vidéo (YouTube, Vimeo...)</label>
          <input
            type="text"
            value={formData.videoUrl}
            onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="https://youtube.com/embed/..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Images additionnelles (URLs Cloudinary)</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addImage();
                }
              }}
              className="flex-1 px-4 py-2 border rounded-lg"
              placeholder="https://res.cloudinary.com/..."
            />
            <button
              type="button"
              onClick={addImage}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img src={img} alt={`Image ${idx + 1}`} className="w-20 h-20 object-cover rounded border" />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Ordre d'affichage</label>
            <input
              type="number"
              value={formData.order}
              onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
              className="w-full px-4 py-2 border rounded-lg"
              min="0"
            />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="isActive" className="text-sm font-medium">
              Projet actif
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-4">
            Sélectionner les talents ({selectedTalents.length} sélectionnés)
          </label>
          <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              {talents.map((talent) => {
                const isSelected = selectedTalents.includes(talent.id);
                return (
                  <button
                    key={talent.id}
                    type="button"
                    onClick={() => toggleTalent(talent.id)}
                    className={`flex items-center gap-3 p-3 border rounded-lg text-left transition-colors ${
                      isSelected ? "border-blue-600 bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4" />
                    {talent.photo ? (
                      <img src={talent.photo} alt={talent.prenom} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                        {talent.prenom[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {talent.prenom} {talent.nom}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-4 pt-4 border-t">
          <Link href="/projects" className="px-6 py-2 border rounded-lg hover:bg-gray-50">
            Annuler
          </Link>
          <button
            type="submit"
            disabled={loading || !formData.title}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Création...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Créer le projet
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
