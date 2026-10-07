import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Consulter n'écrit rien · ouvrir le Studio, une fiche marque ou toute autre page
 * ne doit ni écrire en base ni appeler un site extérieur.
 *
 * ── Le défaut (recette #106) ─────────────────────────────────────────────────
 *
 * Le rendu de /studio/ads, /studio/video et /brands/[id] appelait
 * `ensureBrandEnriched` : dès que la date d'enrichissement avait plus de 6 h,
 * afficher la page ÉCRIVAIT `brands.enriched_at` et, pour une marque avec site,
 * interrogeait ce site (DA, catalogue Shopify, photos produit). Mesuré en local
 * sur main (bf6ef06), sonde réseau active · une DNS et quatre requêtes vers le
 * site de la marque au simple affichage du Studio.
 *
 * ── La règle gardée ──────────────────────────────────────────────────────────
 *
 * Aucun fichier de RENDU (page, layout, template, loading, default) n'importe un
 * module d'enrichissement réseau ni n'appelle une action d'enrichissement.
 * L'enrichissement reste entier, derrière ses gestes EXPLICITES · « Récupérer la
 * DA » (fiche marque), la synchronisation Shopify, la récupération des photos
 * produit (Studio). La preuve au résultat (base identique, zéro sortie réseau)
 * est la recette locale sondée · ce test empêche la régression à la source.
 */
const APP = join(process.cwd(), 'app');
const RENDU = /^(page|layout|template|loading|default)\.tsx?$/;

function fichiersRendu(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...fichiersRendu(p));
    else if (RENDU.test(n)) out.push(p);
  }
  return out;
}

// Modules qui vont chercher dehors · et actions qui enrichissent la marque.
const MODULES_RESEAU = /from\s+['"][^'"]*lib\/(enrich|brand-da|shopify|product-image)['"]/;
const APPELS = /\b(ensureBrandEnriched|extractBrandDA|discoverShopify|resolveProductImage|importBrandDAAction|syncShopifyProductsAction|importAllProductImagesAction|importProductsAction)\s*\(/;

describe('Consulter n’écrit rien · aucun enrichissement au rendu', () => {
  const fichiers = fichiersRendu(APP);

  it('le scanner voit bien les pages concernées (Studio, vidéo, fiche marque)', () => {
    const noms = fichiers.map((f) => relative(APP, f));
    for (const attendu of ['(app)/studio/ads/page.tsx', '(app)/studio/video/page.tsx', '(app)/brands/[id]/page.tsx']) {
      expect(noms, `le scanner ne voit pas ${attendu} · il regarderait ailleurs`).toContain(attendu);
    }
  });

  it('aucune page ni layout n’importe un module d’enrichissement réseau', () => {
    const fautifs = fichiers.filter((f) => MODULES_RESEAU.test(readFileSync(f, 'utf8'))).map((f) => relative(APP, f));
    expect(fautifs, `rendu qui importe un module d’enrichissement réseau : ${fautifs.join(', ')}`).toEqual([]);
  });

  it('aucune page ni layout n’appelle un enrichissement pendant le rendu', () => {
    const fautifs = fichiers.filter((f) => APPELS.test(readFileSync(f, 'utf8'))).map((f) => relative(APP, f));
    expect(fautifs, `rendu qui enrichit la marque (écriture + réseau) : ${fautifs.join(', ')}`).toEqual([]);
  });
});

describe('L’enrichissement reste disponible · par ses gestes explicites', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('« Récupérer la DA » · bouton de la fiche marque', () => {
    expect(src('app/(app)/brands/[id]/BrandDA.tsx'), 'le bouton ne déclenche plus la récupération de la DA').toMatch(/importBrandDAAction\(/);
  });
  it('synchronisation du catalogue Shopify · bouton de la fiche marque', () => {
    expect(src('app/(app)/brands/[id]/ShopifyConnect.tsx'), 'la synchronisation Shopify n’est plus branchée').toMatch(/syncShopifyProductsAction\(/);
  });
  it('photos produit manquantes · bouton du Studio, dans un gestionnaire de clic (pas un effet)', () => {
    const s = src('app/(app)/studio/ads/AdsStudio.tsx');
    const i = s.indexOf('await importAllProductImagesAction()');
    expect(i, 'la récupération des photos produit n’est plus branchée').toBeGreaterThan(-1);
    const avant = s.slice(Math.max(0, i - 200), i);
    expect(avant, 'la récupération des photos n’est plus dans le gestionnaire importAll').toContain('async function importAll()');
  });
});

/**
 * Chantier L0 · consulter n'écrit rien, étendu aux route handlers GET et à
 * TOUT ce que le rendu appelle (BASE-03).
 *
 * ── Ce que l'ancien garde ne voyait pas ──────────────────────────────────────
 *
 * Il ne regardait que les pages, et seulement les modules d'enrichissement ·
 * `GET /api/ad/[id]` réécrivait la recette et l'index des rendus (#125),
 * `/jarvis/sources` et le préflight des Studios inséraient des jalons
 * (`recordMilestones` via `jarvisStats`), sans qu'aucun garde ne rougisse.
 *
 * ── La règle gardée ──────────────────────────────────────────────────────────
 *
 * On dresse le graphe des ÉCRIVAINS · toute fonction de `lib/` ou
 * `app/actions/` dont le corps écrit en base (`db.insert/update/delete`,
 * `tx.…`, `execute(sql\`insert…\`)`), puis, jusqu'au point fixe, toute fonction
 * qui en appelle une. Aucun handler GET et aucun fichier de rendu ne doit
 * écrire directement ni appeler un écrivain, hors exceptions NOMMÉES et
 * justifiées ci-dessous. Le journal technique (`lib/error-log.ts`) n'est pas
 * une écriture métier (BASE-03) et n'entre pas dans le graphe.
 *
 * La preuve au RÉSULTAT (base espionnée, zéro instruction d'écriture) est
 * `l0-lectures-pures.test.ts` · ce garde-ci couvre tous les autres écrans.
 */
const RACINE = process.cwd();
function arbo(dir: string, garder: (n: string) => boolean): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arbo(p, garder) : garder(n) ? [p] : [];
  });
}
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const DEFINITION = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)\s*[(<]|^(?:export\s+)?const\s+(\w+)\s*(?::[^=\n]+)?=\s*(?:async\b|\()/gm;
const ECRIT = /\b(?:db!?|tx)\s*\.\s*(?:insert|update|delete)\s*\(|\.execute\(\s*sql`\s*(?:insert|update|delete)/i;
const appelle = (texte: string, nom: string) => new RegExp(`(?<![.\\w])${nom}\\s*\\(`).test(texte);

/** Journal technique · hors graphe (BASE-03 : « la journalisation technique n'est pas une création métier »). */
const TECHNIQUES = new Set(['lib/error-log.ts']);

function grapheEcrivains(): Map<string, string> {
  const sources = [...arbo(join(RACINE, 'lib'), (n) => /\.tsx?$/.test(n)), ...arbo(join(RACINE, 'app/actions'), (n) => /\.ts$/.test(n))]
    .filter((f) => !TECHNIQUES.has(relative(RACINE, f)));
  const fonctions = sources.flatMap((f) => {
    const s = sansCommentaires(readFileSync(f, 'utf8'));
    const m = [...s.matchAll(DEFINITION)];
    return m.map((x, i) => ({ nom: (x[1] ?? x[2])!, corps: s.slice(x.index, m[i + 1]?.index ?? s.length), f: relative(RACINE, f) }));
  });
  const ecrivains = new Map<string, string>();
  for (const x of fonctions) if (ECRIT.test(x.corps)) ecrivains.set(x.nom, x.f);
  for (let change = true; change;) {
    change = false;
    for (const x of fonctions) {
      if (ecrivains.has(x.nom)) continue;
      for (const w of ecrivains.keys()) {
        if (appelle(x.corps, w)) { ecrivains.set(x.nom, `${x.f} → ${w}`); change = true; break; }
      }
    }
  }
  return ecrivains;
}

/**
 * Les seules consultations autorisées à écrire · chacune avec sa raison.
 * Ajouter une ligne ici est une DÉCISION, à justifier dans la PR.
 */
const EXCEPTIONS: Record<string, string> = {
  // Commandes PAR CONCEPTION, servies en GET · OAuth 2 impose une redirection
  // GET (état signé, code à usage unique chez le fournisseur) ; les crons sont
  // protégés par Bearer. Hors consultation (audit L0-C, 2.a).
  'app/api/oauth/google/callback/route.ts': 'callback OAuth',
  'app/api/oauth/meta/callback/route.ts': 'callback OAuth',
  'app/api/oauth/shopify/callback/route.ts': 'callback OAuth',
  'app/api/cron/adsmap/route.ts': 'cron protégé',
  'app/api/cron/digest/route.ts': 'cron protégé',
  'app/api/cron/radar/route.ts': 'cron protégé',
  'app/api/cron/tracker/route.ts': 'cron protégé',
  // Cache technique BORNÉ (niches proposées × pays proposés, `veillePersistable`)
  // qui évite de repayer le fournisseur de veille · seul `setVeilleCache` est
  // toléré, prouvé borné par `l0-veille-scale.test.tsx`.
  'app/(app)/veille/scale/page.tsx': 'setVeilleCache',
};

/** Le texte d'une cible · pour un route handler, seulement ce que sert GET. */
function texteCible(f: string): string | null {
  const s = sansCommentaires(readFileSync(f, 'utf8'));
  if (!/route\.tsx?$/.test(f)) return s;
  if (!/export\s+(?:async\s+)?function\s+GET\b|export\s+const\s+GET\b/.test(s)) return null;
  return s.replace(/export\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)\b[\s\S]*?(?=\nexport\s|$)/g, '');
}

describe('Consulter n’écrit rien · route handlers GET et rendus, par le graphe des écrivains', () => {
  const ecrivains = grapheEcrivains();
  const cibles = arbo(join(RACINE, 'app'), (n) => /^(page|layout|template|loading|default|route)\.tsx?$/.test(n));

  it('le graphe voit bien les écrivains connus · sinon il regarderait ailleurs', () => {
    for (const n of ['recordMilestones', 'refundCredits', 'setVeilleCache', 'rattraperMesures', 'daterJalons', 'pollVideoAction']) {
      expect(ecrivains.has(n), `le graphe ne reconnaît pas ${n} comme écrivain`).toBe(true);
    }
    const noms = cibles.map((f) => relative(join(RACINE, 'app'), f));
    for (const attendu of ['api/ad/[id]/route.tsx', '(app)/jarvis/sources/page.tsx', '(app)/studio/video/page.tsx']) {
      expect(noms, `le scanner ne voit pas ${attendu}`).toContain(attendu);
    }
  });

  it('aucun handler GET ni aucun rendu n’écrit ou n’appelle un écrivain (hors exceptions nommées)', () => {
    const fautes: string[] = [];
    for (const f of cibles) {
      const t = texteCible(f);
      if (t === null) continue;
      const rel = relative(RACINE, f);
      const exc = EXCEPTIONS[rel];
      if (exc && exc !== 'setVeilleCache') continue;
      if (ECRIT.test(t)) fautes.push(`${rel} · écriture directe en base`);
      for (const [w, d] of ecrivains) {
        if (exc === w) continue;
        if (appelle(t, w)) fautes.push(`${rel} · appelle ${w} (${d})`);
      }
    }
    expect(fautes, `consultation qui écrit en base :\n${fautes.join('\n')}`).toEqual([]);
  });

  it('les lectures appelées AU MONTAGE des écrans restent pures (préflight des Studios, cloche, Adsmap)', () => {
    const lectures = ['preflightAction', 'jarvisStats', 'briefConceptBeforeLaunch', 'jarvisSnapshot', 'fetchNotifications', 'listAdsAction', 'listDecisionsAction', 'marketCoverageAction', 'radarViewAction', 'curationViewAction'];
    const fautes = lectures.filter((n) => ecrivains.has(n)).map((n) => `${n} · ${ecrivains.get(n)}`);
    expect(fautes, `lecture appelée au montage qui écrit :\n${fautes.join('\n')}`).toEqual([]);
  });

  it('les exceptions existent toujours · une exception orpheline masquerait un écran renommé', () => {
    for (const f of Object.keys(EXCEPTIONS)) expect(statSync(join(RACINE, f)).isFile(), `exception orpheline : ${f}`).toBe(true);
  });
});
