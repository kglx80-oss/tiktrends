import { ImageResponse } from 'next/og';
import { adFonts } from './ad-fonts';
import type { AdTemplate } from '@tiktrends/ai';
import { LAYOUT_CLAIR, layoutFor, shellShowsBadge, type AdLayout } from '@tiktrends/core';

export interface AdRecipe {
  template: AdTemplate;
  width?: number; height?: number;
  sceneUrl: string;
  kicker?: string;
  headline: string; subhead?: string; cta: string;
  badge?: string; quote?: string; author?: string; rating?: number; benefits?: string[];
  stat?: string; statLabel?: string;
  accent: string;            // couleur d'accent / bouton (hex)
  variant?: number;          // micro-variation (alignement) · la variété lourde vient de `layout`
  /**
   * La mise en page · d'où vient vraiment la variété.
   *
   * Sept gabarits rendaient la même composition : photo plein cadre, bandeau
   * noir, texte blanc. Ils ne changeaient que les champs affichés. Absent, on
   * garde l'immersive · une pub composée avant ne doit pas changer d'allure.
   */
  layout?: AdLayout;
  brandName?: string;
  logoUrl?: string | null;
  // Méta (non rendues) · pour décliner (« iterate ») une pub existante.
  productId?: string; personaId?: string; objective?: string;
  /**
   * Ce dont la génération a bénéficié, consigné au moment de générer.
   *
   * Sert à répondre à « est-ce que la mémoire de Jarvis améliore vraiment les
   * résultats » · reconstruire après coup ce qu'elle contenait ce jour-là est
   * impossible, elle aura changé entre-temps.
   */
  memoryUse?: { measured: boolean; market: boolean; hooks: number };
  /** Prompt maison utilisé · c'est ce rattachement qui rend un preset mesurable. */
  presetId?: string | null;
  /**
   * Univers visuel demandé · non rendu, consigné.
   *
   * Il ne l'était pas, et il n'existait donc aucun moyen de montrer ce qu'un
   * univers donne CHEZ CETTE MARQUE · le choix se faisait sur un libellé, et le
   * seul moyen de vérifier était de payer une génération.
   */
  universe?: string | null;
  /**
   * Pourquoi Jarvis a proposé ça · calculé depuis la mémoire, jamais rédigé par
   * le modèle. Une justification produite par le modèle est une affirmation ;
   * calculée depuis les chiffres injectés, c'est un fait.
   */
  rationale?: string[] | null;
}

/**
 * ── La maquette est proportionnelle ──────────────────────────────────────────
 *
 * Elle était écrite en pixels durs calés sur une largeur de 1080 : `fontSize:
 * 74`, `padding: ux(150, 56, 56)`, `top: u(46)`. Rendre la même pub dans un
 * canevas plus petit gardait ces valeurs · une accroche de 74 px sur une image
 * large de 432, c'est-à-dire un titre qui mange la moitié de la pub. C'est la
 * régression qu'on a livrée en voulant faire des vignettes.
 *
 * Tout passe donc par `u()`, qui convertit une valeur de maquette en pixels
 * réels. À 1080 la conversion est l'identité · le rendu actuel ne change pas
 * d'un octet, ce qui a été vérifié gabarit par gabarit avant de livrer.
 *
 * ── Pourquoi une variable de module, et pourquoi c'est sûr ───────────────────
 *
 * Passer l'échelle en argument à travers vingt composants n'apporterait rien
 * qu'un bruit. Elle est donc posée par `element()` juste avant de construire
 * l'arbre, et lue pendant cette construction.
 *
 * **La construction de l'arbre ne contient aucun `await`.** Elle est donc
 * atomique du point de vue de la boucle d'événements : deux rendus concurrents
 * ne peuvent pas s'intercaler. Un test le vérifie · si quelqu'un rend `element`
 * asynchrone un jour, deux pubs rendues en même temps prendraient l'échelle
 * l'une de l'autre, et personne ne comprendrait pourquoi.
 */
/**
 * La version de la MAQUETTE, pas de la recette.
 *
 * ── Le cache empoisonné ──────────────────────────────────────────────────────
 *
 * Les rendus sont rangés dans le bucket et retrouvés par une clé qui ne portait
 * que l'identifiant, le ratio et l'empreinte du TEXTE. Rien n'y disait avec
 * quelle version de la maquette l'image avait été composée.
 *
 * Conséquence : les vignettes produites par la première tentative — celle qui
 * ne redimensionnait pas la maquette — sont restées dans le bucket sous la même
 * clé. La correction proportionnelle n'a jamais pu les remplacer, parce que la
 * route les retrouvait avant de composer quoi que ce soit. Les pubs récentes
 * s'affichaient bien, les anciennes gardaient leur titre géant · d'où
 * l'impression que « c'est toujours cassé ».
 *
 * **Un cache persistant a besoin d'une version du producteur, pas seulement
 * d'une empreinte du contenu.** Sans elle, corriger un rendu ne corrige rien de
 * ce qui a déjà été rendu.
 *
 * Un test relie ce numéro au contenu réel du fichier : le modifier sans
 * l'incrémenter fait échouer la suite.
 */
export const RENDER_VERSION = 5;

const LARGEUR_MAQUETTE = 1080;
let ECHELLE = 1;

/** Une valeur de maquette, en pixels réels. */
function u(v: number): number {
  return ECHELLE === 1 ? v : Math.round(v * ECHELLE);
}

/** Une suite de valeurs de maquette · pour `padding`, `margin` et compagnie. */
function ux(...vals: number[]): string {
  return vals.map((v) => `${u(v)}px`).join(' ');
}

const WHITE = '#ffffff';
const DARK = '#0b0b0f';
const STAR = '#FFC531';

/**
 * Taille de titre qui s'adapte à la longueur (évite les débordements).
 *
 * Les seuils sont en unités de maquette · la conversion se fait à la sortie,
 * comme partout ailleurs. `strokeWidth` des icônes, lui, ne passe PAS par `u`
 * : il est exprimé dans le `viewBox` de 24, donc déjà relatif.
 */
function fitHeadline(text: string, base = 78, min = 46): number {
  const n = (text || '').length;
  if (n <= 16) return u(base);
  if (n <= 24) return u(base - 10);
  if (n <= 34) return u(base - 20);
  if (n <= 46) return u(base - 28);
  return u(min);
}
const shadow = () => `0 ${u(3)}px ${u(22)}px rgba(0,0,0,.55)`;

function Star({ size = 32, color = STAR }: { size?: number; color?: string }) {
  return (
    <svg width={u(size)} height={u(size)} viewBox="0 0 24 24" style={{ display: 'flex' }}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={color} />
    </svg>
  );
}
function Arrow({ size = 30, color = WHITE }: { size?: number; color?: string }) {
  return (
    <svg width={u(size)} height={u(size)} viewBox="0 0 24 24" style={{ display: 'flex' }}>
      <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Check({ size = 22, color = WHITE }: { size?: number; color?: string }) {
  return (
    <svg width={u(size)} height={u(size)} viewBox="0 0 24 24" style={{ display: 'flex' }}>
      <path d="M20 6L9 17l-5-5" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Kicker({ text, accent }: { text: string; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', width: u(34), height: u(5), borderRadius: u(3), background: accent, marginRight: u(14) }} />
      <div style={{ display: 'flex', fontSize: u(26), fontWeight: 700, letterSpacing: u(2), color: accent, textTransform: 'uppercase' }}>{text}</div>
    </div>
  );
}

function Logo({ recipe, onDark = true }: { recipe: AdRecipe; onDark?: boolean }) {
  if (recipe.logoUrl) {
     
    return <img src={recipe.logoUrl} alt="" width={u(128)} height={u(42)} style={{ objectFit: 'contain', display: 'flex' }} />;
  }
  if (recipe.brandName) {
    return <div style={{ display: 'flex', fontSize: u(28), fontWeight: 700, color: onDark ? WHITE : '#15151b', letterSpacing: u(-0.5), textShadow: onDark ? shadow() : 'none' }}>{recipe.brandName}</div>;
  }
  return <div style={{ display: 'flex' }} />;
}

function Cta({ recipe, full = false }: { recipe: AdRecipe; full?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: full ? 'stretch' : 'flex-start', background: recipe.accent, color: WHITE, fontSize: u(34), fontWeight: 700, padding: ux(20, 34), borderRadius: u(16), boxShadow: `0 ${u(14)}px ${u(34)}px rgba(0,0,0,.4)` }}>
      <div style={{ display: 'flex', marginRight: u(12) }}>{recipe.cta}</div>
      <Arrow />
    </div>
  );
}

function Bg({ url }: { url: string }) {
   
  return <img src={url} alt="" width={1080} height={1350} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'flex' }} />;
}
const scrimTop = { position: 'absolute' as const, left: u(0), right: u(0), top: u(0), height: '30%', display: 'flex', backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,.6), rgba(0,0,0,0))' };

/** Panneau bas dégradé (transparent -> sombre) qui accueille le texte : le look « pub finie ». */
function BottomPanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: u(0), right: u(0), bottom: u(0), display: 'flex', flexDirection: 'column', padding: ux(150, 56, 56), backgroundImage: 'linear-gradient(to top, rgba(8,8,11,.96) 55%, rgba(8,8,11,.55) 80%, rgba(8,8,11,0))' }}>
      {children}
    </div>
  );
}

function Frame({ children, fond = DARK }: { children: React.ReactNode; fond?: string }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Sans', background: fond, overflow: 'hidden' }}>
      {children}
    </div>
  );
}

function TopBar({ r, center = false }: { r: AdRecipe; center?: boolean }) {
  return (
    <div style={{ position: 'absolute', top: u(46), left: u(56), right: u(56), display: 'flex', justifyContent: center ? 'center' : 'space-between', alignItems: 'flex-start' }}>
      <Logo recipe={r} />
      {!center && r.badge && shellShowsBadge(r.template) ? <div style={pill(r.accent, r.badge)}>{badgeText(r.badge, 22)}</div> : null}
    </div>
  );
}

/* ------------------------------- Pastilles --------------------------------- */

/** Coupe un badge trop long (le texte long va dans le kicker/headline, pas dans la pastille). */
function badgeText(s: string | undefined, max = 20): string {
  const t = (s || '').trim().replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max).trim() : t;
}

/**
 * Taille de police d'un badge selon sa longueur (évite tout débordement).
 *
 * Comme `fitHeadline` · les seuils sont en unités de maquette, la conversion se
 * fait à la sortie.
 */
function fitBadge(s: string, base = 40): number {
  const n = (s || '').length;
  if (n <= 6) return u(base);
  if (n <= 10) return u(base - 6);
  if (n <= 14) return u(base - 12);
  return u(Math.max(18, base - 18));
}

// Pastille top-bar (AVANT/APRÈS, etc.) · une ligne, jamais de débordement.
function pill(accent: string, text?: string) {
  const t = badgeText(text, 22);
  return { display: 'flex', maxWidth: u(360), whiteSpace: 'nowrap', background: accent, color: WHITE, fontSize: fitBadge(t, 26), fontWeight: 700, padding: ux(9, 18), borderRadius: u(999), letterSpacing: u(0.3) } as const;
}

/** Pastille d'offre saillante · sticker arrondi qui s'adapte au texte (jamais de débordement). */
function OfferBadge({ r }: { r: AdRecipe }) {
  const t = badgeText(r.badge, 22) || 'PROMO';
  return (
    <div style={{ display: 'flex', maxWidth: u(320), alignItems: 'center', justifyContent: 'center', padding: ux(14, 22), borderRadius: u(24), background: r.accent, color: WHITE, boxShadow: `0 ${u(12)}px ${u(30)}px rgba(0,0,0,.4)`, transform: 'rotate(-4deg)' }}>
      <div style={{ display: 'flex', textAlign: 'center', fontSize: fitBadge(t, 42), fontWeight: 800, lineHeight: 1.02, letterSpacing: u(-0.5) }}>{t}</div>
    </div>
  );
}

/* ========================= Coquilles (mises en page) ========================= */

/**
 * ── Ce qui a changé, et pourquoi ─────────────────────────────────────────────
 *
 * Sept gabarits rendaient la MÊME composition : photo plein cadre, dégradé noir
 * en bas, texte blanc. Ils ne changeaient que les champs affichés — une note en
 * étoiles, une liste, un gros chiffre. Vues dans une grille, sept « gabarits »
 * donnaient sept fois la même image.
 *
 * Et le texte n'était jamais DANS le visuel · il était posé PAR-DESSUS, dans une
 * bande sombre qui recouvrait une photo qu'on venait de payer. Le copy ne
 * participait pas à l'image, il la masquait.
 *
 * La mise en page est donc séparée du gabarit :
 *
 * - **la coquille** décide où va l'image, ce qu'il y a derrière, et sur quel
 *   fond se lit le texte ;
 * - **le contenu** décide ce que le gabarit a à dire.
 *
 * Quatre coquilles pour sept gabarits, c'est vingt-huit rendus à partir de onze
 * morceaux de code. Le choix de la coquille vient du noyau, qui garantit qu'un
 * lot de quatre ne répète jamais la même.
 */

/** Fond d'affiche · un papier chaud, pas un blanc d'écran. */
const PAPIER = '#f4f1ea';
const ENCRE = '#12121a';

interface Ton {
  /** Couleur du titre. */
  texte: string;
  /** Couleur des lignes secondaires. */
  doux: string;
  /** Ombre portée · inutile et salissante sur fond clair. */
  ombre: string;
  clair: boolean;
}

function tonDe(layout: AdLayout): Ton {
  return LAYOUT_CLAIR[layout]
    ? { texte: ENCRE, doux: 'rgba(18,18,26,.72)', ombre: 'none', clair: true }
    : { texte: WHITE, doux: 'rgba(255,255,255,.88)', ombre: shadow(), clair: false };
}

/** La photo, dans une carte · elle devient un élément de la page, pas son fond. */
function Carte({ url, hauteur }: { url: string; hauteur: string }) {
  return (
    // `flexShrink: 0` n'est pas décoratif · sans lui, la zone de copie qui
    // grandit écrase la carte jusqu'à zéro, et la photo qu'on vient de payer
    // disparaît de la pub sans que rien ne le signale.
    <div style={{ position: 'relative', display: 'flex', flexShrink: 0, width: '100%', height: hauteur, borderRadius: u(28), overflow: 'hidden', background: DARK }}>
      <Bg url={url} />
    </div>
  );
}

/**
 * La coquille.
 *
 * `deco` se superpose à l'image · c'est ce qui permet à `before_after` de poser
 * sa frontière sans avoir besoin de sa propre coquille.
 */
function Coquille({ r, layout, deco, children }: {
  r: AdRecipe; layout: AdLayout; deco?: React.ReactNode; children: React.ReactNode;
}) {
  if (layout === 'split') {
    return (
      <Frame>
        <div style={{ position: 'relative', display: 'flex', width: '100%', height: '54%' }}>
          <Bg url={r.sceneUrl} />
          {deco}
          <div style={scrimTop} />
          <TopBar r={r} />
        </div>
        {/* Frontière nette, pas un dégradé · c'est ce qui distingue cette mise
            en page de l'immersive, et un fondu les rendrait à nouveau jumelles. */}
        <div style={{ display: 'flex', width: '100%', height: '4%', background: r.accent }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '42%', padding: ux(44, 56), background: DARK }}>
          {children}
        </div>
      </Frame>
    );
  }

  if (layout === 'champ') {
    return (
      <Frame fond={DARK}>
        {/* L'aplat prend la couleur de la marque · c'est la seule mise en page
            où l'accent tient toute l'image, et pas seulement un bouton. */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', backgroundImage: `linear-gradient(165deg, ${r.accent} -20%, ${DARK} 62%)` }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: ux(46, 46, 50) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: u(22) }}>
            <Logo recipe={r} />
            {r.badge && shellShowsBadge(r.template) ? <div style={pill('rgba(255,255,255,.18)', r.badge)}>{badgeText(r.badge, 22)}</div> : null}
          </div>
          <Carte url={r.sceneUrl} hauteur="46%" />
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', marginTop: u(30) }}>
            {children}
          </div>
        </div>
      </Frame>
    );
  }

  if (layout === 'affiche') {
    return (
      <Frame fond={PAPIER}>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: ux(50, 52, 54) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: u(26) }}>
            <Logo recipe={r} onDark={false} />
            {r.badge && shellShowsBadge(r.template) ? <div style={pill(r.accent, r.badge)}>{badgeText(r.badge, 22)}</div> : null}
          </div>
          {/* Le texte passe DEVANT l'image, en taille et en surface · c'est
              exactement ce qui manquait, le copy comme sujet du visuel. */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
          <div style={{ display: 'flex', flexGrow: 1, marginTop: u(28) }}>
            <Carte url={r.sceneUrl} hauteur="100%" />
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <Bg url={r.sceneUrl} />
      {deco}
      <div style={scrimTop} />
      <TopBar r={r} />
      <BottomPanel>{children}</BottomPanel>
    </Frame>
  );
}

/* ------------------------------ Briques de copie ---------------------------- */

/**
 * L'accroche.
 *
 * L'affiche la traite en capitales et beaucoup plus grande · c'est l'idiome du
 * format, et c'est ce qui fait qu'on lit le message avant de voir la photo. Les
 * trois autres coquilles gardent la casse d'origine, où une accroche criée sur
 * une photo passerait pour une erreur.
 */
function Titre({ r, t, layout, base }: { r: AdRecipe; t: Ton; layout: AdLayout; base?: number }) {
  const affiche = layout === 'affiche';
  const texte = affiche ? r.headline.toLocaleUpperCase('fr-FR') : r.headline;
  return (
    <div style={{
      display: 'flex',
      fontSize: fitHeadline(texte, base ?? (affiche ? 92 : 74), affiche ? 54 : 46),
      lineHeight: affiche ? 0.94 : 1.0,
      fontWeight: 700, color: t.texte,
      letterSpacing: u(affiche ? -2.2 : -1.4),
      textShadow: t.ombre,
    }}>{texte}</div>
  );
}

function SousTitre({ r, t }: { r: AdRecipe; t: Ton }) {
  if (!r.subhead) return null;
  return (
    <div style={{ display: 'flex', marginTop: u(16), fontSize: u(30), lineHeight: 1.28, color: t.doux, maxWidth: u(840) }}>{r.subhead}</div>
  );
}

/** Une carte de contenu · blanche sur sombre, cernée sur clair pour rester lisible. */
function Bloc({ t, children }: { t: Ton; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: t.clair ? '#ffffff' : 'rgba(255,255,255,.97)',
      border: t.clair ? `${u(2)}px solid rgba(18,18,26,.12)` : 'none',
      borderRadius: u(26), padding: ux(28, 30),
      boxShadow: t.clair ? `0 ${u(10)}px ${u(26)}px rgba(18,18,26,.10)` : `0 ${u(20)}px ${u(46)}px rgba(0,0,0,.42)`,
    }}>{children}</div>
  );
}

function Pied({ r, plein = false }: { r: AdRecipe; plein?: boolean }) {
  return <div style={{ display: 'flex', marginTop: u(28) }}><Cta recipe={r} full={plein} /></div>;
}

/* --------------------------------- Gabarits -------------------------------- */

/**
 * Une colonne EXPLICITE, jamais un fragment.
 *
 * ── Le défaut que ça répare ──────────────────────────────────────────────────
 *
 * `contenu` rendait un fragment `<>…</>`. Satori ne l'aplatit pas comme le DOM :
 * il le traite comme un bloc, avec sa direction par défaut — **en ligne**.
 *
 * Résultat sur la pub : l'accroche, la liste et le bouton se retrouvaient côte à
 * côte, superposés, et le bouton sortait du cadre. Tous les gabarits sauf
 * `before_after` étaient touchés, parce que lui seul rendait déjà un `div`.
 *
 * Les tests ne l'ont pas vu · une pub aux textes empilés à l'horizontale reste
 * « ni vide ni uniforme », ses compositions restent distinctes d'une mise en
 * page à l'autre, et sa zone de texte reste sombre. Trois gardes verts sur une
 * pub illisible.
 */
const colonne = { display: 'flex', flexDirection: 'column' } as const;

/** Ce que chaque gabarit a à dire · la coquille décide où ça se pose. */
function contenu(r: AdRecipe, t: Ton, layout: AdLayout): React.ReactNode {
  switch (r.template) {
    case 'testimonial': {
      const rating = Math.max(0, Math.min(5, Math.round(r.rating ?? 5)));
      return (
        <div style={colonne}>
          <Bloc t={t}>
            <div style={{ display: 'flex' }}>{Array.from({ length: rating }).map((_, i) => <Star key={i} size={36} />)}</div>
            <div style={{ display: 'flex', marginTop: u(16), fontSize: fitHeadline(r.quote || r.headline, 44, 32), lineHeight: 1.22, fontWeight: 700, color: '#15151b', letterSpacing: u(-0.4) }}>“{r.quote || r.headline}”</div>
            {r.author ? <div style={{ display: 'flex', marginTop: u(16), fontSize: u(26), fontWeight: 700, color: r.accent }}>{r.author}</div> : null}
          </Bloc>
          <Pied r={r} plein />
        </div>
      );
    }

    case 'benefits': {
      const items = (r.benefits && r.benefits.length ? r.benefits : [r.subhead || '']).filter(Boolean).slice(0, 3);
      return (
        <div style={colonne}>
          {r.kicker ? <div style={{ display: 'flex', marginBottom: u(14) }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
          <Titre r={r} t={t} layout={layout} base={layout === 'affiche' ? 74 : 62} />
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: u(22) }}>
            {items.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', marginTop: i ? u(16) : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: u(40), height: u(40), borderRadius: u(999), background: r.accent }}><Check /></div>
                <div style={{ display: 'flex', marginLeft: u(16), fontSize: u(31), fontWeight: 700, color: t.texte }}>{b}</div>
              </div>
            ))}
          </div>
          <Pied r={r} />
        </div>
      );
    }

    case 'ugc':
      return (
        <div style={colonne}>
          <Bloc t={t}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', width: u(40), height: u(40), borderRadius: u(999), background: r.accent, alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: u(20), fontWeight: 700 }}>
                {(r.author || r.brandName || '@').replace('@', '').slice(0, 1).toUpperCase()}
              </div>
              <div style={{ display: 'flex', marginLeft: u(12), fontSize: u(24), fontWeight: 700, color: '#15151b' }}>{r.author || r.brandName || ''}</div>
            </div>
            <div style={{ display: 'flex', marginTop: u(14), fontSize: fitHeadline(r.quote || r.headline, 42, 30), lineHeight: 1.24, fontWeight: 700, color: '#15151b', letterSpacing: u(-0.4) }}>{r.quote || r.headline}</div>
          </Bloc>
          <Pied r={r} plein />
        </div>
      );

    case 'stat':
      return (
        <div style={colonne}>
          {r.kicker ? <div style={{ display: 'flex', marginBottom: u(12) }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
          {/* Le chiffre EST le visuel · il prend la place d'un titre, pas celle
              d'une annotation posée dans un coin. */}
          <div style={{ display: 'flex', fontSize: u(150), lineHeight: 0.86, fontWeight: 700, color: r.accent, letterSpacing: u(-3), textShadow: t.ombre }}>{r.stat || '92%'}</div>
          {r.statLabel ? <div style={{ display: 'flex', marginTop: u(6), fontSize: u(30), fontWeight: 700, color: t.texte, maxWidth: u(680), lineHeight: 1.1, textShadow: t.ombre }}>{r.statLabel}</div> : null}
          <div style={{ display: 'flex', marginTop: u(18) }}>
            <Titre r={r} t={t} layout={layout} base={layout === 'affiche' ? 62 : 52} />
          </div>
          <Pied r={r} />
        </div>
      );

    case 'offer':
      return (
        <div style={colonne}>
          <div style={{ display: 'flex', marginBottom: u(18) }}><OfferBadge r={r} /></div>
          <Titre r={r} t={t} layout={layout} />
          <SousTitre r={r} t={t} />
          <Pied r={r} />
        </div>
      );

    case 'before_after':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {r.kicker ? <div style={{ display: 'flex', marginBottom: u(14) }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
          <div style={{ display: 'flex', textAlign: 'center', fontSize: fitHeadline(r.headline, 66), lineHeight: 1.02, fontWeight: 700, color: t.texte, letterSpacing: u(-1.2), maxWidth: u(900), textShadow: t.ombre }}>{r.headline}</div>
          <Pied r={r} />
        </div>
      );

    default:
      return (
        <div style={colonne}>
          {r.kicker ? <div style={{ display: 'flex', marginBottom: u(16) }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
          <Titre r={r} t={t} layout={layout} />
          <SousTitre r={r} t={t} />
          <Pied r={r} />
        </div>
      );
  }
}

/** La frontière avant/après · posée sur l'image, quelle que soit la coquille. */
function decoAvantApres(r: AdRecipe): React.ReactNode {
  // Un calque plein cadre, pas un fragment · satori traite un fragment comme un
  // bloc, et les enfants absolus se positionneraient alors par rapport à LUI.
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: u(4), marginLeft: u(-2), display: 'flex', background: 'rgba(255,255,255,.92)' }} />
      <div style={{ position: 'absolute', top: u(34), left: u(44), display: 'flex', background: 'rgba(0,0,0,.62)', color: WHITE, fontSize: u(24), fontWeight: 700, padding: ux(8, 18), borderRadius: u(8), letterSpacing: u(2) }}>AVANT</div>
      <div style={{ position: 'absolute', top: u(34), right: u(44), display: 'flex', background: r.accent, color: WHITE, fontSize: u(24), fontWeight: 700, padding: ux(8, 18), borderRadius: u(8), letterSpacing: u(2) }}>APRÈS</div>
    </div>
  );
}

/**
 * Construit l'arbre · SYNCHRONE, et doit le rester.
 *
 * L'échelle est posée ici et lue pendant la construction. Aucun `await` ne doit
 * apparaître dans cette fonction ni dans les gabarits qu'elle appelle : ce serait
 * rendre l'échelle partageable entre deux rendus concurrents.
 */
function element(r: AdRecipe) {
  ECHELLE = (r.width ?? LARGEUR_MAQUETTE) / LARGEUR_MAQUETTE;
  // Les pubs d'avant n'ont pas de mise en page consignée · elles gardent
  // l'immersive, celle avec laquelle elles ont été composées. Un ancien rendu ne
  // doit pas changer d'allure parce qu'on a ajouté des coquilles.
  const layout = layoutFor(r.template, r.layout ?? 'immersif');
  const t = tonDe(layout);
  const deco = r.template === 'before_after' ? decoAvantApres(r) : undefined;
  return <Coquille r={r} layout={layout} deco={deco}>{contenu(r, t, layout)}</Coquille>;
}

/** Compose la publicité finale (scène + couche design) et renvoie un PNG. */
export async function renderAdPng(recipe: AdRecipe): Promise<ArrayBuffer> {
  const width = recipe.width ?? 1080;
  const height = recipe.height ?? 1350;
  const res = new ImageResponse(element(recipe), {
    width, height,
     
    fonts: adFonts() as any,
  });
  return res.arrayBuffer();
}
