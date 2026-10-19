import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * Correctifs de la coquille V5 · garde NAVIGATEUR RÉEL (locale, optionnelle).
 * Chromium sur un serveur local et la base de banc · ignorée sans serveur (la
 * CI n'a ni l'un ni l'autre). La même structure est tenue sans navigateur par
 * `uxv5-coquille-correctifs-rendu.test.tsx`, les règles par le noyau
 * (`packages/core/test/coquille-v5.test.ts`).
 *
 * Lancer (banc local) :
 *   COQ_URL=http://127.0.0.1:3120 COQ_EMAIL=owner@banc.local COQ_MOT_DE_PASSE=<mot de passe du banc>
 *   COQ_MARQUE=<id de la marque active, facultatif> COQ_PLAYWRIGHT=/opt/node22/lib/node_modules/playwright
 *   COQ_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
 *   npx vitest run test/uxv5-coquille-correctifs-navigateur.test.ts
 *
 * Ce qu'elle MESURE, à 1440 × 720, 1280 × 720 (rail déplié et replié) et
 * 390 × 780 (tiroir), sur l'accueil et sur /settings (entrée active en bas) :
 *  · après défilement jusqu'à elle, aucune entrée du rail ne recoupe le pied
 *    (pastille + profil), elle tient dans la liste, et c'est bien elle qu'on
 *    touche en son centre (rien de posé par-dessus) ;
 *  · au chargement, l'entrée active est entière dans la vue de la liste ;
 *  · s'il reste du contenu sous la vue, la liste porte un fondu (`mask-image`) ;
 *  · menu de recharge ouvert · aucun prix tronqué ni sur deux lignes, aucune
 *    rangée qui dépasse du panneau, le panneau dans l'écran, « Acheter » touchable ;
 *  · la pastille de crédits tient dans le rail même avec un solde long (colonne
 *    du pied bornée à `minmax(0,…)`).
 *
 * Mutations éprouvées : pied en `position: absolute; bottom: 0` par-dessus la
 * liste → « recoupe le pied » ; largeur minimale du panneau retirée → « 279 € »
 * sur deux lignes et rangées hors du panneau ; colonne du pied dé-bornée
 * (`minmax(0,…)` retiré) → « pastille de crédits déborde du rail avec un solde long ».
 */

const URL_BASE = process.env.COQ_URL ?? '';
const PW = process.env.COQ_PLAYWRIGHT ?? '';
const EMAIL = process.env.COQ_EMAIL ?? '';
const MDP = process.env.COQ_MOT_DE_PASSE ?? '';
const ACTIF = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(URL_BASE) && !!EMAIL && !!MDP && !!PW && existsSync(PW);

interface Page {
  goto(u: string, o?: object): Promise<unknown>;
  fill(s: string, v: string): Promise<void>;
  click(s: string): Promise<void>;
  waitForURL(u: RegExp): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T, A = undefined>(f: (a: A) => T | Promise<T>, a?: A): Promise<T>;
}
interface Contexte { addCookies(c: object[]): Promise<void>; newPage(): Promise<Page>; close(): Promise<void> }

/** Dans la page · chaque entrée du rail, ramenée dans la vue, contre le pied. */
function mesurerRail(): { defauts: string[]; entrees: number } {
  const defauts: string[] = [];
  const liste = document.querySelector<HTMLElement>('#nav-rail nav[aria-label="Navigation principale"]');
  const pied = document.querySelector<HTMLElement>('#nav-rail [data-zone="pied-compte"]');
  if (!liste || !pied) return { defauts: ['liste ou pied du rail introuvable'], entrees: 0 };
  const nom = (e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ').trim() || e.getAttribute('aria-label') || e.getAttribute('href') || '?';
  // Au chargement · l'entrée active est entière dans la vue de la liste.
  const actif = liste.querySelector('[aria-current]');
  if (actif) {
    const a = actif.getBoundingClientRect(); const v = liste.getBoundingClientRect();
    if (a.top < v.top - 0.5 || a.bottom > v.bottom + 0.5) defauts.push(`entrée active « ${nom(actif)} » hors de la vue au chargement (${Math.round(a.top)}→${Math.round(a.bottom)} pour ${Math.round(v.top)}→${Math.round(v.bottom)})`);
  }
  // Il reste du contenu sous la vue · un indice doit le dire.
  if (liste.scrollTop + liste.clientHeight < liste.scrollHeight - 1) {
    const cs = getComputedStyle(liste);
    const masque = cs.maskImage || (cs as unknown as { webkitMaskImage?: string }).webkitMaskImage || 'none';
    if (masque === 'none') defauts.push('contenu sous la vue sans indice de défilement (aucun fondu)');
  }
  const entrees = [...liste.querySelectorAll<HTMLElement>('a[href]')];
  for (const e of entrees) {
    e.scrollIntoView({ block: 'nearest' });
    const r = e.getBoundingClientRect(); const f = pied.getBoundingClientRect(); const v = liste.getBoundingClientRect();
    if (r.bottom > f.top + 0.5 && r.top < f.bottom - 0.5) defauts.push(`« ${nom(e)} » recoupe le pied (${Math.round(r.top)}→${Math.round(r.bottom)} contre ${Math.round(f.top)}→${Math.round(f.bottom)})`);
    if (r.top < v.top - 0.5 || r.bottom > v.bottom + 0.5) defauts.push(`« ${nom(e)} » déborde de la liste après défilement`);
    const cible = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!cible || !e.contains(cible)) defauts.push(`« ${nom(e)} » recouvert en son centre par ${cible ? `<${cible.tagName.toLowerCase()} ${cible.getAttribute('data-zone') ?? ''}>` : 'rien'}`);
  }
  liste.scrollTop = 0;
  // La pastille de crédits tient dans le rail, même avec un solde long (la
  // colonne du pied est bornée à `minmax(0,…)` · sans elle la pastille grandit
  // avec le texte et déborde, « + » compris · défaut « Illimité + hors du rail »).
  const past = document.querySelector<HTMLElement>('[data-zone="pastille-credits"]');
  const solde = document.querySelector<HTMLElement>('[data-solde]');
  if (past) {
    const avant = solde?.textContent ?? '';
    if (solde) { solde.textContent = '1 234 567 890'; void document.body.offsetHeight; }
    const pr = past.getBoundingClientRect();
    const rr = (document.querySelector<HTMLElement>('#nav-rail') ?? liste).getBoundingClientRect();
    if (pr.right > rr.right + 0.5 || pr.left < rr.left - 0.5) defauts.push(`pastille de crédits déborde du rail avec un solde long (${Math.round(pr.left)}→${Math.round(pr.right)} pour rail ${Math.round(rr.left)}→${Math.round(rr.right)})`);
    if (solde) { solde.textContent = avant; void document.body.offsetHeight; }
  }
  return { defauts, entrees: entrees.length };
}

/** Dans la page · le menu de recharge ouvert. */
function mesurerRecharge(): { defauts: string[]; prix: number } {
  const defauts: string[] = [];
  const panneau = document.querySelector<HTMLElement>('[data-zone="menu-recharge"]');
  if (!panneau) return { defauts: ['menu de recharge introuvable'], prix: 0 };
  const p = panneau.getBoundingClientRect();
  if (p.left < 0 || p.right > innerWidth || p.top < 0 || p.bottom > innerHeight) defauts.push(`panneau hors de l'écran (${Math.round(p.left)}→${Math.round(p.right)} × ${Math.round(p.top)}→${Math.round(p.bottom)} pour ${innerWidth} × ${innerHeight})`);
  const prix = [...panneau.querySelectorAll<HTMLElement>('[data-prix]')];
  for (const s of prix) {
    const r = s.getBoundingClientRect();
    if (s.scrollWidth > s.clientWidth) defauts.push(`prix « ${s.textContent} » tronqué (${s.scrollWidth} > ${s.clientWidth})`);
    if (s.getClientRects().length > 1 || r.height > parseFloat(getComputedStyle(s).lineHeight || '0') * 1.5 + 1) defauts.push(`prix « ${s.textContent} » sur plusieurs lignes`);
    if (r.right > p.right - 1) defauts.push(`prix « ${s.textContent} » rogné par le panneau`);
  }
  for (const f of panneau.querySelectorAll<HTMLElement>('form')) {
    const r = f.getBoundingClientRect();
    if (r.right > p.right - 1) defauts.push(`rangée « ${(f.textContent ?? '').trim()} » dépasse du panneau (${Math.round(r.right)} > ${Math.round(p.right)})`);
    const b = f.querySelector('button')!.getBoundingClientRect();
    const cible = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    if (!cible || !f.contains(cible)) defauts.push(`« Acheter » de « ${(f.textContent ?? '').trim()} » n’est pas touchable`);
  }
  return { defauts, prix: prix.length };
}

describe.skipIf(!ACTIF)('Correctifs V5 · coquille · navigateur réel (local)', () => {
  it('rail · aucune entrée sous le pied, active dans la vue, indice de défilement · menu de recharge sans prix coupé', async () => {
    const req = createRequire(`${PW}/`);
    const { chromium } = req(PW) as { chromium: { launch(o: object): Promise<{ newContext(o: object): Promise<Contexte>; close(): Promise<void> }> } };
    const nav = await chromium.launch({ executablePath: process.env.COQ_CHROMIUM || undefined, args: ['--no-sandbox'] });
    const domaine = new URL(URL_BASE).hostname;
    const defauts: string[] = [];
    let mesures = 0;
    try {
      for (const [largeur, hauteur] of [[1440, 720], [1280, 720], [390, 780]] as const) {
        const mobile = largeur < 500;
        for (const replie of mobile ? [false] : [false, true]) {
          const ctx = await nav.newContext({ viewport: { width: largeur, height: hauteur }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
          await ctx.addCookies([
            { name: 'tt_rail', value: replie ? '1' : '0', domain: domaine, path: '/' },
            ...(process.env.COQ_MARQUE ? [{ name: 'tt_brand', value: process.env.COQ_MARQUE, domain: domaine, path: '/' }] : []),
          ]);
          const p = await ctx.newPage();
          await p.goto(`${URL_BASE}/login`);
          await p.fill('input[name=email]', EMAIL);
          await p.fill('input[name=password]', MDP);
          await p.click('button[type=submit]');
          await p.waitForURL(/\/(dashboard|onboarding|brands)/);
          const etat = `${largeur} × ${hauteur} ${mobile ? 'tiroir' : replie ? 'replié' : 'déplié'}`;
          const ouvrirTiroir = async () => { if (mobile) { await p.click('button[aria-controls="nav-rail"]'); await p.waitForTimeout(400); } };
          for (const chemin of ['/dashboard', '/settings']) {
            await p.goto(`${URL_BASE}${chemin}`, { waitUntil: 'networkidle' });
            await p.waitForTimeout(300);
            await ouvrirTiroir();
            const m = await p.evaluate(mesurerRail);
            if (m.entrees < 5) defauts.push(`${etat} ${chemin} · seulement ${m.entrees} entrées lues`);
            defauts.push(...m.defauts.map((d) => `${etat} ${chemin} · ${d}`));
            mesures += m.entrees;
          }
          await p.goto(`${URL_BASE}/dashboard`, { waitUntil: 'networkidle' });
          await p.waitForTimeout(300);
          await ouvrirTiroir();
          await p.click('[data-zone="pastille-credits"]');
          await p.waitForTimeout(200);
          const r = await p.evaluate(mesurerRecharge);
          if (r.prix < 3) defauts.push(`${etat} · recharge · ${r.prix} prix lus`);
          defauts.push(...r.defauts.map((d) => `${etat} · recharge · ${d}`));
          await ctx.close();
        }
      }
    } finally {
      await nav.close();
    }
    expect(mesures, 'aucune entrée mesurée').toBeGreaterThan(20);
    expect(defauts).toEqual([]);
  }, 240_000);
});
