import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Activer les Server Actions
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
  // Images autorisées
  images: {
    domains: ["localhost", "res.cloudinary.com", "lh3.googleusercontent.com"],
  },
};

export default nextConfig;
