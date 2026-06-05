import type { MetadataRoute } from "next";

/**
 * Interdit l'exploration et l'indexation de l'ensemble de la plateforme.
 * Complète public/robots.txt et les en-têtes X-Robots-Tag globaux.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
