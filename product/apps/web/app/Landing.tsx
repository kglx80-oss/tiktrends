import Link from 'next/link';

/**
 * Page d'accueil publique · DA TikTrends (sombre magenta).
 * Rendue aux visiteurs anonymes ; les connectés sont renvoyés vers /dashboard
 * depuis app/page.tsx. Statique (aucun JS) · les animations sont en CSS pur et
 * respectent prefers-reduced-motion. Le mur de créatives est illustratif.
 */

type Ad = { grad: string; glow: string; tag: string; video: boolean; t: string; s: string; sc: string };

const ROW1: Ad[] = [
  { grad: 'linear-gradient(160deg,#3a1f2e,#20131d)', glow: 'rgba(255,92,138,0.5)', tag: 'Vidéo 9:16', video: true, t: 'Ta peau, version été', s: '-30% cette semaine', sc: '#ff5c8a' },
  { grad: 'linear-gradient(160deg,#1e2b33,#12181f)', glow: 'rgba(59,130,246,0.45)', tag: 'Statique', video: false, t: 'Hydratation 24h', s: 'Nouveau format', sc: '#8fbcff' },
  { grad: 'linear-gradient(160deg,#33291a,#1f1811)', glow: 'rgba(245,166,35,0.44)', tag: 'Statique', video: false, t: 'Le rituel du matin', s: 'Best-seller', sc: '#f5c37a' },
  { grad: 'linear-gradient(160deg,#1f3329,#131f18)', glow: 'rgba(24,204,140,0.4)', tag: 'Vidéo 9:16', video: true, t: 'Clean & vegan', s: 'Relu · français OK', sc: '#7fe3c0' },
  { grad: 'linear-gradient(160deg,#2a1a33,#17111f)', glow: 'rgba(167,92,255,0.45)', tag: 'Vidéo 9:16', video: true, t: 'Nouvelle formule', s: 'Édition limitée', sc: '#c79bff' },
  { grad: 'linear-gradient(160deg,#331a24,#1f1116)', glow: 'rgba(254,44,85,0.45)', tag: 'Vidéo 9:16', video: true, t: 'Offre de rentrée', s: 'Dernier jour', sc: '#ff5c8a' },
];

const ROW2: Ad[] = [
  { grad: 'linear-gradient(160deg,#1f3329,#131f18)', glow: 'rgba(24,204,140,0.4)', tag: 'Vidéo 9:16', video: true, t: 'Routine du soir', s: 'UGC · voix off', sc: '#7fe3c0' },
  { grad: 'linear-gradient(160deg,#331a24,#1f1116)', glow: 'rgba(254,44,85,0.42)', tag: 'Statique', video: false, t: 'Pack découverte', s: '2 achetés = 1 offert', sc: '#ff5c8a' },
  { grad: 'linear-gradient(160deg,#2a1a33,#17111f)', glow: 'rgba(167,92,255,0.42)', tag: 'Vidéo 9:16', video: true, t: 'Avant / après', s: 'Preuve produit', sc: '#c79bff' },
  { grad: 'linear-gradient(160deg,#1e2b33,#12181f)', glow: 'rgba(59,130,246,0.42)', tag: 'Statique', video: false, t: 'Testé & approuvé', s: '4,8/5 · avis clients', sc: '#8fbcff' },
  { grad: 'linear-gradient(160deg,#33291a,#1f1811)', glow: 'rgba(245,166,35,0.42)', tag: 'Vidéo 9:16', video: true, t: '3 raisons de tester', s: 'Format hook', sc: '#f5c37a' },
  { grad: 'linear-gradient(160deg,#3a1f2e,#20131d)', glow: 'rgba(255,92,138,0.44)', tag: 'Statique', video: false, t: 'Nouveauté', s: 'Précommande ouverte', sc: '#ff5c8a' },
];

const WALL: { g: string; glow: string }[] = [
  { g: 'linear-gradient(160deg,#3a1f2e,#20131d)', glow: 'rgba(255,92,138,0.5)' },
  { g: 'linear-gradient(160deg,#1e2b33,#12181f)', glow: 'rgba(59,130,246,0.45)' },
  { g: 'linear-gradient(160deg,#33291a,#1f1811)', glow: 'rgba(245,166,35,0.45)' },
  { g: 'linear-gradient(160deg,#1f3329,#131f18)', glow: 'rgba(24,204,140,0.42)' },
  { g: 'linear-gradient(160deg,#2a1a33,#17111f)', glow: 'rgba(167,92,255,0.45)' },
  { g: 'linear-gradient(160deg,#331a24,#1f1116)', glow: 'rgba(254,44,85,0.45)' },
  { g: 'linear-gradient(160deg,#1e2b33,#12181f)', glow: 'rgba(59,130,246,0.4)' },
  { g: 'linear-gradient(160deg,#33291a,#1f1811)', glow: 'rgba(245,166,35,0.4)' },
  { g: 'linear-gradient(160deg,#1f3329,#131f18)', glow: 'rgba(24,204,140,0.38)' },
  { g: 'linear-gradient(160deg,#2a1a33,#17111f)', glow: 'rgba(167,92,255,0.4)' },
  { g: 'linear-gradient(160deg,#331a24,#1f1116)', glow: 'rgba(254,44,85,0.4)' },
  { g: 'linear-gradient(160deg,#3a1f2e,#20131d)', glow: 'rgba(255,92,138,0.4)' },
  { g: 'linear-gradient(160deg,#1e2b33,#12181f)', glow: 'rgba(59,130,246,0.35)' },
  { g: 'linear-gradient(160deg,#33291a,#1f1811)', glow: 'rgba(245,166,35,0.35)' },
  { g: 'linear-gradient(160deg,#1f3329,#131f18)', glow: 'rgba(24,204,140,0.32)' },
  { g: 'linear-gradient(160deg,#2a1a33,#17111f)', glow: 'rgba(167,92,255,0.35)' },
];

const CSS = `
.lp{--ink:#f6eef4;--ink2:#cbbcc7;--muted:#9a8a98;color:var(--ink);font-family:'Geist','Helvetica Neue',Arial,sans-serif;overflow:hidden}
.lp *{box-sizing:border-box}
.lp h1,.lp h2,.lp h3,.lp p{margin:0}
.lp a{text-decoration:none;color:inherit}
html{scroll-behavior:smooth}
.lp-navlinks a{transition:color .18s ease}
.lp-wrap{max-width:1180px;margin:0 auto;padding:0 clamp(20px,5vw,40px)}
.lp-nav{position:sticky;top:0;z-index:20;backdrop-filter:blur(10px);background:rgba(18,8,16,0.7);border-bottom:1px solid rgba(255,255,255,0.08)}
.lp-navrow{height:70px;display:flex;align-items:center;justify-content:space-between}
.lp-navlinks{display:flex;align-items:center;gap:30px;font-size:15px;font-weight:500;color:var(--ink2)}
.lp-navlinks a:hover{color:var(--ink)}
.lp-dd-wrap{position:relative;display:flex;align-items:center}
.lp-dd-trigger{display:inline-flex;align-items:center;gap:5px;cursor:pointer;color:var(--ink2);font-size:15px;font-weight:500;background:none;border:0;padding:0;font-family:inherit;transition:color .18s ease}
.lp-dd-wrap:hover .lp-dd-trigger,.lp-dd-wrap:focus-within .lp-dd-trigger{color:var(--ink)}
.lp-dd-trigger svg{transition:transform .2s ease}
.lp-dd-wrap:hover .lp-dd-trigger svg,.lp-dd-wrap:focus-within .lp-dd-trigger svg{transform:rotate(180deg)}
.lp-dd{position:absolute;top:100%;left:50%;transform:translate(-50%,10px);padding-top:14px;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s ease,transform .18s ease;z-index:40}
.lp-dd-wrap:hover .lp-dd,.lp-dd-wrap:focus-within .lp-dd{opacity:1;visibility:visible;pointer-events:auto;transform:translate(-50%,0)}
.lp-dd-panel{width:520px;display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:16px;background:#1c121b;border:1px solid rgba(255,255,255,0.12);border-radius:16px;box-shadow:0 26px 64px -22px rgba(0,0,0,0.85)}
.lp-dd-head{font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);padding:4px 10px 8px}
.lp-dd-item{display:flex;gap:11px;align-items:flex-start;padding:9px 10px;border-radius:11px;transition:background .15s ease}
.lp-dd-item:hover{background:rgba(255,255,255,0.05)}
.lp-dd-ic{width:32px;height:32px;border-radius:9px;background:rgba(254,44,85,0.12);border:1px solid rgba(254,44,85,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.lp-dd-t{display:block;font-size:14px;font-weight:600;color:var(--ink)}
.lp-dd-d{display:block;font-size:12px;color:var(--muted);margin-top:1px}
.lp-pill{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);font-size:13px;color:var(--ink2);font-weight:500;transition:border-color .2s ease,background .2s ease}
.lp-pill:hover{border-color:rgba(255,255,255,0.26);background:rgba(255,255,255,0.07)}
.lp-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;background:linear-gradient(135deg,#fe2c55 0%,#ff2d8f 100%);color:#fff;border:0;border-radius:999px;padding:15px 28px;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 10px 30px -8px rgba(254,44,85,0.6);transition:transform .2s ease,box-shadow .2s ease}
.lp-btn:hover{transform:translateY(-2px);box-shadow:0 16px 40px -10px rgba(254,44,85,0.8)}
.lp-btn.sm{padding:11px 20px;font-size:14px}
.lp-ghost{display:inline-flex;align-items:center;justify-content:center;gap:9px;background:rgba(255,255,255,0.05);color:var(--ink);border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:15px 26px;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s ease,border-color .2s ease}
.lp-ghost:hover{background:rgba(255,255,255,0.09);border-color:rgba(255,255,255,0.28)}
.lp-card{background:#1c121b;border:1px solid rgba(255,255,255,0.10);border-radius:20px;box-shadow:0 2px 12px rgba(0,0,0,0.40);transition:transform .25s ease,border-color .25s ease,box-shadow .25s ease}
.lp-card:hover{transform:translateY(-3px);border-color:rgba(255,255,255,0.2);box-shadow:0 20px 44px -20px rgba(0,0,0,0.65)}
.lp-eyebrow{font-size:13px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#ff5c8a}
.lp-mono{font-family:'Geist Mono','SFMono-Regular',monospace}
.lp-muted{color:var(--muted)}.lp-ink2{color:var(--ink2)}
.lp-grad{background:linear-gradient(135deg,#fe2c55,#ff2d8f);-webkit-background-clip:text;background-clip:text;color:transparent}
.lp-h1{font-size:clamp(40px,6.6vw,70px);line-height:1.02;font-weight:850;letter-spacing:-0.035em;text-shadow:0 4px 40px rgba(0,0,0,0.6)}
.lp-h2{font-size:clamp(30px,4.2vw,44px);font-weight:800;letter-spacing:-0.025em}
.lp-feat{display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,4vw,50px);align-items:center}
.lp-g3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.lp-g4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.lp-adlabel{position:absolute;left:10px;right:10px;bottom:10px;z-index:3}
.lp-t{font-size:12px;font-weight:800;color:#fff;line-height:1.15}
.lp-s{font-size:9px;font-weight:800;margin-top:2px}
.lp-wall{position:absolute;inset:0;display:grid;grid-template-columns:repeat(8,1fr);gap:14px;padding:20px;opacity:1;transform:rotate(-6deg) scale(1.3);transform-origin:center;animation:lpFloaty 11s ease-in-out infinite}
.lp-wallcard{border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.09);position:relative;aspect-ratio:9/16}
.lp-marqmask{overflow:hidden;padding:14px 0;-webkit-mask-image:linear-gradient(90deg,transparent,#000 7%,#000 93%,transparent);mask-image:linear-gradient(90deg,transparent,#000 7%,#000 93%,transparent)}
.lp-marq{display:flex;gap:16px;width:max-content;animation:lpMarqL 44s linear infinite}
.lp-marq.rev{animation-name:lpMarqR;animation-duration:52s}
.lp-marq:hover{animation-play-state:paused}
.lp-gcard{flex:0 0 200px;width:200px;aspect-ratio:9/16;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);position:relative;box-shadow:0 16px 40px -14px rgba(0,0,0,0.6);transition:transform .3s ease,box-shadow .3s ease}
.lp-gcard:hover{transform:translateY(-8px) scale(1.02);box-shadow:0 26px 54px -16px rgba(0,0,0,0.75)}
.lp-play{position:absolute;top:42%;left:50%;transform:translate(-50%,-50%);width:46px;height:46px;border-radius:999px;background:rgba(255,255,255,0.16);border:1px solid rgba(255,255,255,0.42);display:flex;align-items:center;justify-content:center}
.lp-tag{position:absolute;top:10px;left:10px;font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;background:rgba(0,0,0,0.42);color:var(--ink2)}
.lp-rise{animation:lpRise .7s cubic-bezier(.2,.7,.2,1) both}
.lp-d1{animation-delay:.06s}.lp-d2{animation-delay:.16s}.lp-d3{animation-delay:.26s}.lp-d4{animation-delay:.36s}.lp-d5{animation-delay:.46s}
@keyframes lpMarqL{from{transform:translateX(0)}to{transform:translateX(-1296px)}}
@keyframes lpMarqR{from{transform:translateX(-1296px)}to{transform:translateX(0)}}
@keyframes lpRise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
@keyframes lpFloaty{0%,100%{transform:rotate(-6deg) scale(1.3) translateY(0)}50%{transform:rotate(-6deg) scale(1.3) translateY(-16px)}}
@keyframes lpEnter{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
.lp-reveal{animation:lpEnter .8s cubic-bezier(.2,.7,.2,1) both;animation-timeline:view();animation-range:entry 0% cover 30%}
.lp-thumb{position:relative;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)}
.lp-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04)}
.lp-live{width:8px;height:8px;border-radius:999px;background:#18cc8c;box-shadow:0 0 0 0 rgba(24,204,140,.5);animation:lpPing 2.4s ease-out infinite}
@keyframes lpPing{0%{box-shadow:0 0 0 0 rgba(24,204,140,.5)}70%,100%{box-shadow:0 0 0 9px rgba(24,204,140,0)}}
.lp-pickcard{position:relative;transition:transform .2s ease,border-color .2s ease}
.lp-pickcard:hover{transform:translateY(-3px)}
.lp-check{position:absolute;top:8px;right:8px;width:20px;height:20px;border-radius:999px;background:linear-gradient(135deg,#fe2c55,#ff2d8f);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px -2px rgba(254,44,85,0.6)}
.lp-bar{position:relative;height:11px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden}
.lp-barfill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;transform-origin:left;animation:lpGrow 1s cubic-bezier(.2,.7,.2,1) both;animation-timeline:view();animation-range:cover 6% cover 42%}
@keyframes lpGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (max-width:820px){
  .lp-navlinks{display:none}
  .lp-feat{grid-template-columns:1fr}
  .lp-g3{grid-template-columns:1fr}
  .lp-g4{grid-template-columns:1fr 1fr}
}
@media (prefers-reduced-motion:reduce){
  .lp-marq,.lp-rise,.lp-wall,.lp-reveal,.lp-barfill,.lp-live{animation:none!important}
  .lp-gcard,.lp-btn,.lp-ghost,.lp-card,.lp-pill,.lp-pickcard{transition:none}
  html{scroll-behavior:auto}
}
`;

function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#1c121b" />
      <path d="M16 5.5l2.2 7.3 7.3 2.2-7.3 2.2-2.2 7.3-2.2-7.3-7.3-2.2 7.3-2.2z" fill="#fe2c55" />
    </svg>
  );
}

function Check({ stroke = '#ff5c8a', size = 15 }: { stroke?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function AdCard({ c }: { c: Ad }) {
  return (
    <div className="lp-gcard" style={{ background: c.grad }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(58% 40% at 50% 40%, ${c.glow}, transparent 72%)` }} />
      <span className="lp-tag">{c.tag}</span>
      <svg viewBox="0 0 100 178" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <rect x="36" y="60" width="28" height="46" rx="8" fill="#f6eef4" />
        <rect x="42" y="72" width="16" height="6" rx="3" fill="#fe2c55" opacity="0.85" />
      </svg>
      {c.video && (
        <span className="lp-play">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M8 5v14l11-7z" /></svg>
        </span>
      )}
      <div className="lp-adlabel">
        <div className="lp-t">{c.t}</div>
        <div className="lp-s" style={{ color: c.sc }}>{c.s}</div>
      </div>
    </div>
  );
}

function Thumb({ grad, glow, style }: { grad: string; glow: string; style?: React.CSSProperties }) {
  return (
    <div className="lp-thumb" style={{ background: grad, ...style }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(72% 62% at 50% 42%, ${glow}, transparent 72%)` }} />
      <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <rect x="40" y="24" width="20" height="46" rx="6" fill="#f6eef4" opacity="0.9" />
        <rect x="45" y="36" width="10" height="5" rx="2.5" fill="#ffffff" opacity="0.45" />
      </svg>
    </div>
  );
}

const JSONLD = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': 'https://app.tiktrends.co/#org', name: 'TikTrends', url: 'https://app.tiktrends.co/' },
    { '@type': 'WebSite', '@id': 'https://app.tiktrends.co/#site', url: 'https://app.tiktrends.co/', name: 'TikTrends', inLanguage: 'fr-FR', publisher: { '@id': 'https://app.tiktrends.co/#org' } },
    {
      '@type': 'SoftwareApplication',
      name: 'TikTrends',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'fr-FR',
      description: 'Génère des publicités statiques et vidéo, teste par lots et laisse la donnée trancher. La création publicitaire en boucle fermée.',
      url: 'https://app.tiktrends.co/',
      offers: { '@type': 'AggregateOffer', priceCurrency: 'EUR', lowPrice: '0', highPrice: '990', offerCount: '4' },
    },
  ],
};

export function Landing() {
  const feature = { display: 'flex', gap: 13, alignItems: 'flex-start' as const };
  const featIcon = { width: 26, height: 26, borderRadius: 8, background: 'rgba(254,44,85,0.16)', border: '1px solid rgba(254,44,85,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } as const;
  return (
    <div className="lp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }} />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* NAV */}
      <nav className="lp-nav">
        <div className="lp-wrap lp-navrow">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <Logo />
            <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>TikTrends</span>
          </div>
          <div className="lp-navlinks">
            <a href="#galerie">Créatives</a>
            <a href="#methode">Méthode</a>
            <div className="lp-dd-wrap">
              <button type="button" className="lp-dd-trigger" aria-haspopup="true">
                Ressources
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
              </button>
              <div className="lp-dd" role="menu">
                <div className="lp-dd-panel">
                  <div>
                    <div className="lp-dd-head">Le produit</div>
                    {[
                      { t: 'Créatives winneuses', d: 'La galerie de rendus', href: '#galerie', icon: (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ff5c8a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>) },
                      { t: 'La méthode', d: 'Hypothèse → itération → résultat', href: '#methode', icon: (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ff5c8a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 3h6M10 3v6.5L5 19a1 1 0 0 0 .9 1.5h12.2A1 1 0 0 0 19 19l-5-9.5V3" /></svg>) },
                      { t: 'Adsmap', d: 'Le laboratoire de test', href: '#adsmap', icon: (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ff5c8a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></svg>) },
                    ].map((it) => (
                      <a key={it.t} href={it.href} className="lp-dd-item" role="menuitem">
                        <span className="lp-dd-ic">{it.icon}</span>
                        <span><span className="lp-dd-t">{it.t}</span><span className="lp-dd-d">{it.d}</span></span>
                      </a>
                    ))}
                  </div>
                  <div>
                    <div className="lp-dd-head">L'entreprise</div>
                    {[
                      { t: 'Mentions légales', d: 'Éditeur & hébergeur', href: '/legal/mentions-legales' },
                      { t: 'CGV', d: 'Conditions de vente', href: '/legal/cgv' },
                      { t: 'Confidentialité', d: 'Vos données', href: '/legal/confidentialite' },
                    ].map((it) => (
                      <Link key={it.t} href={it.href} className="lp-dd-item" role="menuitem">
                        <span className="lp-dd-ic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ff5c8a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg></span>
                        <span><span className="lp-dd-t">{it.t}</span><span className="lp-dd-d">{it.d}</span></span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <Link href="/tarifs">Tarifs</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link href="/login" style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-2)' }}>Connexion</Link>
            <Link href="/signup" className="lp-btn sm">Démarrer</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="lp-wall" aria-hidden>
          {WALL.map((w, i) => (
            <div key={i} className="lp-wallcard" style={{ background: w.g }}>
              <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(60% 45% at 50% 40%, ${w.glow}, transparent 72%)` }} />
            </div>
          ))}
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(1100px 600px at 50% 40%,rgba(18,8,16,0.55),rgba(18,8,16,0.82) 72%,#120810 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 0%,transparent 58%,#120810 100%)' }} />
        <div className="lp-wrap" style={{ position: 'relative', zIndex: 5, padding: '104px 40px 124px', textAlign: 'center' }}>
          <div className="lp-pill lp-rise lp-d1" style={{ marginBottom: 26 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: '#fe2c55' }} />
            Créer, mesurer, itérer · en un seul outil
          </div>
          <h1 className="lp-h1 lp-rise lp-d2">La créative<br />devient une <span className="lp-grad">science</span></h1>
          <p className="lp-ink2 lp-rise lp-d3" style={{ fontSize: 20, maxWidth: 640, margin: '24px auto 0', lineHeight: 1.55 }}>
            Pose une hypothèse, génère des variantes statiques et vidéo, teste par lots et laisse le protocole trancher. Tu trouves tes créatives gagnantes plus vite, avec des preuves.
          </p>
          <div className="lp-rise lp-d4" style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 36, flexWrap: 'wrap' }}>
            <Link href="/signup" className="lp-btn">Démarrer gratuitement</Link>
            <a href="#methode" className="lp-ghost">Voir la méthode</a>
          </div>
          <p className="lp-muted lp-rise lp-d5" style={{ fontSize: 13, marginTop: 16 }}>Plan gratuit · sans carte bancaire · français natif</p>
        </div>
      </header>

      {/* PROBLÈME */}
      <section className="lp-wrap lp-reveal" style={{ padding: '64px 40px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div className="lp-eyebrow" style={{ marginBottom: 14, color: '#f5a623' }}>Le problème</div>
          <h2 className="lp-h2">Créer à l'aveugle coûte cher</h2>
          <p className="lp-muted" style={{ fontSize: 15, maxWidth: 520, margin: '14px auto 0' }}>La plupart des créatives partent en média sans qu'on sache lesquelles vont gagner. On dépense, on espère, on recommence.</p>
        </div>
        <div className="lp-g3">
          {[
            { t: 'Tu devines', d: "Quelle accroche, quel angle, quel format ? Personne ne sait avant d'avoir dépensé.", icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f5c37a" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>) },
            { t: 'Tu brûles du budget', d: 'Chaque test raté part en dépenses média, sans apprentissage réutilisable.', icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f5c37a" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>) },
            { t: 'Tu repars de zéro', d: 'À chaque campagne, la page blanche · rien ne capitalise sur ce qui a déjà gagné.', icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f5c37a" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>) },
          ].map((p) => (
            <div key={p.t} className="lp-card" style={{ padding: 28 }}>
              <span style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>{p.icon}</span>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{p.t}</h3>
              <p className="lp-muted" style={{ fontSize: 14 }}>{p.d}</p>
            </div>
          ))}
        </div>
        <p className="lp-ink2" style={{ textAlign: 'center', fontSize: 16, marginTop: 26 }}>TikTrends ferme la boucle · tu ne scales que ce que la donnée valide.</p>
      </section>

      {/* MÉTHODE */}
      <section id="methode" className="lp-wrap lp-reveal" style={{ padding: '64px 40px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div className="lp-eyebrow" style={{ marginBottom: 14 }}>La méthode</div>
          <h2 className="lp-h2">Hypothèse, itération, résultat mesuré</h2>
          <p className="lp-muted" style={{ fontSize: 15, maxWidth: 520, margin: '14px auto 0' }}>Faire et gérer les hypothèses pour affiner les résultats et trouver plus vite de nouvelles gagnantes. C'est tout le cap du produit.</p>
        </div>
        <div className="lp-g3">
          <div className="lp-card" style={{ padding: 28 }}>
            <div className="lp-mono" style={{ fontSize: 13, color: '#ff5c8a', fontWeight: 600, marginBottom: 14 }}>01 / hypothèse</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Formule une intuition</h3>
            <p className="lp-muted" style={{ fontSize: 14 }}>« La preuve sociale bat le prix sur ce produit. » Tu pars de la Veille et du Radar produits pour choisir l'angle à tester.</p>
          </div>
          <div className="lp-card" style={{ padding: 28 }}>
            <div className="lp-mono" style={{ fontSize: 13, color: '#ff5c8a', fontWeight: 600, marginBottom: 14 }}>02 / itération</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Génère un lot</h3>
            <p className="lp-muted" style={{ fontSize: 14 }}>Le Studio IA produit les variantes, statique et vidéo, avec directions artistiques. Le tri des propositions garde les meilleures.</p>
          </div>
          <div className="lp-card" style={{ padding: 28 }}>
            <div className="lp-mono" style={{ fontSize: 13, color: '#ff5c8a', fontWeight: 600, marginBottom: 14 }}>03 / résultat</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Mesure et tranche</h3>
            <p className="lp-muted" style={{ fontSize: 14 }}>Le protocole compare à la référence avec un effectif minimum. Tu sais quel angle gagne, et tu relances dessus.</p>
          </div>
        </div>
      </section>

      {/* GALERIE */}
      <section id="galerie" className="lp-reveal">
        <div className="lp-wrap" style={{ padding: '56px 40px 14px', textAlign: 'center' }}>
          <div className="lp-eyebrow" style={{ marginBottom: 14 }}>La galerie</div>
          <h2 className="lp-h2">Un flux de gagnantes potentielles, en continu</h2>
          <p className="lp-ink2" style={{ fontSize: 17, maxWidth: 620, margin: '16px auto 0' }}>Illustrations du rendu · statique et vidéo, produit fidèle, français relu. Survole pour arrêter le défilement.</p>
        </div>
        <div style={{ padding: '14px 0 8px' }}>
          <div className="lp-marqmask">
            <div className="lp-marq">{[...ROW1, ...ROW1].map((c, i) => <AdCard key={`a${i}`} c={c} />)}</div>
          </div>
          <div className="lp-marqmask">
            <div className="lp-marq rev">{[...ROW2, ...ROW2].map((c, i) => <AdCard key={`b${i}`} c={c} />)}</div>
          </div>
        </div>
      </section>

      {/* STUDIO IA */}
      <section className="lp-wrap lp-reveal" style={{ padding: '60px 40px 20px' }}>
        <div className="lp-feat">
          <div>
            <div className="lp-eyebrow" style={{ marginBottom: 14 }}>Studio IA</div>
            <h2 className="lp-h2" style={{ marginBottom: 16 }}>Chaque mode dit ce qu'il garantit</h2>
            <p className="lp-ink2" style={{ fontSize: 16, marginBottom: 20 }}>Deux façons de fabriquer une publicité, et une promesse claire à chaque fois · une garantie, pas une moyenne. Le modèle produit la pub entière à partir de la photo produit et d'une copie écrite par Jarvis.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={feature}><span style={featIcon}><Check /></span><div><b>Composée</b> <span className="lp-muted">· textes exacts à tous les coups, mise en page prévisible</span></div></div>
              <div style={feature}><span style={featIcon}><Check /></span><div><b>Générée entièrement</b> <span className="lp-muted">· rendu d'agence, relu automatiquement</span></div></div>
              <div style={feature}><span style={featIcon}><Check /></span><div><b>Scène, lumière, typo, disposition</b> <span className="lp-muted">· une direction complète, pas une phrase</span></div></div>
            </div>
          </div>
          <div className="lp-card" style={{ padding: 24, background: 'linear-gradient(160deg,#221320,#16101a)' }}>
            <div style={{ display: 'flex', gap: 7, marginBottom: 16 }}>
              {[0, 1, 2].map((i) => <span key={i} style={{ flex: 1, height: 6, borderRadius: 999, background: 'linear-gradient(90deg,#fe2c55,#ff5c8a)' }} />)}
              {[3, 4].map((i) => <span key={i} style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.14)' }} />)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div className="lp-muted lp-mono" style={{ fontSize: 12 }}>étape 3 · Direction artistique</div>
              <span className="lp-chip" style={{ color: 'var(--ink2)' }}>3 / 5</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {[
                { t: 'Studio lumière douce', grad: 'linear-gradient(160deg,#3a1f2e,#20131d)', glow: 'rgba(255,92,138,0.55)', sel: true },
                { t: 'Dark cinématique', grad: 'linear-gradient(160deg,#1e2b33,#12181f)', glow: 'rgba(59,130,246,0.5)', sel: false },
                { t: 'Naturel clair', grad: 'linear-gradient(160deg,#1f3329,#131f18)', glow: 'rgba(24,204,140,0.5)', sel: false },
              ].map((d) => (
                <div key={d.t} className="lp-pickcard" style={{ border: d.sel ? '1px solid rgba(254,44,85,0.6)' : '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 10, background: d.sel ? 'rgba(254,44,85,0.08)' : 'transparent' }}>
                  <Thumb grad={d.grad} glow={d.glow} style={{ height: 46, marginBottom: 9 }} />
                  {d.sel && (
                    <span className="lp-check">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
                    </span>
                  )}
                  <div className={d.sel ? '' : 'lp-ink2'} style={{ fontSize: 11, fontWeight: 700 }}>{d.t}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <span className="lp-btn sm">Continuer</span>
            </div>
          </div>
        </div>
      </section>

      {/* OBSERVATOIRE */}
      <section className="lp-wrap lp-reveal" style={{ padding: '60px 40px 20px' }}>
        <div className="lp-feat">
          <div className="lp-card" style={{ padding: 22, background: 'linear-gradient(160deg,#141a22,#111318)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span className="lp-live" />
                <div style={{ fontSize: 13, fontWeight: 700 }}>Ce qui scale · cette semaine</div>
              </div>
              <span className="lp-chip" style={{ color: 'var(--ink2)' }}>Beauté</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { g: 'linear-gradient(160deg,#3a1f2e,#20131d)', glow: 'rgba(255,92,138,0.5)', t: 'Pub concurrente · sérum', m: 'en hausse · 6 variantes actives', tag: '↑ scale', tc: '#18cc8c', spark: '0,13 13,11 26,10 39,5 52,2' },
                { g: 'linear-gradient(160deg,#1e2b33,#12181f)', glow: 'rgba(59,130,246,0.45)', t: 'Pub concurrente · crème', m: 'stable · 3 variantes', tag: '→ stable', tc: '#9a8a98', spark: '0,8 13,7 26,9 39,7 52,8' },
                { g: 'linear-gradient(160deg,#33291a,#1f1811)', glow: 'rgba(245,166,35,0.45)', t: 'Produit qui monte · roll-on', m: 'radar produits', tag: 'nouveau', tc: '#f5a623', spark: '0,14 13,12 26,9 39,7 52,4' },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 11, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <Thumb grad={r.g} glow={r.glow} style={{ width: 40, height: 52, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.t}</div>
                    <div className="lp-muted" style={{ fontSize: 11 }}>{r.m}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <svg width="52" height="16" viewBox="0 0 52 16" fill="none" aria-hidden><polyline points={r.spark} stroke={r.tc} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span style={{ fontSize: 11, fontWeight: 800, color: r.tc }}>{r.tag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="lp-eyebrow" style={{ marginBottom: 14 }}>Observatoire</div>
            <h2 className="lp-h2" style={{ marginBottom: 16 }}>Pars d'un signal, pas d'une page blanche</h2>
            <p className="lp-ink2" style={{ fontSize: 16, marginBottom: 18 }}>La Veille te montre le mur des pubs qui tournent chez tes concurrents, filtré par ce qui scale réellement. Le Radar produits repère ceux qui montent · ton hypothèse démarre là.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {['Mur des pubs', 'Ce qui scale', 'Radar produits', 'Sauvegardes', 'Tagging'].map((p) => <span key={p} className="lp-pill">{p}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* ADSMAP */}
      <section id="adsmap" className="lp-wrap lp-reveal" style={{ padding: '60px 40px 30px' }}>
        <div className="lp-feat">
          <div>
            <div className="lp-eyebrow" style={{ marginBottom: 14, color: '#7fe3c0' }}>Laboratoire · Adsmap</div>
            <h2 className="lp-h2" style={{ marginBottom: 16 }}>Laisse la donnée dire qui gagne</h2>
            <p className="lp-ink2" style={{ fontSize: 16, marginBottom: 18 }}>Le protocole compare à la référence, pas à zéro, avec un effectif minimum avant qu'un groupe ait le droit de parler. Chaque pub est relue à sa génération, le constat s'affiche, et le cumul dit quel moteur réécrit le mieux.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {['Suites', 'Lots de test', 'Tri des propositions', 'Protocole & seuils'].map((p) => <span key={p} className="lp-pill">{p}</span>)}
            </div>
          </div>
          <div className="lp-card" style={{ padding: 24, background: 'linear-gradient(160deg,#131f1a,#111614)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Bilan de relecture · lot #17</div>
              <span className="lp-chip" style={{ color: '#7fe3c0', borderColor: 'rgba(24,204,140,0.35)', background: 'rgba(24,204,140,0.1)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7fe3c0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
                effectif atteint
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { n: 'Moteur A', w: '81%', bar: 'linear-gradient(90deg,#18cc8c,#7fe3c0)', vc: '#7fe3c0', win: true },
                { n: 'Moteur B', w: '52%', bar: 'rgba(255,255,255,0.28)', vc: '#9a8a98', win: false },
                { n: 'Référence', w: '48%', bar: 'rgba(255,255,255,0.18)', vc: '#9a8a98', win: false },
              ].map((r) => (
                <div key={r.n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="lp-ink2" style={{ width: 70, fontSize: 12 }}>{r.n}</span>
                  <span className="lp-bar" style={{ flex: 1 }}>
                    <span className="lp-barfill" style={{ width: r.w, background: r.bar, boxShadow: r.win ? '0 0 16px rgba(24,204,140,0.55)' : 'none' }} />
                  </span>
                  <span style={{ fontSize: 12, color: r.vc, fontWeight: 800, width: 38, textAlign: 'right' }}>{r.w}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: 'rgba(24,204,140,0.08)', border: '1px solid rgba(24,204,140,0.25)', fontSize: 12, color: '#7fe3c0' }}>Intervalle qui exclut le taux général · le Moteur A gagne, on relance dessus.</div>
          </div>
        </div>
      </section>

      {/* TARIFS */}
      <section id="tarifs" className="lp-reveal">
        <div className="lp-wrap" style={{ padding: '60px 40px 28px', textAlign: 'center' }}>
          <div className="lp-eyebrow" style={{ marginBottom: 14 }}>Tarifs</div>
          <h2 className="lp-h2">Un tarif par niveau de la boucle</h2>
        </div>
        <div className="lp-wrap" style={{ paddingBottom: 40 }}>
          <div className="lp-g4">
            {[
              { n: 'Starter', p: '0€', per: '', d: 'Observer · Dashboard, Analytics, Tagging', hot: false },
              { n: 'Core', p: '99€', per: '/mois', d: 'Créer · Studio IA, Jarvis, Veille', hot: false },
              { n: 'Plus', p: '299€', per: '/mois', d: 'Tester · Adsmap complet, protocole', hot: true },
              { n: 'Business', p: '990€', per: '/mois', d: 'Piloter · marques multiples, rôles', hot: false },
            ].map((t) => (
              <div key={t.n} className="lp-card" style={{ padding: 24, position: 'relative', ...(t.hot ? { border: '1.5px solid rgba(254,44,85,0.6)', background: 'linear-gradient(160deg,#241320,#1a1019)' } : {}) }}>
                {t.hot && <span style={{ position: 'absolute', top: -11, left: 24, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', padding: '4px 11px', borderRadius: 999, background: 'linear-gradient(135deg,#fe2c55,#ff2d8f)', color: '#fff' }}>Recommandé</span>}
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>{t.n}</h3>
                <div style={{ margin: '12px 0 6px', fontSize: 34, fontWeight: 850 }}>{t.p}<span className="lp-muted" style={{ fontSize: 14 }}>{t.per}</span></div>
                <p className={t.hot ? 'lp-ink2' : 'lp-muted'} style={{ fontSize: 13 }}>{t.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="lp-reveal" style={{ position: 'relative', overflow: 'hidden', marginTop: 20 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(700px 340px at 50% 100%,rgba(254,44,85,0.3),transparent 65%)' }} />
        <div className="lp-wrap" style={{ position: 'relative', zIndex: 2, padding: '90px 40px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(34px,5vw,52px)', fontWeight: 850, letterSpacing: '-0.03em', maxWidth: 760, margin: '0 auto', textWrap: 'balance' }}>Arrête de deviner. Mesure, et trouve tes gagnantes.</h2>
          <p className="lp-ink2" style={{ fontSize: 19, maxWidth: 540, margin: '20px auto 0' }}>Plan gratuit, sans carte bancaire. La boucle démarre à ta première hypothèse.</p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 32, flexWrap: 'wrap' }}>
            <Link href="/signup" className="lp-btn">Démarrer gratuitement</Link>
            <Link href="/login" className="lp-ghost">J'ai déjà un compte</Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: '#0d070c' }}>
        <div className="lp-wrap" style={{ padding: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo size={26} />
            <span style={{ fontSize: 17, fontWeight: 800 }}>TikTrends</span>
          </div>
          <div style={{ display: 'flex', gap: 26, color: 'var(--muted)', fontSize: 13, flexWrap: 'wrap' }}>
            <a href="#galerie">Créatives</a>
            <a href="#methode">Méthode</a>
            <a href="#adsmap">Adsmap</a>
            <a href="#tarifs">Tarifs</a>
            <Link href="/legal/mentions-legales">Mentions légales</Link>
          </div>
          <div className="lp-muted" style={{ fontSize: 12 }}>© 2026 TikTrends</div>
        </div>
      </footer>
    </div>
  );
}
