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
}

const WHITE = '#ffffff';
const DARK = '#0b0b0f';
const STAR = '#FFC531';

/** Taille de titre qui s'adapte à la longueur (évite les débordements). */
function fitHeadline(text: string, base = 78, min = 46): number {
  const n = (text || '').length;
  if (n <= 16) return base;
  if (n <= 24) return base - 10;
  if (n <= 34) return base - 20;
  if (n <= 46) return base - 28;
  return min;
}
const shadow = '0 3px 22px rgba(0,0,0,.55)';

function Star({ size = 32, color = STAR }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'flex' }}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={color} />
    </svg>
  );
}
function Arrow({ size = 30, color = WHITE }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'flex' }}>
      <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Check({ size = 22, color = WHITE }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'flex' }}>
      <path d="M20 6L9 17l-5-5" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Kicker({ text, accent }: { text: string; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', width: 34, height: 5, borderRadius: 3, background: accent, marginRight: 14 }} />
      <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 2, color: accent, textTransform: 'uppercase' }}>{text}</div>
    </div>
  );
}

function Logo({ recipe, onDark = true }: { recipe: AdRecipe; onDark?: boolean }) {
  if (recipe.logoUrl) {
     
    return <img src={recipe.logoUrl} alt="" width={128} height={42} style={{ objectFit: 'contain', display: 'flex' }} />;
  }
  if (recipe.brandName) {
    return <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: onDark ? WHITE : '#15151b', letterSpacing: -0.5, textShadow: onDark ? shadow : 'none' }}>{recipe.brandName}</div>;
  }
  return <div style={{ display: 'flex' }} />;
}

function Cta({ recipe, full = false }: { recipe: AdRecipe; full?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: full ? 'stretch' : 'flex-start', background: recipe.accent, color: WHITE, fontSize: 34, fontWeight: 700, padding: '20px 34px', borderRadius: 16, boxShadow: '0 14px 34px rgba(0,0,0,.4)' }}>
      <div style={{ display: 'flex', marginRight: 12 }}>{recipe.cta}</div>
      <Arrow />
    </div>
  );
}

function Bg({ url }: { url: string }) {
   
  return <img src={url} alt="" width={1080} height={1350} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'flex' }} />;
}
const scrimTop = { position: 'absolute' as const, left: 0, right: 0, top: 0, height: '30%', display: 'flex', backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,.6), rgba(0,0,0,0))' };

/** Panneau bas dégradé (transparent -> sombre) qui accueille le texte : le look « pub finie ». */
function BottomPanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', padding: '150px 56px 56px', backgroundImage: 'linear-gradient(to top, rgba(8,8,11,.96) 55%, rgba(8,8,11,.55) 80%, rgba(8,8,11,0))' }}>
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
    <div style={{ position: 'absolute', top: 46, left: 56, right: 56, display: 'flex', justifyContent: center ? 'center' : 'space-between', alignItems: 'flex-start' }}>
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
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '52%', display: 'flex', backgroundImage: 'linear-gradient(to bottom, rgba(8,8,11,.92) 30%, rgba(8,8,11,.5) 70%, rgba(8,8,11,0))' }} />
        <div style={{ position: 'absolute', top: 46, left: 56, right: 56, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Logo recipe={r} />{r.badge ? <div style={pill(r.accent, r.badge)}>{badgeText(r.badge, 22)}</div> : null}
        </div>
        <div style={{ position: 'absolute', top: 116, left: 56, right: 56, display: 'flex', flexDirection: 'column' }}>
          {r.kicker ? <div style={{ display: 'flex', marginBottom: 14 }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
          <div style={{ display: 'flex', fontSize: fitHeadline(r.headline, 74), lineHeight: 1.0, fontWeight: 700, color: WHITE, letterSpacing: -1.4 }}>{r.headline}</div>
          {r.subhead ? <div style={{ display: 'flex', marginTop: 16, fontSize: 30, lineHeight: 1.28, color: 'rgba(255,255,255,.9)', maxWidth: 840 }}>{r.subhead}</div> : null}
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 52, display: 'flex' }}><Cta recipe={r} /></div>
      </Frame>
    );
  }
  return (
    <Frame>
      <Bg url={r.sceneUrl} />
      <div style={scrimTop} />
      <TopBar r={r} />
      <BottomPanel>
        {r.kicker ? <div style={{ display: 'flex', marginBottom: 16 }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
        <div style={{ display: 'flex', fontSize: fitHeadline(r.headline), lineHeight: 1.0, fontWeight: 700, color: WHITE, letterSpacing: -1.5, textAlign: (r.variant ?? 0) % 3 === 2 ? 'center' : 'left', alignSelf: (r.variant ?? 0) % 3 === 2 ? 'center' : 'flex-start' }}>{r.headline}</div>
        {r.subhead ? <div style={{ display: 'flex', marginTop: 18, fontSize: 30, lineHeight: 1.28, color: 'rgba(255,255,255,.88)', maxWidth: 840 }}>{r.subhead}</div> : null}
        <div style={{ display: 'flex', marginTop: 34, alignSelf: (r.variant ?? 0) % 3 === 2 ? 'center' : 'flex-start' }}><Cta recipe={r} /></div>
      </BottomPanel>
    </Frame>
  );
}

function BeforeAfter(r: AdRecipe) {
  return (
    <Frame>
      <Bg url={r.sceneUrl} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 4, marginLeft: -2, display: 'flex', background: 'rgba(255,255,255,.92)' }} />
      <div style={{ position: 'absolute', top: 34, left: 44, display: 'flex', background: 'rgba(0,0,0,.62)', color: WHITE, fontSize: 24, fontWeight: 700, padding: '8px 18px', borderRadius: 8, letterSpacing: 2 }}>AVANT</div>
      <div style={{ position: 'absolute', top: 34, right: 44, display: 'flex', background: r.accent, color: WHITE, fontSize: 24, fontWeight: 700, padding: '8px 18px', borderRadius: 8, letterSpacing: 2 }}>APRÈS</div>
      <BottomPanel>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {r.kicker ? <div style={{ display: 'flex', marginBottom: 14 }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
          <div style={{ display: 'flex', textAlign: 'center', fontSize: fitHeadline(r.headline, 68), lineHeight: 1.02, fontWeight: 700, color: WHITE, letterSpacing: -1.2, maxWidth: 900 }}>{r.headline}</div>
          <div style={{ display: 'flex', marginTop: 30 }}><Cta recipe={r} /></div>
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
      <div style={{ position: 'absolute', left: 56, right: 56, bottom: 52, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,.97)', borderRadius: 28, padding: '32px 34px', boxShadow: '0 22px 50px rgba(0,0,0,.45)' }}>
          <div style={{ display: 'flex' }}>{Array.from({ length: rating }).map((_, i) => <Star key={i} size={36} />)}</div>
          <div style={{ display: 'flex', marginTop: 16, fontSize: fitHeadline(r.quote || r.headline, 44, 32), lineHeight: 1.22, fontWeight: 700, color: '#15151b', letterSpacing: -0.4 }}>“{r.quote || r.headline}”</div>
          {r.author ? <div style={{ display: 'flex', marginTop: 16, fontSize: 26, fontWeight: 700, color: r.accent }}>{r.author}</div> : null}
        </div>
        <div style={{ display: 'flex', marginTop: 24 }}><Cta recipe={r} full /></div>
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
      <div style={{ position: 'absolute', top: 150, left: 56, right: 56, display: 'flex', flexDirection: 'column' }}>
        {r.kicker ? <div style={{ display: 'flex', marginBottom: 14 }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
        <div style={{ display: 'flex', fontSize: fitHeadline(r.headline, 66), lineHeight: 1.02, fontWeight: 700, color: WHITE, letterSpacing: -1.2, maxWidth: 900, textShadow: shadow }}>{r.headline}</div>
      </div>
      <div style={{ position: 'absolute', left: 56, right: 56, bottom: 52, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,.97)', borderRadius: 24, padding: '26px 28px', boxShadow: '0 20px 46px rgba(0,0,0,.42)' }}>
          {items.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', marginTop: i ? 18 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 999, background: r.accent }}><Check /></div>
              <div style={{ display: 'flex', marginLeft: 16, fontSize: 32, fontWeight: 700, color: '#15151b' }}>{b}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: 22 }}><Cta recipe={r} full /></div>
      </div>
    </Frame>
  );
}

/** Coupe un badge trop long (le texte long va dans le kicker/headline, pas dans la pastille). */
function badgeText(s: string | undefined, max = 20): string {
  const t = (s || '').trim().replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max).trim() : t;
}
/** Taille de police d'un badge selon sa longueur (évite tout débordement). */
function fitBadge(s: string, base = 40): number {
  const n = (s || '').length;
  if (n <= 5) return base;
  if (n <= 9) return Math.round(base * 0.7);
  if (n <= 14) return Math.round(base * 0.52);
  return Math.round(base * 0.42);
}

// Pastille top-bar (AVANT/APRÈS, etc.) · une ligne, jamais de débordement.
function pill(accent: string, text?: string) {
  const t = badgeText(text, 22);
  return { display: 'flex', maxWidth: 360, whiteSpace: 'nowrap', background: accent, color: WHITE, fontSize: fitBadge(t, 26), fontWeight: 700, padding: '9px 18px', borderRadius: 999, letterSpacing: 0.3 } as const;
}

/** Pastille d'offre saillante · sticker arrondi qui s'adapte au texte (jamais de débordement). */
function OfferBadge({ r }: { r: AdRecipe }) {
  const t = badgeText(r.badge, 22) || 'PROMO';
  return (
    <div style={{ display: 'flex', maxWidth: 320, alignItems: 'center', justifyContent: 'center', padding: '14px 22px', borderRadius: 24, background: r.accent, color: WHITE, boxShadow: '0 12px 30px rgba(0,0,0,.4)', transform: 'rotate(-4deg)' }}>
      <div style={{ display: 'flex', textAlign: 'center', fontSize: fitBadge(t, 42), fontWeight: 800, lineHeight: 1.02, letterSpacing: -0.5 }}>{t}</div>
    </div>
  );
}

/** UGC : rendu natif « contenu créateur » · bulle de caption + pseudo. */
function Ugc(r: AdRecipe) {
  return (
    <Frame>
      <Bg url={r.sceneUrl} />
      <div style={scrimTop} />
      <div style={{ position: 'absolute', top: 46, left: 56, right: 56, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', width: 44, height: 44, borderRadius: 999, background: r.accent, alignItems: 'center', justifyContent: 'center', color: WHITE, fontSize: 22, fontWeight: 700 }}>{(r.author || r.brandName || '@').replace('@', '').slice(0, 1).toUpperCase()}</div>
          <div style={{ display: 'flex', marginLeft: 12, fontSize: 26, fontWeight: 700, color: WHITE, textShadow: shadow }}>{r.author || r.brandName || ''}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 56, right: 56, bottom: 52, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,.97)', borderRadius: 22, padding: '24px 26px', fontSize: fitHeadline(r.quote || r.headline, 44, 32), lineHeight: 1.24, fontWeight: 700, color: '#15151b', letterSpacing: -0.4 }}>{r.quote || r.headline}</div>
        <div style={{ display: 'flex', marginTop: 22 }}><Cta recipe={r} full /></div>
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
      <div style={{ position: 'absolute', top: 150, left: 56, right: 56, display: 'flex', flexDirection: 'column' }}>
        {r.kicker ? <div style={{ display: 'flex', marginBottom: 16 }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <div style={{ display: 'flex', fontSize: 150, lineHeight: 0.9, fontWeight: 700, color: r.accent, letterSpacing: -3, textShadow: shadow }}>{r.stat || '92%'}</div>
        </div>
        {r.statLabel ? <div style={{ display: 'flex', marginTop: 10, fontSize: 38, fontWeight: 700, color: WHITE, maxWidth: 640, lineHeight: 1.1, textShadow: shadow }}>{r.statLabel}</div> : null}
      </div>
      <BottomPanel>
        <div style={{ display: 'flex', fontSize: fitHeadline(r.headline, 60), lineHeight: 1.03, fontWeight: 700, color: WHITE, letterSpacing: -1.2 }}>{r.headline}</div>
        <div style={{ display: 'flex', marginTop: 28 }}><Cta recipe={r} /></div>
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
      <div style={{ position: 'absolute', top: 46, left: 56, right: 56, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Logo recipe={r} />
        <OfferBadge r={r} />
      </div>
      <BottomPanel>
        {r.kicker ? <div style={{ display: 'flex', marginBottom: 14 }}><Kicker text={r.kicker} accent={r.accent} /></div> : null}
        <div style={{ display: 'flex', fontSize: fitHeadline(r.headline), lineHeight: 1.0, fontWeight: 700, color: WHITE, letterSpacing: -1.5 }}>{r.headline}</div>
        {r.subhead ? <div style={{ display: 'flex', marginTop: 16, fontSize: 30, lineHeight: 1.28, color: 'rgba(255,255,255,.88)', maxWidth: 840 }}>{r.subhead}</div> : null}
        <div style={{ display: 'flex', marginTop: 32 }}><Cta recipe={r} /></div>
      </BottomPanel>
    </Frame>
  );
}

function element(r: AdRecipe) {
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
