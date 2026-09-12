import type { Metadata } from 'next';
import { Fragment } from 'react';
import Link from 'next/link';
import { PLAN_PRICE, PLAN_CREDITS, planAtLeast, type Plan } from '../../lib/rbac';

/**
 * Page tarifs publique · statique (aucune session). Les prix et le volume de
 * crédits viennent de la SEULE source de vérité (lib/rbac) · si le catalogue
 * change, la page suit. Le tableau comparatif dérive les ✓ de `minPlan` via
 * `planAtLeast` · rien n'est écrit en dur qui puisse se désynchroniser.
 *
 * Le tarif annuel est dérivé du mensuel avec « 2 mois offerts » (×10) · c'est
 * une convention par défaut, annoncée à l'écran, à confirmer par le propriétaire.
 */

export const metadata: Metadata = {
  title: 'Tarifs',
  description: 'Un tarif par niveau de la boucle · commence gratuitement, passe à l’échelle quand tu gagnes. Starter, Core, Plus, Business.',
  alternates: { canonical: '/tarifs' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'TikTrends',
    url: '/tarifs',
    title: 'Tarifs · TikTrends',
    description: 'Un tarif par niveau de la boucle · commence gratuitement, passe à l’échelle quand tu gagnes.',
  },
};

const CSS = `
.lp{--ink:#f6eef4;--ink2:#cbbcc7;--muted:#9a8a98;color:var(--ink);font-family:'Geist','Helvetica Neue',Arial,sans-serif;overflow:hidden}
.lp *{box-sizing:border-box}
.lp h1,.lp h2,.lp h3,.lp p{margin:0}
.lp a{text-decoration:none;color:inherit}
html{scroll-behavior:smooth}
.lp-wrap{max-width:1180px;margin:0 auto;padding:0 clamp(20px,5vw,40px)}
.lp-nav{position:sticky;top:0;z-index:20;backdrop-filter:blur(10px);background:rgba(18,8,16,0.7);border-bottom:1px solid rgba(255,255,255,0.08)}
.lp-navrow{height:70px;display:flex;align-items:center;justify-content:space-between}
.lp-navlinks{display:flex;align-items:center;gap:30px;font-size:15px;font-weight:500;color:var(--ink2)}
.lp-navlinks a{transition:color .18s ease}
.lp-navlinks a:hover,.lp-navlinks a.on{color:var(--ink)}
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
.lp-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;background:linear-gradient(135deg,#fe2c55 0%,#ff2d8f 100%);color:#fff;border:0;border-radius:999px;padding:15px 28px;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 10px 30px -8px rgba(254,44,85,0.6);transition:transform .2s ease,box-shadow .2s ease}
.lp-btn:hover{transform:translateY(-2px);box-shadow:0 16px 40px -10px rgba(254,44,85,0.8)}
.lp-btn.sm{padding:11px 20px;font-size:14px}
.lp-ghost{display:inline-flex;align-items:center;justify-content:center;gap:9px;background:rgba(255,255,255,0.05);color:var(--ink);border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:13px 22px;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s ease,border-color .2s ease}
.lp-ghost:hover{background:rgba(255,255,255,0.09);border-color:rgba(255,255,255,0.28)}
.lp-card{background:#1c121b;border:1px solid rgba(255,255,255,0.10);border-radius:20px;box-shadow:0 2px 12px rgba(0,0,0,0.40)}
.lp-eyebrow{font-size:13px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#ff5c8a}
.lp-muted{color:var(--muted)}.lp-ink2{color:var(--ink2)}
.lp-h1{font-size:clamp(38px,5.4vw,58px);line-height:1.03;font-weight:850;letter-spacing:-0.03em;text-wrap:balance}
/* bascule mensuel / annuel · pur CSS */
.tp-bill{position:absolute;width:0;height:0;opacity:0;pointer-events:none}
.tp-billrow{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:28px;font-size:15px;font-weight:600}
.tp-toggle{width:48px;height:27px;border-radius:999px;background:rgba(255,255,255,0.14);position:relative;cursor:pointer;transition:background .2s ease;flex-shrink:0}
.tp-knob{position:absolute;top:3px;left:3px;width:21px;height:21px;border-radius:999px;background:#fff;transition:transform .22s cubic-bezier(.2,.7,.2,1)}
.tp-save{display:inline-block;margin-left:6px;font-size:11px;font-weight:800;color:#7fe3c0;background:rgba(24,204,140,0.12);border:1px solid rgba(24,204,140,0.3);padding:2px 8px;border-radius:999px}
.tp-off{color:var(--muted)}
#tp-annuel:checked ~ .tp-billrow .tp-toggle{background:linear-gradient(135deg,#fe2c55,#ff2d8f)}
#tp-annuel:checked ~ .tp-billrow .tp-toggle .tp-knob{transform:translateX(21px)}
#tp-annuel:checked ~ .tp-billrow .tp-lab-mo{color:var(--muted)}
#tp-annuel:checked ~ .tp-billrow .tp-lab-yr{color:var(--ink)}
.tp-lab-yr{color:var(--muted)}
.tp-yr{display:none}
#tp-annuel:checked ~ .tp-grid .tp-mo{display:none}
#tp-annuel:checked ~ .tp-grid .tp-yr{display:block}
.tp-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:34px;align-items:stretch}
.tp-tier{background:#1c121b;border:1px solid rgba(255,255,255,0.10);border-radius:20px;padding:26px;display:flex;flex-direction:column;position:relative}
.tp-tier.hot{border:1.5px solid rgba(254,44,85,0.6);background:linear-gradient(160deg,#241320,#1a1019);box-shadow:0 20px 50px -22px rgba(254,44,85,0.45)}
.tp-badge{position:absolute;top:-12px;left:26px;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;padding:5px 12px;border-radius:999px;background:linear-gradient(135deg,#fe2c55,#ff2d8f);color:#fff}
.tp-price{margin:14px 0 2px;display:flex;align-items:baseline;gap:4px;min-height:46px}
.tp-price b{font-size:40px;font-weight:850;letter-spacing:-0.02em}
.tp-per{color:var(--muted);font-size:14px}
.tp-note{font-size:12px;color:var(--muted);min-height:16px}
.tp-cr{margin:16px 0 14px;font-size:13px;color:var(--ink2);display:flex;align-items:center;gap:8px}
.tp-feat{display:flex;flex-direction:column;gap:9px;font-size:13.5px;color:var(--ink2);flex:1}
.tp-feat div{display:flex;gap:9px;align-items:flex-start}
/* tableau comparatif */
.tp-tablewrap{overflow-x:auto;border-radius:18px;border:1px solid rgba(255,255,255,0.09);background:#1c121b}
.tp-table{width:100%;border-collapse:collapse;min-width:720px}
.tp-table th,.tp-table td{padding:14px 16px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06);font-size:14px}
.tp-table thead th{position:sticky;top:0;background:#1c121b;font-weight:800;font-size:15px}
.tp-table tbody th{text-align:left;font-weight:500;color:var(--ink2)}
.tp-table th.hot,.tp-table td.hot{background:rgba(254,44,85,0.06)}
.tp-grp td{text-align:left;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#ff5c8a;background:rgba(255,255,255,0.02);padding-top:18px}
.tp-yes{color:#18cc8c}
.tp-no{color:rgba(255,255,255,0.22)}
.tp-faq{max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
@media (max-width:900px){.tp-grid{grid-template-columns:1fr 1fr}}
@media (max-width:820px){.lp-navlinks{display:none}}
@media (max-width:560px){.tp-grid{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.lp-btn,.tp-knob,.tp-toggle,.lp-dd{transition:none}html{scroll-behavior:auto}}
`;

function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#1c121b" />
      <path d="M16 5.5l2.2 7.3 7.3 2.2-7.3 2.2-2.2 7.3-2.2-7.3-7.3-2.2 7.3-2.2z" fill="#fe2c55" />
    </svg>
  );
}

function Yes() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#18cc8c" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-label="inclus"><path d="M20 6L9 17l-5-5" /></svg>
  );
}
function No() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2.4" strokeLinecap="round" aria-label="non inclus"><path d="M5 12h14" /></svg>
  );
}

const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];
const TIER_LABEL: Record<Plan, string> = { starter: 'Starter', core: 'Core', plus: 'Plus', business: 'Business' };
const TIER_PITCH: Record<Plan, string> = {
  starter: 'Observer, sans payer',
  core: 'Créer sans limite',
  plus: 'Tester et itérer',
  business: 'Piloter à l’échelle',
};
const TIER_FEATURES: Record<Plan, string[]> = {
  starter: ['Dashboard & Analytics', 'Veille en lecture', 'Tagging'],
  core: ['Tout Starter', 'Studio IA complet', 'Jarvis · copie relue', 'Veille & Radar produits'],
  plus: ['Tout Core', 'Adsmap complet', 'Suites & lots de test', 'Protocole & seuils'],
  business: ['Tout Plus', 'Marques & membres multiples', 'Le plus gros volume de crédits'],
};

function euro(n: number): string {
  return n.toLocaleString('fr-FR');
}

// Colonnes de fonctionnalités du tableau · les ✓ dérivent de minPlan.
const TABLE: { group: string; rows: { label: string; min: Plan }[] }[] = [
  { group: 'Piloter', rows: [{ label: 'Dashboard & Analytics', min: 'starter' }, { label: 'Tagging', min: 'starter' }] },
  { group: 'Observer', rows: [{ label: 'Veille & Ce qui scale', min: 'core' }, { label: 'Radar produits', min: 'core' }, { label: 'Sauvegardes', min: 'core' }] },
  { group: 'Créer', rows: [{ label: 'Studio IA · Pubs, Image, Vidéo, Textes', min: 'core' }, { label: 'Jarvis · copie relue', min: 'core' }, { label: 'Assets', min: 'core' }] },
  { group: 'Tester', rows: [{ label: 'Adsmap · suites, lots, tri', min: 'plus' }, { label: 'Protocole & seuils', min: 'plus' }, { label: 'Import de campagnes', min: 'plus' }] },
  { group: 'Espace', rows: [{ label: 'Marques & membres multiples', min: 'starter' }, { label: 'Connexions & facturation', min: 'starter' }] },
];

function NavLinks() {
  return (
    <div className="lp-navlinks">
      <Link href="/#galerie">Créatives</Link>
      <Link href="/#methode">Méthode</Link>
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
                { t: 'Créatives winneuses', d: 'La galerie de rendus', href: '/#galerie' },
                { t: 'La méthode', d: 'Hypothèse → itération → résultat', href: '/#methode' },
                { t: 'Adsmap', d: 'Le laboratoire de test', href: '/#adsmap' },
              ].map((it) => (
                <Link key={it.t} href={it.href} className="lp-dd-item" role="menuitem">
                  <span className="lp-dd-ic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ff5c8a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg></span>
                  <span><span className="lp-dd-t">{it.t}</span><span className="lp-dd-d">{it.d}</span></span>
                </Link>
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
      <Link href="/tarifs" className="on">Tarifs</Link>
    </div>
  );
}

export default function TarifsPage() {
  const annuelTotal = (p: Plan) => PLAN_PRICE[p] * 10; // 2 mois offerts
  const annuelMensuel = (p: Plan) => (PLAN_PRICE[p] === 0 ? 0 : Math.round((PLAN_PRICE[p] * 10) / 12));

  return (
    <div className="lp">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* NAV */}
      <nav className="lp-nav">
        <div className="lp-wrap lp-navrow">
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <Logo />
            <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>TikTrends</span>
          </Link>
          <NavLinks />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link href="/login" style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink2)' }}>Connexion</Link>
            <Link href="/signup" className="lp-btn sm">Démarrer</Link>
          </div>
        </div>
      </nav>

      {/* HERO + TARIFS */}
      <section className="lp-wrap" style={{ padding: '70px 40px 20px', textAlign: 'center' }}>
        <div className="lp-eyebrow" style={{ marginBottom: 16 }}>Tarifs</div>
        <h1 className="lp-h1" style={{ maxWidth: 760, margin: '0 auto' }}>Un tarif par niveau de la boucle</h1>
        <p className="lp-ink2" style={{ fontSize: 18, maxWidth: 560, margin: '20px auto 0' }}>Commence gratuitement, passe à l’échelle quand tu gagnes. Sans engagement, résiliable à tout moment.</p>

        <input id="tp-annuel" className="tp-bill" type="checkbox" />
        <div className="tp-billrow">
          <span className="tp-lab-mo">Mensuel</span>
          <label htmlFor="tp-annuel" className="tp-toggle" aria-label="Basculer entre mensuel et annuel"><span className="tp-knob" /></label>
          <span className="tp-lab-yr">Annuel<span className="tp-save">2 mois offerts</span></span>
        </div>

        <div className="tp-grid">
          {PLANS.map((p) => {
            const hot = p === 'plus';
            return (
              <div key={p} className={hot ? 'tp-tier hot' : 'tp-tier'}>
                {hot && <span className="tp-badge">Recommandé</span>}
                <h3 style={{ fontSize: 17, fontWeight: 700 }}>{TIER_LABEL[p]}</h3>
                <p className="lp-muted" style={{ fontSize: 12.5, marginTop: 3 }}>{TIER_PITCH[p]}</p>
                <div className="tp-price">
                  <span className="tp-mo"><b>{euro(PLAN_PRICE[p])}€</b><span className="tp-per">{PLAN_PRICE[p] === 0 ? '' : '/mois'}</span></span>
                  <span className="tp-yr"><b>{euro(annuelMensuel(p))}€</b><span className="tp-per">{PLAN_PRICE[p] === 0 ? '' : '/mois'}</span></span>
                </div>
                <div className="tp-note">
                  <span className="tp-mo">{PLAN_PRICE[p] === 0 ? 'Gratuit, pour toujours' : 'facturé mensuellement'}</span>
                  <span className="tp-yr">{PLAN_PRICE[p] === 0 ? 'Gratuit, pour toujours' : `soit ${euro(annuelTotal(p))}€ /an`}</span>
                </div>
                <div className="tp-cr">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff5c8a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                  <b style={{ color: 'var(--ink)' }}>{euro(PLAN_CREDITS[p])}</b> crédits IA / mois
                </div>
                <div className="tp-feat">
                  {TIER_FEATURES[p].map((f) => (
                    <div key={f}><Yes />{f}</div>
                  ))}
                </div>
                <Link href="/signup" className={hot ? 'lp-btn' : 'lp-ghost'} style={{ width: '100%', marginTop: 22 }}>
                  {p === 'business' ? 'Nous contacter' : p === 'starter' ? 'Commencer' : `Choisir ${TIER_LABEL[p]}`}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* TABLEAU COMPARATIF */}
      <section className="lp-wrap" style={{ padding: '60px 40px 20px' }}>
        <h2 className="lp-h1" style={{ fontSize: 'clamp(28px,3.4vw,38px)', textAlign: 'center', marginBottom: 30 }}>Comparer les offres</h2>
        <div className="tp-tablewrap">
          <table className="tp-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}> </th>
                {PLANS.map((p) => (
                  <th key={p} className={p === 'plus' ? 'hot' : undefined}>{TIER_LABEL[p]}<div className="lp-muted" style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>{PLAN_PRICE[p] === 0 ? 'Gratuit' : `${euro(PLAN_PRICE[p])}€/mois`}</div></th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Crédits IA / mois</th>
                {PLANS.map((p) => (
                  <td key={p} className={p === 'plus' ? 'hot' : undefined} style={{ fontWeight: 800 }}>{euro(PLAN_CREDITS[p])}</td>
                ))}
              </tr>
              {TABLE.map((grp) => (
                <Fragment key={grp.group}>
                  <tr className="tp-grp">
                    <td colSpan={5}>{grp.group}</td>
                  </tr>
                  {grp.rows.map((row) => (
                    <tr key={row.label}>
                      <th>{row.label}</th>
                      {PLANS.map((p) => (
                        <td key={p} className={p === 'plus' ? 'hot' : undefined}>
                          {planAtLeast(p, row.min) ? <span className="tp-yes"><Yes /></span> : <span className="tp-no"><No /></span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-wrap" style={{ padding: '60px 40px 20px' }}>
        <h2 className="lp-h1" style={{ fontSize: 'clamp(28px,3.4vw,38px)', textAlign: 'center', marginBottom: 30 }}>Questions fréquentes</h2>
        <div className="tp-faq">
          {[
            { q: 'C’est quoi, les crédits IA ?', a: 'Chaque génération (image, vidéo, texte, relecture) consomme des crédits. Ton allocation mensuelle dépend de ton offre · le prix est toujours annoncé avant de lancer, jamais après.' },
            { q: 'Puis-je changer d’offre à tout moment ?', a: 'Oui. Tu montes ou tu descends d’offre quand tu veux · l’ajustement est immédiat, sans frais cachés.' },
            { q: 'Y a-t-il un engagement ?', a: 'Non. Le mensuel est sans engagement, résiliable à tout moment. L’annuel te fait économiser deux mois.' },
            { q: 'Le plan gratuit, c’est vraiment gratuit ?', a: 'Oui · Starter est gratuit pour toujours, sans carte bancaire, avec de quoi observer le marché et découvrir l’outil.' },
          ].map((f) => (
            <div key={f.q} className="lp-card" style={{ padding: '22px 26px' }}>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{f.q}</div>
              <p className="lp-muted" style={{ fontSize: 14 }}>{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ position: 'relative', overflow: 'hidden', marginTop: 20 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(700px 340px at 50% 100%,rgba(254,44,85,0.28),transparent 65%)' }} />
        <div className="lp-wrap" style={{ position: 'relative', zIndex: 2, padding: '80px 40px', textAlign: 'center' }}>
          <h2 className="lp-h1" style={{ fontSize: 'clamp(32px,4.4vw,48px)', maxWidth: 700, margin: '0 auto' }}>Commence gratuitement, aujourd’hui</h2>
          <p className="lp-ink2" style={{ fontSize: 18, maxWidth: 520, margin: '18px auto 0' }}>Sans carte bancaire. Ta première créative en quelques minutes.</p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 30, flexWrap: 'wrap' }}>
            <Link href="/signup" className="lp-btn">Démarrer gratuitement</Link>
            <Link href="/#methode" className="lp-ghost" style={{ padding: '15px 26px', fontSize: 15 }}>Voir la méthode</Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: '#0d070c' }}>
        <div className="lp-wrap" style={{ padding: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo size={26} />
            <span style={{ fontSize: 17, fontWeight: 800 }}>TikTrends</span>
          </Link>
          <div style={{ display: 'flex', gap: 26, color: 'var(--muted)', fontSize: 13, flexWrap: 'wrap' }}>
            <Link href="/#galerie">Créatives</Link>
            <Link href="/#methode">Méthode</Link>
            <Link href="/#adsmap">Adsmap</Link>
            <Link href="/tarifs">Tarifs</Link>
            <Link href="/legal/mentions-legales">Mentions légales</Link>
          </div>
          <div className="lp-muted" style={{ fontSize: 12 }}>© 2026 TikTrends</div>
        </div>
      </footer>
    </div>
  );
}
