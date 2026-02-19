"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Film, Loader2, Calendar, MapPin } from "lucide-react";

const BASE = "/partners/projects";

interface Project {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverImage: string | null;
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
  createdAt: string;
}

export default function PartnersProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteProject(id: string) {
    if (!confirm("Supprimer ce projet ?")) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (error) {
      console.error("Erreur:", error);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Non défini";
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Projets</h1>
          <p className="text-gray-600">Gérez les projets de l'agence (portail partenaire)</p>
        </div>
        <Link
          href={`${BASE}/new`}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Nouveau projet
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-lg border">
          <Film className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">Aucun projet créé</p>
          <Link
            href={`${BASE}/new`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            Créer le premier projet
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="relative h-48 bg-gradient-to-br from-gray-100 to-gray-200">
                {project.coverImage ? (
                  <img
                    src={project.coverImage}
                    alt={project.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film className="w-16 h-16 text-gray-400" />
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      project.isActive
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {project.isActive ? "Actif" : "Inactif"}
                  </span>
                </div>
              </div>

              <div className="p-5">
                <h3 className="text-lg font-bold mb-2">{project.title}</h3>
                {project.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{project.description}</p>
                )}

                <div className="space-y-2 mb-4">
                  {project.category && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="font-medium">Catégorie:</span>
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">{project.category}</span>
                    </div>
                  )}
                  {project.date && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      {formatDate(project.date)}
                    </div>
                  )}
                  {project.location && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin className="w-4 h-4" />
                      {project.location}
                    </div>
                  )}
                </div>

                {project.talents.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-2">Talents ({project.talents.length})</p>
                    <div className="flex -space-x-2">
                      {project.talents.slice(0, 5).map((talent) => (
                        <div
                          key={talent.id}
                          className="w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-gray-200"
                          title={`${talent.prenom} ${talent.nom}`}
                        >
                          {talent.photo ? (
                            <img
                              src={talent.photo}
                              alt={`${talent.prenom} ${talent.nom}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-600">
                              {talent.prenom.charAt(0)}
                            </div>
                          )}
                        </div>
                      ))}
                      {project.talents.length > 5 && (
                        <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-300 flex items-center justify-center text-xs font-bold text-gray-700">
                          +{project.talents.length - 5}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-4 border-t">
                  <Link
                    href={`${BASE}/${project.id}/edit`}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                    Modifier
                  </Link>
                  <button
                    onClick={() => deleteProject(project.id)}
                    className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
