import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { and, eq } from 'drizzle-orm';

/**
 * Lot 1 V5 · hypothèses LIBRES, sur une VRAIE base (pglite, migrations réelles,
 * 0068 comprise). On appelle les VRAIES actions (`creerHypotheseAction`,
 * `completerHypotheseAction`, `saveAd`) et on rend la VRAIE page Hypothèses
 * (`/adsmap/hypotheses`) · on lit le HTML, colonne par colonne.
 *
 *  · créée de rien → dans « À formuler », avec ce qui manque, en mots ;
 *  · depuis une pub de la Veille, depuis une accroche de persona, depuis un
 *    apprentissage → idem, avec sa source sur la carte ;
 *  · « Compléter la phrase » → la carte dit « Phrase complète », l'estimation
 *    d'équipe donne la priorité ;
 *  · une référence d'une AUTRE marque (persona, sauvegarde, ad) → refus, rien
 *    d'écrit ;
 *  · un rôle sans droit, une formule sans Adsmap → refus, rien d'écrit.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return {
    ws: randomUUID(), marqueX: randomUUID(), marqueY: randomUUID(), camille: randomUUID(),
    personaX: randomUUID(), personaY: randomUUID(), appris: randomUUID(),
  };
});
const session = vi.hoisted(() => ({ plan: 'plus' as string, role: 'member' as string, marque: 'X' as 'X' | 'Y' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({
  getSession: async () => ({
    user: { id: ids.camille, email: 'camille@agence.test', name: 'Camille' },
    workspaceId: ids.ws, workspaceName: 'Agence', role: session.role, plan: session.plan,
  }),
}));
vi.mock('../lib/brands', () => ({
  getActiveBrand: async () => (session.marque === 'X'
    ? { id: ids.marqueX, name: 'Marque X', workspaceId: ids.ws }
    : { id: ids.marqueY, name: 'Marque Y', workspaceId: ids.ws }),
}));
// Rien de payant ni de lent · la mémoire Jarvis (statistiques) est neutralisée.
vi.mock('../lib/jarvis-memory', () => ({ invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }) }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error('redirect ' + u); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/adsmap/hypotheses',
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema } from '@tiktrends/db';
import { completerHypotheseAction, creerHypotheseAction } from '../app/actions/adsmap-hypotheses';
import { saveAd } from '../app/actions/inspo';
import HypothesesSpatial from '../app/(spatial)/sp/adsmap/hypotheses/page';
import type { InspoAd } from '@tiktrends/integrations';

const pub = (id: string, annonceur: string): InspoAd =>
  ({ id, platform: 'meta', status: 'active', daysRunning: 12, mediaType: 'image', advertiserName: annonceur, body: `Texte de ${annonceur}` });

/** Le tableau rendu · le HTML de chaque colonne, par titre. */
async function tableau(): Promise<Record<string, string[]>> {
  const html = renderToStaticMarkup(await HypothesesSpatial({ searchParams: Promise.resolve({}) }));
  const board = html.slice(html.indexOf('<div class="board4">'));
  expect(board, 'le tableau des hypothèses n’est pas rendu').not.toBe('');
  const out: Record<string, string[]> = {};
  for (const col of board.split('<div class="colh">').slice(1)) {
    const titre = col.slice(0, col.indexOf('<span'));
    out[titre] = col.split('<div class="hcard">').slice(1);
  }
  return out;
}
const carte = (cartes: string[] | undefined, texte: string) => (cartes ?? []).find((c) => c.includes(texte)) ?? '';
const nbAds = async () => (await db!.select({ id: schema.ads.id }).from(schema.ads).where(eq(schema.ads.workspaceId, ids.ws))).length;

beforeAll(async () => {
  await db!.insert(schema.users).values({ id: ids.camille, email: 'camille@agence.test', name: 'Camille' });
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence', plan: 'plus' });
  await db!.insert(schema.workspaceMembers).values({ workspaceId: ids.ws, userId: ids.camille, role: 'member' });
  await db!.insert(schema.brands).values([{ id: ids.marqueX, workspaceId: ids.ws, name: 'Marque X' }, { id: ids.marqueY, workspaceId: ids.ws, name: 'Marque Y' }]);
  await db!.insert(schema.personas).values([
    { id: ids.personaX, brandId: ids.marqueX, name: 'Léa, 34 ans', status: 'validated' },
    { id: ids.personaY, brandId: ids.marqueY, name: 'Hugo, 41 ans', status: 'validated' },
  ]);
  await db!.insert(schema.learnings).values({ id: ids.appris, workspaceId: ids.ws, brandId: ids.marqueX, scope: 'ad', statement: 'Les accroches en question retiennent mieux' });
  // Une pub gardée pour la marque Y · elle ne doit pas devenir une hypothèse de X.
  await db!.insert(schema.savedAds).values({ workspaceId: ids.ws, brandId: ids.marqueY, platform: 'meta', externalId: 'veille-y', snapshot: pub('veille-y', 'Annonceur Y') });
});
beforeEach(() => { session.plan = 'plus'; session.role = 'member'; session.marque = 'X'; });

describe('créer une hypothèse · elle entre dans « À formuler »', () => {
  it('de rien · phrase incomplète, ce qui manque en mots, « Idée d’équipe », bouton « Compléter la phrase »', async () => {
    const r = await creerHypotheseAction({ source: { type: 'libre' }, saisie: { si: 'le prix barré apparaît dans l’image' } });
    expect(r.error, r.error).toBeUndefined();
    expect(r.adId).toBeTruthy();
    const [ad] = await db!.select().from(schema.ads).where(eq(schema.ads.id, r.adId!));
    expect(ad!.status).toBe('draft');
    expect(ad!.hypothesis).toBe('Si le prix barré apparaît dans l’image, alors… ?');

    const t = await tableau();
    const c = carte(t['À formuler'], 'le prix barré apparaît dans l’image');
    expect(c, 'l’hypothèse créée n’est pas dans « À formuler »').not.toBe('');
    expect(c).toContain('Il manque le résultat attendu (alors…), la raison (parce que…) et la variable testée · Idée d’équipe');
    expect(c).toMatch(/<button class="btn sm"[^>]*>Compléter la phrase<\/button>/);
    expect(c).toContain('aria-label="Priorité à évaluer"');
    for (const autre of ['Prête à tester', 'En test', 'Conclue']) expect(carte(t[autre], 'le prix barré'), `hypothèse rangée dans « ${autre} »`).toBe('');
  });

  it('depuis une pub de la Veille · gardée en source, « Veille · <annonceur> » sur la carte', async () => {
    const ad = pub('veille-x', 'Ploufy');
    expect((await saveAd({ platform: 'meta', externalId: ad.id, snapshot: ad })).ok).toBe(true);
    const r = await creerHypotheseAction({ source: { type: 'veille', platform: 'meta', externalId: 'veille-x' }, saisie: { si: 'on reprend la structure de la pub de Ploufy', variable: 'hook' } });
    expect(r.error, r.error).toBeUndefined();
    const [l] = await db!.select({ type: schema.ads.adType, ref: schema.ads.sourceRef }).from(schema.ads).where(eq(schema.ads.id, r.adId!));
    expect(l!.type, 'le pont Veille fait une imitation').toBe('imitation');
    const c = carte((await tableau())['À formuler'], 'structure de la pub de Ploufy');
    expect(c, 'l’hypothèse Veille n’est pas dans « À formuler »').not.toBe('');
    expect(c).toContain('Il manque le résultat attendu (alors…) et la raison (parce que…) · Veille · Ploufy');
    expect(c).toContain('<span class="pill c">Accroche</span>');
  });

  it('depuis une accroche de persona · rangée sous ce persona, « Persona · Léa » sur la carte', async () => {
    const r = await creerHypotheseAction({
      source: { type: 'persona', personaId: ids.personaX, accroche: 'enfin une crème qui ne colle pas' },
      saisie: { si: 'l’accroche reprend ses mots « enfin une crème qui ne colle pas »', alors: 'le taux d’accroche monte', parceQue: 'ce sont ses mots', variable: 'hook' },
    });
    expect(r.error, r.error).toBeUndefined();
    const [g] = await db!.select({ persona: schema.personas.id, callout: schema.concepts.callout }).from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id)).innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id)).innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(eq(schema.ads.id, r.adId!));
    expect(g).toEqual({ persona: ids.personaX, callout: 'enfin une crème qui ne colle pas' });
    const c = carte((await tableau())['À formuler'], 'enfin une crème qui ne colle pas');
    expect(c).toContain('Phrase complète · avant le test : l’offre et la page de destination · Persona · Léa');
    expect(c).toMatch(/>Modifier<\/button>/);
  });

  it('depuis un apprentissage (fonction exposée au lot 3) · « Apprentissage · … » sur la carte', async () => {
    const r = await creerHypotheseAction({ source: { type: 'apprentissage', learningId: ids.appris }, saisie: { parceQue: 'les accroches en question retiennent mieux', si: 'on ouvre sur une question' } });
    expect(r.error, r.error).toBeUndefined();
    const c = carte((await tableau())['À formuler'], 'on ouvre sur une question');
    expect(c).toContain('Apprentissage · Les accroches en question retiennent mieux');
  });
});

describe('compléter la phrase', () => {
  it('la carte passe à « Phrase complète », l’estimation donne la priorité', async () => {
    const { adId } = await creerHypotheseAction({ source: { type: 'libre' }, saisie: { si: 'on tutoie' } });
    const r = await completerHypotheseAction({ adId: adId!, saisie: { si: 'on tutoie', alors: 'le clic tient', parceQue: 'les concurrents tutoient', variable: 'body', impact: '3', confiance: '3', effort: '1' } });
    expect(r.error, r.error).toBeUndefined();
    const [ad] = await db!.select().from(schema.ads).where(eq(schema.ads.id, adId!));
    expect([ad!.iceImpact, ad!.iceConfidence, ad!.iceEffort]).toEqual([3, 3, 1]);
    const c = carte((await tableau())['À formuler'], 'le clic tient');
    expect(c).toContain('Si on tutoie, alors le clic tient, parce que les concurrents tutoient.'.replace('Si', '<b>Si</b>').replace('alors', '<b>alors</b>').replace('parce que', '<b>parce que</b>'));
    expect(c).toContain('Phrase complète · avant le test : l’offre et la page de destination · Idée d’équipe');
    expect(c).toContain('aria-label="Priorité forte"');
  });

  it('une hypothèse sortie du brouillon ne se réécrit plus', async () => {
    const { adId } = await creerHypotheseAction({ source: { type: 'libre' }, saisie: { si: 'on raccourcit à 15 s' } });
    await db!.update(schema.ads).set({ status: 'proposed' }).where(eq(schema.ads.id, adId!));
    const r = await completerHypotheseAction({ adId: adId!, saisie: { si: 'autre chose' } });
    expect(r.error).toBe('Cette hypothèse a quitté le brouillon · sa phrase ne se réécrit plus.');
    const [ad] = await db!.select({ h: schema.ads.hypothesis }).from(schema.ads).where(eq(schema.ads.id, adId!));
    expect(ad!.h).toBe('Si on raccourcit à 15 s, alors… ?');
  });
});

describe('marque bornée · une référence d’une autre marque est refusée, rien n’est écrit', () => {
  it('persona d’une autre marque', async () => {
    const avant = await nbAds();
    const r = await creerHypotheseAction({ source: { type: 'persona', personaId: ids.personaY, accroche: 'x' }, saisie: { si: 'on teste ses mots' } });
    expect(r.error).toBe('Persona introuvable dans la marque active.');
    expect(await nbAds()).toBe(avant);
  });
  it('pub de la Veille sauvegardée pour une autre marque', async () => {
    const avant = await nbAds();
    const r = await creerHypotheseAction({ source: { type: 'veille', platform: 'meta', externalId: 'veille-y' }, saisie: { si: 'on reprend sa structure' } });
    expect(r.error).toBe('Cette pub est sauvegardée pour une autre marque de l’espace · ouvre cette marque pour en faire une hypothèse.');
    expect(await nbAds()).toBe(avant);
  });
  it('compléter l’hypothèse d’une autre marque · introuvable, et absente du tableau de X', async () => {
    session.marque = 'Y';
    const { adId } = await creerHypotheseAction({ source: { type: 'libre' }, saisie: { si: 'hypothèse de la marque Y' } });
    expect(adId).toBeTruthy();
    session.marque = 'X';
    const r = await completerHypotheseAction({ adId: adId!, saisie: { si: 'réécrite depuis X' } });
    expect(r.error).toBe('Hypothèse introuvable dans la marque active.');
    const [ad] = await db!.select({ h: schema.ads.hypothesis }).from(schema.ads).where(eq(schema.ads.id, adId!));
    expect(ad!.h).toBe('Si hypothèse de la marque Y, alors… ?');
    expect(JSON.stringify(await tableau())).not.toContain('hypothèse de la marque Y');
  });
  it('apprentissage d’une autre marque', async () => {
    session.marque = 'Y';
    const r = await creerHypotheseAction({ source: { type: 'apprentissage', learningId: ids.appris }, saisie: { si: 'x' } });
    expect(r.error).toBe('Apprentissage introuvable dans la marque active.');
  });
});

describe('droits · la garde des actions Adsmap, rien de plus', () => {
  it('un membre en lecture seule (client_viewer) · refus, rien n’est écrit', async () => {
    session.role = 'client_viewer';
    const avant = await nbAds();
    const r = await creerHypotheseAction({ source: { type: 'libre' }, saisie: { si: 'tentative' } });
    expect(r.error).toBe('Ton rôle ne permet pas d’accéder à Adsmap.');
    const { adId } = (await db!.select({ adId: schema.ads.id }).from(schema.ads).where(and(eq(schema.ads.workspaceId, ids.ws), eq(schema.ads.status, 'draft'))).limit(1))[0]!;
    expect((await completerHypotheseAction({ adId, saisie: { si: 'tentative' } })).error).toBe('Ton rôle ne permet pas d’accéder à Adsmap.');
    expect(await nbAds()).toBe(avant);
  });
  it('une formule sans Adsmap · refus en le disant', async () => {
    session.plan = 'core';
    const r = await creerHypotheseAction({ source: { type: 'libre' }, saisie: { si: 'tentative' } });
    expect(r.error).toBe('Adsmap est disponible à partir de l’offre Plus.');
  });
  it('une saisie vide · refusée par la règle du noyau, rien n’est écrit', async () => {
    const avant = await nbAds();
    const r = await creerHypotheseAction({ source: { type: 'libre' }, saisie: { si: '  ', alors: '' } });
    expect(r.error).toMatch(/^Écris au moins une partie de la phrase/);
    expect(await nbAds()).toBe(avant);
  });
});
