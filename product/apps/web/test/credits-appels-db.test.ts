import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Débit en crédits des appels IA aujourd'hui gratuits (29/10, point 4) · sur
 * une vraie base (pglite, migrations réelles) et la fonction serveur réelle
 * (`reserverAppel`). On lit le SOLDE et le JOURNAL, jamais la présence d'un appel.
 *
 * Mutations faites (restaurées) :
 *  · `regler` ne rend pas le surplus ⇒ « ajusté au coût réel » tombe (solde 965 au lieu de 990) ;
 *  · `annuler` ne rend rien ⇒ « un appel qui échoue rend tout » tombe ;
 *  · `regimeSession` ignorant `TARIFS_V2` ⇒ « sans l'interrupteur, rien n'est réservé » tombe.
 */
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq } from '@tiktrends/db';
import { coutActionRegime } from '@tiktrends/core';
import { regimeEspace, regimeSession, reserverAppel } from '../lib/credits-appels';

const W = schema.workspaces;
async function espace(plan: string, solde: number) {
  const id = randomUUID();
  await db.insert(W).values({ id, name: 'Appels', plan, creditsBalance: solde });
  return id;
}
const solde = async (id: string) => (await db.select({ c: W.creditsBalance }).from(W).where(eq(W.id, id)))[0]!.c;
const journal = async (id: string) => (await db.select({ d: schema.creditLedger.delta }).from(schema.creditLedger).where(eq(schema.creditLedger.workspaceId, id))).map((r) => r.d);

afterEach(() => { delete process.env.TARIFS_V2; });

describe('appels IA · réserver au prix annoncé, ajuster au coût réel', () => {
  it('sans l’interrupteur TARIFS_V2, rien n’est réservé, même sur un forfait V2', async () => {
    const id = await espace('pro', 1000);
    expect(regimeSession({ plan: 'pro' })).toBe('actuel');
    expect(await regimeEspace(id)).toBe('actuel');
    const resa = await reserverAppel({ workspaceId: id, annonce: coutActionRegime('jarvis_message', regimeSession({ plan: 'pro' })), raison: 'Jarvis · conversation' });
    expect(resa?.reserve).toBe(0);
    await resa!.regler(0.5);
    expect(await solde(id)).toBe(1000);
    expect(await journal(id)).toEqual([]);
  });

  it('avec TARIFS_V2 sur Pro · 35 réservés, puis ajustés au coût réel (0,01 $ ⇒ 10 crédits)', async () => {
    process.env.TARIFS_V2 = '1';
    const id = await espace('pro', 1000);
    expect(await regimeEspace(id)).toBe('v2');
    const resa = await reserverAppel({ workspaceId: id, annonce: coutActionRegime('jarvis_message', regimeSession({ plan: 'pro' })), raison: 'Jarvis · conversation' });
    expect(resa?.reserve).toBe(35);
    expect(await solde(id)).toBe(965);
    await resa!.regler(0.01);
    await resa!.regler(0.01); // idempotent
    expect(await solde(id)).toBe(990);
    expect(await journal(id)).toEqual([-35, 25]);
  });

  it('un appel qui échoue rend tout · un abonné actuel (Core) n’est pas débité même avec TARIFS_V2', async () => {
    process.env.TARIFS_V2 = '1';
    const id = await espace('essentiel', 100);
    const resa = await reserverAppel({ workspaceId: id, annonce: 35, raison: 'Studio · appel texte' });
    await resa!.annuler();
    expect(await solde(id)).toBe(100);
    const core = await espace('core', 100);
    expect(await regimeEspace(core)).toBe('actuel');
  });

  it('solde insuffisant · rien n’est réservé, l’appel ne part pas', async () => {
    process.env.TARIFS_V2 = '1';
    const id = await espace('essentiel', 20);
    expect(await reserverAppel({ workspaceId: id, annonce: 35, raison: 'Jarvis · conversation' })).toBeNull();
    expect(await solde(id)).toBe(20);
  });
});
