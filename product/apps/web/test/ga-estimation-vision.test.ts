import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * G-A · estimation d'un appel avec image (besoin F-D n° 2).
 *
 * Le défaut : `guardedAnthropic` estimait l'entrée sur la longueur JSON du
 * contenu, base64 des images compris. Une image de 1 Mo (1 000 000 octets)
 * pesait 1 333 336 caractères de base64 ⇒ 1,203039 $ réservés (Sonnet,
 * `max_tokens` 4000), quand le fournisseur facture au plus
 * `VISION_JETONS_IMAGE_MAX` = 4 784 jetons par image. Le plafond refusait à
 * tort un appel vision qui tenait.
 *
 * On lit les RÉSULTATS : montant calculé, ligne `ai_spend` réservée (pglite,
 * migrations réelles), appel parti ou refusé. Client Anthropic remplacé par un
 * espion (aucun réseau, 0 $).
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

const faux = vi.hoisted(() => ({ appels: 0, vuPendant: null as unknown }));
vi.mock('@tiktrends/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/ai')>();
  return {
    ...actual,
    anthropicFromEnv: () => ({
      messages: {
        create: async () => {
          faux.appels += 1;
          return { id: 'msg_simule', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 5000, output_tokens: 200 } };
        },
      },
    }),
  };
});

import type Anthropic from '@anthropic-ai/sdk';
import { db, schema, eq } from '@tiktrends/db';
import { estimateCallCost, costOfTokens, VISION_JETONS_IMAGE_MAX } from '@tiktrends/core';
import { guardedAnthropic, coutMaximalAppel, entreeAppel, SpendBlockedError } from '../lib/spend-guard';

const CLE = 'AI_SPEND_CAP_USD';
const MODELE = 'claude-sonnet-5';
const UN_MO = 1_000_000;

/** Un bloc image comme l'adaptateur le construit (`contenuUtilisateur`) · octets en base64. */
const image = (octets: number): Anthropic.ImageBlockParam => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.alloc(octets, 7).toString('base64') } });
const TEXTE = 'Contrôle visuel : la sortie respecte-t-elle les composants protégés ?';
const appel = (images: Anthropic.ImageBlockParam[], max = 4000): Anthropic.MessageCreateParamsNonStreaming => ({
  model: MODELE, max_tokens: max, system: [{ type: 'text', text: 'Système' }],
  messages: [{ role: 'user', content: [...images, { type: 'text', text: TEXTE }] }],
});
/** Ce qu'on réservait AVANT (G-A) · `promptChars` d'origine, recopié : longueur JSON du contenu, base64 compris. */
function ancienneEstimation(p: Anthropic.MessageCreateParamsNonStreaming): number {
  let n = typeof p.system === 'string' ? p.system.length : JSON.stringify(p.system ?? '').length;
  for (const m of p.messages) n += typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length;
  if (p.tools) n += JSON.stringify(p.tools).length;
  return estimateCallCost({ model: String(p.model), promptChars: n, maxTokens: p.max_tokens });
}

const avant = process.env[CLE];
beforeEach(async () => { await db!.delete(schema.aiSpend); faux.appels = 0; });
afterEach(() => { if (avant === undefined) delete process.env[CLE]; else process.env[CLE] = avant; });

describe('estimation · une image compte sa borne de jetons, pas la longueur de son base64', () => {
  it('image de 1 Mo · 4 784 jetons d’entrée pour l’image, le texte et max_tokens comptés comme avant', () => {
    const p = appel([image(UN_MO)]);
    const texteSeul = appel([]);
    expect(entreeAppel(p)).toEqual({ caracteres: entreeAppel(texteSeul).caracteres, images: 1 });
    const attendu = Math.round((estimateCallCost({ model: MODELE, promptChars: entreeAppel(texteSeul).caracteres, maxTokens: 4000 }) + costOfTokens(MODELE, VISION_JETONS_IMAGE_MAX, 0)) * 1e6) / 1e6;
    expect(coutMaximalAppel(p), 'l’image n’est pas estimée à sa borne de 4 784 jetons').toBe(attendu);
    // Tableau mesuré (claude-sonnet-5, max_tokens 4000) · écrit dans spend-guard.ts.
    const base64 = (p.messages[0]!.content as Array<{ source?: { data?: string } }>)[0]!.source!.data!.length;
    expect({ base64, avant: ancienneEstimation(p), apres: coutMaximalAppel(p) })
      .toEqual({ base64: 1_333_336, avant: 1.203039, apres: 0.074466 });
  });

  it('la borne ne dépend pas de la taille · 1 ko et 1 Mo coûtent pareil ; deux images, deux bornes', () => {
    expect(coutMaximalAppel(appel([image(1_000)]))).toBe(coutMaximalAppel(appel([image(UN_MO)])));
    const une = coutMaximalAppel(appel([image(UN_MO)]));
    const deux = coutMaximalAppel(appel([image(UN_MO), image(UN_MO)]));
    expect(Math.round((deux - une) * 1e6)).toBe(Math.round(costOfTokens(MODELE, VISION_JETONS_IMAGE_MAX, 0) * 1e6));
  });

  it('sans image · strictement l’estimation d’avant (texte simple, blocs texte, système en blocs, outils)', () => {
    const cas: Anthropic.MessageCreateParamsNonStreaming[] = [
      { model: MODELE, max_tokens: 5000, messages: [{ role: 'user', content: 'x' }] },
      appel([]),
      { model: MODELE, max_tokens: 1200, system: 'Système en texte', messages: [{ role: 'user', content: 'Bonjour' }, { role: 'assistant', content: [{ type: 'text', text: 'Oui ?' }] }] },
    ];
    cas.push({ ...appel([]), tools: [{ name: 'outil', description: 'd', input_schema: { type: 'object', properties: {} } }] });
    for (const p of cas) expect(coutMaximalAppel(p), 'un appel sans image n’est plus estimé comme avant').toBe(ancienneEstimation(p));
  });
});

describe('barrière · le plafond n’est plus bloqué à tort par une image', () => {
  it('plafond 0,50 $ · l’appel avec une image de 1 Mo part ; la réservation vaut la borne (0,074466 $), pas 1,20 $', async () => {
    process.env[CLE] = '0.5';
    const c = guardedAnthropic({ workspaceId: randomUUID(), action: 'ga:vision' })!;
    const r = await c.messages.create(appel([image(UN_MO)])).then(() => 'parti', (e) => (e instanceof SpendBlockedError ? `refusé · ${e.message}` : `erreur · ${String(e)}`));
    expect(r, 'plafond bloqué à tort · l’image est comptée sur son base64').toBe('parti');
    expect(faux.appels).toBe(1);
    const lignes = await db!.select().from(schema.aiSpend).where(eq(schema.aiSpend.action, 'ga:vision'));
    // Réservée au maximum (borne), puis réglée au réel lu dans la réponse.
    expect(lignes.map((l) => ({ estime: l.estimatedUsd, reel: l.actualUsd, entree: l.inputTokens })))
      .toEqual([{ estime: 0.074466, reel: costOfTokens(MODELE, 5000, 200), entree: 5000 }]);
  });

  it('le plafond garde ses dents · plafond 0,05 $ ⇒ le même appel (max 0,074466 $) est refusé AVANT l’appel, aucune ligne', async () => {
    process.env[CLE] = '0.05';
    const c = guardedAnthropic({ workspaceId: randomUUID(), action: 'ga:vision-refus' })!;
    const e = await c.messages.create(appel([image(UN_MO)])).catch((x) => x);
    expect(e).toBeInstanceOf(SpendBlockedError);
    expect({ appels: faux.appels, lignes: (await db!.select().from(schema.aiSpend).where(eq(schema.aiSpend.action, 'ga:vision-refus'))).length }).toEqual({ appels: 0, lignes: 0 });
  });
});
