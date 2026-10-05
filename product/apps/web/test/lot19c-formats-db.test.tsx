import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { and, eq } from 'drizzle-orm';

/**
 * Lot 19C · formats créatifs v1 · sur une VRAIE base (pglite, migrations
 * réelles). On exerce l'action de classement et la page `/veille/formats` et on
 * lit des RÉSULTATS · la ligne en base, le HTML rendu.
 *
 * - identité (espace, plateforme, external_id) · la même annonce sauvegardée
 *   dans deux espaces · classer dans A ne touche pas B ; une annonce qui n'existe
 *   que dans B est introuvable depuis A ;
 * - contrôle de la fonctionnalité Veille (offre Core) sur l'écriture ET sur
 *   `saveAd` (qui ne vérifiait que la session) ;
 * - compteurs = nombre réel, valeur inconnue → non classée, filtre par média,
 *   critères relus depuis l'URL, vignette absente → « Aperçu indisponible ».
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { wsA: randomUUID(), wsB: randomUUID(), userA: randomUUID(), userB: randomUUID() };
});
const session = vi.hoisted(() => ({ plan: 'core' as string, role: 'member' as string }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({
  getSession: async () => ({
    user: { id: ids.userA, email: 'camille@test.local', name: 'Camille' },
    workspaceId: ids.wsA, workspaceName: 'Agence A', role: session.role, plan: session.plan,
  }),
}));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => null }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error('redirect ' + u); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/saved',
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }), useToastSiPresent: () => null }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackSavedAdAction: async () => ({}) }));

import { db, schema } from '@tiktrends/db';
import { classerFormatSauvegarde, saveAd } from '../app/actions/inspo';
import FormatsPage from '../app/(app)/veille/formats/page';
import SavedPage from '../app/(app)/saved/page';
import { VueFormats } from '../app/(app)/veille/formats/VueFormats';
import { CRITERES_FORMATS_DEFAUT } from '@tiktrends/core';
import type { InspoAd } from '@tiktrends/integrations';

const ad = (id: string, mediaType: string, extra: Partial<InspoAd> = {}): InspoAd =>
  ({ id, platform: 'meta', status: 'active', daysRunning: 12, mediaType, advertiserName: 'Marque ' + id, thumbnailUrl: `https://cdn.exemple.test/${id}.jpg`, ...extra });

async function snapshot(ws: string, ext: string) {
  const [r] = await db!.select({ s: schema.savedAds.snapshot }).from(schema.savedAds)
    .where(and(eq(schema.savedAds.workspaceId, ws), eq(schema.savedAds.platform, 'meta'), eq(schema.savedAds.externalId, ext)));
  return r?.s as Record<string, unknown> | undefined;
}
const sauver = (ws: string, ext: string, a: InspoAd | Record<string, unknown>, quand = '2026-10-01T10:00:00Z') =>
  db!.insert(schema.savedAds).values({ workspaceId: ws, platform: 'meta', externalId: ext, snapshot: a, createdAt: new Date(quand) });

beforeAll(async () => {
  await db!.insert(schema.users).values([{ id: ids.userA, email: 'camille@test.local', name: 'Camille' }, { id: ids.userB, email: 'b@test.local', name: 'B' }]);
  await db!.insert(schema.workspaces).values([{ id: ids.wsA, name: 'Agence A', plan: 'core' }, { id: ids.wsB, name: 'Agence B', plan: 'core' }]);
  // La MÊME annonce (meta, partagee-1) sauvegardée dans les deux espaces.
  await sauver(ids.wsA, 'partagee-1', ad('partagee-1', 'image'));
  await sauver(ids.wsB, 'partagee-1', ad('partagee-1', 'image'));
  // Une annonce qui n'existe QUE dans B.
  await sauver(ids.wsB, 'seulement-b', ad('seulement-b', 'image'));
  // A · une vidéo, une image déjà classée, une valeur inconnue, une ancienne valeur, une vignette absente.
  await sauver(ids.wsA, 'video-1', ad('video-1', 'video'), '2026-10-02T10:00:00Z');
  await sauver(ids.wsA, 'image-classee', { ...ad('image-classee', 'image'), formatCreatif: { id: 'packshot', version: 1, date: '2026-10-03T09:00:00Z', auteur: ids.userA } }, '2026-09-20T10:00:00Z');
  await sauver(ids.wsA, 'valeur-inconnue', { ...ad('valeur-inconnue', 'image'), formatCreatif: { id: 'format_qui_nexiste_pas', version: 1 } });
  await sauver(ids.wsA, 'ancienne-valeur', { ...ad('ancienne-valeur', 'video'), formatCreatif: 'ugc_talking_head' });
  await sauver(ids.wsA, 'sans-vignette', { ...ad('sans-vignette', 'image', { thumbnailUrl: undefined, mediaUrl: undefined }), formatCreatif: { id: 'texte_seul', version: 1, date: '2026-10-04T09:00:00Z', auteur: ids.userA } });
});

beforeEach(() => { session.plan = 'core'; session.role = 'member'; });

describe('écriture · identité (espace, plateforme, external_id)', () => {
  it('classer dans A écrit A, avec version, date, auteur · B est intact', async () => {
    const avantB = await snapshot(ids.wsB, 'partagee-1');
    const r = await classerFormatSauvegarde({ platform: 'meta', externalId: 'partagee-1', format: 'packshot' });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const a = await snapshot(ids.wsA, 'partagee-1');
    expect(a?.formatCreatif).toMatchObject({ id: 'packshot', version: 1, auteur: ids.userA });
    expect(Date.parse(String((a?.formatCreatif as { date: string }).date))).not.toBeNaN();
    // Le reste du snapshot est conservé.
    expect(a?.advertiserName).toBe('Marque partagee-1');
    expect(await snapshot(ids.wsB, 'partagee-1'), 'l’annonce de l’autre espace ne doit pas bouger').toEqual(avantB);
  });

  it('une annonce d’un autre espace est refusée et reste intacte', async () => {
    const avant = await snapshot(ids.wsB, 'seulement-b');
    const r = await classerFormatSauvegarde({ platform: 'meta', externalId: 'seulement-b', format: 'packshot' });
    expect(r).toEqual({ ok: false, error: 'Annonce introuvable dans ton espace · recharge la page.' });
    expect(await snapshot(ids.wsB, 'seulement-b')).toEqual(avant);
  });

  it('un format qui ne s’applique pas au média est refusé', async () => {
    const r = await classerFormatSauvegarde({ platform: 'meta', externalId: 'video-1', format: 'packshot' });
    expect(r.ok).toBe(false);
    expect((await snapshot(ids.wsA, 'video-1'))?.formatCreatif).toBeUndefined();
  });

  it('non_classe retire le classement', async () => {
    await classerFormatSauvegarde({ platform: 'meta', externalId: 'video-1', format: 'demo' });
    expect((await snapshot(ids.wsA, 'video-1'))?.formatCreatif).toMatchObject({ id: 'demo' });
    const r = await classerFormatSauvegarde({ platform: 'meta', externalId: 'video-1', format: 'non_classe' });
    expect(r).toMatchObject({ ok: true, format: null });
    expect((await snapshot(ids.wsA, 'video-1'))?.formatCreatif).toBeUndefined();
  });
});

describe('contrôle de la fonctionnalité Veille', () => {
  it('sans la Veille (offre Starter), classer est refusé et rien n’est écrit', async () => {
    session.plan = 'starter';
    const avant = await snapshot(ids.wsA, 'video-1');
    const r = await classerFormatSauvegarde({ platform: 'meta', externalId: 'video-1', format: 'demo' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain('Core');
    expect(await snapshot(ids.wsA, 'video-1')).toEqual(avant);
  });

  it('sans la Veille, saveAd refuse aussi (il ne vérifiait que la session)', async () => {
    session.plan = 'starter';
    const r = await saveAd({ platform: 'meta', externalId: 'interdite', snapshot: ad('interdite', 'image') });
    expect(r.ok).toBe(false);
    expect(await snapshot(ids.wsA, 'interdite')).toBeUndefined();
  });

  it('un rôle lecteur client est refusé', async () => {
    session.role = 'client_viewer';
    const r = await classerFormatSauvegarde({ platform: 'meta', externalId: 'video-1', format: 'demo' });
    expect(!r.ok && r.error).toContain('rôle');
  });

  it('avec la Veille, saveAd écrit mais jamais un classement passager', async () => {
    const r = await saveAd({ platform: 'meta', externalId: 'passager', snapshot: { ...ad('passager', 'image'), formatCreatif: { id: 'packshot', version: 1 } } as unknown as InspoAd });
    expect(r.ok).toBe(true);
    const s = await snapshot(ids.wsA, 'passager');
    expect(s?.advertiserName).toBe('Marque passager');
    expect(s?.formatCreatif, 'le classement ne s’écrit que par l’action dédiée').toBeUndefined();
    await db!.delete(schema.savedAds).where(and(eq(schema.savedAds.workspaceId, ids.wsA), eq(schema.savedAds.externalId, 'passager')));
  });
});

const rendre = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await FormatsPage({ searchParams: Promise.resolve(sp) }));
const compteDe = (h: string, id: string) => { const m = h.match(new RegExp(`data-format="${id}" data-compte="(\\d+)"`)); return m ? Number(m[1]) : null; };

describe('/veille/formats · compteurs réels, rendu', () => {
  it('chaque format présent porte son nombre réel · non classées comptées à part · aucun format à 0 présenté', async () => {
    // État connu · A = partagee-1 (packshot), video-1 (non classée), image-classee (packshot),
    // valeur-inconnue (non classée), ancienne-valeur (face_camera), sans-vignette (texte_seul).
    const h = await rendre();
    expect(compteDe(h, 'packshot')).toBe(2);
    expect(compteDe(h, 'face_camera')).toBe(1);
    expect(compteDe(h, 'texte_seul')).toBe(1);
    const presents = [...h.matchAll(/data-format="([a-z_]+)" data-compte="(\d+)"/g)];
    expect(presents.map((m) => m[1]).sort()).toEqual(['face_camera', 'packshot', 'texte_seul']);
    expect(presents.every((m) => Number(m[2]) > 0)).toBe(true);
    expect(h).toContain('6 sauvegardes · 4 classées · 2 non classées');
    expect(h).toContain('2 sauvegardes à classer');
    // L'autre espace n'entre dans aucun compte.
    expect(h).not.toContain('seulement-b');
  });

  it('une valeur inconnue en base est comptée non classée, sans crash', async () => {
    const h = await rendre({ format: 'non_classe' });
    expect(h).toContain('data-annonce="valeur-inconnue"');
    expect(h).toContain('data-annonce="video-1"');
    expect(h).not.toContain('data-annonce="image-classee"');
  });

  it('le périmètre affiché · tes sauvegardes classées, jamais toute la bibliothèque', async () => {
    const h = await rendre();
    expect(h).toContain('tes sauvegardes classées');
    expect(h).toContain('Ce n’est pas toute la bibliothèque de la Veille');
  });

  it('le filtre par média restreint les comptes et la liste proposée', async () => {
    const h = await rendre({ media: 'video' });
    expect(compteDe(h, 'face_camera')).toBe(1);
    expect(compteDe(h, 'packshot')).toBeNull();
    expect(h).toContain('2 sauvegardes dans ces critères');
  });

  it('les critères sont relus depuis l’URL · grille, critère retirable, retour qui garde le média', async () => {
    const h = await rendre({ format: 'packshot', media: 'image', tri: 'classe' });
    const annonces = [...h.matchAll(/data-annonce="([^"]+)"/g)].map((m) => m[1]);
    expect(annonces, 'tri « classées récemment » · la classée aujourd’hui d’abord').toEqual(['partagee-1', 'image-classee']);
    expect(h).toContain('href="/veille/formats?media=image&amp;tri=classe" aria-label="Retirer le critère Format · Packshot"');
    expect(h).toContain('href="/veille/formats?media=image"');
    expect(h).toContain('← Tous les formats');
    expect(h).toMatch(/href="\/veille\/formats\?format=packshot&amp;media=image&amp;tri=classe" aria-current="true"/);
  });

  it('le choix « Format » d’une vidéo ne propose aucun format image seule', async () => {
    const h = await rendre({ format: 'non_classe' });
    const carte = h.slice(h.indexOf('data-annonce="video-1"'));
    const select = carte.slice(carte.indexOf('<select'), carte.indexOf('</select>'));
    expect(select).toContain('value="face_camera"');
    expect(select).not.toContain('value="packshot"');
    expect(select).toContain('<option value="non_classe" selected="">Non classé</option>');
    expect(carte.slice(0, carte.indexOf('<select'))).toMatch(/<label for="[^"]+"[^>]*>Format<\/label>/);
  });

  it('une vignette absente montre « Aperçu indisponible » · le classement survit', async () => {
    const h = await rendre({ format: 'texte_seul' });
    const carte = h.slice(h.indexOf('data-annonce="sans-vignette"'));
    expect(carte).toContain('Aperçu indisponible');
    expect(carte).toContain('<option value="texte_seul" selected="">Texte seul</option>');
    expect(carte).toContain('classée le 04/10/2026 par Camille');
  });

  it('sans la Veille, la page est verrouillée et ne montre aucune annonce', async () => {
    session.plan = 'starter';
    const h = await rendre();
    expect(h).toContain('Fonctionnalité incluse dès l’abonnement Core');
    expect(h).not.toContain('data-format=');
  });
});

describe('/veille/formats · états vides', () => {
  it('aucune sauvegarde · ni compteurs à zéro ni filtres, une explication et une sortie', () => {
    const h = renderToStaticMarkup(<VueFormats annonces={[]} criteres={CRITERES_FORMATS_DEFAUT} marque="Vide" suivis={[]} adsmap={false} />);
    expect(h).toContain('Aucune annonce sauvegardée.');
    expect(h).toContain('href="/veille"');
    expect(h, 'pas de « 0 sauvegarde · 0 classée » présenté comme un compte').not.toContain('data-compteurs');
    expect(h, 'pas de filtres qui ne trouveraient rien').not.toContain('aria-label="Média"');
    expect(h).not.toContain('data-format=');
  });
});

/**
 * Sauvegardes · le choix « Format » de la carte suit le DROIT Veille calculé
 * côté serveur (`saved/page.tsx`) · sans Veille, désactivé dès la carte avec sa
 * raison ; avec, actif. On rend la page réelle (pglite) et on lit le HTML.
 */
describe('/saved · choix « Format » selon le droit Veille', () => {
  const rendreSaved = async () => renderToStaticMarkup(await SavedPage({ searchParams: Promise.resolve({}) }));
  const selects = (h: string) => [...h.matchAll(/<select[^>]*data-format-choix[^>]*>/g)].map((m) => m[0]);

  it('avec la Veille (Core) · chaque choix est actif, aucune raison affichée', async () => {
    const h = await rendreSaved();
    expect(selects(h).length, 'un choix par carte').toBeGreaterThan(3);
    expect(selects(h).every((x) => !/\sdisabled=""/.test(x)), 'aucun choix désactivé').toBe(true);
    expect(h).not.toContain('data-format-indisponible');
  });

  it('sans la Veille (Starter) · chaque choix est désactivé dès la carte, la raison est dite et liée', async () => {
    session.plan = 'starter';
    const h = await rendreSaved();
    const s = selects(h);
    expect(s.length).toBeGreaterThan(3);
    expect(s.every((x) => /\sdisabled=""/.test(x)), 'tous les choix désactivés').toBe(true);
    expect(h).toContain('Classement réservé à la Veille · offre Core.');
    const id = s[0]!.match(/aria-describedby="([^" ]+)/)![1]!;
    expect(h, 'la raison est liée au choix (lecteur d’écran)').toContain(`id="${id}" data-format-indisponible="true"`);
  });
});

