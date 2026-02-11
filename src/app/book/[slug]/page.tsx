"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// Types
interface TalentData {
  id: string;
  name: string;
  handle: string;
  photo: string | null;
  niche: string[];
  platforms: string[];
  followers: number;
  engagementRate: number;
  frAudience: number;
  pitch: string;
  instagram: string | null;
  tiktok: string | null;
}

interface BrandData {
  name: string;
  niche: string;
  talents: TalentData[];
}

// Logo Glow Up SVG
function GlowUpLogo({ className = "", color = "#220101" }: { className?: string; color?: string }) {
  return (
    <svg className={className} viewBox="0 0 478 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M58.1427 49.2504L58.3576 71.3492C37.4442 81.0362 14.7263 69.0428 13.6522 39.6706C12.4814 9.08627 46.7247 -4.15158 72.0098 31.2816L72.332 31.1851L68.7015 13.2164C40.7525 -1.42677 0 9.56901 0 44.7019C0 81.8515 49.5067 92.6542 72.9765 62.6706V38.2439H52.7936C55.0385 41.269 58.1535 45.5172 58.1535 49.2504H58.1427Z" fill={color}/>
      <path d="M97.8426 74.7713V8.05642H83.0089V78.719H138.692L138.832 65.0843C130.69 71.553 114.578 74.7713 102.418 74.7713H97.8319H97.8426Z" fill={color}/>
      <path d="M204.397 15.3297C187.866 2.30643 163.966 4.82741 150.518 20.3824C137.392 36.2378 139.745 58.9481 156.168 71.9714C172.699 84.2867 196.921 81.9695 210.465 66.3179C223.376 50.6664 220.605 27.7523 204.386 15.3405L204.397 15.3297ZM198.747 58.9374C185.836 73.9774 172.194 80.3389 158.531 69.5362C148.499 61.5656 148.499 44.2084 161.302 29.3614C173.891 14.4179 190.948 9.27936 202.259 17.5611C215.385 27.2481 211.228 44.1011 198.747 58.9481V58.9374Z" fill={color}/>
      <path d="M403.637 8.46407V45.4099C403.637 82.9672 355.742 88.213 355.742 45.9141V8.05642H340.596V46.9225C340.596 90.8412 407.171 91.5492 407.171 45.8175V8.05642H403.648V8.46407H403.637Z" fill={color}/>
      <path d="M446.925 8.05642H416.301V78.719H431.135V50.1515L446.925 50.0549C464.745 49.9584 477.333 41.3763 477.333 28.5461C477.333 16.6385 464.745 8.05642 446.925 8.05642ZM440.093 46.4075H431.135V10.792H440.093C454.82 10.792 461.533 15.8232 461.533 27.3339C461.533 40.2606 454.809 46.4075 440.093 46.4075Z" fill={color}/>
      <path d="M325.451 0.0107276L317.395 8.05642L320.102 10.7598C324.678 15.5657 322.895 20.9832 319.522 27.6343L302.239 62.0591L278.984 18.1511L273.861 8.65716L273.538 8.05642H257.212L257.319 8.26024L262.12 16.9389L272.894 37.4286L260.52 61.9625L236.416 17.9473L231.078 8.56062L230.756 8.05642H214.536L214.859 8.56062L220.294 18.2476L255.181 79.9313H255.396L275.235 40.8614L296.783 79.9313H296.997L333.486 8.24952L333.593 8.04569H333.496L325.44 0L325.451 0.0107276Z" fill={color}/>
    </svg>
  );
}

// Instagram Icon
function InstagramIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  );
}

// TikTok Icon
function TikTokIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
    </svg>
  );
}

// Format followers
function formatFollowers(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(".", ",") + "M";
  if (num >= 1000) {
    const k = num / 1000;
    if (k >= 100) return Math.round(k) + "K";
    return k.toFixed(1).replace(".", ",") + "K";
  }
  return num.toString();
}

// Get initials
function getInitials(name: string): string {
  const parts = name.split(' ');
  return parts.map(p => p.charAt(0)).join('').toUpperCase();
}

export default function PressKitPage() {
  const params = useParams();
  const slug = params.slug as string;
  
  const [brandData, setBrandData] = useState<BrandData | null>(null);
  const [loading, setLoading] = useState(true);
  const [brandColor, setBrandColor] = useState('#B06F70');

  useEffect(() => {
    // Fetch brand data
    fetch(`/api/presskit/${slug}`)
      .then(res => res.json())
      .then(data => {
        setBrandData(data);
        setBrandColor(data.primaryColor || '#B06F70');
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading press kit:', err);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5EDE0] flex items-center justify-center">
        <div className="text-[#220101] text-xl">Chargement...</div>
      </div>
    );
  }

  if (!brandData) {
    return (
      <div className="min-h-screen bg-[#F5EDE0] flex items-center justify-center">
        <div className="text-[#220101] text-xl">Press kit introuvable</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5EDE0]">
      {/* Header */}
      <header className="border-b border-[#220101]/10">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <GlowUpLogo className="h-10 md:h-12 mb-2" color="#220101" />
              <p className="text-[#220101]/60 text-xs md:text-sm tracking-[0.2em] uppercase">
                THE RISE of IDEAS
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-[#220101]/10 py-12 md:py-20">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-[#220101]/50 text-sm md:text-base uppercase tracking-[0.15em] mb-4">
            Sélection personnalisée
          </p>
          <h1 className="text-4xl md:text-6xl lg:text-7xl mb-6">
            <span className="font-spectral-light text-[#220101]">Votre sélection pour </span>
            <span className="font-spectral-medium-italic" style={{ color: brandColor }}>
              {brandData.name}
            </span>
          </h1>
          
          {/* Ligne décorative avec couleur marque */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="h-[1px] w-24 bg-[#220101]/20"></div>
            <div className="h-[2px] w-16" style={{ backgroundColor: brandColor }}></div>
            <div className="h-[1px] w-24 bg-[#220101]/20"></div>
          </div>

          <p className="text-[#220101]/70 text-lg md:text-xl max-w-3xl mx-auto leading-relaxed">
            {brandData.talents.length} créateurs sélectionnés spécialement pour votre marque
          </p>
        </div>
      </section>

      {/* Talents Grid */}
      <section className="py-12 md:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {brandData.talents.map((talent) => {
              const hasPhoto = talent.photo && talent.photo.trim() !== "";
              
              return (
                <article
                  key={talent.id}
                  className="group bg-white rounded-3xl overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(34,1,1,0.15)]"
                  style={{ boxShadow: "0 4px 24px rgba(34, 1, 1, 0.06)" }}
                >
                  {/* Photo */}
                  <div className="relative h-[340px] overflow-hidden bg-[#F5EDE0]">
                    {hasPhoto ? (
                      <img
                        src={talent.photo!}
                        alt={talent.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#B06F70] to-[#220101]">
                        <span className="text-8xl text-[#F5EDE0]/60 tracking-widest font-spectral-light">
                          {getInitials(talent.name)}
                        </span>
                      </div>
                    )}
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-[#220101]/90 via-[#220101]/30 to-transparent" />
                    
                    <div className="absolute bottom-5 left-5 right-5">
                      <p className="text-[#F5EDE0] text-2xl tracking-wide font-spectral-light">
                        {talent.name.toUpperCase()}
                      </p>
                      {talent.handle && (
                        <p className="text-[#F5EDE0]/50 text-sm font-switzer mt-1">
                          @{talent.handle}
                        </p>
                      )}
                    </div>

                    {/* Social Icons */}
                    <div className="absolute top-5 right-5 flex gap-2">
                      {talent.instagram && (
                        <a
                          href={`https://instagram.com/${talent.instagram.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center hover:bg-white hover:scale-110 transition-all shadow-sm"
                        >
                          <InstagramIcon className="w-4 h-4 text-[#220101]" />
                        </a>
                      )}
                      {talent.tiktok && (
                        <a
                          href={`https://tiktok.com/@${talent.tiktok.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center hover:bg-white hover:scale-110 transition-all shadow-sm"
                        >
                          <TikTokIcon className="w-4 h-4 text-[#220101]" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    {/* Niches */}
                    <p className="text-[11px] text-[#220101]/50 uppercase tracking-[0.15em] mb-3 font-spectral-light">
                      {talent.niche.length > 0 ? talent.niche.slice(0, 3).join(" · ") : "Créateur de contenu"}
                    </p>

                    {/* Stats */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between py-2.5 px-3 bg-[#F5EDE0]/50 rounded-xl">
                        <div className="flex items-center gap-2.5">
                          <InstagramIcon className="w-4 h-4 text-[#220101]/60" />
                          <span className="font-switzer text-[#220101]">
                            {formatFollowers(talent.followers)}
                          </span>
                        </div>
                        <span className="font-switzer text-[#220101]">
                          {talent.engagementRate.toFixed(1).replace(".", ",")}%
                        </span>
                      </div>

                      {talent.frAudience > 0 && (
                        <div className="flex items-center justify-between py-2.5 px-3 bg-[#F5EDE0]/50 rounded-xl">
                          <span className="text-xs text-[#220101]/60 font-switzer uppercase tracking-wider">
                            Audience FR
                          </span>
                          <span className="font-switzer text-[#220101]">
                            {talent.frAudience}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Pitch IA */}
                    <div className="pt-4 border-t border-[#220101]/10">
                      <p className="text-[#220101]/70 text-sm leading-relaxed font-spectral-light italic">
                        {talent.pitch}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 md:py-20 border-t border-[#220101]/10">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-spectral-light text-[#220101] mb-6">
            Prêt à lancer votre campagne ?
          </h2>
          <p className="text-[#220101]/70 text-lg mb-10">
            Planifions un appel pour discuter de votre projet
          </p>
          <a
            href="mailto:contact@glowupagence.com?subject=Collaboration avec Glow Up"
            className="inline-block px-10 py-4 rounded-full font-switzer font-semibold text-white text-lg transition-all hover:scale-105 shadow-lg"
            style={{ backgroundColor: brandColor }}
          >
            Planifier un appel
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#220101]/10 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-[#220101]/50 text-sm">
          Ce book a été créé spécialement pour{" "}
          <span style={{ color: brandColor, fontWeight: 600 }}>{brandData.name}</span>
          <br />
          © 2026 Glow Up Agence — THE RISE of IDEAS
        </div>
      </footer>
    </div>
  );
}
