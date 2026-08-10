"use client";

import { useState, type ReactNode } from "react";
import {
  BookOpen,
  CircleAlert,
  Layers,
  Scale,
  Sparkles,
} from "lucide-react";

import { CessionsConfidentialNote } from "./CessionsConfidentialNote";

type SectionId =
  | "modes"
  | "ampli"
  | "ooh"
  | "influence"
  | "ugc-prod"
  | "ugc-droits"
  | "pieges"
  | "checklist";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "modes", label: "Influence vs UGC" },
  { id: "ampli", label: "Paid / Whitelist / Spark" },
  { id: "ooh", label: "OOH / DOOH" },
  { id: "influence", label: "Droits Influence" },
  { id: "ugc-prod", label: "Production UGC" },
  { id: "ugc-droits", label: "Droits UGC" },
  { id: "pieges", label: "Pièges fréquents" },
  { id: "checklist", label: "Checklist nego" },
];

function DroitCard({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-gray-100 bg-white px-4 py-4 sm:px-5 sm:py-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-glowup-licorice">{title}</h4>
        {badge ? (
          <span className="rounded-md bg-glowup-lace px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-glowup-licorice">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="space-y-2.5 text-sm leading-relaxed text-gray-600">
        {children}
      </div>
    </article>
  );
}

function SectionIntro({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-4 rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-glowup-licorice">{title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-600">
        {children}
      </div>
    </div>
  );
}

export function CessionsGuidePanel() {
  const [section, setSection] = useState<SectionId>("modes");

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-glowup-licorice/10 bg-gradient-to-br from-glowup-licorice via-[#2a1212] to-[#1a0a0a] p-6 text-white sm:p-8">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/10 p-2.5">
            <BookOpen className="h-5 w-5 text-glowup-rose-light" />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-red-300">
              Confidentiel · Onglet explicatif
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">
              Comprendre les droits &amp; les différences
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
              Cet onglet est là pour vous aider à choisir le bon mode, le bon
              usage, et à défendre un chiffrage cohérent Glow Up. Ce n&apos;est
              pas un devis magique : c&apos;est un cadre commun pour l&apos;équipe.
            </p>
            <div className="mt-4">
              <CessionsConfidentialNote />
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              section === s.id
                ? "bg-glowup-licorice text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:border-glowup-rose/40 hover:text-glowup-licorice"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "modes" && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-glowup-rose" />
              <h3 className="text-sm font-semibold text-glowup-licorice">
                Mode Influence
              </h3>
            </div>
            <div className="space-y-2.5 text-sm leading-relaxed text-gray-600">
              <p>
                En Influence, le talent publie le contenu sur son propre compte.
                La marque achète donc d&apos;abord un cachet de publication, puis
                des droits d&apos;exploitation si elle veut réutiliser ce contenu
                ailleurs (repost, site, paid, affichage, etc.).
              </p>
              <p>
                Le simulateur Influence affiche uniquement la{" "}
                <strong>cession HT</strong>, hors cachet organique. La plupart
                des droits se calculent en pourcentage du cachet, modulé par la
                durée et le territoire. Le paid et le whitelisting, eux, se
                calculent surtout à partir du budget ads (30 %), avec un plancher
                lié au cachet.
              </p>
              <p>
                Territoires Influence : France ×1 · FR+ ×1,15 · Europe ×1,40 ·
                Monde ×1,80.
              </p>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4 text-glowup-rose" />
              <h3 className="text-sm font-semibold text-glowup-licorice">
                Mode UGC pur
              </h3>
            </div>
            <div className="space-y-2.5 text-sm leading-relaxed text-gray-600">
              <p>
                En UGC, le créateur produit et livre un asset à la marque. Il
                n&apos;y a pas de publication sur son compte. On facture donc la
                production, puis les droits d&apos;exploitation de cet asset, plus
                d&apos;éventuelles options (hooks, CTA, rushes, urgence…).
              </p>
              <p>
                La production n&apos;est plus un forfait générique auquel on
                ajoute un coefficient de notoriété. Elle est déterminée par
                l&apos;audience du talent, puis multipliée par le format choisi.
                Les droits UGC ont leur propre catalogue, distinct de la grille
                Influence.
              </p>
              <p>
                Territoires UGC : France ×1 · FR+ ×1,10 · Europe ×1,20 · Monde
                ×1,30.
              </p>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-amber-200/80 bg-amber-50/60 p-5 sm:col-span-2">
            <div className="flex gap-2">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div className="space-y-2 text-sm leading-relaxed text-amber-950">
                <p className="font-semibold">Règle d&apos;or</p>
                <p>
                  Ne jamais mélanger les grilles. Un droit Influence n&apos;a
                  pas le même prix qu&apos;un droit UGC, même si le libellé se
                  ressemble. Si le talent publie sur son compte et livre aussi un
                  asset, chaque partie doit être chiffrée avec la bonne logique,
                  ou validée en direction.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {section === "ampli" && (
        <section className="space-y-4">
          <SectionIntro title="Paid, Whitelisting et Spark Ads">
            <p>
              Ces trois notions sont souvent confondues en négociation. La
              question qui tranche presque toujours est simple : depuis quel
              compte la publicité est-elle réellement diffusée ? Le compte de
              la marque, le compte Instagram/Facebook du talent, ou le compte /
              post TikTok du talent ?
            </p>
          </SectionIntro>

          <div className="space-y-3">
            <DroitCard title="Paid media — compte marque" badge="Amplification">
              <p>
                Le paid marque correspond aux publicités diffusées depuis le
                compte ads de la marque (Meta Ads Manager, TikTok Ads, Google,
                etc.), en utilisant le contenu du talent ou un asset UGC. Le
                talent n&apos;ouvre pas son compte à la marque : il cède
                uniquement le droit d&apos;exploiter le contenu en media payant
                sur les espaces publicitaires de la marque.
              </p>
              <p>
                C&apos;est souvent moins « social proof » qu&apos;un boost natif
                depuis le compte créateur, mais c&apos;est plus simple
                opérationnellement. En Influence, on prend 30 % du budget ads
                max contractuel, avec un plancher égal à cachet × 20 % ×
                multiplicateur de durée. En UGC, on prend le maximum entre un
                pourcentage de la production valorisée et 5 % du budget ads.
              </p>
            </DroitCard>

            <DroitCard
              title="Whitelisting — Meta / Instagram"
              badge="Compte talent"
            >
              <p>
                Le whitelisting (Partnership Ads / Branded Content) permet à la
                marque de diffuser des publicités depuis le compte Instagram ou
                Facebook du talent. L&apos;identité visible reste celle du
                créateur, ce qui renforce la confiance et la performance
                perçue. En contrepartie, le talent ouvre un accès réel à son
                compte pour la durée et le budget négociés.
              </p>
              <p>
                C&apos;est pourquoi le plancher Influence est plus haut que
                pour le paid marque : cachet × 40 % × durée, toujours contre un
                plafond de 30 % du budget ads. En UGC, le calcul part de la
                production, compare avec 8 % du budget, et peut encore appliquer
                un floor Influence si un vrai cachet talent existe et que la
                pub part bien du compte créateur.
              </p>
            </DroitCard>

            <DroitCard title="Spark Ads — TikTok" badge="Équivalent TikTok">
              <p>
                Les Spark Ads sont l&apos;équivalent TikTok du whitelisting
                Meta. La marque obtient l&apos;autorisation de booster ou de
                diffuser une publicité à partir du compte ou d&apos;un post du
                créateur sur TikTok. Le contenu apparaît comme natif dans
                l&apos;écosystème TikTok, avec l&apos;identité du talent.
              </p>
              <p>
                Dans le simulateur Glow Up, Spark Ads et Whitelisting partagent
                la même ligne tarifaire, car commercialement ils appartiennent à
                la même famille : amplification depuis le compte créateur. La
                distinction plateforme (Instagram vs TikTok) doit toutefois être
                claire dans le brief, le contrat et le budget ads max.
              </p>
            </DroitCard>
          </div>

          <div className="rounded-[1.5rem] border border-amber-200/80 bg-amber-50/60 p-5 text-sm leading-relaxed text-amber-950">
            <p className="font-semibold">Comment trancher en nego</p>
            <p className="mt-2">
              Si la marque booste uniquement depuis ses propres comptes ads,
              c&apos;est du paid marque. Si elle veut diffuser depuis le compte
              Instagram du talent, c&apos;est du whitelisting. Si elle veut
              booster un contenu TikTok via Spark Ads, c&apos;est la même
              famille que le whitelist, sur TikTok. Si Meta et TikTok sont tous
              les deux prévus, il faut soit deux lignes avec deux budgets, soit
              un budget global explicitement contractuel — jamais un flou.
            </p>
          </div>
        </section>
      )}

      {section === "ooh" && (
        <section className="space-y-4">
          <SectionIntro title="OOH / DOOH — affichage extérieur">
            <p>
              L&apos;affichage extérieur est l&apos;un des droits les plus
              exposants : l&apos;image du talent sort du feed pour aller dans
              l&apos;espace public. Avant de chiffrer, il faut distinguer le
              support (OOH vs DOOH), l&apos;ampleur géographique
              (agglomérations), les zones spéciales (Paris, transport) et le
              budget média d&apos;affichage.
            </p>
          </SectionIntro>

          <div className="space-y-3">
            <DroitCard title="OOH — Out-of-Home classique" badge="Affichage physique">
              <p>
                L&apos;OOH (Out-of-Home) désigne l&apos;affichage publicitaire
                physique hors domicile : panneaux 4×3, abribus, mobilier urbain,
                grands formats muraux, parfois du print grand format en rue. Le
                support est fixe ou semi-fixe, visible par le flux piéton /
                automobiliste pendant toute la durée de la campagne.
              </p>
              <p>
                Ce n&apos;est pas un repost, ni du paid social. C&apos;est une
                présence dans l&apos;espace urbain, souvent sur plusieurs villes,
                avec un coût média propre (budget OOH) distinct du cachet
                talent.
              </p>
            </DroitCard>

            <DroitCard title="DOOH — Digital Out-of-Home" badge="Écrans digitaux">
              <p>
                Le DOOH est la version digitale de l&apos;affichage extérieur :
                écrans dynamiques en rue, centres commerciaux, gares, aéroports,
                métro digital, etc. Le contenu peut tourner en boucle, être
                programmé par vagues, voire ciblé selon le lieu et le créneau
                horaire.
              </p>
              <p>
                Pour Glow Up, OOH et DOOH partagent la même famille de droit
                « affichage extérieur » dans le simulateur Influence, car
                l&apos;enjeu image est le même : exposition publique large. En
                nego, précisez toutefois le type de faces (statique vs écrans),
                le nombre d&apos;écrans et le nombre de vagues — cela change le
                plan media et la discussion direction.
              </p>
            </DroitCard>

            <DroitCard title="Qu’est-ce qu’une agglomération ?" badge="Géographie">
              <p>
                Une agglomération est une zone urbaine de diffusion cohérente
                (ex. Lyon et sa métropole, Bordeaux, Lille…). Ce n&apos;est pas
                « un panneau », ni forcément « une ville administrative » au
                sens strict : c&apos;est le nombre de bassins de diffusion
                distincts dans lesquels l&apos;image du talent est affichée.
              </p>
              <p>
                Plus il y a d&apos;agglomérations, plus l&apos;exposition et le
                coefficient montent. Une campagne « Paris seulement » n&apos;est
                pas la même chose qu&apos;une campagne « 8 métropoles » ou
                « nationale ».
              </p>
            </DroitCard>

            <DroitCard title="Grille des agglomérations (Influence)" badge="Coefficients">
              <p>
                En mode Influence, le coefficient géographique dépend du nombre
                d&apos;agglomérations :
              </p>
              <p>
                1 agglomération → ×1 · 2 agglomérations → ×1,6 · 3 à 5 → ×2,2 ·
                6 à 10 → ×3. Au-delà de 10 agglomérations, ou pour un dispositif
                national large, le simulateur bascule en{" "}
                <strong>SUR_DEVIS</strong> : trop d&apos;exposition pour un
                tarif automatique.
              </p>
            </DroitCard>

            <DroitCard title="Zones spéciales : Paris & transport" badge="Exceptions">
              <p>
                Paris n&apos;est pas traité comme une agglo banale. Paris
                intramuros applique un plancher de ×1,25 sur le coefficient
                zones. L&apos;agglomération parisienne étendue applique un
                plancher de ×1,5. Autrement dit : même avec « 1 zone », Paris
                remonte le coefficient si le barème standard serait trop bas.
              </p>
              <p>
                Métro, gares et aéroports sont toujours en SUR_DEVIS. Ces
                environnements transport cumulent densité de passages,
                captive audience et complexité média : aucun montant
                automatique n&apos;est produit.
              </p>
            </DroitCard>

            <DroitCard title="Durée d’affichage & densité" badge="Temps × intensité">
              <p>
                La durée OOH n&apos;est pas exactement la même grille que les
                droits digitaux. On parle en vagues / semaines / mois
                d&apos;affichage (vague courte, 1 mois, 3 mois / 2 vagues, 6
                mois, 12 mois…). Plus la présence est longue, plus le
                multiplicateur de durée monte.
              </p>
              <p>
                La case « densité » majore encore le calcul (+15 %) lorsqu&apos;il
                s&apos;agit d&apos;un dispositif dense (forte répétition de
                faces, saturation locale). C&apos;est un levier de realism :
                10 faces dispersées ≠ 10 faces concentrées sur un axe ultra
                fréquenté.
              </p>
            </DroitCard>

            <DroitCard title="Formule Influence" badge="max(cachet, budget)">
              <p>
                Le montant OOH Influence est :
              </p>
              <p className="rounded-lg bg-glowup-lace/60 px-3 py-2 font-mono text-xs text-glowup-licorice">
                max( cachet × 75 % × coeff agglomérations × durée × densité ,
                budget OOH × 2 % )
              </p>
              <p>
                Autrement dit : on part d&apos;une base cachet (75 %), on
                multiplie par l&apos;ampleur géographique et la durée
                d&apos;affichage, puis on compare à un plancher de 2 % du budget
                média OOH. On garde le plus haut des deux. Sans budget OOH
                renseigné, le plancher budget ne joue pas — mais le budget reste
                indispensable pour défendre le prix face à une grosse campagne.
              </p>
            </DroitCard>

            <DroitCard title="Ce qu’il faut demander en nego" badge="Brief">
              <p>
                Avant de chiffrer, collectez au minimum : OOH ou DOOH (ou les
                deux), nombre d&apos;agglomérations, inclusion de Paris ou non,
                présence transport (métro / gare / aéroport), durée / nombre de
                vagues, estimation du nombre de faces ou d&apos;écrans, budget
                média OOH, et territoire contractuel.
              </p>
              <p>
                Si le dispositif est national, transport, ou très atypique :
                annoncez clairement SUR_DEVIS et remontez en direction. Ne
                jamais inventer un prix « pour faire plaisir ».
              </p>
            </DroitCard>

            <DroitCard title="OOH / DOOH en mode UGC" badge="Toujours SUR_DEVIS">
              <p>
                En UGC, l&apos;affichage extérieur est toujours traité en
                SUR_DEVIS. On ne produit aucun tarif automatique définitif. Le
                simulateur demande agglomérations, faces/écrans, durée, vagues,
                transports, budget OOH et territoire, et affiche seulement un
                minimum indicatif interne (1 500 €) pour cadrer la discussion —
                jamais comme prix client.
              </p>
              <p>
                Logique : un asset UGC en affichage public n&apos;a pas le même
                référentiel qu&apos;un cachet Influence, et les plans media OOH
                sont trop variables pour une formule unique.
              </p>
            </DroitCard>
          </div>
        </section>
      )}

      {section === "influence" && (
        <section className="space-y-4">
          <SectionIntro title="Catalogue des droits Influence">
            <p>
              En Influence, chaque droit décrit un usage précis du contenu publié
              par le talent. Sauf paid, whitelist, OOH et buyout, la base est un
              pourcentage du cachet (référence 3 mois France), ensuite modulé par
              la durée et le territoire.
            </p>
            <p>
              Ne cochez que ce qui est réellement négocié. Un droit non demandé
              n&apos;a pas à apparaître dans le chiffrage.
            </p>
          </SectionIntro>

          <div className="space-y-3">
            <DroitCard title="Repost organique" badge="~12 % cachet">
              <p>
                Le repost organique autorise la marque à republier le contenu sur
                ses propres réseaux sociaux, sans media payant. C&apos;est le
                droit image « classique » : la marque prolonge la vie du contenu
                sur ses comptes Instagram, TikTok, LinkedIn, etc., dans le cadre
                d&apos;une diffusion organique.
              </p>
              <p>
                Ce n&apos;est ni du paid, ni du whitelisting. Si la marque
                souhaite ensuite booster ce contenu avec un budget ads, il faut
                ajouter une ligne paid ou whitelist séparée.
              </p>
            </DroitCard>

            <DroitCard title="Site web / landing" badge="~15 % cachet">
              <p>
                Ce droit couvre l&apos;exploitation du contenu sur le site
                corporate, une landing page campagne, un blog ou une page
                dédiée. Il s&apos;agit d&apos;une présence digitale durable sur
                les propriétés web de la marque, distincte des réseaux sociaux.
              </p>
              <p>
                Plus la durée est longue et le territoire large, plus le
                pourcentage final monte. Ce n&apos;est pas un droit e-commerce
                PDP : la fiche produit a sa propre ligne.
              </p>
            </DroitCard>

            <DroitCard title="Newsletter — envoi unique" badge="8 % cachet">
              <p>
                Ce droit autorise un seul envoi newsletter utilisant le contenu
                ou l&apos;image du talent. Il convient aux campagnes one-shot :
                une annonce, un lancement, un email événementiel.
              </p>
              <p>
                Dès qu&apos;il y a plusieurs envois sur la période, il faut
                basculer sur l&apos;emailing multienvois. Une base internationale
                ou très volumineuse sort de cette ligne et passe en SUR_DEVIS.
              </p>
            </DroitCard>

            <DroitCard
              title="Emailing / CRM multienvois"
              badge="12 % cachet"
            >
              <p>
                Ici, la marque peut envoyer plusieurs emails pendant la durée
                négociée (par exemple plusieurs newsletters sur trois mois).
                L&apos;intensité d&apos;exploitation est plus forte qu&apos;un
                envoi unique, donc le coefficient est plus élevé.
              </p>
              <p>
                Ce n&apos;est pas encore du CRM automatisé : on parle
                d&apos;envois pilotés, pas d&apos;un scénario de triggers
                permanents.
              </p>
            </DroitCard>

            <DroitCard title="CRM automatisé / relances" badge="15 % cachet">
              <p>
                Le CRM automatisé couvre les scénarios de relances, tunnels et
                messages déclenchés automatiquement (abandon panier, nurturing,
                onboarding…). Le contenu ou l&apos;image du talent peut donc
                apparaître de façon répétée dans des parcours automatisés.
              </p>
              <p>
                C&apos;est plus invasif qu&apos;une newsletter éditoriale : le
                coefficient reflète cette intensité. Une exploitation
                internationale ou hors période reste SUR_DEVIS.
              </p>
            </DroitCard>

            <DroitCard
              title="Emailing — base internationale / très importante"
              badge="SUR_DEVIS"
            >
              <p>
                Dès que la base est internationale, très large, ou que
                l&apos;exploitation email dépasse le cadre standard, on ne
                produit plus de tarif automatique. Le risque d&apos;exposition
                et le volume rendent le chiffrage trop sensible pour une
                formule fixe.
              </p>
              <p>
                Dans le simulateur, cette ligne bloque la copie tant qu&apos;un
                montant n&apos;a pas été validé en direction. Ne jamais
                l&apos;afficher comme 0 €.
              </p>
            </DroitCard>

            <DroitCard title="E-commerce / PDP" badge="~18 % cachet">
              <p>
                Ce droit concerne les fiches produit, carrousels PDP et
                marketplaces. Le contenu sert directement à la conversion : il
                vit près du prix, du panier et de l&apos;acte d&apos;achat.
              </p>
              <p>
                C&apos;est plus valorisé qu&apos;un simple site vitrine, car
                l&apos;image du talent accompagne la décision d&apos;achat sur
                la durée négociée.
              </p>
            </DroitCard>

            <DroitCard title="Paid media — compte marque" badge="30 % budget">
              <p>
                Voir aussi l&apos;onglet Paid / Whitelist / Spark. En résumé : la
                marque diffuse depuis son propre compte ads. Le simulateur
                compare 30 % du budget ads max avec un plancher cachet × 20 % ×
                durée, et retient le maximum.
              </p>
              <p>
                Sans budget contractuel clair, le chiffrage n&apos;est pas
                défendable : il faut soit saisir le budget, soit basculer en
                minimum garanti / estimation provisoire.
              </p>
            </DroitCard>

            <DroitCard
              title="Whitelisting / Spark Ads"
              badge="30 % budget · plancher haut"
            >
              <p>
                Même famille d&apos;amplification, mais depuis le compte talent
                (Instagram/Facebook) ou via Spark Ads (TikTok). Le plafond reste
                30 % du budget ads, mais le plancher Influence est plus élevé
                (cachet × 40 % × durée), car l&apos;identité du talent est
                engagée.
              </p>
              <p>
                C&apos;est le droit à mobiliser dès que la marque veut « parler
                avec la voix » du créateur en paid, pas seulement réutiliser son
                contenu sur ses propres espaces ads.
              </p>
            </DroitCard>

            <DroitCard title="Print / catalogue" badge="~40 % cachet + plancher">
              <p>
                Le print couvre catalogues, encarts, brochures et supports
                papier. L&apos;image du talent est figée dans un support durable,
                souvent difficile à retirer une fois imprimé, ce qui justifie un
                coefficient élevé et des planchers absolus selon l&apos;ampleur
                (notamment national / longue durée).
              </p>
              <p>
                Toujours préciser le type de support, la durée de circulation et
                le territoire de diffusion.
              </p>
            </DroitCard>

            <DroitCard title="Point de vente / PLV" badge="~40 % cachet + plancher">
              <p>
                La PLV concerne corners, kakémonos, écrans magasin et tout
                dispositif en point de vente. Le talent devient visible dans un
                contexte retail, parfois sur un réseau national, avec une
                exposition forte auprès des clients en magasin.
              </p>
              <p>
                Comme le print, la durée et l&apos;ampleur du réseau (nombre de
                magasins, enseignes) font monter le prix, avec des planchers
                absolus sur les campagnes nationales longues.
              </p>
            </DroitCard>

            <DroitCard title="OOH / DOOH" badge="Agglomérations + budget">
              <p>
                Affichage extérieur physique (OOH) ou digital (DOOH : écrans
                rue, gare, centre commercial…). Le prix Influence dépend du
                nombre d&apos;agglomérations, de la durée d&apos;affichage, de
                la densité, d&apos;éventuelles exceptions Paris, et d&apos;un
                plancher à 2 % du budget OOH.
              </p>
              <p>
                Métro / gares / aéroports et campagnes &gt; 10 agglomérations
                sont en SUR_DEVIS. Voir l&apos;onglet dédié{" "}
                <strong>OOH / DOOH</strong> pour le détail pédagogique
                (différences, grille, formule).
              </p>
            </DroitCard>

            <DroitCard title="TV / cinéma / broadcast" badge="SUR_DEVIS / élevé">
              <p>
                La diffusion TV, replay, BVOD ou cinéma est l&apos;un des usages
                les plus exposants. Même quand une estimation existe, les
                paramètres (chaînes, vagues, territoire, montage, budget)
                rendent le tarif très sensible.
              </p>
              <p>
                En pratique, beaucoup de cas restent soumis à validation
                direction. Ne jamais promettre un prix définitif sans cadrage
                précis du plan media.
              </p>
            </DroitCard>

            <DroitCard title="Press kit / RP" badge="~10 % cachet">
              <p>
                Ce droit couvre un usage strictement éditorial dans un press kit
                ou une action RP. Il ne remplace pas une campagne publicitaire :
                dès que le contenu est utilisé en pub print, paid, PLV ou
                affichage, il faut reclasser l&apos;usage dans le support
                correspondant.
              </p>
            </DroitCard>

            <DroitCard title="Usage interne / corporate" badge="~8 % cachet">
              <p>
                L&apos;usage interne autorise une diffusion non publicitaire
                externe : séminaire, recrutement, formation, communication
                interne. L&apos;image du talent reste dans le périmètre
                corporate de la marque.
              </p>
              <p>
                Si le contenu sort ensuite vers le public ou vers de la pub, ce
                n&apos;est plus un usage interne.
              </p>
            </DroitCard>

            <DroitCard
              title="Full buyout — supports"
              badge="Matrice FR / Monde"
            >
              <p>
                Le buyout regroupe les supports expressément couverts pour une
                durée et un territoire donnés, via une matrice France / Monde.
                Il simplifie la nego quand la marque veut une large liberté
                d&apos;exploitation hors media payant illimité.
              </p>
              <p>
                Attention : le buyout ne comprend jamais automatiquement le paid
                illimité, le whitelisting illimité, le packaging, le clonage
                voix/visage, l&apos;avatar ou la création de contenus IA. Tout
                paid reste soumis à un budget ads max contractuel.
              </p>
            </DroitCard>
          </div>
        </section>
      )}

      {section === "ugc-prod" && (
        <section className="space-y-4">
          <SectionIntro title="Production UGC — comment on fixe le tarif">
            <p>
              En UGC, on commence par valoriser la production. On ne part plus
              d&apos;un forfait 500 € auquel on applique ensuite un coefficient
              de notoriété : l&apos;audience est déjà intégrée dans la base
              automatique.
            </p>
            <p>
              Formule : production = base audience × multiplicateur de format.
              Exemple : 550 000 abonnés → base standard 1 200 € ; en premium
              (×1,50) → 1 800 € ; en photo (×0,30) → 360 €.
            </p>
          </SectionIntro>

          <div className="overflow-x-auto rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="py-2 pr-3 font-medium">Audience</th>
                  <th className="py-2 font-medium">Base vidéo standard</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {[
                  ["Moins de 10 000", "500 €"],
                  ["10 000 – 99 999", "600 €"],
                  ["100 000 – 249 999", "750 €"],
                  ["250 000 – 499 999", "900 €"],
                  ["500 000 – 999 999", "1 200 €"],
                  ["1 000 000 et plus", "1 500 €"],
                ].map(([a, b]) => (
                  <tr key={a} className="border-b border-gray-50">
                    <td className="py-2 pr-3">{a}</td>
                    <td className="py-2 font-semibold tabular-nums">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3">
            <DroitCard title="Priorité de tarif production">
              <p>
                Si un prix manuel a été saisi pour la simulation, il prime. Sinon,
                on utilise le ugcBaseRate de la fiche talent lorsqu&apos;il
                existe. À défaut, on applique le barème audience automatique.
                S&apos;il n&apos;y a aucune audience disponible, on retombe sur
                la base générique de 500 € (puis multipliée par le format).
              </p>
              <p>
                Quand un prix manuel ou personnalisé est utilisé, on n&apos;ajoute
                plus de coefficient d&apos;audience par-dessus. Le bouton
                « Revenir au tarif automatique » permet de retrouver le barème.
              </p>
            </DroitCard>
          </div>
        </section>
      )}

      {section === "ugc-droits" && (
        <section className="space-y-4">
          <SectionIntro title="Catalogue des droits UGC">
            <p>
              Les droits UGC portent sur la production valorisée, pas sur un
              cachet Influence. Le catalogue est volontairement distinct : les
              coefficients Influence ne doivent jamais apparaître dans le menu
              UGC.
            </p>
            <p>
              Les usages courants sont visibles immédiatement. Les usages
              avancés (print, PLV, OOH, TV, packaging…) sont regroupés dans une
              section repliable pour ne pas surcharger l&apos;interface.
            </p>
          </SectionIntro>

          <div className="space-y-3">
            <DroitCard
              title="Réseaux sociaux organiques marque"
              badge="+10 % à +60 %"
            >
              <p>
                La marque peut publier l&apos;asset UGC sur ses réseaux sociaux
                organiques pendant la durée choisie. Plus la durée est longue,
                plus le pourcentage de la production augmente (3 mois +10 %, 6
                mois +20 %, 12 mois +35 %, 24 mois +60 %). Au-delà : SUR_DEVIS.
              </p>
            </DroitCard>

            <DroitCard title="Site web / landing" badge="+20 % à +80 %">
              <p>
                Exploitation de l&apos;asset sur site ou landing. Comme
                l&apos;usage est plus « propriétaire » et durable que le simple
                feed social, les coefficients sont plus élevés que pour les RS
                organiques, à durée égale.
              </p>
            </DroitCard>

            <DroitCard
              title="E-commerce / PDP / marketplace"
              badge="+30 % à +110 %"
            >
              <p>
                L&apos;asset sert directement la conversion produit (PDP,
                marketplace). C&apos;est l&apos;un des usages digitaux les plus
                valorisés en UGC, car le contenu travaille près de l&apos;achat
                pendant toute la durée négociée.
              </p>
            </DroitCard>

            <DroitCard title="Newsletter — envoi unique" badge="+10 % · min 100 €">
              <p>
                Un seul envoi email utilisant l&apos;asset. Le simulateur prend
                le maximum entre +10 % de la production et un plancher de 100 €,
                pour éviter les montants trop bas sur les productions légères.
              </p>
            </DroitCard>

            <DroitCard
              title="Emailing — multienvois 3 mois"
              badge="+20 % · min 150 €"
            >
              <p>
                Plusieurs envois pendant trois mois. L&apos;intensité est
                supérieure à l&apos;envoi unique, d&apos;où le +20 % et le
                plancher à 150 €.
              </p>
            </DroitCard>

            <DroitCard title="CRM automatisé — 3 mois" badge="+30 % · min 200 €">
              <p>
                Scénarios CRM automatisés pendant trois mois. L&apos;asset peut
                être répété dans des tunnels et relances, ce qui justifie un
                coefficient et un plancher plus hauts.
              </p>
            </DroitCard>

            <DroitCard
              title="Emailing — base internationale / très importante"
              badge="SUR_DEVIS"
            >
              <p>
                Comme en Influence, une base internationale ou une exploitation
                email hors cadre standard ne produit aucun tarif automatique.
                Montant null, validation direction, jamais 0 € affiché comme
                prix.
              </p>
            </DroitCard>

            <DroitCard
              title="Usage interne / corporate"
              badge="+20 % à +50 % + min"
            >
              <p>
                Diffusion strictement interne, sans publicité externe. Le droit
                reste cadré dans le temps (3 / 6 / 12 mois) avec des minimums
                absolus, car même un usage interne engage l&apos;image du
                créateur.
              </p>
            </DroitCard>

            <DroitCard title="Paid UGC — compte marque" badge="max(prod, 5 % budget)">
              <p>
                La marque diffuse l&apos;asset depuis son compte ads. On compare
                le pourcentage de production lié à la durée (et le territoire)
                avec 5 % du budget ads, puis on retient le maximum. Le floor
                Influence ne s&apos;applique pas ici, car la pub ne part pas du
                compte talent.
              </p>
            </DroitCard>

            <DroitCard
              title="Whitelisting / Spark Ads UGC"
              badge="max(prod, 8 % budget, floor)"
            >
              <p>
                Même logique que le whitelist Influence, mais calculée sur la
                production UGC : pourcentage de durée × territoire, ou 8 % du
                budget ads. Si un véritable influenceur fournit l&apos;accès à
                son compte et dispose d&apos;un cachet Influence, un floor
                supplémentaire s&apos;applique : cachet × 40 % × durée Influence.
              </p>
              <p>
                Ce floor n&apos;existe que pour la diffusion depuis le compte
                réel du talent, jamais pour le paid marque.
              </p>
            </DroitCard>

            <DroitCard title="Print / catalogue" badge="Avancé">
              <p>
                Catalogue, print et supports papier. Coefficients élevés et
                minimums francs (ex. 3 mois : +100 %, min 500 €). À 24 mois, le
                barème bascule en SUR_DEVIS.
              </p>
            </DroitCard>

            <DroitCard title="PLV / point de vente" badge="Avancé">
              <p>
                Dispositifs en magasin. Outre le pourcentage et les minimums, le
                simulateur demande le nombre de points de vente et les enseignes.
                Un réseau national, un volume important ou une durée supérieure
                à 12 mois passe en SUR_DEVIS.
              </p>
            </DroitCard>

            <DroitCard title="Press kit / RP" badge="Éditorial">
              <p>
                Usage éditorial strict. Toute utilisation publicitaire doit être
                reclassée dans le support adéquat (print, paid, PLV…). Les
                coefficients restent modestes, avec des minimums pour sécuriser
                le plancher.
              </p>
            </DroitCard>

            <DroitCard title="Salons / événements / écrans pro" badge="Avancé">
              <p>
                Diffusion sur salons, événements et écrans professionnels. Un
                événement international majeur sort du barème et devient
                SUR_DEVIS.
              </p>
            </DroitCard>

            <DroitCard title="Retail media" badge="Budget obligatoire">
              <p>
                Toujours demander le budget média. Le tarif est le maximum entre
                un pourcentage de la production et 5 % du budget, selon la durée.
                Une exploitation massive reste SUR_DEVIS.
              </p>
            </DroitCard>

            <DroitCard title="OOH / DOOH" badge="SUR_DEVIS">
              <p>
                En UGC, OOH et DOOH sont toujours SUR_DEVIS : aucun tarif
                automatique définitif. On collecte agglomérations, faces/écrans,
                durée, vagues, transports, budget OOH et territoire. Un minimum
                indicatif interne de 1 500 € cadre la discussion interne
                uniquement.
              </p>
              <p>
                Pour comprendre OOH vs DOOH, la notion d&apos;agglomération et
                les exceptions Paris / transport, ouvrez l&apos;onglet{" "}
                <strong>OOH / DOOH</strong>.
              </p>
            </DroitCard>

            <DroitCard title="TV / cinéma / broadcast" badge="SUR_DEVIS">
              <p>
                Toujours SUR_DEVIS. Il faut préciser chaînes/supports, type de
                diffusion, durée, territoire, vagues, budget média et dérivés
                autorisés. Minimum indicatif interne : 2 500 €, sans affichage
                comme tarif définitif.
              </p>
            </DroitCard>

            <DroitCard title="Packaging produit" badge="SUR_DEVIS">
              <p>
                Toujours SUR_DEVIS. On demande les produits, le nombre
                d&apos;unités, les pays, la durée de commercialisation et les
                circuits. Minimum indicatif interne : 2 000 €.
              </p>
            </DroitCard>

            <DroitCard title="Full buyout UGC" badge="Matrice FR / Monde">
              <p>
                Matrice dédiée UGC (ex. 12 mois France +300 %, Monde +400 %).
                Comme en Influence, le buyout ne couvre pas automatiquement paid
                illimité, whitelisting illimité, packaging, clonage, avatar ou
                contenus synthétiques IA.
              </p>
            </DroitCard>
          </div>
        </section>
      )}

      {section === "pieges" && (
        <section className="space-y-3 rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 sm:p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-glowup-licorice">
            <CircleAlert className="h-4 w-4 text-amber-600" />
            Pièges fréquents
          </h3>
          <div className="space-y-3">
            <DroitCard title="Confondre paid marque et whitelisting">
              <p>
                Le paid marque diffuse depuis le compte ads de la marque. Le
                whitelisting / Spark Ads diffuse depuis le compte du talent.
                Même si le pourcentage de budget Influence est identique (30 %),
                le plancher et la signification commerciale ne le sont pas.
              </p>
            </DroitCard>
            <DroitCard title="Afficher 0 € pour un SUR_DEVIS">
              <p>
                Un SUR_DEVIS n&apos;a pas de montant automatique exploitable. La
                copie est bloquée tant qu&apos;un montant n&apos;a pas été
                validé en direction. Afficher 0 € donnerait une fausse
                impression de gratuité.
              </p>
            </DroitCard>
            <DroitCard title="Budget contractuel vide">
              <p>
                Si le mode « budget contractuel » est choisi, le budget ads max
                est obligatoire. Sinon le simulateur affiche une erreur et bloque
                la copie du tarif définitif. Alternative : « Budget inconnu —
                minimum garanti ».
              </p>
            </DroitCard>
            <DroitCard title="Additionner les audiences">
              <p>
                En UGC, on retient une plateforme (Instagram, TikTok, YouTube) ou
                l&apos;audience maximale. On n&apos;additionne jamais les
                abonnés de plusieurs réseaux pour gonfler la base.
              </p>
            </DroitCard>
            <DroitCard title="Croire que le buyout couvre tout">
              <p>
                Le buyout couvre les supports expressément prévus. Il ne remplace
                pas un paid illimité, un whitelisting illimité, un packaging, un
                clonage de voix/visage, un avatar ou la création de contenus IA.
              </p>
            </DroitCard>
          </div>
        </section>
      )}

      {section === "checklist" && (
        <section className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 sm:p-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-glowup-licorice">
            <Scale className="h-4 w-4 text-glowup-rose" />
            Avant d&apos;envoyer un chiffrage marque
          </h3>
          <div className="space-y-3 text-sm leading-relaxed text-gray-700">
            <p>
              Vérifiez d&apos;abord le mode : Influence si le talent publie,
              UGC s&apos;il livre seulement un asset. Sélectionnez le talent,
              contrôlez le cachet ou l&apos;audience, puis ne cochez que les
              usages réellement négociés.
            </p>
            <p>
              Sur chaque ligne, renseignez durée et territoire. Pour le paid et
              le whitelisting, saisissez le budget ads max contractuel. Aucun
              SUR_DEVIS ne doit partir sans validation direction. Le montant
              copié est HT, sans commission Glow Up interne.
            </p>
            <p className="text-xs text-gray-500">
              En cas d&apos;écart vs marché ou vs une nego réelle, remontez le
              talent et le setup exact à la direction.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
