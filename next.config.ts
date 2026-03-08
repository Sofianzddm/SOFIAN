import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Activer les Server Actions
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
    // Racine du projet pour Turbopack (évite "couldn't find Next.js package" si lancé avec --turbo)
    turbo: {
      root: ".",
    },
  },
  // Images autorisées
  images: {
    domains: [
      "localhost",
      "res.cloudinary.com",
      "lh3.googleusercontent.com",
      "cdn.brandfetch.io", // Logos des marques via Brandfetch API
    ],
  },
};

export default nextConfig;
