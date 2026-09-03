import { ImageResponse } from 'next/og';
import { adFonts } from './ad-fonts';
import type { AdTemplate } from '@tiktrends/ai';
import { LAYOUT_CLAIR, layoutFor, shellShowsBadge, voilesDe, type AdLayout, type SceneLight, type StudioVariable, type EssaiVariable } from '@tiktrends/core';

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
  /**
   * Ce qu'on a mesuré de la scène · deux bandes, relevées une fois.
   *
   * Absente, les voiles restent ceux d'avant la mesure : une publicité déjà
   * composée ne doit pas changer d'allure sans qu'on ait rien appris sur elle.
   */
  light?: SceneLight | null;
  /**
   * Le brief de la scène · non rendu, consigné.
   *
   * Il ne l'était pas, et produire UNE AUTRE scène du même concept était donc
   * impossible : il aurait fallu redemander au modèle d'inventer le brief qu'il
   * avait déjà écrit.
   */
  sceneBrief?: string;
  /**
   * Le moteur d'image qui a produit la scène · non rendu, consigné.
   *
   * Il ne l'était pas · on ne pouvait donc pas répondre à « d'où viennent mes
   * ratés de fabrication », alors que c'est la question qui décide du moteur
   * qu'on paie.
   */
  model?: string;
  /**
   * De qui cette publicité descend, et ce qu'on y a changé.
   *
   * C'est ce qui distingue une déclinaison d'une créa de plus dans la grille ·
   * sans filiation, l'écart mesuré plus tard n'est rattaché à rien.
   */
  parentId?: string | null;
  variable?: StudioVariable | null;
  /**
   * Ce que le LOT déclarait tester · non rendu, consigné.
   *
   * Sans lui, quatre publicités produites ensemble sont quatre paris
   * indépendants, et la mesure qui suit n'attribue l'écart à rien.
   */
  essai?: { variable: EssaiVariable; groupe: string } | null;
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
export const RENDER_VERSION = 8;

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
  // Les paliers descendent en POURCENTAGE, pas en points fixes.
  //
  // Retirer 20 points à une base de 86 en enlève un quart ; les retirer d'une
  // base de 150 en enlève un septième. Écrits en dur, les paliers écrasaient
  // toute tentative d'agrandir l'accroche · c'est ce qui rendait la maquette
  // impossible à sortir de sa timidité.
  //
  // L'arrondi se fait en unités de MAQUETTE, avant la conversion · arrondir
  // après donnait une taille légèrement différente selon l'échelle, et la
  // vignette cessait d'être la même composition que le plein format.
  const palier = n <= 16 ? 1 : n <= 24 ? 0.88 : n <= 34 ? 0.77 : n <= 46 ? 0.67 : 0.58;
  return u(Math.max(min, Math.round(base * palier)));
}
const shadow = () => `0 ${u(3)}px ${u(22)}px rgba(0,0,0,.55)`;

/**
 * Une couleur assombrie, en restant elle-même.
 *
 * Un dégradé vers le noir efface la teinte · c'est exactement ce qui vidait le
 * « champ de couleur » de sa couleur. On multiplie donc les canaux au lieu de
 * fondre vers autre chose.
 */
function assombrir(hex: string, part: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const k = Math.max(0, Math.min(1, 1 - part));
  const c = (d: number) => Math.round(((n >> d) & 255) * k);
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

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
      <div style={{ display: 'flex', width: u(46), height: u(6), borderRadius: u(3), background: accent, marginRight: u(16) }} />
      <div style={{ display: 'flex', fontSize: u(28), fontWeight: 800, letterSpacing: u(2.4), color: accent, textTransform: 'uppercase' }}>{text}</div>
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

/**
 * Le bouton d'action.
 *
 * `invert` le rend blanc sur texte d'accent · nécessaire dès que le fond porte
 * déjà l'accent, où un bouton d'accent se dissoudrait dans son support.
 */
function Cta({ recipe, full = false, invert = false }: { recipe: AdRecipe; full?: boolean; invert?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: full ? 'stretch' : 'flex-start', background: invert ? WHITE : recipe.accent, color: invert ? '#12121a' : WHITE, fontSize: u(36), fontWeight: 800, padding: ux(22, 38), borderRadius: u(18), boxShadow: `0 ${u(14)}px ${u(34)}px rgba(0,0,0,.4)` }}>
      <div style={{ display: 'flex', marginRight: u(12) }}>{recipe.cta}</div>
      <Arrow color={invert ? '#12121a' : WHITE} />
    </div>
  );
}

function Bg({ url }: { url: string }) {
   
  return <img src={url} alt="" width={1080} height={1350} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'flex' }} />;
}
/**
 * Le bandeau du haut · son opacité suit la bande qu'il couvre.
 *
 * Il était peint à `.6` quelle que soit la scène. Sur une image sombre, il
 * assombrissait du noir ; sur une image claire, il tenait par chance.
 */
const scrimTop = (a: number) => ({
  position: 'absolute' as const, left: u(0), right: u(0), top: u(0), height: '30%', display: 'flex',
  backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,${a}), rgba(0,0,0,0))`,
});

/**
 * Panneau bas dégradé qui accueille le texte : le look « pub finie ».
 *
 * Les deux arrêts viennent de la mesure. C'est le plus TRANSPARENT qui porte la
 * garantie de lisibilité · le texte y monte, et dimensionner sur la base pleine
 * laisserait sa moitié haute sans rien pour la tenir.
 */
function BottomPanel({ fort, doux, children }: { fort: number; doux: number; children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: u(0), right: u(0), bottom: u(0), display: 'flex', flexDirection: 'column', padding: ux(112, 60, 62), backgroundImage: `linear-gradient(to top, rgba(8,8,11,${fort}) 62%, rgba(8,8,11,${doux}) 84%, rgba(8,8,11,0))` }}>
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
  /**
   * Ce qui s'encre en couleur d'accent · kicker, chiffre-clé, pastilles.
   *
   * Le bloc de couleur du split PORTE l'accent · un kicker d'accent y devient
   * invisible, et le chiffre-clé disparaît complètement. Sur ce fond-là, l'encre
   * d'accent est blanche.
   */
  accentInk: string;
  /** Couleur des lignes secondaires. */
  doux: string;
  /** Ombre portée · inutile et salissante sur fond clair. */
  ombre: string;
  clair: boolean;
}

function tonDe(layout: AdLayout, accent: string): Ton {
  if (LAYOUT_CLAIR[layout]) return { texte: ENCRE, accentInk: accent, doux: 'rgba(18,18,26,.72)', ombre: 'none', clair: true };
  // Sur un bloc de couleur, l'ombre portée salit au lieu de détacher · le
  // contraste vient déjà du fond. Et l'encre d'accent devient blanche.
  // Deux coquilles posent leur texte sur un aplat d'accent · l'encre d'accent y
  // deviendrait invisible, et l'ombre portée salirait un fond déjà contrasté.
  if (layout === 'split' || layout === 'champ') return { texte: WHITE, accentInk: WHITE, doux: 'rgba(255,255,255,.92)', ombre: 'none', clair: false };
  return { texte: WHITE, accentInk: accent, doux: 'rgba(255,255,255,.88)', ombre: shadow(), clair: false };
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
  // Une seule lecture de la mesure · deux calculs séparés finiraient par
  // diverger, et le bandeau du haut ne parlerait plus de la même image que le
  // panneau du bas.
  const voiles = voilesDe(r.light);

  if (layout === 'split') {
    return (
      <Frame>
        <div style={{ position: 'relative', display: 'flex', width: '100%', height: '60%' }}>
          <Bg url={r.sceneUrl} />
          {deco}
          <div style={scrimTop(voiles.haut)} />
          <TopBar r={r} />
        </div>
        {/* Un BLOC de couleur, pas une bande sombre.

             La frontière nette ne suffisait pas : photo en haut, noir en bas,
             c'était l'immersive avec un trait. Mesurée, la composition était la
             même à 0,7 % près. Le fond prend donc l'accent, et le bouton
             s'inverse pour ne pas s'y dissoudre. */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '40%', padding: ux(40, 60), background: r.accent }}>
          {children}
        </div>
      </Frame>
    );
  }

  if (layout === 'champ') {
    return (
      /* L'aplat est le FOND du cadre, pas un calque posé dessus · un calque
         « inset: 0 » ne peignait rien, et la mise en page nommée « champ de
         couleur » n'en montrait aucune. Il commence À la couleur : écrit
         « accent -20 % », il la plaçait hors de l'image. */
      /* Un aplat, pas un dégradé vers le noir.
           Écrit « accent 0 %, accent 30 %, sombre 84 % », le champ n'avait de
           couleur QUE derrière la photo, qui la cache · le texte tombait sur du
           noir, et la mise en page nommée « champ de couleur » n'en montrait
           toujours aucune. Le dégradé reste, mais entre deux tons de l'accent :
           il donne du relief sans reprendre la couleur qu'il est censé poser. */
      <Frame fond={`linear-gradient(178deg, ${r.accent} 0%, ${assombrir(r.accent, 0.34)} 100%)`}>
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
      <div style={scrimTop(voiles.haut)} />
      <TopBar r={r} />
      <BottomPanel fort={voiles.basFort} doux={voiles.basDoux}>{children}</BottomPanel>
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
      // Une publicité n'est pas une carte web · son accroche doit MANGER
      // l'image. À 86, elle pesait à peine plus que ses propres puces, et les
      // deux tiers hauts du cadre restaient vides.
      fontSize: fitHeadline(texte, base ?? (affiche ? 168 : 140), affiche ? 82 : 74),
      lineHeight: affiche ? 0.92 : 0.96,
      fontWeight: 800, color: t.texte,
      letterSpacing: u(affiche ? -2.2 : -1.4),
      textShadow: t.ombre,
    }}>{texte}</div>
  );
}

function SousTitre({ r, t }: { r: AdRecipe; t: Ton }) {
  if (!r.subhead) return null;
  return (
    <div style={{ display: 'flex', marginTop: u(18), fontSize: u(33), lineHeight: 1.3, color: t.doux, maxWidth: u(880) }}>{r.subhead}</div>
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

function Pied({ r, plein = false, layout }: { r: AdRecipe; plein?: boolean; layout?: AdLayout }) {
  // Un bouton sans texte n'est pas un bouton.
  //
  // Le modèle rend parfois un `cta` vide. On dessinait quand même la pastille,
  // avec sa seule flèche · une publicité qui affiche un bouton muet a l'air
  // cassée, et elle l'est. Mieux vaut pas de bouton du tout : la publicité
  // reste publiable, l'accroche porte seule.
  if (!r.cta?.trim()) return <div style={{ display: 'flex' }} />;
  return (
    <div style={{ display: 'flex', marginTop: u(28) }}>
      {/* Un bloc de couleur pleine avale un bouton d'accent · il s'inverse. */}
      <Cta recipe={r} full={plein} invert={layout === 'split' || layout === 'champ'} />
    </div>
  );
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
          <Pied r={r} plein layout={layout} />
        </div>
      );
    }

    case 'benefits': {
      const items = (r.benefits && r.benefits.length ? r.benefits : [r.subhead || '']).filter(Boolean).slice(0, 3);
      return (
        <div style={colonne}>
          {r.kicker ? <div style={{ display: 'flex', marginBottom: u(20) }}><Kicker text={r.kicker} accent={t.accentInk} /></div> : null}
          {/* La liste ne fait PAS rétrécir l'accroche.
               Elle était bridée à 62 pour laisser de la place aux puces · une
               accroche de 42 px sur un cadre de 1080, c'est-à-dire quatre pour
               cent de la largeur. La réponse à « le titre gêne la liste » n'est
               pas de rapetisser le titre, c'est de rapetisser la liste. */}
          <Titre r={r} t={t} layout={layout} base={layout === 'affiche' ? 132 : 112} />
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: u(22) }}>
            {items.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', marginTop: i ? u(16) : 0 }}>
                {/* La coche se lit sur SA pastille, pas sur un nom de coquille.
                     La règle disait « si c'est le split » · le jour où le champ
                     a rejoint les fonds d'accent, sa pastille blanche a reçu une
                     coche blanche. Une règle qui énumère des coquilles casse à
                     la coquille suivante. */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: u(40), height: u(40), borderRadius: u(999), background: t.accentInk }}><Check color={t.accentInk === WHITE ? r.accent : WHITE} /></div>
                <div style={{ display: 'flex', marginLeft: u(16), fontSize: u(30), fontWeight: 600, color: t.doux }}>{b}</div>
              </div>
            ))}
          </div>
          <Pied r={r} layout={layout} />
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
          <Pied r={r} plein layout={layout} />
        </div>
      );

    case 'stat':
      return (
        <div style={colonne}>
          {r.kicker ? <div style={{ display: 'flex', marginBottom: u(20) }}><Kicker text={r.kicker} accent={t.accentInk} /></div> : null}
          {/* Le chiffre EST le visuel · il prend la place d'un titre, pas celle
              d'une annotation posée dans un coin. */}
          {/* Encre d'accent, pas couleur d'accent · sur le bloc de couleur du
              split, un chiffre d'accent disparaît dans son propre fond.

              Et la taille suit la place réelle : le bloc « chiffre + libellé +
              accroche + bouton » ne tient pas dans les 40 % du split. À 150 px
              il débordait vers le haut, sur la photo, où le blanc s'efface. */}
          <div style={{ display: 'flex', fontSize: u(layout === 'split' ? 96 : layout === 'champ' ? 122 : 150), lineHeight: 0.86, fontWeight: 700, color: t.accentInk, letterSpacing: u(-3), textShadow: t.ombre }}>{r.stat || '92%'}</div>
          {r.statLabel ? <div style={{ display: 'flex', marginTop: u(6), fontSize: u(30), fontWeight: 700, color: t.texte, maxWidth: u(680), lineHeight: 1.1, textShadow: t.ombre }}>{r.statLabel}</div> : null}
          <div style={{ display: 'flex', marginTop: u(18) }}>
            {/* Le chiffre-clé occupe déjà la moitié du bloc · l'accroche reste
                en dessous de la base commune, mais pas au point de disparaître. */}
            <Titre r={r} t={t} layout={layout} base={layout === 'affiche' ? 112 : layout === 'split' ? 80 : 96} />
          </div>
          <Pied r={r} layout={layout} />
        </div>
      );

    case 'offer':
      return (
        <div style={colonne}>
          <div style={{ display: 'flex', marginBottom: u(18) }}><OfferBadge r={r} /></div>
          <Titre r={r} t={t} layout={layout} />
          <SousTitre r={r} t={t} />
          <Pied r={r} layout={layout} />
        </div>
      );

    case 'before_after':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {r.kicker ? <div style={{ display: 'flex', marginBottom: u(20) }}><Kicker text={r.kicker} accent={t.accentInk} /></div> : null}
          <div style={{ display: 'flex', textAlign: 'center', fontSize: fitHeadline(r.headline, 66), lineHeight: 1.02, fontWeight: 700, color: t.texte, letterSpacing: u(-1.2), maxWidth: u(900), textShadow: t.ombre }}>{r.headline}</div>
          <Pied r={r} layout={layout} />
        </div>
      );

    default:
      return (
        <div style={colonne}>
          {r.kicker ? <div style={{ display: 'flex', marginBottom: u(20) }}><Kicker text={r.kicker} accent={t.accentInk} /></div> : null}
          <Titre r={r} t={t} layout={layout} />
          <SousTitre r={r} t={t} />
          <Pied r={r} layout={layout} />
        </div>
      );
  }
}

/** La frontière avant/après · posée sur l'image, quelle que soit la coquille. */
function decoAvantApres(r: AdRecipe): React.ReactNode {
  // Un TABLEAU, pas un calque enveloppe · satori ne sort pas les enfants absolus
  // d'un conteneur qu'on lui ajoute. Avec l'enveloppe, seule l'étiquette de
  // gauche apparaissait : la frontière et « APRÈS » disparaissaient de la pub,
  // c'est-à-dire tout ce qui fait la comparaison.
  return [
    <div key="ligne" style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: u(8), marginLeft: u(-4), display: 'flex', background: WHITE }} />,
    // Sous la barre du haut · elles s'y superposaient au logo, et une pub qui
    // écrase le nom de sa marque est ratée avant qu'on la lise.
    <div key="avant" style={{ position: 'absolute', top: u(132), left: u(44), display: 'flex', background: 'rgba(10,10,14,.82)', color: WHITE, fontSize: u(28), fontWeight: 800, padding: ux(10, 20), borderRadius: u(10), letterSpacing: u(2.5) }}>AVANT</div>,
    <div key="apres" style={{ position: 'absolute', top: u(132), right: u(44), display: 'flex', background: r.accent, color: WHITE, fontSize: u(28), fontWeight: 800, padding: ux(10, 20), borderRadius: u(10), letterSpacing: u(2.5) }}>APRÈS</div>,
  ];
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
  const t = tonDe(layout, r.accent);
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
