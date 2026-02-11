"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";

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
  ageRange: string;
  pitch: string;
  bestCollab: string;
}

interface CaseStudyData {
  title: string;
  brandName: string;
  description: string;
  impressions: string;
  engagement: string;
  imageUrl: string | null;
}

interface BrandData {
  name: string;
  logo: string | null;
  primaryColor: string;
  secondaryColor: string;
  niche: string;
  talents: TalentData[];
  caseStudies: CaseStudyData[];
}

export default function PressKitPage() {
  const params = useParams();
  const slug = params.slug as string;
  
  const [brandData, setBrandData] = useState<BrandData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  const [startTime] = useState(Date.now());
  const [scrollDepth, setScrollDepth] = useState(0);
  const [viewedTalents, setViewedTalents] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Fetch brand data
    fetch(`/api/presskit/${slug}`)
      .then(res => res.json())
      .then(data => {
        setBrandData(data);
        setLoading(false);
        
        // Track page view
        trackEvent('view', {});
      })
      .catch(err => {
        console.error('Error loading press kit:', err);
        setLoading(false);
      });
  }, [slug]);

  useEffect(() => {
    // Track scroll depth
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const depth = Math.round(((scrollTop + windowHeight) / documentHeight) * 100);
      
      if (depth > scrollDepth) {
        setScrollDepth(depth);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [scrollDepth]);

  useEffect(() => {
    // Setup intersection observer for talent cards
    if (!brandData?.talents) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const talentId = entry.target.getAttribute('data-talent-id');
            if (talentId && !viewedTalents.has(talentId)) {
              setViewedTalents(prev => new Set([...prev, talentId]));
            }
          }
        });
      },
      { threshold: 0.5 }
    );

    document.querySelectorAll('[data-talent-id]').forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [brandData, viewedTalents]);

  useEffect(() => {
    // Send analytics on unmount or visibility change
    const sendAnalytics = () => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      trackEvent('session_end', {
        durationSeconds: duration,
        scrollDepthPercent: scrollDepth,
        talentsViewed: Array.from(viewedTalents),
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        sendAnalytics();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', sendAnalytics);

    return () => {
      sendAnalytics();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', sendAnalytics);
    };
  }, [startTime, scrollDepth, viewedTalents]);

  const trackEvent = (type: string, metadata: any) => {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        sessionId,
        type,
        metadata,
      }),
    }).catch(err => console.error('Tracking error:', err));
  };

  const handleCTAClick = () => {
    trackEvent('cta_click', { ctaType: 'mailto' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-white text-xl font-playfair">Chargement...</div>
      </div>
    );
  }

  if (!brandData) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-white text-xl font-playfair">Press kit introuvable</div>
      </div>
    );
  }

  // Couleurs Glow Up (toujours utilisées)
  const glowupPink = '#ff6b9d';
  const glowupDarkPink = '#c2185b';
  
  // Couleurs de la marque (utilisées SUBTILEMENT)
  const brandColor = brandData.primaryColor || glowupPink;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      {/* Hero Section */}
      <section className="relative py-20 px-6 overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center gap-8 mb-12">
            {/* Glow Up Logo */}
            <div className="text-4xl font-playfair font-bold tracking-wider">
              GLOW<span className="text-[#ff6b9d]">UP</span>
            </div>
            
            <span className="text-3xl text-gray-600">×</span>
            
            {/* Brand Logo */}
            {brandData.logo ? (
              <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center">
                <Image 
                  src={brandData.logo} 
                  alt={brandData.name}
                  width={128}
                  height={128}
                  className="object-contain p-2"
                />
              </div>
            ) : (
              <div className="text-4xl font-playfair font-bold">{brandData.name}</div>
            )}
          </div>

          <h1 className="text-5xl md:text-7xl font-playfair text-center mb-6">
            Votre sélection de <span className="text-[#ff6b9d]">créateurs</span>
          </h1>
          
          <p className="text-xl text-gray-400 text-center max-w-3xl mx-auto">
            Une sélection personnalisée de talents parfaitement alignés avec l'univers {brandData.name}
          </p>
        </div>

        {/* Decorative gradient - Glow Up pink */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full blur-[120px] opacity-20 bg-gradient-radial from-[#ff6b9d] to-transparent"></div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-gray-800 py-8 px-6">
        {/* Ligne décorative en couleur marque */}
        <div 
          className="max-w-6xl mx-auto h-[2px] mb-8"
          style={{ background: `linear-gradient(90deg, transparent, ${brandColor}, transparent)` }}
        ></div>
        
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <div className="text-4xl font-playfair font-bold text-[#ff6b9d]">
              {brandData.talents.length}
            </div>
            <div className="text-sm text-gray-400 mt-1">Créateurs sélectionnés</div>
          </div>
          <div>
            <div className="text-4xl font-playfair font-bold text-[#ff6b9d]">
              {(brandData.talents.reduce((sum, t) => sum + t.followers, 0) / 1000000).toFixed(1)}M
            </div>
            <div className="text-sm text-gray-400 mt-1">Reach cumulé</div>
          </div>
          <div>
            <div className="text-4xl font-playfair font-bold text-[#ff6b9d]">
              {(brandData.talents.reduce((sum, t) => sum + t.engagementRate, 0) / brandData.talents.length).toFixed(1)}%
            </div>
            <div className="text-sm text-gray-400 mt-1">Engagement moyen</div>
          </div>
          <div>
            <div className="text-4xl font-playfair font-bold text-[#ff6b9d]">
              150+
            </div>
            <div className="text-sm text-gray-400 mt-1">Campagnes réalisées</div>
          </div>
        </div>
      </section>

      {/* Talents Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-playfair font-bold text-center mb-16">
            Nos <span className="text-[#ff6b9d]">talents</span>
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {brandData.talents.map((talent, index) => (
              <div
                key={talent.id}
                data-talent-id={talent.id}
                className="group relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl overflow-hidden hover:scale-[1.02] transition-all duration-500"
                style={{
                  animation: `fadeUp 0.6s ease-out ${index * 0.1}s both`,
                }}
              >
                {/* Photo */}
                <div className="relative h-80 overflow-hidden">
                  {talent.photo ? (
                    <Image
                      src={talent.photo}
                      alt={talent.name}
                      fill
                      className="object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                      <span className="text-6xl font-playfair">{talent.name[0]}</span>
                    </div>
                  )}
                  
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent"></div>
                  
                  {/* Handle */}
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full">
                    <span className="text-sm">@{talent.handle}</span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3 className="text-2xl font-playfair font-bold mb-2">{talent.name}</h3>
                  
                  {/* Niches */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {talent.niche.map(n => (
                      <span 
                        key={n}
                        className="px-3 py-1 text-xs rounded-full border border-gray-600 text-gray-300"
                      >
                        {n}
                      </span>
                    ))}
                  </div>

                  {/* Pitch */}
                  <p className="text-gray-300 mb-6 leading-relaxed">{talent.pitch}</p>

                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div>
                      <div className="text-2xl font-bold text-[#ff6b9d]">
                        {talent.followers >= 1000000 
                          ? `${(talent.followers / 1000000).toFixed(1)}M`
                          : `${(talent.followers / 1000).toFixed(0)}K`
                        }
                      </div>
                      <div className="text-xs text-gray-400">Followers</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-[#ff6b9d]">
                        {talent.engagementRate}%
                      </div>
                      <div className="text-xs text-gray-400">Engagement</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-[#ff6b9d]">
                        {talent.frAudience}%
                      </div>
                      <div className="text-xs text-gray-400">Audience FR</div>
                    </div>
                  </div>

                  {/* Best Collab */}
                  <div className="pt-4 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-1">Meilleure collaboration</div>
                    <div className="text-sm font-medium">{talent.bestCollab}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case Studies Section */}
      {brandData.caseStudies.length > 0 && (
        <section className="py-20 px-6 bg-gray-900/50">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl font-playfair font-bold text-center mb-16">
              Campagnes <span className="text-[#ff6b9d]">similaires</span>
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              {brandData.caseStudies.map((cs, index) => (
                <div
                  key={index}
                  className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8"
                >
                  <div className="text-sm text-gray-400 mb-2">{cs.brandName}</div>
                  <h3 className="text-2xl font-playfair font-bold mb-4">{cs.title}</h3>
                  <p className="text-gray-300 mb-6">{cs.description}</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-3xl font-bold text-[#ff6b9d]">
                        {cs.impressions}
                      </div>
                      <div className="text-xs text-gray-400">Impressions</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-[#ff6b9d]">
                        {cs.engagement}
                      </div>
                      <div className="text-xs text-gray-400">Engagement</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-playfair font-bold mb-6">
            Prêt à lancer votre campagne ?
          </h2>
          <p className="text-xl text-gray-400 mb-10">
            Planifions un appel pour discuter de votre projet
          </p>
          <a
            href="mailto:contact@glowupagence.com?subject=Collaboration avec Glow Up"
            onClick={handleCTAClick}
            className="inline-block px-10 py-4 rounded-full font-semibold text-lg transition-all hover:scale-105 text-white"
            style={{ 
              backgroundColor: brandColor,
            }}
          >
            Planifier un appel
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 px-6">
        <div className="max-w-6xl mx-auto text-center text-gray-500 text-sm">
          Ce book a été créé spécialement pour <span style={{ color: brandColor, fontWeight: 600 }}>{brandData.name}</span>
          <br />
          © 2026 Glow Up Agence — THE RISE of IDEAS
        </div>
      </footer>

      {/* Keyframes for animations */}
      <style jsx>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
