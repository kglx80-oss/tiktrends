import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';

/**
 * F-A · R2 · UNE réservation pour tous les chemins payants du site.
 *
 * Constat (contre-recette du 8 octobre, P1) : la barrière web lisait la somme
 * puis insérait sans le verrou du worker, et le chemin Anthropic n'écrivait sa
 * ligne qu'APRÈS l'appel. La course mixte sur PostgreSQL réel est dans
 * `fa-course-mixte-pg.test.ts` (locale). Ce fichier tourne PARTOUT (pglite,
 * migrations réelles) et vérifie les RÉSULTATS en base :
 *  · Anthropic · la ligne existe, au MAXIMUM, PENDANT l'appel ; trois appels
 *    simultanés contre un plafond qui en tient deux ⇒ deux partent ;
 *  · le plafond refuse AVANT l'appel quand le maximum ne tient pas ;
 *  · règlement au réel une fois ; refus certain ⇒ rendu ; issue incertaine ⇒ gardé ;
 *  · flux : réglé seulement à l'usage final ; coupé ou jamais lu ⇒ gardé ;
 *  · règlement / libération rejoués ⇒ rien ne change.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

const faux = vi.hoisted(() => ({ create: null as null | ((p: unknown) => Promise<unknown>), appels: 0 }));
vi.mock('@tiktrends/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/ai')>();
  return {
    ...actual,
    anthropicFromEnv: () => ({ messages: { create: async (p: unknown) => { faux.appels += 1; return faux.create!(p); } } }),
  };
});

import { db, schema, eq, reglerDepense, annulerDepense, reserverDepense, type BaseDepense } from '@tiktrends/db';
import { estimateCallCost, costOfTokens, reservationTexteLiberable, REFUS_CERTAINS_TEXTE } from '@tiktrends/core';
import { guardedAnthropic, sousPlafond, annuleCoutFixe, guardFixedCost, spentUsd, SpendBlockedError } from '../lib/spend-guard';

const CLE = 'AI_SPEND_CAP_USD';
const avant = process.env[CLE];
const base = db as unknown as BaseDepense;

/** max_tokens 5000 sur Sonnet : 5000 × 15 $/M + 1 jeton d'entrée × 3 $/M. */
const APPEL = { model: 'claude-sonnet-5', max_tokens: 5000, messages: [{ role: 'user' as const, content: 'x' }] };
const MAX = estimateCallCost({ model: 'claude-sonnet-5', promptChars: 3, maxTokens: 5000 });
const REPONSE = (entree: number, sortie: number) => ({ id: 'msg_simule', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: entree, output_tokens: sortie } });

const lignes = async (action: string) => db!.select().from(schema.aiSpend).where(eq(schema.aiSpend.action, action));
const client = (action: string) => guardedAnthropic({ workspaceId: randomUUID(), action })!;

beforeEach(async () => {
  await db!.delete(schema.aiSpend);
  process.env[CLE] = '50';
  faux.appels = 0;
  faux.create = async () => REPONSE(1000, 100);
});
afterEach(() => { if (avant === undefined) delete process.env[CLE]; else process.env[CLE] = avant; });

describe('Anthropic · le maximum est réservé AVANT l’appel', () => {
  it('le maximum vaut 0,075003 $ (5000 × 15 $/M + 1 × 3 $/M) · dérivé des tarifs du noyau', () => {
    expect(MAX).toBe(0.075003);
  });

  it('pendant l’appel, la ligne existe déjà au maximum ; après, elle est réglée au réel, une seule ligne', async () => {
    let vuPendant: unknown = null;
    faux.create = async () => {
      vuPendant = (await lignes('r2:pendant')).map((l) => ({ est: l.estimatedUsd, reel: l.actualUsd, entree: l.inputTokens, sortie: l.outputTokens }));
      return REPONSE(1000, 100);
    };
    await client('r2:pendant').messages.create(APPEL);
    expect(vuPendant, 'aucune réservation visible pendant l’appel · la dépense est écrite après').toEqual([{ est: MAX, reel: MAX, entree: null, sortie: null }]);
    const apres = await lignes('r2:pendant');
    expect(apres.map((l) => ({ est: l.estimatedUsd, reel: l.actualUsd, entree: l.inputTokens, sortie: l.outputTokens, p: l.provider })))
      .toEqual([{ est: MAX, reel: costOfTokens('claude-sonnet-5', 1000, 100), entree: 1000, sortie: 100, p: 'anthropic' }]);
  });

  it('trois appels simultanés contre un plafond qui n’en tient que deux · deux partent, le troisième est refusé sans appel', async () => {
    process.env[CLE] = '0.2';
    let liberer!: () => void;
    const porte = new Promise<void>((r) => { liberer = r; });
    faux.create = async () => { await porte; return REPONSE(1, 5000); };
    const c = client('r2:trois');
    const issues = Promise.allSettled([c.messages.create(APPEL), c.messages.create(APPEL), c.messages.create(APPEL)]);
    // Les trois sont lancés ; on laisse les réservations se faire avant d'ouvrir la porte.
    await new Promise((r) => setTimeout(r, 200));
    const appelsEnVol = faux.appels;
    liberer();
    const r = await issues;
    expect({ appelsEnVol, refus: r.filter((x) => x.status === 'rejected').length }, 'les trois appels sont partis ensemble · le plafond ne réserve pas avant l’appel')
      .toEqual({ appelsEnVol: 2, refus: 1 });
    expect(r.find((x) => x.status === 'rejected')!.reason).toBeInstanceOf(SpendBlockedError);
    expect(await spentUsd()).toBeLessThanOrEqual(0.2);
  });

  it('le maximum ne tient pas ⇒ refus AVANT l’appel, aucune ligne', async () => {
    process.env[CLE] = '0.05';
    const e = await client('r2:refus').messages.create(APPEL).catch((x) => x);
    expect(e).toBeInstanceOf(SpendBlockedError);
    expect((e as Error).message).toContain('0.08 $');
    expect({ appels: faux.appels, lignes: (await lignes('r2:refus')).length }).toEqual({ appels: 0, lignes: 0 });
  });

  it('base injoignable ⇒ refus avant l’appel (en cas de doute, on refuse)', async () => {
    const d = db as unknown as { transaction: unknown };
    const vraie = d.transaction;
    d.transaction = async () => { throw new Error('connexion perdue'); };
    try {
      const e = await client('r2:panne').messages.create(APPEL).catch((x) => x);
      expect(e).toBeInstanceOf(SpendBlockedError);
      const f = await sousPlafond('fal_image', { workspaceId: randomUUID(), action: 'r2:panne' }, async () => 'parti').catch((x) => x);
      expect(f).toBeInstanceOf(SpendBlockedError);
    } finally { d.transaction = vraie; }
    expect(faux.appels).toBe(0);
  });
});

describe('Anthropic · issue de l’appel : rendu si certain, gardé si incertain', () => {
  const H = undefined;
  const cas: Array<[string, () => Error, 'rendue' | 'gardée']> = [
    ['400 demande malformée', () => new Anthropic.BadRequestError(400, { type: 'error' }, 'invalid_request_error', H), 'rendue'],
    ['401 clé refusée', () => new Anthropic.AuthenticationError(401, { type: 'error' }, 'authentication_error', H), 'rendue'],
    ['403 accès refusé', () => new Anthropic.PermissionDeniedError(403, { type: 'error' }, 'permission_error', H), 'rendue'],
    ['422 entité refusée', () => new Anthropic.UnprocessableEntityError(422, { type: 'error' }, 'unprocessable', H), 'rendue'],
    ['429 saturation (rejouée par le client)', () => new Anthropic.RateLimitError(429, { type: 'error' }, 'rate_limit_error', H), 'gardée'],
    ['500 panne', () => new Anthropic.InternalServerError(500, { type: 'error' }, 'api_error', H), 'gardée'],
    ['529 surcharge', () => new Anthropic.InternalServerError(529, { type: 'error' }, 'overloaded_error', H), 'gardée'],
    ['coupure réseau', () => new Anthropic.APIConnectionError({ message: 'Connection error.' }), 'gardée'],
    ['délai dépassé', () => new Anthropic.APIConnectionTimeoutError(), 'gardée'],
    ['erreur inconnue', () => new Error('inattendu'), 'gardée'],
  ];
  it.each(cas)('%s ⇒ réservation %s', async (_nom, erreur, attendu) => {
    faux.create = async () => { throw erreur(); };
    const e = await client('r2:issue').messages.create(APPEL).catch((x) => x);
    expect(e, 'l’erreur du fournisseur doit être relancée telle quelle').not.toBeInstanceOf(SpendBlockedError);
    const l = await lignes('r2:issue');
    expect(l.map((x) => ({ est: x.estimatedUsd, reel: x.actualUsd })), `réservation non ${attendu} après « ${_nom} »`).toEqual([{ est: MAX, reel: attendu === 'rendue' ? 0 : MAX }]);
  });

  it('une réponse sans usage garde le maximum (ne compte jamais pour zéro)', async () => {
    faux.create = async () => ({ id: 'm', type: 'message', role: 'assistant', content: [] });
    await client('r2:sans-usage').messages.create(APPEL);
    expect((await lignes('r2:sans-usage')).map((x) => x.actualUsd)).toEqual([MAX]);
  });

  it('règle pure · seuls 400, 401, 403, 422 libèrent', () => {
    expect(Object.keys(REFUS_CERTAINS_TEXTE).map(Number).sort()).toEqual([400, 401, 403, 422]);
    for (const s of [400, 401, 403, 422]) expect(reservationTexteLiberable(s), `refus certain ${s} non libéré`).toBe(true);
    for (const s of [undefined, null, '400', 404, 408, 409, 413, 429, 500, 529, 400.5]) expect(reservationTexteLiberable(s), `issue incertaine ${String(s)} libérée`).toBe(false);
  });
});

describe('Anthropic · flux', () => {
  async function* flux(evs: unknown[], coupure = false) {
    for (const e of evs) yield e;
    if (coupure) throw new Error('socket hang up');
  }
  const DEBUT = { type: 'message_start', message: { usage: { input_tokens: 700 } } };
  const FIN = { type: 'message_delta', usage: { output_tokens: 300 } };
  const lire = async (it: unknown) => { for await (const _ of it as AsyncIterable<unknown>) { void _; } };

  it('flux complet ⇒ réglé au réel à l’usage final', async () => {
    faux.create = async () => flux([DEBUT, { type: 'content_block_delta' }, FIN, { type: 'message_stop' }]);
    await lire(await client('r2:flux').messages.create({ ...APPEL, stream: true }));
    expect((await lignes('r2:flux')).map((x) => [x.actualUsd, x.inputTokens, x.outputTokens])).toEqual([[costOfTokens('claude-sonnet-5', 700, 300), 700, 300]]);
  });

  it('flux coupé avant l’usage final ⇒ la réservation (maximum) reste', async () => {
    faux.create = async () => flux([DEBUT, { type: 'content_block_delta' }], true);
    await expect(lire(await client('r2:flux-coupe').messages.create({ ...APPEL, stream: true }))).rejects.toThrow('socket hang up');
    expect((await lignes('r2:flux-coupe')).map((x) => [x.actualUsd, x.inputTokens]), 'flux coupé réglé sur un usage partiel · la sortie facturée est sous-comptée').toEqual([[MAX, null]]);
  });

  it('flux jamais lu ⇒ la réservation (maximum) est déjà comptée', async () => {
    faux.create = async () => flux([DEBUT, FIN]);
    await client('r2:flux-ignore').messages.create({ ...APPEL, stream: true });
    expect((await lignes('r2:flux-ignore')).map((x) => x.actualUsd)).toEqual([MAX]);
  });
});

describe('coût fixe du site · même réservation', () => {
  it('la réservation est visible PENDANT l’appel payant', async () => {
    let pendant = -1;
    await sousPlafond('fal_image', { workspaceId: randomUUID(), action: 'r2:fixe' }, async () => { pendant = await spentUsd(); return 'ok'; });
    expect(pendant).toBeCloseTo(0.08, 10);
  });
});

describe('règlement et libération idempotents', () => {
  const reserver = async (usd: number) => {
    const r = await reserverDepense(base, { workspaceId: null, provider: 'anthropic', model: 'claude-sonnet-5', action: 'r2:idem', usd }, { depuis: new Date(0), decider: () => ({ allowed: true, reason: '' }) });
    if (!r.ok) throw new Error('réservation refusée');
    return r.id;
  };
  const etat = async (id: string) => {
    const [l] = await db!.select().from(schema.aiSpend).where(eq(schema.aiSpend.id, id));
    return [l!.estimatedUsd, l!.actualUsd, l!.inputTokens, l!.outputTokens];
  };

  it('régler deux fois ⇒ la seconde ne change rien', async () => {
    const id = await reserver(0.075);
    expect(await reglerDepense(base, id, { usd: 0.01, inputTokens: 10, outputTokens: 20 })).toBe(true);
    expect(await reglerDepense(base, id, { usd: 0.05, inputTokens: 99, outputTokens: 99 }), 'second règlement appliqué · le règlement n’est pas idempotent').toBe(false);
    expect(await etat(id)).toEqual([0.075, 0.01, 10, 20]);
  });

  it('régler même avec un coût égal au maximum marque la ligne · un second règlement ne change rien', async () => {
    const id = await reserver(0.075);
    expect(await reglerDepense(base, id, { usd: 0.075, inputTokens: 1, outputTokens: 5000 })).toBe(true);
    expect(await reglerDepense(base, id, { usd: 0.001, inputTokens: 1, outputTokens: 1 }), 'second règlement appliqué · le règlement n’est pas idempotent').toBe(false);
    expect(await etat(id)).toEqual([0.075, 0.075, 1, 5000]);
  });

  it('une ligne réglée n’est jamais rendue ; une ligne rendue n’est jamais réglée', async () => {
    const a = await reserver(0.075);
    await reglerDepense(base, a, { usd: 0.02, inputTokens: 5, outputTokens: 5 });
    expect(await annulerDepense(base, a), 'une ligne réglée au coût réel a été rendue').toBe(false);
    expect(await etat(a)).toEqual([0.075, 0.02, 5, 5]);
    const b = await reserver(0.075);
    expect(await annulerDepense(base, b)).toBe(true);
    expect(await reglerDepense(base, b, { usd: 0.02, inputTokens: 5, outputTokens: 5 }), 'une ligne rendue a été réglée de nouveau').toBe(false);
    expect(await etat(b)).toEqual([0.075, 0, null, null]);
  });

  it('rendre deux fois (site : annuleCoutFixe) ⇒ la seconde ne change rien', async () => {
    const id = await guardFixedCost('fal_image', { workspaceId: randomUUID(), action: 'r2:idem' });
    expect(await annuleCoutFixe(id, 'requete')).toBe(true);
    expect(await annuleCoutFixe(id, 'requete'), 'seconde libération appliquée · la libération n’est pas idempotente').toBe(false);
    expect(await etat(id!)).toEqual([0.08, 0, null, null]);
  });
});
