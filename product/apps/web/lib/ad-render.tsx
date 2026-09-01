import { ImageResponse } from 'next/og';
import { adFonts } from './ad-fonts';
import type { AdTemplate } from '@tiktrends/ai';

export interface AdRecipe {
  template: AdTemplate;
  width?: number; height?: number;
  sceneUrl: string;
  kicker?: string;
  headline: string; subhead?: string; cta: string;
  badge?: string; quote?: string; author?: string; rating?: number; benefits?: string[];
  stat?: string; statLabel?: string;
  accent: string;            // couleur d'accent / bouton (hex)
  variant?: number;          // variante de mise en page (diversité)
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
export const RENDER_VERSION = 2;

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

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Sans', background: DARK, overflow: 'hidden' }}>
      {children}
    </div>
  );
}

function TopBar({ r, center = false }: { r: AdRecipe; center?: boolean }) {
  return (
    <div style={{ position: 'absolute', top: u(46), left: u(56), right: u(56), display: 'flex', justifyContent: center ? 'center' : 'space-between', alignItems: 'flex-start' }}>
      <Logo recipe={r} />
      {!center && r.badge ? <div style={pill(r.accent, r.badge)}>{badgeText(r.badge, 22)}</div> : null}
    </div>
  );
}

/* --------------------------- Gabarits --------------------------- */

function ProblemSolution(r: AdRecipe) {
  // Variante 1 : accroche EN HAUT (gros titre), CTA en bas · casse la monotonie « tout en bas ».
  if ((r.variant ?? 0) % 3 === 1) {
    return (
      <Frame>
        <Bg url={r.sceneUrl} />
        <div style={{ position: 'absolute', left: u(0), right: u(0), top: u(0), height: '52%', display: 'flex', backgroundImage: 'linear-gradient(to bottom, rgba(8,8,11,.92) 30%, rgba(8,8,11,.5) 70%, rgba(8,8,11,0))' }} />
        <div style={{ position: 'absolute', top: u(46), left: u(56), right: u(56), display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Logo recipe={r} />{r.badge ? <div style={pill(r.accent, r.badge)}>{badgeText(r.badge, 22)}</div> : null}
        </div>
        <div style={{ position: 'absolute', top: u(116), left: u(56), right: u(56), display: 'flex', flexDirection: 'column' }}>
          {r.kicker ? <div style={{ display: 'flex', marginBottom: u(14) }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
          <div style={{ display: 'flex', fontSize: fitHeadline(r.headline, 74), lineHeight: 1.0, fontWeight: 700, color: WHITE, letterSpacing: u(-1.4) }}>{r.headline}</div>
          {r.subhead ? <div style={{ display: 'flex', marginTop: u(16), fontSize: u(30), lineHeight: 1.28, color: 'rgba(255,255,255,.9)', maxWidth: u(840) }}>{r.subhead}</div> : null}
        </div>
        <div style={{ position: 'absolute', left: u(56), right: u(56), bottom: u(52), display: 'flex' }}><Cta recipe={r} /></div>
      </Frame>
    );
  }
  return (
    <Frame>
      <Bg url={r.sceneUrl} />
      <div style={scrimTop} />
      <TopBar r={r} />
      <BottomPanel>
        {r.kicker ? <div style={{ display: 'flex', marginBottom: u(16) }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
        <div style={{ display: 'flex', fontSize: fitHeadline(r.headline), lineHeight: 1.0, fontWeight: 700, color: WHITE, letterSpacing: u(-1.5), textAlign: (r.variant ?? 0) % 3 === 2 ? 'center' : 'left', alignSelf: (r.variant ?? 0) % 3 === 2 ? 'center' : 'flex-start' }}>{r.headline}</div>
        {r.subhead ? <div style={{ display: 'flex', marginTop: u(18), fontSize: u(30), lineHeight: 1.28, color: 'rgba(255,255,255,.88)', maxWidth: u(840) }}>{r.subhead}</div> : null}
        <div style={{ display: 'flex', marginTop: u(34), alignSelf: (r.variant ?? 0) % 3 === 2 ? 'center' : 'flex-start' }}><Cta recipe={r} /></div>
      </BottomPanel>
    </Frame>
  );
}

function BeforeAfter(r: AdRecipe) {
  return (
    <Frame>
      <Bg url={r.sceneUrl} />
      <div style={{ position: 'absolute', top: u(0), bottom: u(0), left: '50%', width: u(4), marginLeft: u(-2), display: 'flex', background: 'rgba(255,255,255,.92)' }} />
      <div style={{ position: 'absolute', top: u(34), left: u(44), display: 'flex', background: 'rgba(0,0,0,.62)', color: WHITE, fontSize: u(24), fontWeight: 700, padding: ux(8, 18), borderRadius: u(8), letterSpacing: u(2) }}>AVANT</div>
      <div style={{ position: 'absolute', top: u(34), right: u(44), display: 'flex', background: r.accent, color: WHITE, fontSize: u(24), fontWeight: 700, padding: ux(8, 18), borderRadius: u(8), letterSpacing: u(2) }}>APRÈS</div>
      <BottomPanel>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {r.kicker ? <div style={{ display: 'flex', marginBottom: u(14) }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
          <div style={{ display: 'flex', textAlign: 'center', fontSize: fitHeadline(r.headline, 68), lineHeight: 1.02, fontWeight: 700, color: WHITE, letterSpacing: u(-1.2), maxWidth: u(900) }}>{r.headline}</div>
          <div style={{ display: 'flex', marginTop: u(30) }}><Cta recipe={r} /></div>
        </div>
      </BottomPanel>
    </Frame>
  );
}

function Testimonial(r: AdRecipe) {
  const rating = Math.max(0, Math.min(5, Math.round(r.rating ?? 5)));
  return (
    <Frame>
      <Bg url={r.sceneUrl} />
      <div style={scrimTop} />
      <TopBar r={r} center />
      <div style={{ position: 'absolute', left: u(56), right: u(56), bottom: u(52), display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,.97)', borderRadius: u(28), padding: ux(32, 34), boxShadow: `0 ${u(22)}px ${u(50)}px rgba(0,0,0,.45)` }}>
          <div style={{ display: 'flex' }}>{Array.from({ length: rating }).map((_, i) => <Star key={i} size={36} />)}</div>
          <div style={{ display: 'flex', marginTop: u(16), fontSize: fitHeadline(r.quote || r.headline, 44, 32), lineHeight: 1.22, fontWeight: 700, color: '#15151b', letterSpacing: u(-0.4) }}>“{r.quote || r.headline}”</div>
          {r.author ? <div style={{ display: 'flex', marginTop: u(16), fontSize: u(26), fontWeight: 700, color: r.accent }}>{r.author}</div> : null}
        </div>
        <div style={{ display: 'flex', marginTop: u(24) }}><Cta recipe={r} full /></div>
      </div>
    </Frame>
  );
}

function Benefits(r: AdRecipe) {
  const items = (r.benefits && r.benefits.length ? r.benefits : [r.subhead || '']).filter(Boolean).slice(0, 3);
  return (
    <Frame>
      <Bg url={r.sceneUrl} />
      <div style={scrimTop} />
      <TopBar r={r} />
      <div style={{ position: 'absolute', top: u(150), left: u(56), right: u(56), display: 'flex', flexDirection: 'column' }}>
        {r.kicker ? <div style={{ display: 'flex', marginBottom: u(14) }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
        <div style={{ display: 'flex', fontSize: fitHeadline(r.headline, 66), lineHeight: 1.02, fontWeight: 700, color: WHITE, letterSpacing: u(-1.2), maxWidth: u(900), textShadow: shadow() }}>{r.headline}</div>
      </div>
      <div style={{ position: 'absolute', left: u(56), right: u(56), bottom: u(52), display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,.97)', borderRadius: u(24), padding: ux(26, 28), boxShadow: `0 ${u(20)}px ${u(46)}px rgba(0,0,0,.42)` }}>
          {items.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', marginTop: i ? u(18) : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: u(42), height: u(42), borderRadius: u(999), background: r.accent }}><Check /></div>
              <div style={{ display: 'flex', marginLeft: u(16), fontSize: u(32), fontWeight: 700, color: '#15151b' }}>{b}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: u(22) }}><Cta recipe={r} full /></div>
      </div>
    </Frame>
  );
}

/** Coupe un badge trop long (le texte long va dans le kicker/headline, pas dans la pastille). */
function badgeText(s: string | undefined, max = 20): string {
  const t = (s || '').trim().replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max).trim() : t;
}
/**
 * Taille de police d'un badge selon sa longueur (évite tout débordement).
 *
 * Comme `fitHeadline` · les seuils sont en unités de maquette, la conversion se
 * fait à la sortie. C'est ce qui manquait ici : le badge gardait sa taille
 * d'impression sur une vignette, et débordait de sa pastille.
 */
function fitBadge(s: string, base = 40): number {
  const n = (s || '').length;
  if (n <= 5) return u(base);
  if (n <= 9) return u(Math.round(base * 0.7));
  if (n <= 14) return u(Math.round(base * 0.52));
  return u(Math.round(base * 0.42));
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

/** UGC : rendu natif « contenu créateur » · bulle de caption + pseudo. */
function Ugc(r: AdRecipe) {
  return (
    <Frame>
      <Bg url={r.sceneUrl} />
      <div style={scrimTop} />
      <div style={{ position: 'absolute', top: u(46), left: u(56), right: u(56), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', width: u(44), height: u(44), borderRadius: u(999), background: r.accent, alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: u(22), fontWeight: 700 }}>{(r.author || r.brandName || '@').replace('@', '').slice(0, 1).toUpperCase()}</div>
          <div style={{ display: 'flex', marginLeft: u(12), fontSize: u(26), fontWeight: 700, color: WHITE, textShadow: shadow() }}>{r.author || r.brandName || ''}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: u(56), right: u(56), bottom: u(52), display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,.97)', borderRadius: u(22), padding: ux(24, 26), fontSize: fitHeadline(r.quote || r.headline, 44, 32), lineHeight: 1.24, fontWeight: 700, color: '#15151b', letterSpacing: u(-0.4) }}>{r.quote || r.headline}</div>
        <div style={{ display: 'flex', marginTop: u(22) }}><Cta recipe={r} full /></div>
      </div>
    </Frame>
  );
}

/** Stat : un chiffre-clé hero + libellé + titre. */
function Stat(r: AdRecipe) {
  return (
    <Frame>
      <Bg url={r.sceneUrl} />
      <div style={scrimTop} />
      <TopBar r={r} />
      <div style={{ position: 'absolute', top: u(150), left: u(56), right: u(56), display: 'flex', flexDirection: 'column' }}>
        {r.kicker ? <div style={{ display: 'flex', marginBottom: u(16) }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <div style={{ display: 'flex', fontSize: u(150), lineHeight: 0.9, fontWeight: 700, color: r.accent, letterSpacing: u(-3), textShadow: shadow() }}>{r.stat || '92%'}</div>
        </div>
        {r.statLabel ? <div style={{ display: 'flex', marginTop: u(10), fontSize: u(38), fontWeight: 700, color: WHITE, maxWidth: u(640), lineHeight: 1.1, textShadow: shadow() }}>{r.statLabel}</div> : null}
      </div>
      <BottomPanel>
        <div style={{ display: 'flex', fontSize: fitHeadline(r.headline, 60), lineHeight: 1.03, fontWeight: 700, color: WHITE, letterSpacing: u(-1.2) }}>{r.headline}</div>
        <div style={{ display: 'flex', marginTop: u(28) }}><Cta recipe={r} /></div>
      </BottomPanel>
    </Frame>
  );
}

/** Offer : promo · pastille d'offre saillante + titre urgence + CTA. */
function Offer(r: AdRecipe) {
  return (
    <Frame>
      <Bg url={r.sceneUrl} />
      <div style={scrimTop} />
      <div style={{ position: 'absolute', top: u(46), left: u(56), right: u(56), display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Logo recipe={r} />
        <OfferBadge r={r} />
      </div>
      <BottomPanel>
        {r.kicker ? <div style={{ display: 'flex', marginBottom: u(14) }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
        <div style={{ display: 'flex', fontSize: fitHeadline(r.headline), lineHeight: 1.0, fontWeight: 700, color: WHITE, letterSpacing: u(-1.5) }}>{r.headline}</div>
        {r.subhead ? <div style={{ display: 'flex', marginTop: u(16), fontSize: u(30), lineHeight: 1.28, color: 'rgba(255,255,255,.88)', maxWidth: u(840) }}>{r.subhead}</div> : null}
        <div style={{ display: 'flex', marginTop: u(32) }}><Cta recipe={r} /></div>
      </BottomPanel>
    </Frame>
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
  switch (r.template) {
    case 'before_after': return BeforeAfter(r);
    case 'testimonial': return Testimonial(r);
    case 'benefits': return Benefits(r);
    case 'ugc': return Ugc(r);
    case 'stat': return Stat(r);
    case 'offer': return Offer(r);
    default: return ProblemSolution(r);
  }
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
