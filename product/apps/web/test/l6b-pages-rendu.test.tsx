// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L6-B · `/studio/projets/[id]/identites` au HTML RENDU, sur une vraie base
 * (pglite).
 *
 *  · VIDEO-02 · la contradiction du plan 2 est affichée avec « Devis bloqué »
 *    et ses DEUX résolutions (boutons), aucune appliquée par la visite ;
 *  · VIDEO-07 · aucune option lipsync activable (toutes `disabled`), carte
 *    « Parole synchronisée » indisponible avec sa raison, voix off proposée,
 *    alerte et bouton « Passer en voix off » pour le plan en lipsync ;
 *  · VIDEO-06 · « Synthèse vocale indisponible » dite, durée de la prise lue
 *    dans l'en-tête (1,70 s), dépassement de la cible écrit ;
 *  · la visite n'écrit rien ; lecteur : gestes désactivés ; autre espace : introuvable.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('notFound'); }, useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, schema } from '@tiktrends/db';
import { session, semer } from './studios-semis';
import { projetVideo } from './l4a-outils';
import { jargonEcran, texteVisible } from './helpers/jargon-ecran';
import { injecterLecteurMedias } from '../lib/studios/rendu/medias';
import IdentitesPage from '../app/(app)/studio/projets/[id]/identites/page';
import { contenuContradictoire } from '../../../packages/core/test/l6b-fixtures';

const ids = h.ids;
const qui = (q: 'ua' | 'uv' | 'ur' | 'ub') => { h.session = session(ids, q); };
const stockage = new Map<string, Uint8Array>();

async function rendre(id: string) {
  const d = document.createElement('div');
  d.innerHTML = renderToStaticMarkup(await IdentitesPage({ params: Promise.resolve({ id }) }));
  return d;
}
async function empreinteBase() {
  const n = async (t: any) => JSON.stringify(await db.select().from(t));
  return [await n(schema.studioProjects), await n(schema.studioProjectVersions), await n(schema.studioAuditEvents), await n(schema.studioPromptRuns), await n(schema.studioQuotes)].join('|');
}

let projectId = '';
beforeAll(async () => {
  await semer(db, schema, ids);
  injecterLecteurMedias({ async lire(m) { return stockage.get(m.storageKey) ?? null; } });
  const octets = new Uint8Array(readFileSync(join(__dirname, '../../../packages/core/test/fixtures/l6b-voix-16k.wav')));
  const assetId = randomUUID();
  const cle = `studios/${ids.wsA}/${assetId}.wav`;
  await db.insert(schema.studioAssets).values({ id: assetId, workspaceId: ids.wsA, brandId: ids.brandA1, storageKey: cle, mime: 'audio/wav', bytes: octets.length, sha256: createHash('sha256').update(octets).digest('hex'), origin: 'import', storageState: 'stored' });
  stockage.set(cle, octets);
  const c = contenuContradictoire();
  c.shots.byId.s1!.speechMode = 'lipsync';
  c.shots.byId.s1!.narration = 'Je ne lâche rien.';
  c.shots.byId.s1!.estimatedDurationMs = 1500;
  c.shots.byId.s1!.voiceAssetId = assetId;
  projectId = (await projetVideo(db, ids, ids.brandA1, ids.ua, c)).projectId;
});
afterAll(() => injecterLecteurMedias(null));

describe('/studio/projets/[id]/identites', () => {
  it('VIDEO-02 · contradiction affichée, « Devis bloqué », deux résolutions proposées ; la visite n’écrit rien', async () => {
    qui('ua');
    const avant = await empreinteBase();
    const d = await rendre(projectId);
    expect(await empreinteBase(), 'la visite a écrit').toBe(avant);
    expect(d.querySelector('h1')?.textContent).toBe('Identités et voix');
    const z = d.querySelector('[data-zone="contradictions"]')!;
    expect(z.querySelector('[data-etat="devis-bloque"]')?.textContent).toContain('Devis bloqué · un plan contredit sa fiche');
    expect(z.textContent).toContain('Plan s2 (sujet) : « veste jaune » contredit la fiche de Léa (tenue : veste verte).');
    const boutons = [...z.querySelectorAll('button[data-resolution]')];
    expect(boutons.map((b) => [b.getAttribute('data-resolution'), b.textContent, b.hasAttribute('disabled')])).toEqual([
      ['plan', 'Corriger le plan · « veste jaune » devient « veste verte »', false],
      ['identite', 'Changer la fiche · tenue de Léa : « veste jaune » (version 2)', false],
    ]);
    expect(z.textContent).toContain('Touche 2 plans (plan 1, plan 2) : leurs images seront à refaire. Après ce choix, 1 contradiction resterait dans le projet.');
    const fiche = d.querySelector('[data-identite="perso_lea"]')!;
    expect(fiche.textContent).toContain('Fiche version 1');
    expect(fiche.textContent).toContain('Tenue · veste verte');
  });

  it('VIDEO-07 · aucune option lipsync activable, voix off proposée, plan en lipsync à basculer', async () => {
    qui('ua');
    const d = await rendre(projectId);
    const v = d.querySelector('[data-zone="voix"]')!;
    const optionsLipsync = [...v.querySelectorAll('option[value="lipsync"]')];
    expect(optionsLipsync.length).toBe(2);
    expect(optionsLipsync.every((o) => o.hasAttribute('disabled'))).toBe(true);
    expect(optionsLipsync.every((o) => o.textContent === 'Parole synchronisée (lipsync) · indisponible')).toBe(true);
    expect([...v.querySelectorAll('option[value="voiceover"]')].every((o) => !o.hasAttribute('disabled'))).toBe(true);
    expect(v.querySelectorAll('input[value="lipsync"], button[data-mode="lipsync"]').length).toBe(0);
    const carteLipsync = v.querySelector('li[data-mode="lipsync"]')!;
    expect(carteLipsync.getAttribute('data-disponible')).toBe('non');
    expect(carteLipsync.textContent).toContain('Indisponible');
    expect(carteLipsync.textContent).toContain('Elle n’est jamais simulée.');
    expect(v.querySelector('li[data-mode="voiceover"]')?.textContent).toContain('Proposé');
    const alerte = v.querySelector('[data-etat="lipsync-indisponible"]')!;
    expect(alerte.textContent).toContain('Parole synchronisée demandée sans fournisseur · plan 1.');
    expect([...alerte.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Passer en voix off']);
  });

  it('VIDEO-06 · synthèse indisponible dite, durée lue dans la prise, dépassement écrit ; aucun jargon', async () => {
    qui('ua');
    const d = await rendre(projectId);
    const v = d.querySelector('[data-zone="voix"]')!;
    expect(v.querySelector('[data-capacite="synthese"]')?.textContent).toBe('Synthèse vocale indisponible · aucun tarif de voix n’existe dans l’offre et aucun fournisseur de voix n’est branché. La voix ne prononce que la narration validée de chaque plan.');
    expect(v.querySelector('[data-plan="s1"] [data-prise="mesuree"]')?.textContent).toBe('Prise existante · durée mesurée 1,70 s (lue dans l’en-tête WAV) pour 1,50 s prévues. Le plan passe à 1,70 s.');
    expect(v.querySelector('[data-plan="s2"] [data-prise="absente"]')?.textContent).toBe('Aucune prise · durée prévue 3,00 s, à confirmer par une prise réelle.');
    expect(v.querySelector('[data-temps="depassement"]')?.textContent).toBe('Durée recalculée 4,70 s pour une cible de 4,50 s · dépassement de 0,20 s.');
    expect(jargonEcran(texteVisible(d.innerHTML))).toEqual([]);
    expect(d.innerHTML).not.toMatch(/—/);
  });

  it('lecteur · gestes désactivés ; autre espace · introuvable', async () => {
    qui('uv');
    const d = await rendre(projectId);
    expect([...d.querySelectorAll('button[data-resolution]')].every((b) => b.hasAttribute('disabled'))).toBe(true);
    expect([...d.querySelectorAll('button')].some((b) => b.textContent === 'Nouvelle fiche')).toBe(false);
    qui('ub');
    const x = await rendre(projectId);
    expect(x.querySelector('h1')?.textContent).toBe('Projet introuvable');
    expect(x.textContent).not.toContain('Léa');
  });
});
