import type { NextConfig } from "next";

const awsBucket = process.env.AWS_S3_BUCKET;
const awsRegion = process.env.AWS_REGION ?? "eu-west-3";
const s3PublicUrl = process.env.AWS_S3_PUBLIC_URL?.replace(/\/+$/, "");

const s3RemotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  { protocol: "https", hostname: "*.cloudfront.net", pathname: "/**" },
];
if (awsBucket) {
  s3RemotePatterns.push({
    protocol: "https",
    hostname: `${awsBucket}.s3.${awsRegion}.amazonaws.com`,
    pathname: "/**",
  });
}
if (s3PublicUrl) {
  try {
    const host = new URL(s3PublicUrl).hostname;
    if (!s3RemotePatterns.some((p) => p.hostname === host)) {
      s3RemotePatterns.push({ protocol: "https", hostname: host, pathname: "/**" });
    }
  } catch {
    /* URL invalide — ignorée */
  }
}

const nextConfig: NextConfig = {
  // Activer les Server Actions
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
  // Images autorisées (remotePatterns remplace domains, déprécié)
  images: {
    remotePatterns: [
      ...s3RemotePatterns,
      // Cloudinary — conservé le temps de migrer les anciens fichiers
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "cdn.brandfetch.io", pathname: "/**" },
      { protocol: "http", hostname: "localhost", pathname: "/**" },
    ],
  },
};

export default nextConfig;
