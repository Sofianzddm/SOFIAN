"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, Plus, X, Link2, Upload, Crop } from "lucide-react";
import Cropper, { Area } from "react-easy-crop";

const BASE = "/partners/projects";

interface Talent {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
}

type ProjectLink = { label: string; url: string };

interface Project {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  images: string[] | null;
  links: ProjectLink[] | null;
  videoUrl: string | null;
  category: string | null;
  date: string | null;
  location: string | null;
  isActive: boolean;
  order: number;
  talents: Array<{
    id: string;
    prenom: string;
    nom: string;
    photo: string | null;
    role: string | null;
  }>;
}

function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || "")) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  const handleInput = () => {
    if (ref.current) {
      onChange(ref.current.innerHTML);
    }
  };

  const applyFormat = (command: "bold" | "underline") => {
    if (!ref.current) return;
    ref.current.focus();
    document.execCommand(command, false);
    handleInput();
  };

  return (
    <div className="border rounded-lg">
      <div className="flex items-center gap-2 px-2 py-1 border-b bg-gray-50 text-xs text-gray-600">
        <span className="mr-1">Mise en forme</span>
        <button
          type="button"
          onClick={() => applyFormat("bold")}
          className="px-2 py-0.5 rounded hover:bg-gray-200 font-semibold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => applyFormat("underline")}
          className="px-2 py-0.5 rounded hover:bg-gray-200 underline"
        >
          U
        </button>
      </div>
      <div
        ref={ref}
        className="px-3 py-2 min-h-[96px] text-sm focus:outline-none"
        contentEditable
        onInput={handleInput}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
    </div>
  );
}

export default function EditPartnerProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [project, setProject] = useState<Project | null>(null);
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
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [selectedTalents, setSelectedTalents] = useState<string[]>([]);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [isCroppingCover, setIsCroppingCover] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  useEffect(() => {
    if (projectId) {
      fetchProject();
      fetchTalents();
    }
  }, [projectId]);

  async function fetchProject() {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
        setFormData({
          title: data.title || "",
          description: data.description || "",
          coverImage: data.coverImage || "",
          videoUrl: data.videoUrl || "",
          category: data.category || "",
          date: data.date ? new Date(data.date).toISOString().split("T")[0] : "",
          location: data.location || "",
          order: data.order || 0,
          isActive: data.isActive ?? true,
        });
        setImages(data.images || []);
        setLinks(Array.isArray(data.links) ? data.links : []);
        setSelectedTalents(data.talents.map((t: { id: string }) => t.id));
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  }

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

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingCover(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/projects/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload échoué");
      const { url } = await res.json();
      setFormData((prev) => ({ ...prev, coverImage: url }));
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'upload de l'image de couverture");
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    e.target.value = "";
    setUploadingGallery(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const form = new FormData();
        form.append("file", files[i]);
        const res = await fetch("/api/projects/upload", { method: "POST", body: form });
        if (!res.ok) throw new Error("Upload échoué");
        const { url } = await res.json();
        urls.push(url);
      }
      setImages((prev) => [...prev, ...urls]);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'upload des photos");
    } finally {
      setUploadingGallery(false);
    }
  }

  function removeImage(index: number) {
    setImages(images.filter((_, i) => i !== index));
  }

  function addLink() {
    setLinks([...links, { label: "", url: "" }]);
  }

  function removeLink(index: number) {
    setLinks(links.filter((_, i) => i !== index));
  }

  function updateLink(index: number, field: "label" | "url", value: string) {
    setLinks(links.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function toggleTalent(talentId: string) {
    setSelectedTalents((prev) =>
      prev.includes(talentId) ? prev.filter((id) => id !== talentId) : [...prev, talentId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          images: images.length > 0 ? images : null,
          links: links.filter((l) => l.url.trim()).length > 0 ? links.filter((l) => l.url.trim()) : null,
          date: formData.date || null,
          talentIds: selectedTalents,
        }),
      });
      if (res.ok) {
        router.push(BASE);
      } else {
        const error = await res.json();
        alert(error.error || "Erreur lors de la mise à jour");
      }
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  }

  function onCropComplete(_area: Area, croppedPixels: Area) {
    setCroppedAreaPixels(croppedPixels);
  }

  async function getCroppedImageUrl(imageUrl: string, area: Area): Promise<string> {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = imageUrl;

    await new Promise((resolve, reject) => {
      image.onload = () => resolve(null);
      image.onerror = (err) => reject(err);
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas non supporté");

    canvas.width = area.width;
    canvas.height = area.height;

    ctx.drawImage(
      image,
      area.x,
      area.y,
      area.width,
      area.height,
      0,
      0,
      area.width,
      area.height
    );

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.9);
    });

    const form = new FormData();
    form.append("file", blob, "crop.jpg");
    const res = await fetch("/api/projects/upload", { method: "POST", body: form });
    if (!res.ok) throw new Error("Upload recadrage échoué");
    const { url } = await res.json();
    return url;
  }

  async function applyCoverCrop() {
    if (!formData.coverImage || !croppedAreaPixels) return;
    setUploadingCover(true);
    try {
      const url = await getCroppedImageUrl(formData.coverImage, croppedAreaPixels);
      setFormData((prev) => ({ ...prev, coverImage: url }));
      setIsCroppingCover(false);
    } catch (err) {
      console.error(err);
      alert("Erreur lors du recadrage de l'image");
    } finally {
      setUploadingCover(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <p className="text-gray-600">Projet non trouvé</p>
        <Link href={BASE} className="text-blue-600 hover:underline">
          Retour à la liste
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link href={BASE} className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" />
        Retour à la liste
      </Link>

      <h1 className="text-3xl font-bold mb-8">Modifier le projet</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Titre du projet *</label>
          <input
            type="text"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <RichTextEditor
            value={formData.description}
            onChange={(html) => setFormData({ ...formData, description: html })}
            placeholder="Description du projet..."
          />
          <p className="mt-1 text-xs text-gray-500">
            Tu peux aérer (Entrée), mettre en <strong>gras</strong> ou <span className="underline">souligné</span>.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Image de couverture</label>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 items-start">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={formData.coverImage}
                    onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                    placeholder="URL ou upload ci-contre"
                  />
                </div>
                <label className="shrink-0 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer flex items-center gap-2 text-sm">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleCoverUpload}
                    disabled={uploadingCover}
                  />
                  {uploadingCover ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  Upload
                </label>
              </div>
              {formData.coverImage && (
                <div className="flex items-center gap-2">
                  <div className="w-32 h-20 rounded-lg border bg-gray-50 overflow-hidden">
                    <img src={formData.coverImage} alt="Couverture" className="w-full h-full object-cover" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCrop({ x: 0, y: 0 });
                      setZoom(1);
                      setIsCroppingCover(true);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs border rounded-lg hover:bg-gray-50"
                  >
                    <Crop className="w-3 h-3" />
                    Recadrer
                  </button>
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Catégorie</label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
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
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Photos du projet (galerie)</label>
          <p className="text-xs text-gray-500 mb-2">
            Upload direct ou coller une URL. Vous pouvez sélectionner plusieurs fichiers.
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            <label className="px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer flex items-center gap-2 text-sm shrink-0">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                multiple
                onChange={handleGalleryUpload}
                disabled={uploadingGallery}
              />
              {uploadingGallery ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Upload...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Uploader des photos
                </>
              )}
            </label>
            <span className="text-gray-400 self-center text-sm">ou</span>
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
              className="flex-1 min-w-[200px] px-4 py-2 border rounded-lg"
              placeholder="Coller l'URL d'une photo"
            />
            <button
              type="button"
              onClick={addImage}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg shrink-0"
            >
              <Plus className="w-4 h-4" /> Ajouter l'URL
            </button>
          </div>
          {images.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {images.map((img, idx) => (
                <div key={idx} className="relative group">
                  <div className="w-24 h-24 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                    <img src={img} alt={`Photo ${idx + 1}`} className="max-w-full max-h-full object-contain" />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Liens (optionnel)
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Articles, posts réseaux, site du projet, etc.
          </p>
          {links.map((link, idx) => (
            <div key={idx} className="flex gap-2 mb-2">
              <input
                type="text"
                value={link.label}
                onChange={(e) => updateLink(idx, "label", e.target.value)}
                className="w-40 px-3 py-2 border rounded-lg"
                placeholder="Libellé"
              />
              <input
                type="url"
                value={link.url}
                onChange={(e) => updateLink(idx, "url", e.target.value)}
                className="flex-1 px-3 py-2 border rounded-lg"
                placeholder="https://..."
              />
              <button
                type="button"
                onClick={() => removeLink(idx)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addLink}
            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Ajouter un lien
          </button>
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
          <Link href={BASE} className="px-6 py-2 border rounded-lg hover:bg-gray-50">
            Annuler
          </Link>
          <button
            type="submit"
            disabled={saving || !formData.title}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Enregistrer
              </>
            )}
          </button>
        </div>
      </form>

      {isCroppingCover && formData.coverImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-4 md:p-6">
            <h2 className="text-lg font-semibold mb-3">Recadrer l'image de couverture</h2>
            <div className="relative w-full h-64 bg-black/80 rounded-lg overflow-hidden">
              <Cropper
                image={formData.coverImage}
                crop={crop}
                zoom={zoom}
                aspect={16 / 9}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs text-gray-500">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  type="button"
                  onClick={() => setIsCroppingCover(false)}
                  className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={applyCoverCrop}
                  disabled={uploadingCover}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploadingCover ? "Enregistrement..." : "Appliquer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
