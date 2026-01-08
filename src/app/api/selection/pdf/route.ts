import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Traductions pour le PDF
const pdfTranslations = {
  fr: {
    selectionTalents: "sélection",
    talents: "talents",
    tagline: "THE RISE OF IDEAS",
    about: "À PROPOS",
    community: "COMMUNAUTÉ",
    engagementRate: "TX D'ENGAGEMENT",
    contentCreator: "CRÉATEUR DE CONTENU",
  },
  en: {
    selectionTalents: "talent",
    talents: "selection",
    tagline: "THE RISE OF IDEAS",
    about: "ABOUT",
    community: "COMMUNITY",
    engagementRate: "ENGAGEMENT RATE",
    contentCreator: "CONTENT CREATOR",
  },
};

type Lang = "fr" | "en";

export async function POST(request: NextRequest) {
  try {
    const { talentIds, lang = "fr" } = await request.json();

    if (!talentIds || !Array.isArray(talentIds) || talentIds.length === 0) {
      return NextResponse.json(
        { error: "Liste de talents requise" },
        { status: 400 }
      );
    }

    // Récupérer les talents avec leurs stats
    const talents = await prisma.talent.findMany({
      where: {
        id: { in: talentIds },
      },
      include: {
        stats: true,
      },
    });

    if (talents.length === 0) {
      return NextResponse.json(
        { error: "Aucun talent trouvé" },
        { status: 404 }
      );
    }

    // Si anglais, traduire les présentations
    let talentsWithTranslations = talents;
    if (lang === "en") {
      talentsWithTranslations = await Promise.all(
        talents.map(async (talent) => {
          if (talent.presentation) {
            try {
              const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=en&dt=t&q=${encodeURIComponent(talent.presentation)}`;
              const response = await fetch(url);
              if (response.ok) {
                const data = await response.json();
                let translation = "";
                if (data && data[0]) {
                  for (const part of data[0]) {
                    if (part[0]) {
                      translation += part[0];
                    }
                  }
                }
                return { ...talent, presentation: translation };
              }
            } catch (e) {
              console.error("Erreur traduction PDF:", e);
            }
          }
          return talent;
        })
      );
    }

    // Générer le HTML pour le PDF avec la langue
    const html = generatePDFHtml(talentsWithTranslations, lang as Lang);

    // Retourner le HTML (on utilisera html2pdf côté client)
    return NextResponse.json({ html, talents: talentsWithTranslations });
  } catch (error) {
    console.error("Erreur génération PDF:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération" },
      { status: 500 }
    );
  }
}

function formatFollowers(num: number | null): string {
  if (!num) return "—";
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(".", ",") + "M";
  if (num >= 1000) {
    const k = num / 1000;
    if (k >= 100) return Math.round(k) + "K";
    return k.toFixed(1).replace(".", ",") + "K";
  }
  return num.toString();
}

function generatePDFHtml(talents: any[], lang: Lang = "fr"): string {
  const t = pdfTranslations[lang];
  
  const today = new Date().toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const talentPages = talents
    .map(
      (talent, index) => `
    <!-- Page Talent ${index + 1} -->
    <div class="page talent-page">
      <div class="talent-content">
        <!-- Photo -->
        <div class="talent-photo">
          ${
            talent.photo
              ? `<img src="${talent.photo}" alt="${talent.prenom} ${talent.nom}" style="width: 280px; height: 280px; object-fit: cover; object-position: top center; border-radius: 16px;" />`
              : `<div class="initials">${talent.prenom.charAt(0)}${talent.nom.charAt(0)}</div>`
          }
        </div>
        
        <!-- Infos -->
        <div class="talent-info">
          <!-- Header avec nom -->
          <div class="talent-header">
            <h2 class="talent-name">
              <span class="prenom">${talent.prenom}</span>
              <span class="nom">${talent.nom.toUpperCase()}</span>
            </h2>
            <p class="niches">${talent.niches?.join(" / ") || t.contentCreator}</p>
          </div>
          
          <!-- Stats -->
          <div class="stats-section">
            <div class="stats-header">
              <span>${t.community}</span>
              <span>${t.engagementRate}</span>
            </div>
            
            ${
              talent.stats?.igFollowers
                ? `
            <div class="stat-row">
              <div class="stat-left">
                <svg class="icon" viewBox="0 0 24 24" fill="#220101"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                <span class="followers">${formatFollowers(talent.stats.igFollowers)}</span>
                ${
                  talent.stats.igFollowersEvol
                    ? `<span class="evolution">▲ ${talent.stats.igFollowersEvol.toFixed(2).replace(".", ",")}%</span>`
                    : ""
                }
              </div>
              <div class="stat-right">
                <span class="engagement">${talent.stats.igEngagement?.toFixed(2).replace(".", ",") || "—"}%</span>
              </div>
            </div>
            `
                : ""
            }
            
            ${
              talent.stats?.ttFollowers
                ? `
            <div class="stat-row">
              <div class="stat-left">
                <svg class="icon" viewBox="0 0 24 24" fill="#220101"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>
                <span class="followers">${formatFollowers(talent.stats.ttFollowers)}</span>
                ${
                  talent.stats.ttFollowersEvol
                    ? `<span class="evolution">▲ ${talent.stats.ttFollowersEvol.toFixed(2).replace(".", ",")}%</span>`
                    : ""
                }
              </div>
              <div class="stat-right">
                <span class="engagement">${talent.stats.ttEngagement?.toFixed(2).replace(".", ",") || "—"}%</span>
              </div>
            </div>
            `
                : ""
            }
            
            ${
              talent.stats?.ytAbonnes
                ? `
            <div class="stat-row">
              <div class="stat-left">
                <svg class="icon" viewBox="0 0 24 24" fill="#220101"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                <span class="followers">${formatFollowers(talent.stats.ytAbonnes)}</span>
                ${
                  talent.stats.ytAbonnesEvol
                    ? `<span class="evolution">▲ ${talent.stats.ytAbonnesEvol.toFixed(2).replace(".", ",")}%</span>`
                    : ""
                }
              </div>
              <div class="stat-right"></div>
            </div>
            `
                : ""
            }
          </div>
          
          <!-- Présentation -->
          ${
            talent.presentation
              ? `
          <div class="presentation-section">
            <p class="presentation-label">${t.about}</p>
            <p class="presentation">${talent.presentation}</p>
          </div>
          `
              : ""
          }
          
          <!-- Logo bas de page -->
          <div class="talent-footer">
            <svg class="logo-small" viewBox="0 0 478 80" fill="#B06F70">
              <path d="M58.1427 49.2504L58.3576 71.3492C37.4442 81.0362 14.7263 69.0428 13.6522 39.6706C12.4814 9.08627 46.7247 -4.15158 72.0098 31.2816L72.332 31.1851L68.7015 13.2164C40.7525 -1.42677 0 9.56901 0 44.7019C0 81.8515 49.5067 92.6542 72.9765 62.6706V38.2439H52.7936C55.0385 41.269 58.1535 45.5172 58.1535 49.2504H58.1427Z"/>
              <path d="M97.8426 74.7713V8.05642H83.0089V78.719H138.692L138.832 65.0843C130.69 71.553 114.578 74.7713 102.418 74.7713H97.8319H97.8426Z"/>
              <path d="M204.397 15.3297C187.866 2.30643 163.966 4.82741 150.518 20.3824C137.392 36.2378 139.745 58.9481 156.168 71.9714C172.699 84.2867 196.921 81.9695 210.465 66.3179C223.376 50.6664 220.605 27.7523 204.386 15.3405L204.397 15.3297ZM198.747 58.9374C185.836 73.9774 172.194 80.3389 158.531 69.5362C148.499 61.5656 148.499 44.2084 161.302 29.3614C173.891 14.4179 190.948 9.27936 202.259 17.5611C215.385 27.2481 211.228 44.1011 198.747 58.9481V58.9374Z"/>
              <path d="M403.637 8.46407V45.4099C403.637 82.9672 355.742 88.213 355.742 45.9141V8.05642H340.596V46.9225C340.596 90.8412 407.171 91.5492 407.171 45.8175V8.05642H403.648V8.46407H403.637Z"/>
              <path d="M446.925 8.05642H416.301V78.719H431.135V50.1515L446.925 50.0549C464.745 49.9584 477.333 41.3763 477.333 28.5461C477.333 16.6385 464.745 8.05642 446.925 8.05642ZM440.093 46.4075H431.135V10.792H440.093C454.82 10.792 461.533 15.8232 461.533 27.3339C461.533 40.2606 454.809 46.4075 440.093 46.4075Z"/>
              <path d="M325.451 0.0107276L317.395 8.05642L320.102 10.7598C324.678 15.5657 322.895 20.9832 319.522 27.6343L302.239 62.0591L278.984 18.1511L273.861 8.65716L273.538 8.05642H257.212L257.319 8.26024L262.12 16.9389L272.894 37.4286L260.52 61.9625L236.416 17.9473L231.078 8.56062L230.756 8.05642H214.536L214.859 8.56062L220.294 18.2476L255.181 79.9313H255.396L275.235 40.8614L296.783 79.9313H296.997L333.486 8.24952L333.593 8.04569H333.496L325.44 0L325.451 0.0107276Z"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  `
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,400;1,300;1,400;1,500&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Spectral', Georgia, serif;
      background: #F5EDE0;
      color: #220101;
    }
    
    .page {
      width: 210mm;
      height: 297mm;
      padding: 0;
      background: #F5EDE0;
      page-break-after: always;
      position: relative;
      overflow: hidden;
    }
    
    /* Cover Page */
    .cover-page {
      background: #220101;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    
    .cover-logo {
      width: 280px;
      height: auto;
      margin-bottom: 40px;
    }
    
    .cover-title {
      font-size: 42px;
      color: #F5EDE0;
      font-weight: 300;
      margin-bottom: 8px;
      letter-spacing: 0.05em;
    }
    
    .cover-title .italic {
      font-style: italic;
      opacity: 0.8;
    }
    
    .cover-subtitle {
      font-size: 14px;
      color: #F5EDE0;
      opacity: 0.5;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin-bottom: 60px;
    }
    
    .cover-date {
      font-size: 14px;
      color: #B06F70;
      letter-spacing: 0.1em;
    }
    
    .cover-count {
      font-size: 16px;
      color: #F5EDE0;
      opacity: 0.6;
      margin-top: 8px;
    }
    
    /* Talent Page */
    .talent-page {
      display: flex;
      flex-direction: column;
    }
    
    .talent-content {
      display: flex;
      flex: 1;
      padding: 30px;
      gap: 30px;
      align-items: flex-start;
    }
    
    .talent-photo {
      width: 280px;
      height: 280px;
      flex-shrink: 0;
      background: linear-gradient(135deg, #B06F70 0%, #220101 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 16px;
    }
    
    .talent-photo img {
      display: block;
    }
    
    .talent-photo .initials {
      font-size: 80px;
      color: rgba(245, 237, 224, 0.5);
      font-weight: 300;
      letter-spacing: 0.1em;
    }
    
    .talent-info {
      flex: 1;
      padding: 20px 0;
      display: flex;
      flex-direction: column;
    }
    
    .talent-header {
      margin-bottom: 30px;
    }
    
    .talent-name {
      font-size: 34px;
      margin-bottom: 10px;
      line-height: 1.2;
    }
    
    .talent-name .prenom {
      font-style: italic;
      font-weight: 500;
      display: block;
    }
    
    .talent-name .nom {
      font-weight: 300;
      letter-spacing: 0.08em;
    }
    
    .niches {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      font-weight: 600;
      color: #220101;
    }
    
    /* Stats Section - Style identique au talentbook */
    .stats-section {
      margin-bottom: 30px;
    }
    
    .stats-header {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: rgba(34, 1, 1, 0.5);
      padding-bottom: 8px;
      margin-bottom: 0;
      font-family: system-ui, -apple-system, sans-serif;
    }
    
    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
      border-top: 1px solid rgba(34, 1, 1, 0.15);
    }
    
    .stat-left, .stat-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .icon {
      width: 20px;
      height: 20px;
    }
    
    .followers {
      font-size: 20px;
      color: #220101;
      font-family: system-ui, -apple-system, sans-serif;
      font-weight: 400;
    }
    
    .engagement {
      font-size: 20px;
      color: #220101;
      font-family: system-ui, -apple-system, sans-serif;
      font-weight: 400;
    }
    
    .evolution {
      font-size: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      background: #E5F2B5;
      color: #4a5d23;
      padding: 4px 10px;
      border-radius: 4px;
    }
    
    /* Presentation Section */
    .presentation-section {
      flex: 1;
      padding-top: 24px;
      border-top: 1px solid rgba(34, 1, 1, 0.15);
    }
    
    .presentation-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: rgba(34, 1, 1, 0.5);
      margin-bottom: 16px;
      font-family: system-ui, -apple-system, sans-serif;
    }
    
    .presentation {
      font-size: 15px;
      line-height: 1.8;
      color: #220101;
      font-weight: 300;
    }
    
    /* Talent Footer */
    .talent-footer {
      margin-top: auto;
      padding-top: 30px;
      display: flex;
      justify-content: center;
    }
    
    .logo-small {
      width: 100px;
      height: auto;
      opacity: 0.5;
    }
    
    /* Last Page */
    .last-page {
      background: #220101;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    
    .last-page .cover-logo {
      margin-bottom: 30px;
    }
    
    .last-page-tagline {
      font-size: 18px;
      color: #F5EDE0;
      opacity: 0.6;
      font-style: italic;
      letter-spacing: 0.1em;
    }
    
    .last-page-contact {
      margin-top: 60px;
    }
    
    .last-page-email {
      font-size: 20px;
      color: #B06F70;
      letter-spacing: 0.05em;
    }
    
    .last-page-address {
      font-size: 14px;
      color: #F5EDE0;
      opacity: 0.5;
      margin-top: 16px;
      line-height: 1.6;
    }
    
    @media print {
      .page {
        page-break-after: always;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <!-- Cover Page -->
  <div class="page cover-page">
    <svg class="cover-logo" viewBox="0 0 478 80" fill="#B06F70">
      <path d="M58.1427 49.2504L58.3576 71.3492C37.4442 81.0362 14.7263 69.0428 13.6522 39.6706C12.4814 9.08627 46.7247 -4.15158 72.0098 31.2816L72.332 31.1851L68.7015 13.2164C40.7525 -1.42677 0 9.56901 0 44.7019C0 81.8515 49.5067 92.6542 72.9765 62.6706V38.2439H52.7936C55.0385 41.269 58.1535 45.5172 58.1535 49.2504H58.1427Z"/>
      <path d="M97.8426 74.7713V8.05642H83.0089V78.719H138.692L138.832 65.0843C130.69 71.553 114.578 74.7713 102.418 74.7713H97.8319H97.8426Z"/>
      <path d="M204.397 15.3297C187.866 2.30643 163.966 4.82741 150.518 20.3824C137.392 36.2378 139.745 58.9481 156.168 71.9714C172.699 84.2867 196.921 81.9695 210.465 66.3179C223.376 50.6664 220.605 27.7523 204.386 15.3405L204.397 15.3297ZM198.747 58.9374C185.836 73.9774 172.194 80.3389 158.531 69.5362C148.499 61.5656 148.499 44.2084 161.302 29.3614C173.891 14.4179 190.948 9.27936 202.259 17.5611C215.385 27.2481 211.228 44.1011 198.747 58.9481V58.9374Z"/>
      <path d="M403.637 8.46407V45.4099C403.637 82.9672 355.742 88.213 355.742 45.9141V8.05642H340.596V46.9225C340.596 90.8412 407.171 91.5492 407.171 45.8175V8.05642H403.648V8.46407H403.637Z"/>
      <path d="M446.925 8.05642H416.301V78.719H431.135V50.1515L446.925 50.0549C464.745 49.9584 477.333 41.3763 477.333 28.5461C477.333 16.6385 464.745 8.05642 446.925 8.05642ZM440.093 46.4075H431.135V10.792H440.093C454.82 10.792 461.533 15.8232 461.533 27.3339C461.533 40.2606 454.809 46.4075 440.093 46.4075Z"/>
      <path d="M325.451 0.0107276L317.395 8.05642L320.102 10.7598C324.678 15.5657 322.895 20.9832 319.522 27.6343L302.239 62.0591L278.984 18.1511L273.861 8.65716L273.538 8.05642H257.212L257.319 8.26024L262.12 16.9389L272.894 37.4286L260.52 61.9625L236.416 17.9473L231.078 8.56062L230.756 8.05642H214.536L214.859 8.56062L220.294 18.2476L255.181 79.9313H255.396L275.235 40.8614L296.783 79.9313H296.997L333.486 8.24952L333.593 8.04569H333.496L325.44 0L325.451 0.0107276Z"/>
    </svg>
    
    <h1 class="cover-title">
      <span class="italic">${t.selectionTalents}</span> ${t.talents}
    </h1>
    <p class="cover-subtitle">${t.tagline}</p>
    
    <p class="cover-date">${today}</p>
    <p class="cover-count">${talents.length} talent${talents.length > 1 ? "s" : ""}</p>
  </div>

  ${talentPages}

  <!-- Last Page -->
  <div class="page last-page">
    <svg class="cover-logo" viewBox="0 0 478 80" fill="#B06F70">
      <path d="M58.1427 49.2504L58.3576 71.3492C37.4442 81.0362 14.7263 69.0428 13.6522 39.6706C12.4814 9.08627 46.7247 -4.15158 72.0098 31.2816L72.332 31.1851L68.7015 13.2164C40.7525 -1.42677 0 9.56901 0 44.7019C0 81.8515 49.5067 92.6542 72.9765 62.6706V38.2439H52.7936C55.0385 41.269 58.1535 45.5172 58.1535 49.2504H58.1427Z"/>
      <path d="M97.8426 74.7713V8.05642H83.0089V78.719H138.692L138.832 65.0843C130.69 71.553 114.578 74.7713 102.418 74.7713H97.8319H97.8426Z"/>
      <path d="M204.397 15.3297C187.866 2.30643 163.966 4.82741 150.518 20.3824C137.392 36.2378 139.745 58.9481 156.168 71.9714C172.699 84.2867 196.921 81.9695 210.465 66.3179C223.376 50.6664 220.605 27.7523 204.386 15.3405L204.397 15.3297ZM198.747 58.9374C185.836 73.9774 172.194 80.3389 158.531 69.5362C148.499 61.5656 148.499 44.2084 161.302 29.3614C173.891 14.4179 190.948 9.27936 202.259 17.5611C215.385 27.2481 211.228 44.1011 198.747 58.9481V58.9374Z"/>
      <path d="M403.637 8.46407V45.4099C403.637 82.9672 355.742 88.213 355.742 45.9141V8.05642H340.596V46.9225C340.596 90.8412 407.171 91.5492 407.171 45.8175V8.05642H403.648V8.46407H403.637Z"/>
      <path d="M446.925 8.05642H416.301V78.719H431.135V50.1515L446.925 50.0549C464.745 49.9584 477.333 41.3763 477.333 28.5461C477.333 16.6385 464.745 8.05642 446.925 8.05642ZM440.093 46.4075H431.135V10.792H440.093C454.82 10.792 461.533 15.8232 461.533 27.3339C461.533 40.2606 454.809 46.4075 440.093 46.4075Z"/>
      <path d="M325.451 0.0107276L317.395 8.05642L320.102 10.7598C324.678 15.5657 322.895 20.9832 319.522 27.6343L302.239 62.0591L278.984 18.1511L273.861 8.65716L273.538 8.05642H257.212L257.319 8.26024L262.12 16.9389L272.894 37.4286L260.52 61.9625L236.416 17.9473L231.078 8.56062L230.756 8.05642H214.536L214.859 8.56062L220.294 18.2476L255.181 79.9313H255.396L275.235 40.8614L296.783 79.9313H296.997L333.486 8.24952L333.593 8.04569H333.496L325.44 0L325.451 0.0107276Z"/>
    </svg>
    
    <p class="last-page-tagline">THE RISE OF IDEAS</p>
    
    <div class="last-page-contact">
      <p class="last-page-email">contact@glowupagence.fr</p>
      <p class="last-page-address">
        1330 Avenue Guilibert de la Lauziere<br>
        13290 Aix-en-Provence
      </p>
    </div>
  </div>
</body>
</html>
  `;
}