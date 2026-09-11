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
.lp-wrap{max-width:1180px;margin:0 auto;padding:0 clamp(20px,5vw,40px)}
.lp-nav{position:sticky;top:0;z-index:20;backdrop-filter:blur(10px);background:rgba(18,8,16,0.7);border-bottom:1px solid rgba(255,255,255,0.08)}
.lp-navrow{height:70px;display:flex;align-items:center;justify-content:space-between}
.lp-navlinks{display:flex;align-items:center;gap:30px;font-size:15px;font-weight:500;color:var(--ink2)}
.lp-navlinks a:hover{color:var(--ink)}
.lp-pill{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);font-size:13px;color:var(--ink2);font-weight:500}
.lp-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;background:linear-gradient(135deg,#fe2c55 0%,#ff2d8f 100%);color:#fff;border:0;border-radius:999px;padding:15px 28px;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 10px 30px -8px rgba(254,44,85,0.6);transition:transform .2s ease,box-shadow .2s ease}
.lp-btn:hover{transform:translateY(-2px);box-shadow:0 16px 40px -10px rgba(254,44,85,0.8)}
.lp-btn.sm{padding:11px 20px;font-size:14px}
.lp-ghost{display:inline-flex;align-items:center;justify-content:center;gap:9px;background:rgba(255,255,255,0.05);color:var(--ink);border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:15px 26px;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s ease,border-color .2s ease}
.lp-ghost:hover{background:rgba(255,255,255,0.09);border-color:rgba(255,255,255,0.28)}
.lp-card{background:#1c121b;border:1px solid rgba(255,255,255,0.10);border-radius:20px;box-shadow:0 2px 12px rgba(0,0,0,0.40)}
.lp-eyebrow{font-size:13px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#ff5c8a}
.lp-mono{font-family:'Geist Mono','SFMono-Regular',monospace}
.lp-muted{color:var(--muted)}.lp-ink2{color:var(--ink2)}
.lp-grad{background:linear-gradient(135deg,#fe2c55,#ff2d8f);-webkit-background-clip:text;background-clip:text;color:transparent}
.lp-h1{font-size:clamp(40px,6.6vw,70px);line-height:1.02;font-weight:850;letter-spacing:-0.035em;max-width:900px;margin:0 auto;text-wrap:balance;text-shadow:0 4px 40px rgba(0,0,0,0.6)}
.lp-h2{font-size:clamp(30px,4.2vw,44px);font-weight:800;letter-spacing:-0.025em}
.lp-feat{display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,4vw,50px);align-items:center}
.lp-g3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.lp-g4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.lp-adlabel{position:absolute;left:10px;right:10px;bottom:10px;z-index:3}
.lp-t{font-size:12px;font-weight:800;color:#fff;line-height:1.15}
.lp-s{font-size:9px;font-weight:800;margin-top:2px}
.lp-wall{position:absolute;inset:0;display:grid;grid-template-columns:repeat(8,1fr);gap:14px;padding:20px;opacity:0.9;transform:rotate(-6deg) scale(1.3);transform-origin:center;animation:lpFloaty 11s ease-in-out infinite}
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
@media (max-width:820px){
  .lp-navlinks{display:none}
  .lp-feat{grid-template-columns:1fr}
  .lp-g3{grid-template-columns:1fr}
  .lp-g4{grid-template-columns:1fr 1fr}
}
@media (prefers-reduced-motion:reduce){
  .lp-marq,.lp-rise,.lp-wall{animation:none!important}
  .lp-gcard,.lp-btn,.lp-ghost{transition:none}
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

export function Landing() {
  const feature = { display: 'flex', gap: 13, alignItems: 'flex-start' as const };
  const featIcon = { width: 26, height: 26, borderRadius: 8, background: 'rgba(254,44,85,0.16)', border: '1px solid rgba(254,44,85,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } as const;
  return (
    <div className="lp">
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
            <a href="#adsmap">Adsmap</a>
            <a href="#tarifs">Tarifs</a>
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
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 520px at 50% 42%,rgba(18,8,16,0.86),rgba(18,8,16,0.94) 70%,#120810 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 0%,transparent 55%,#120810 100%)' }} />
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

      {/* MÉTHODE */}
      <section id="methode" className="lp-wrap" style={{ padding: '64px 40px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 30 }}>
          <div>
            <div className="lp-eyebrow" style={{ marginBottom: 12 }}>La méthode</div>
            <h2 className="lp-h2" style={{ maxWidth: 560 }}>Hypothèse, itération, résultat mesuré</h2>
          </div>
          <p className="lp-muted" style={{ fontSize: 15, maxWidth: 360 }}>Faire et gérer les hypothèses pour affiner les résultats et trouver plus vite de nouvelles gagnantes. C'est tout le cap du produit.</p>
        </div>
        <div className="lp-g3">
          <div className="lp-card" style={{ padding: 28 }}>
            <div className="lp-mono" style={{ fontSize: 13, color: '#ff5c8a', fontWeight: 600, marginBottom: 14 }}>01 / hypothèse</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Formule une intuition</h3>
            <p className="lp-muted" style={{ fontSize: 14 }}>« La preuve sociale bat le prix sur ce produit. » Tu pars de la Veille et du Radar produits pour choisir l'angle à tester.</p>
          </div>
          <div className="lp-card" style={{ padding: 28, borderColor: 'rgba(254,44,85,0.3)' }}>
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
      <section id="galerie">
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
      <section className="lp-wrap" style={{ padding: '60px 40px 20px' }}>
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
            <div style={{ display: 'flex', gap: 7, marginBottom: 18 }}>
              {[0, 1, 2].map((i) => <span key={i} style={{ flex: 1, height: 6, borderRadius: 999, background: '#fe2c55' }} />)}
              {[3, 4].map((i) => <span key={i} style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.14)' }} />)}
            </div>
            <div className="lp-muted lp-mono" style={{ fontSize: 12, marginBottom: 14 }}>étape 3 · Direction artistique</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              <div style={{ border: '1px solid rgba(254,44,85,0.5)', borderRadius: 12, padding: 12, background: 'rgba(254,44,85,0.08)' }}><div style={{ height: 44, borderRadius: 8, background: 'linear-gradient(160deg,#3a1f2e,#20131d)', marginBottom: 8 }} /><div style={{ fontSize: 11, fontWeight: 700 }}>Studio lumière douce</div></div>
              <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12 }}><div style={{ height: 44, borderRadius: 8, background: 'linear-gradient(160deg,#1e2b33,#12181f)', marginBottom: 8 }} /><div className="lp-ink2" style={{ fontSize: 11, fontWeight: 700 }}>Dark cinématique</div></div>
              <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12 }}><div style={{ height: 44, borderRadius: 8, background: 'linear-gradient(160deg,#1f3329,#131f18)', marginBottom: 8 }} /><div className="lp-ink2" style={{ fontSize: 11, fontWeight: 700 }}>Naturel clair</div></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <span style={{ display: 'inline-flex', padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 999, background: 'linear-gradient(135deg,#fe2c55,#ff2d8f)', color: '#fff' }}>Continuer</span>
            </div>
          </div>
        </div>
      </section>

      {/* OBSERVATOIRE */}
      <section className="lp-wrap" style={{ padding: '60px 40px 20px' }}>
        <div className="lp-feat">
          <div className="lp-card" style={{ padding: 22, background: 'linear-gradient(160deg,#141a22,#111318)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Ce qui scale · cette semaine</div>
              <span className="lp-pill" style={{ padding: '5px 11px', fontSize: 11 }}>Beauté</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { g: 'linear-gradient(160deg,#3a1f2e,#20131d)', t: 'Pub concurrente · sérum', m: 'en hausse · 6 variantes actives', tag: '↑ scale', tc: '#18cc8c' },
                { g: 'linear-gradient(160deg,#1e2b33,#12181f)', t: 'Pub concurrente · crème', m: 'stable · 3 variantes', tag: '→ stable', tc: 'var(--muted)' },
                { g: 'linear-gradient(160deg,#33291a,#1f1811)', t: 'Produit qui monte · roll-on', m: 'radar produits', tag: 'nouveau', tc: '#f5a623' },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 11, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ width: 40, height: 52, borderRadius: 8, background: r.g, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.t}</div>
                    <div className="lp-muted" style={{ fontSize: 11 }}>{r.m}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: r.tc }}>{r.tag}</span>
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
      <section id="adsmap" className="lp-wrap" style={{ padding: '60px 40px 30px' }}>
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
              <span style={{ fontSize: 11, color: '#7fe3c0', fontWeight: 700 }}>effectif atteint</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { n: 'Moteur A', w: '81%', bar: 'linear-gradient(90deg,#18cc8c,#7fe3c0)', vc: '#7fe3c0' },
                { n: 'Moteur B', w: '52%', bar: 'rgba(255,255,255,0.28)', vc: 'var(--muted)' },
                { n: 'Référence', w: '48%', bar: 'rgba(255,255,255,0.18)', vc: 'var(--muted)' },
              ].map((r) => (
                <div key={r.n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="lp-ink2" style={{ width: 70, fontSize: 12 }}>{r.n}</span>
                  <span style={{ flex: 1, height: 11, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: r.w, height: '100%', background: r.bar }} />
                  </span>
                  <span style={{ fontSize: 12, color: r.vc, fontWeight: 800 }}>{r.w}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: 'rgba(24,204,140,0.08)', border: '1px solid rgba(24,204,140,0.25)', fontSize: 12, color: '#7fe3c0' }}>Intervalle qui exclut le taux général · le Moteur A gagne, on relance dessus.</div>
          </div>
        </div>
      </section>

      {/* TARIFS */}
      <section id="tarifs">
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
      <section style={{ position: 'relative', overflow: 'hidden', marginTop: 20 }}>
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
