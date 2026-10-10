import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * L8-B · UX-05 · navigation · routes historiques toujours servies, et le
 * « retour Veille » d'un projet créé depuis la Veille porte TOUS ses critères
 * (recherche, filtres, page) et la carte d'où l'on est parti.
 *
 * On parcourt la carte `ROUTES_HISTORIQUES` (`lib/navigation.ts`) : chaque
 * chemin est déclaré dans `ROUTES`, sa page existe, et elle lit encore chaque
 * paramètre que des liens en circulation portent. Puis on suit le vrai chemin
 * du retour : critères de la Veille → `contexteVeille` (carte) → nettoyage
 * serveur à la création (`retourNettoye`) → page projet RENDUE (`VueProjet`) →
 * href du lien « Revenir à la recherche de Veille ».
 *
 * Une partie VIVANTE (facultative) interroge un serveur local de recette si
 * `RECETTE_URL` et `RECETTE_SECRET` sont fournis · sans eux elle est sautée.
 */

const h = vi.hoisted(() => ({ session: { workspaceId: 'ws', role: 'owner', plan: 'business', user: { id: 'u', email: 'u@exemple.invalid' } } as Record<string, unknown> }));
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: 'b1', name: 'Maison Ondine' }) }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock('../app/actions/studios/propositions', () => ({ listerPropositions: async () => ({ ok: false, code: 'NOT_FOUND', message: 'x', traceId: 't' }) }));
vi.mock('../app/actions/studios/sources', () => ({ exporterBrief: async () => ({ ok: false }) }));

import {
  contexteVeille, ancreCarteVeille, annonceObservee, referenceSource, lienRetourVeille, PARAM_RETOUR_VEILLE, completudeProjet,
  ANCIENNES_ADRESSES_STUDIO, CHEMIN_PROJETS, CHEMIN_NOUVEAU_PROJET, PARAMS_NOUVEAU_PROJET, destinationAncienneAdresse,
} from '@tiktrends/core';
import { ROUTES, ROUTES_HISTORIQUES, matchRoute } from '../lib/navigation';
import { studioDepuisVeille } from '../lib/veille-link';
import { retourNettoye } from '../lib/studios/sources/sources';
import { VueProjet } from '../components/studios/projet/VueProjet';
import StudioPage from '../app/(app)/studio/page';

const APP = join(process.cwd(), 'app', '(app)');
const fichierPage = (motif: string): string | null => {
  const base = join(APP, ...motif.split('/').filter(Boolean));
  for (const f of ['page.tsx', 'route.ts']) if (existsSync(join(base, f))) return join(base, f);
  return null;
};

describe('UX-05 · chaque route historique est servie et lit encore ses paramètres', () => {
  it('la carte couvre les trois origines · Studio, Pubs IA, Veille', () => {
    expect(new Set(ROUTES_HISTORIQUES.map((r) => r.origine))).toEqual(new Set(['Studio', 'Pubs IA', 'Veille']));
  });
  for (const r of ROUTES_HISTORIQUES) {
    it(`${r.chemin} · déclarée, page présente${r.params.length ? `, lit ${r.params.join(', ')}` : ''}`, () => {
      expect(ROUTES.some((x) => x.path === r.chemin), `${r.chemin} a quitté la carte ROUTES`).toBe(true);
      expect(matchRoute(r.chemin.replace('[id]', '00000000-0000-4000-8000-000000000000'))?.path).toBe(r.chemin);
      const f = fichierPage(r.chemin);
      expect(f, `${r.chemin} n’a plus de page · les liens existants mèneraient à un 404`).not.toBeNull();
      const source = readFileSync(f!, 'utf8');
      if ((ANCIENNES_ADRESSES_STUDIO as readonly string[]).includes(r.chemin)) {
        // Ancien studio retiré · la page ne fait plus que rediriger, en passant
        // TOUS ses paramètres à la règle du noyau, et mène à une page servie.
        const passe = r.chemin === '/studio' ? /redirect\(CHEMIN_PROJETS\)/ : new RegExp(`redirect\\(destinationAncienneAdresse\\('${r.chemin}', await searchParams\\)\\)`);
        expect(source, `${r.chemin} ne redirige plus avec ses paramètres`).toMatch(passe);
        const dest = destinationAncienneAdresse(r.chemin, {}).split('?')[0]!;
        expect(fichierPage(dest), `${r.chemin} redirige vers ${dest}, sans page`).not.toBeNull();
      } else if (r.chemin === CHEMIN_NOUVEAU_PROJET) {
        // La préparation relit son adresse par la règle du noyau (bornée, validée).
        expect(source, `${r.chemin} ne relit plus son adresse`).toContain('lireContexteNouveauProjet(await searchParams)');
        const perdus = r.params.filter((p) => !(PARAMS_NOUVEAU_PROJET as readonly string[]).includes(p));
        expect(perdus, `${r.chemin} ne lit plus : ${perdus.join(', ')}`).toEqual([]);
      } else {
        const perdus = r.params.filter((p) => !new RegExp(`\\bsp\\.${p}\\b`).test(source));
        expect(perdus, `${r.chemin} ne lit plus : ${perdus.join(', ')}`).toEqual([]);
      }
      // Recherche globale conservée · la page vit sous la coquille de l'appli (barre « Rechercher »).
      expect(f!.startsWith(APP)).toBe(true);
    });
  }
});

const CRITERES = { q: 'Geheimnis', p: 'meta', searchIn: 'ad_copy', media: 'video', sort: 'longestRunning', status: 'active', country: 'DE', page: '3' };
const AD = { id: 'sample_neutrogena', platform: 'meta', advertiserName: 'Neutrogena', body: 'Kennst du schon das Geheimnis ?', callToAction: 'ORDER NOW', daysRunning: 143, mediaType: 'video' };

function retourDuProjet(): string {
  const ancre = ancreCarteVeille(AD);
  const contexte = `${contexteVeille(CRITERES)}#${ancre}`; // ce que la carte de Veille passe à « Préparer une création »
  const stocke = retourNettoye(contexte); // ce que le serveur garde dans la référence de source
  const source = referenceSource({ type: 'veille_ad', annonce: annonceObservee(AD)!, savedAdId: null, portee: { workspaceId: 'ws', brandId: 'b1' }, observeLe: new Date('2026-10-09T08:00:00Z'), format: null, retourVeille: stocke });
  const vueSource = { ...source, apercu: null, lienSource: lienRetourVeille(stocke) };
  const html = renderToStaticMarkup(
    <VueProjet exportAutorise detail={{
      projet: { id: 'p1', title: 'D’après Neutrogena', kind: 'ads', libelleType: 'Publicité', status: 'active', brandId: 'b1', marque: 'Maison Ondine', createdAt: '2026-10-09T08:00:00Z', updatedAt: '2026-10-09T08:00:00Z' },
      version: { id: 'v1', n: 1, createdAt: '2026-10-09T08:00:00Z', contentHash: 'h'.repeat(64) },
      brief: null, briefIllisible: false, hypothese: null, produit: null, sources: [vueSource], sourcesIllisibles: 0,
      completude: completudeProjet({ brief: null, produit: null, sources: [vueSource], aDuContenuDeProduction: false }),
      versions: [{ id: 'v1', n: 1, createdAt: '2026-10-09T08:00:00Z', reason: '', courante: true }],
    } as never} />,
  );
  const d = /<a href="([^"]+)"[^>]*>(?:(?!<\/a>).)*Revenir à la recherche de Veille/s.exec(html);
  return d ? d[1]!.replace(/&amp;/g, '&') : '';
}

describe('UX-05 · « Revenir à la recherche de Veille » depuis un projet créé depuis la Veille', () => {
  it('le lien rendu sur la page projet porte la recherche, CHAQUE filtre, la page et la carte', () => {
    const href = retourDuProjet();
    expect(href, 'la page projet ne rend plus de lien de retour vers la Veille').toMatch(/^\/veille\?/);
    const u = new URL(href, 'http://x');
    const params = ROUTES_HISTORIQUES.find((r) => r.chemin === '/veille')!.params.filter((p) => p !== PARAM_RETOUR_VEILLE);
    const perdus = params.filter((p) => u.searchParams.get(p) !== (CRITERES as Record<string, string>)[p]);
    expect(perdus, `critères perdus au retour : ${perdus.join(', ')}`).toEqual([]);
    expect(u.hash, 'la carte d’origine (position) est perdue').toBe(`#${ancreCarteVeille(AD)}`);
  });

  it('le lien « Génère ta version » mène à la préparation d’un projet, avec son origine et le même retour', () => {
    const ancre = ancreCarteVeille(AD);
    const url = new URL(studioDepuisVeille(AD as never, { ref: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f', retour: `${contexteVeille(CRITERES)}#${ancre}` }), 'http://x');
    expect(url.pathname).toBe(CHEMIN_NOUVEAU_PROJET);
    // Une annonce de Veille ne porte ni produit nommé ni test Adsmap.
    const attendus = ROUTES_HISTORIQUES.find((r) => r.chemin === CHEMIN_NOUVEAU_PROJET)!.params.filter((p) => p !== 'produit' && p !== 'iter');
    const absents = attendus.filter((p) => !url.searchParams.has(p));
    expect(absents, `le lien historique a perdu : ${absents.join(', ')}`).toEqual([]);
    expect(lienRetourVeille(url.searchParams.get(PARAM_RETOUR_VEILLE))).toBe(retourDuProjet());
  });
});

describe('UX-05 · les projets sont atteignables depuis le Studio', () => {
  it('l’ancienne page /studio mène aux projets Studios', () => {
    expect(() => StudioPage()).toThrow(`redirect ${CHEMIN_PROJETS}`);
  });
});

/* ───────────── Partie vivante · serveur local de recette (facultative) ───────────── */

const URL_RECETTE = process.env.RECETTE_URL;
const SECRET = process.env.RECETTE_SECRET;
const UID = process.env.RECETTE_UID;
const PROJET = process.env.RECETTE_PROJET;

function jeton(): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const t = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ uid: UID, ep: 0, iat: now, exp: now + 600 })}`;
  return `${t}.${createHmac('sha256', SECRET!).update(t).digest('base64url')}`;
}

describe.skipIf(!URL_RECETTE || !SECRET || !UID)('UX-05 · en vrai, sur le serveur de recette local', () => {
  for (const r of ROUTES_HISTORIQUES) {
    it(`${r.chemin} répond, avec la recherche globale`, async () => {
      if (r.chemin.includes('[id]') && !PROJET) return;
      const chemin = r.chemin.replace('[id]', PROJET ?? '');
      const res = await fetch(`${URL_RECETTE}${chemin}`, { headers: { cookie: `tt_session=${jeton()}` }, redirect: 'manual' });
      expect(res.status, `${chemin} → ${res.status}`).toBe(200);
      const html = await res.text();
      expect(html, `${chemin} · barre de recherche globale absente`).toContain('Rechercher');
    });
  }
  it('le projet créé depuis la Veille rend son lien de retour avec les critères', async () => {
    if (!PROJET) return;
    const res = await fetch(`${URL_RECETTE}/studio/projets/${PROJET}`, { headers: { cookie: `tt_session=${jeton()}` } });
    const html = await res.text();
    expect(html).toMatch(/href="\/veille\?q=[^"]+#ad-[^"]+"/);
  });
});
