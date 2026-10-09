import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mesurerPage, decrireFocus, type FocusDecrit, type MesurePage } from './l8a-mesures-navigateur.mjs';

/**
 * L8-A · garde NAVIGATEUR locale (optionnelle) · Chromium réel sur un serveur
 * local et une base LOCALE semée par `l8a-semis-recette.test.ts`. Ignorée
 * sans serveur : la CI n'a ni la base semée ni le serveur. Les mêmes règles
 * sont tenues sans navigateur par `l8a-ecrans-rendu.test.tsx`,
 * `l8a-image-studio-rendu.test.tsx` et `packages/core/test/l8a-ux-image.test.ts`.
 *
 * Lancer :
 *   L8A_URL=http://127.0.0.1:3481 L8A_SEMIS=/chemin/semis.json L8A_AUTH_SECRET=<secret du serveur LOCAL>
 *   L8A_PLAYWRIGHT=/opt/node22/lib/node_modules/playwright L8A_CHROMIUM=/opt/pw-browsers/chromium
 *   npx vitest run test/l8a-navigateur.test.ts
 *
 * Ce qu'elle constate, à 1280, 1440 et 390 × 720 (zone `main` et dialogues) :
 * aucune page plus large que l'écran, aucune cible sous 44 px, aucun champ
 * sous 16 px, aucun texte sous AA, aucun contrôle qui en chevauche un autre ;
 * au Tab, focus toujours visible, jamais perdu, jamais entièrement caché ;
 * dialogues qui piègent puis RENDENT le focus ; calque déplacé aux flèches.
 */

const URL_BASE = process.env.L8A_URL ?? '';
const SEMIS = process.env.L8A_SEMIS ?? '';
const SECRET = process.env.L8A_AUTH_SECRET ?? '';
const PW = process.env.L8A_PLAYWRIGHT ?? '';
const ACTIF = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(URL_BASE) && !!SECRET && existsSync(SEMIS) && !!PW && existsSync(PW);

/**
 * Hors périmètre L8-A (composants partagés, autres lots), mesurés et transmis
 * à l'intégrateur · ils ne doivent pas masquer un défaut des écrans du lot.
 */
const HORS_PERIMETRE = [
  /summary « i(générer un visuel|ce que ça produit)▾ »/, // `components/PageInfo` · 31 px de haut
  /textarea « Description de la création »/, // `components/Composer` · 15 px
];
const horsPerimetre = (s: string) => HORS_PERIMETRE.some((r) => r.test(s));

interface Page {
  goto(u: string, o?: object): Promise<unknown>;
  evaluate<T, A = undefined>(f: (a: A) => T, a?: A): Promise<T>;
  keyboard: { press(k: string): Promise<void> };
  waitForTimeout(ms: number): Promise<void>;
  waitForSelector(s: string, o?: object): Promise<unknown>;
  click(s: string): Promise<void>;
}

describe.skipIf(!ACTIF)('L8-A · navigateur réel (local)', () => {
  it('trois largeurs · mise en page, cibles, champs, contraste, parcours clavier, dialogues', async () => {
    const S = JSON.parse(readFileSync(SEMIS, 'utf8')) as { brand: string; demo: string; rempli: string; long: string; vide: string };
    const req = createRequire(`${PW}/`);
    const { chromium } = req(PW) as { chromium: { launch(o: object): Promise<{ newContext(o: object): Promise<{ addCookies(c: object[]): Promise<void>; newPage(): Promise<Page>; close(): Promise<void> }>; close(): Promise<void> }> } };
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const t = Math.floor(Date.now() / 1000);
    const corps = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ uid: S.demo, ep: 0, iat: t, exp: t + 3600 })}`;
    const jeton = `${corps}.${createHmac('sha256', SECRET).update(corps).digest('base64url')}`;
    const ecrans: Array<[string, string]> = [
      ['produit-rempli', `/studio/projets/${S.rempli}/produit`], ['textes-rempli', `/studio/projets/${S.rempli}/textes`], ['editeur-rempli', `/studio/projets/${S.rempli}/image`],
      ['produit-long', `/studio/projets/${S.long}/produit`], ['textes-long', `/studio/projets/${S.long}/textes`], ['editeur-long', `/studio/projets/${S.long}/image`],
      ['produit-vide', `/studio/projets/${S.vide}/produit`], ['textes-vide', `/studio/projets/${S.vide}/textes`], ['editeur-vide', `/studio/projets/${S.vide}/image`],
      ['studio-image', '/studio/image'], ['studio-textes', '/studio/textes'],
    ];
    const nav = await chromium.launch({ executablePath: process.env.L8A_CHROMIUM || undefined, args: ['--no-sandbox'] });
    const defauts: string[] = [];
    try {
      for (const largeur of [1280, 1440, 390]) {
        const ctx = await nav.newContext({ viewport: { width: largeur, height: 720 }, isMobile: largeur < 500, hasTouch: largeur < 500, reducedMotion: 'reduce' });
        await ctx.addCookies([{ name: 'tt_session', value: jeton, domain: '127.0.0.1', path: '/' }, { name: 'tt_brand', value: S.brand, domain: '127.0.0.1', path: '/' }]);
        const p = await ctx.newPage();
        const focus = async (): Promise<FocusDecrit> => {
          await p.waitForTimeout(120);
          let f = await p.evaluate(decrireFocus);
          // Une transition (même réduite à 0,01 ms) se termine à l'image suivante · on relit une fois.
          if (!f.perdu && !f.visible) { await p.waitForTimeout(400); f = await p.evaluate(decrireFocus); }
          return f;
        };
        for (const [nom, chemin] of ecrans) {
          const ici = `${nom}@${largeur}`;
          await p.goto(`${URL_BASE}${chemin}`, { waitUntil: 'networkidle', timeout: 180_000 });
          await p.waitForSelector('main h1', { timeout: 180_000 });
          const m: MesurePage = await p.evaluate(mesurerPage);
          if (m.sw !== m.cw) defauts.push(`${ici} · page plus large que l'écran (${m.sw} > ${m.cw}) : ${m.fautifs.map((f) => f.el).join(' ; ')}`);
          for (const c of m.cibles) if (!c.enLigne && !horsPerimetre(c.el)) defauts.push(`${ici} · cible ${c.largeur}×${c.hauteur} : ${c.el}`);
          for (const c of m.champs) if (!horsPerimetre(c.el)) defauts.push(`${ici} · champ à ${c.taille} px : ${c.el}`);
          for (const c of m.contrastes) defauts.push(`${ici} · contraste ${c.ratio} < ${c.seuil} : ${c.el}`);
          for (const c of m.collisions) defauts.push(`${ici} · collision : ${c}`);
          await p.evaluate(() => { const r = document.querySelector('main')!; const s = document.createElement('span'); s.tabIndex = -1; r.prepend(s); s.focus(); });
          const vus = new Set<string>();
          for (let i = 0; i < 160; i++) {
            await p.keyboard.press('Tab');
            const f = await focus();
            if (f.perdu) {
              // Fin du document : le Tab sort vers le navigateur (<body>) puis revient en tête de page.
              await p.keyboard.press('Tab');
              const suite = await focus();
              const tete = !suite.perdu && await p.evaluate(() => !!document.activeElement?.closest('#nav-rail, header'));
              if (!tete) defauts.push(`${ici} · focus perdu au Tab n°${i + 1}`);
              break;
            }
            if (f.horsZone && await p.evaluate(() => !!document.activeElement?.closest('#nav-rail, header, nextjs-portal'))) break;
            const cle = `${f.tag}|${f.texte}|${f.haut}|${f.gauche}`;
            if (vus.has(cle)) break;
            vus.add(cle);
            if (!f.visible) defauts.push(`${ici} · focus invisible : ${f.tag} « ${f.texte} »`);
            if (f.recouvert) defauts.push(`${ici} · focus entièrement caché : ${f.tag} « ${f.texte} »`);
          }
        }
        // Dialogues de l'éditeur · piègent puis rendent le focus ; calque déplacé aux flèches.
        await p.goto(`${URL_BASE}/studio/projets/${S.rempli}/image`, { waitUntil: 'networkidle', timeout: 180_000 });
        if (largeur >= 1280) {
          await p.evaluate(() => (document.querySelector('[data-ajouter="texte"]')!.parentElement!.lastElementChild as HTMLElement).focus());
          await p.keyboard.press('Enter');
          const dedans = await focus();
          if (dedans.perdu || !dedans.dansDialogue) defauts.push(`${largeur} · dialogue des médias : focus hors de la fenêtre`);
          await p.keyboard.press('Escape');
          const rendu = await focus();
          if (rendu.perdu || rendu.texte !== 'Média') defauts.push(`${largeur} · dialogue des médias : focus non rendu à « Média »`);
          await p.click('[data-choisir-calque="titre"]');
          await p.evaluate(() => (document.querySelector('[data-surface="document"]') as HTMLElement).focus());
          await p.keyboard.press('ArrowRight');
          const valeur = await p.evaluate(() => ([...document.querySelectorAll('label')].find((l) => l.textContent === 'X')?.control as HTMLInputElement | null)?.value ?? null);
          if (valeur !== '81') defauts.push(`${largeur} · flèche droite sur l'aperçu : X = ${valeur}, 81 attendu`);
        } else {
          await p.evaluate(() => (document.querySelector('[data-choisir-calque="titre"]') as HTMLElement).focus());
          await p.keyboard.press('Enter');
          const dedans = await focus();
          if (dedans.perdu || !dedans.dansDialogue) defauts.push('390 · panneau des propriétés : focus hors du panneau');
          await p.keyboard.press('Escape');
          const rendu = await focus();
          if (rendu.perdu || !rendu.texte.startsWith('Texte · Accroche')) defauts.push('390 · panneau des propriétés : focus non rendu au calque');
        }
        await ctx.close();
      }
    } finally {
      await nav.close();
    }
    expect(defauts, defauts.join('\n')).toEqual([]);
  }, 1_800_000);
});
