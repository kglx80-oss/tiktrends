import { ImageResponse } from 'next/og';
import { adFonts } from './ad-fonts';
import type { AdTemplate } from '@tiktrends/ai';

export interface AdRecipe {
  template: AdTemplate;
  width?: number; height?: number;
  sceneUrl: string;
  headline: string; subhead?: string; cta: string;
  badge?: string; quote?: string; author?: string; rating?: number; benefits?: string[];
  accent: string;            // couleur d'accent / bouton (hex)
  brandName?: string;
  logoUrl?: string | null;
}

const WHITE = '#ffffff';
const DARK = '#0b0b0f';

/** Étoile pleine en SVG (rendu fiable, indépendant de la police). */
function Star({ size = 30, color = '#FFC531' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'flex' }}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={color} />
    </svg>
  );
}

function Logo({ recipe }: { recipe: AdRecipe }) {
  if (recipe.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={recipe.logoUrl} alt="" width={132} height={44} style={{ objectFit: 'contain', display: 'flex' }} />;
  }
  if (recipe.brandName) {
    return (
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: WHITE, letterSpacing: -0.5, textShadow: '0 2px 12px rgba(0,0,0,.5)' }}>
        {recipe.brandName}
      </div>
    );
  }
  return <div style={{ display: 'flex' }} />;
}

function Cta({ recipe }: { recipe: AdRecipe }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', alignSelf: 'flex-start', background: recipe.accent, color: WHITE, fontSize: 34, fontWeight: 700, padding: '20px 38px', borderRadius: 999, boxShadow: '0 12px 30px rgba(0,0,0,.35)' }}>
      {recipe.cta}
    </div>
  );
}

const scrimBottom = { position: 'absolute' as const, left: 0, right: 0, bottom: 0, height: '62%', display: 'flex', backgroundImage: `linear-gradient(to top, rgba(0,0,0,.86), rgba(0,0,0,.45) 45%, rgba(0,0,0,0))` };
const scrimTop = { position: 'absolute' as const, left: 0, right: 0, top: 0, height: '34%', display: 'flex', backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,.62), rgba(0,0,0,0))` };

function Bg({ url }: { url: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" width={1080} height={1350} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'flex' }} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'Sans', background: DARK, overflow: 'hidden' }}>
      {children}
    </div>
  );
}

/* --------------------------- Gabarits --------------------------- */

function ProblemSolution(r: AdRecipe) {
  return (
    <Frame>
      <Bg url={r.sceneUrl} />
      <div style={scrimTop} />
      <div style={scrimBottom} />
      <div style={{ position: 'absolute', top: 46, left: 52, right: 52, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Logo recipe={r} />
        {r.badge ? <div style={pill(r.accent)}>{r.badge}</div> : <div style={{ display: 'flex' }} />}
      </div>
      <div style={{ position: 'absolute', left: 52, right: 52, bottom: 52, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 74, lineHeight: 1.02, fontWeight: 700, color: WHITE, letterSpacing: -1.5, textShadow: '0 3px 20px rgba(0,0,0,.5)' }}>{r.headline}</div>
        {r.subhead ? <div style={{ display: 'flex', marginTop: 18, fontSize: 32, lineHeight: 1.25, color: 'rgba(255,255,255,.9)', maxWidth: 820 }}>{r.subhead}</div> : null}
        <div style={{ display: 'flex', marginTop: 34 }}><Cta recipe={r} /></div>
      </div>
    </Frame>
  );
}

function BeforeAfter(r: AdRecipe) {
  return (
    <Frame>
      <Bg url={r.sceneUrl} />
      {/* Séparateur central + libellés AVANT / APRÈS */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 4, marginLeft: -2, display: 'flex', background: 'rgba(255,255,255,.9)' }} />
      <div style={{ position: 'absolute', top: 130, left: 46, display: 'flex', background: 'rgba(0,0,0,.6)', color: WHITE, fontSize: 26, fontWeight: 700, padding: '8px 18px', borderRadius: 8, letterSpacing: 1 }}>AVANT</div>
      <div style={{ position: 'absolute', top: 130, right: 46, display: 'flex', background: r.accent, color: WHITE, fontSize: 26, fontWeight: 700, padding: '8px 18px', borderRadius: 8, letterSpacing: 1 }}>APRÈS</div>
      <div style={scrimTop} />
      <div style={scrimBottom} />
      <div style={{ position: 'absolute', top: 46, left: 52, right: 52, display: 'flex', justifyContent: 'center' }}>
        <Logo recipe={r} />
      </div>
      <div style={{ position: 'absolute', left: 52, right: 52, bottom: 52, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', textAlign: 'center', fontSize: 66, lineHeight: 1.03, fontWeight: 700, color: WHITE, letterSpacing: -1.2, textShadow: '0 3px 20px rgba(0,0,0,.55)' }}>{r.headline}</div>
        <div style={{ display: 'flex', marginTop: 30 }}><Cta recipe={r} /></div>
      </div>
    </Frame>
  );
}

function Testimonial(r: AdRecipe) {
  const rating = Math.max(0, Math.min(5, Math.round(r.rating ?? 5)));
  return (
    <Frame>
      <Bg url={r.sceneUrl} />
      <div style={scrimTop} />
      <div style={scrimBottom} />
      <div style={{ position: 'absolute', top: 46, left: 52, right: 52, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Logo recipe={r} />
      </div>
      <div style={{ position: 'absolute', left: 52, right: 52, bottom: 52, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,.96)', borderRadius: 26, padding: '30px 32px', boxShadow: '0 18px 40px rgba(0,0,0,.4)' }}>
          <div style={{ display: 'flex' }}>
            {Array.from({ length: rating }).map((_, i) => <Star key={i} size={34} />)}
          </div>
          <div style={{ display: 'flex', marginTop: 16, fontSize: 38, lineHeight: 1.22, fontWeight: 700, color: '#15151b', letterSpacing: -0.5 }}>“{r.quote || r.headline}”</div>
          {r.author ? <div style={{ display: 'flex', marginTop: 16, fontSize: 26, color: '#5a5a66' }}>{r.author}</div> : null}
        </div>
        <div style={{ display: 'flex', marginTop: 26 }}><Cta recipe={r} /></div>
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
      <div style={scrimBottom} />
      <div style={{ position: 'absolute', top: 46, left: 52, right: 52, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Logo recipe={r} />
        {r.badge ? <div style={pill(r.accent)}>{r.badge}</div> : <div style={{ display: 'flex' }} />}
      </div>
      <div style={{ position: 'absolute', top: 150, left: 52, right: 52, display: 'flex' }}>
        <div style={{ display: 'flex', fontSize: 64, lineHeight: 1.03, fontWeight: 700, color: WHITE, letterSpacing: -1.2, textShadow: '0 3px 18px rgba(0,0,0,.5)', maxWidth: 900 }}>{r.headline}</div>
      </div>
      <div style={{ position: 'absolute', left: 52, right: 52, bottom: 52, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', marginTop: i ? 14 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 999, background: r.accent }}>
                <svg width={22} height={22} viewBox="0 0 24 24" style={{ display: 'flex' }}><path d="M20 6L9 17l-5-5" fill="none" stroke={WHITE} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div style={{ display: 'flex', marginLeft: 16, fontSize: 34, fontWeight: 700, color: WHITE, textShadow: '0 2px 10px rgba(0,0,0,.5)' }}>{b}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: 30 }}><Cta recipe={r} /></div>
      </div>
    </Frame>
  );
}

function pill(accent: string) {
  return { display: 'flex', background: accent, color: WHITE, fontSize: 24, fontWeight: 700, padding: '10px 20px', borderRadius: 999, letterSpacing: 0.5 } as const;
}

function element(r: AdRecipe) {
  switch (r.template) {
    case 'before_after': return BeforeAfter(r);
    case 'testimonial': return Testimonial(r);
    case 'benefits': return Benefits(r);
    default: return ProblemSolution(r);
  }
}

/** Compose la publicité finale (scène + couche design) et renvoie un PNG. */
export async function renderAdPng(recipe: AdRecipe): Promise<ArrayBuffer> {
  const width = recipe.width ?? 1080;
  const height = recipe.height ?? 1350;
  const res = new ImageResponse(element(recipe), {
    width, height,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fonts: adFonts() as any,
  });
  return res.arrayBuffer();
}
