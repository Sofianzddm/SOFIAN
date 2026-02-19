"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, Upload, X } from "lucide-react";

export default function NewPartnerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    logo: "",
    contactName: "",
    contactEmail: "",
    message: "",
    description: "",
  });
  const [generatedSlug, setGeneratedSlug] = useState<string | null>(null);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Vérifier le type de fichier
    if (!file.type.startsWith("image/")) {
      alert("Veuillez sélectionner une image");
      return;
    }

    // Limite de taille (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert("L'image ne doit pas dépasser 10MB");
      return;
    }

    setUploadingLogo(true);

    try {
      // Créer un partenaire temporaire pour obtenir un ID (ou utiliser un ID temporaire)
      // Pour la création, on va uploader après la création du partenaire
      // Pour l'instant, on va juste préparer le fichier
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Stocker le fichier pour l'upload après création
      (window as any).pendingLogoFile = file;
    } catch (error) {
      console.error("Erreur préparation logo:", error);
      alert("Erreur lors de la préparation du logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  function removeLogo() {
    setLogoPreview(null);
    setFormData({ ...formData, logo: "" });
    delete (window as any).pendingLogoFile;
  }

  async function uploadLogoAfterCreation(partnerId: string) {
    const pendingFile = (window as any).pendingLogoFile;
    if (!pendingFile) return;

    try {
      // 1. Récupérer la signature
      const signatureRes = await fetch("/api/partners/upload-logo/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId }),
      });

      if (!signatureRes.ok) {
        throw new Error("Erreur de signature");
      }

      const { signature, timestamp, folder, publicId, cloudName, apiKey } = await signatureRes.json();

      // 2. Upload direct vers Cloudinary
      const formData = new FormData();
      formData.append("file", pendingFile);
      formData.append("signature", signature);
      formData.append("timestamp", timestamp.toString());
      formData.append("folder", folder);
      formData.append("public_id", publicId);
      formData.append("api_key", apiKey);

      const cloudinaryRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!cloudinaryRes.ok) {
        throw new Error("Erreur upload Cloudinary");
      }

      const cloudinaryData = await cloudinaryRes.json();
      const logoUrl = cloudinaryData.secure_url;

      // 3. Mettre à jour la DB avec la nouvelle URL
      const updateRes = await fetch("/api/partners/upload-logo/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId, logoUrl }),
      });

      if (!updateRes.ok) {
        throw new Error("Erreur mise à jour DB");
      }

      // Nettoyer
      delete (window as any).pendingLogoFile;
    } catch (error) {
      console.error("Erreur upload logo:", error);
      // Ne pas bloquer la création si l'upload échoue
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          // Plus besoin de sélectionner les talents, tous sont affichés automatiquement
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedSlug(data.slug);
        
        // Uploader le logo si un fichier est en attente
        if ((window as any).pendingLogoFile) {
          await uploadLogoAfterCreation(data.id);
        }
        
        setTimeout(() => {
          router.push(`/partners/manage/${data.id}`);
        }, 2000);
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


  if (generatedSlug) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <h2 className="text-2xl font-bold text-green-800 mb-4">✅ Partenaire créé !</h2>
          <p className="text-gray-700 mb-4">Lien généré :</p>
          <div className="bg-white rounded-lg p-4 mb-4">
            <code className="text-blue-600 break-all">
              {window.location.origin}/partners/{generatedSlug}
            </code>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/partners/${generatedSlug}`);
              alert("Lien copié !");
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Copier le lien
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link href="/partners" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" />
        Retour à la liste
      </Link>

      <h1 className="text-3xl font-bold mb-8">Nouveau partenaire</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Nom de l'agence *</label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="Ex: WOO, Influence4You..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Logo</label>
          
          {logoPreview || formData.logo ? (
            <div className="relative inline-block">
              <div className="w-32 h-32 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden p-2">
                <img
                  src={logoPreview || formData.logo}
                  alt="Logo preview"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <button
                type="button"
                onClick={removeLogo}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <label className="cursor-pointer">
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Cliquez pour uploader un logo
                  </span>
                  <span className="text-xs text-gray-400">
                    PNG, JPG, WEBP (max 10MB)
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                  disabled={uploadingLogo}
                />
              </label>
            </div>
          )}
          
          {uploadingLogo && (
            <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              Upload en cours...
            </div>
          )}
          
          {/* Option alternative : URL manuelle */}
          <div className="mt-4">
            <label className="block text-xs text-gray-500 mb-1">Ou entrez une URL</label>
            <input
              type="text"
              value={formData.logo}
              onChange={(e) => {
                setFormData({ ...formData, logo: e.target.value });
                if (e.target.value) {
                  setLogoPreview(null);
                  delete (window as any).pendingLogoFile;
                }
              }}
              className="w-full px-4 py-2 border rounded-lg text-sm"
              placeholder="https://res.cloudinary.com/..."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Nom du contact</label>
            <input
              type="text"
              value={formData.contactName}
              onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Email du contact</label>
            <input
              type="email"
              value={formData.contactEmail}
              onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Message d'accueil personnalisé</label>
          <textarea
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
            rows={3}
            placeholder="Message affiché sur la page publique..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
            rows={2}
          />
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>ℹ️ Information :</strong> Tous les talents actifs seront automatiquement visibles sur le portail partenaire.
            Aucune sélection n'est nécessaire.
          </p>
        </div>

        <div className="flex justify-end gap-4 pt-4 border-t">
          <Link href="/partners" className="px-6 py-2 border rounded-lg hover:bg-gray-50">
            Annuler
          </Link>
          <button
            type="submit"
            disabled={loading || !formData.name}
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
                Créer le partenaire
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
