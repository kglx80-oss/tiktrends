import { describe, it, expect, beforeAll, vi } from 'vitest';

/**
 * UX V5 · multi-conversation Jarvis · le DÉPÔT sur une VRAIE base (pglite,
 * migrations réelles, dont 0057). On lit les LIGNES, pas un appel :
 *
 *  · créer · une conversation portée (espace + marque + personne) existe ;
 *  · ouvrir / restitution · les messages d'une conversation reviennent, du plus
 *    ancien au plus récent, et PAS ceux d'une autre conversation ni du fil
 *    principal ;
 *  · renommer · le titre change, borné et nettoyé ;
 *  · PORTÉE · une autre personne ou une autre marque ne lit, ne renomme ni
 *    n'ouvre la conversation · le filtre ne la trouve pas.
 *
 * Mutation (faite à la main, restaurée) : retirer `eq(userId)` de
 * `messagesDeConversation` fait passer la lecture inter-personnes au vert · le
 * cas « u2 ne lit pas le fil de u1 » tombe alors en rouge, la garde regarde donc
 * la bonne chose.
 *
 * Mutation (faite sur copie, restaurée) : remettre `asc` + borne dans
 * `messagesDeConversation` fait tomber « 130 messages » sur « le dernier message
 * de la conversation doit être rendu » ; garder `desc` sans l'inversion le fait
 * tomber sur « les 120 derniers, du plus ancien au plus récent ».
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema } from '@tiktrends/db';
import {
  creerConversation, listerConversations, renommerConversation,
  conversationAppartient, messagesDeConversation, effacerMessagesConversation,
} from '../lib/jarvis/conversations';
import { messagesOnboarding, insererMessageOnboarding, effacerOnboarding } from '../lib/jarvis/onboarding';

const WS = '11111111-1111-4111-8111-111111111111';
const U1 = '22222222-2222-4222-8222-222222222221';
const U2 = '22222222-2222-4222-8222-222222222222';
const B1 = '33333333-3333-4333-8333-333333333331';
const B2 = '33333333-3333-4333-8333-333333333332';

const p1 = { workspaceId: WS, brandId: B1, userId: U1 };

async function message(conversationId: string | null, userId: string, brandId: string, role: string, content: string, at: Date) {
  await db.insert(schema.jarvisMessages).values({ workspaceId: WS, brandId, userId, conversationId, role, content, createdAt: at });
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: WS, name: 'Espace test' });
  await db.insert(schema.users).values([{ id: U1, email: 'u1@test.exemple' }, { id: U2, email: 'u2@test.exemple' }]);
  await db.insert(schema.brands).values([{ id: B1, workspaceId: WS, name: 'Neva' }, { id: B2, workspaceId: WS, name: 'Autre' }]);
});

describe('créer, ouvrir, restituer', () => {
  it('une conversation créée est listée · ouvrir restitue SES messages, en ordre', async () => {
    const conv = await creerConversation(p1);
    expect(conv).toBeTruthy();
    await message(conv, U1, B1, 'user', 'Première question sur Neva', new Date('2026-01-01T10:00:00Z'));
    await message(conv, U1, B1, 'assistant', 'Première réponse', new Date('2026-01-01T10:00:05Z'));

    const msgs = await messagesDeConversation(p1, conv);
    expect(msgs.map((m) => m.content)).toEqual(['Première question sur Neva', 'Première réponse']);

    // Le titre se dérive du premier message tant qu'on ne l'a pas renommée.
    const liste = await listerConversations(p1);
    expect(liste.find((c) => c.id === conv)?.titre).toBe('Première question sur Neva');
  });

  it('le fil principal (sans conversation) et une conversation nommée ne se mélangent pas', async () => {
    await message(null, U1, B1, 'user', 'Message du fil principal', new Date('2026-01-02T10:00:00Z'));
    const conv = await creerConversation(p1);
    await message(conv, U1, B1, 'user', 'Message de la conversation nommée', new Date('2026-01-02T11:00:00Z'));

    const principal = await messagesDeConversation(p1, null);
    expect(principal.map((m) => m.content)).toContain('Message du fil principal');
    expect(principal.map((m) => m.content)).not.toContain('Message de la conversation nommée');

    const nommee = await messagesDeConversation(p1, conv);
    expect(nommee.map((m) => m.content)).toEqual(['Message de la conversation nommée']);
  });
});

describe('conversation longue · la borne garde les DERNIERS messages', () => {
  // Défaut réparé · la lecture triait en ascendant PUIS bornait à 120 · au-delà
  // de 120 messages, l'écran montrait les 120 plus anciens et le contexte du
  // modèle (`.slice(-40)` de la route) figeait les messages 81 à 120 · les
  // derniers échanges disparaissaient de l'écran ET de ce que Jarvis relit.
  it('130 messages · le dernier est rendu, le premier non, en ordre chronologique', async () => {
    const conv = await creerConversation(p1);
    const t0 = Date.parse('2026-02-01T10:00:00Z');
    for (let i = 1; i <= 130; i++) {
      await message(conv, U1, B1, i % 2 ? 'user' : 'assistant', `Message ${i}`, new Date(t0 + i * 1000));
    }
    const contenus = (await messagesDeConversation(p1, conv)).map((m) => m.content);

    // Même borne qu'avant · le coût du contexte ne change pas, seuls les bons messages.
    expect(contenus).toHaveLength(120);
    expect(contenus, 'le dernier message de la conversation doit être rendu').toContain('Message 130');
    expect(contenus, 'le premier message (hors des 120 derniers) ne doit pas être rendu').not.toContain('Message 1');
    expect(contenus, 'les 120 derniers, du plus ancien au plus récent').toEqual(
      Array.from({ length: 120 }, (_, k) => `Message ${k + 11}`),
    );
  });
});

describe('renommer', () => {
  it('change le titre, nettoyé · un titre vide ne renomme rien', async () => {
    const conv = await creerConversation(p1);
    expect(await renommerConversation(p1, conv, '  Angles « rentrée des clubs »  ')).toBe(true);
    expect((await listerConversations(p1)).find((c) => c.id === conv)?.titre).toBe('Angles « rentrée des clubs »');
    expect(await renommerConversation(p1, conv, '   ')).toBe(false);
    expect((await listerConversations(p1)).find((c) => c.id === conv)?.titre).toBe('Angles « rentrée des clubs »');
  });
});

describe('portée · ni autre personne ni autre marque', () => {
  it('une conversation de u1/B1 est invisible et inatteignable pour u2 et pour B2', async () => {
    const conv = await creerConversation(p1);
    await message(conv, U1, B1, 'user', 'Secret de u1', new Date('2026-01-03T10:00:00Z'));

    // u2 (même marque) ne lit rien, ne possède pas, ne renomme pas.
    expect(await messagesDeConversation({ workspaceId: WS, brandId: B1, userId: U2 }, conv)).toEqual([]);
    expect(await conversationAppartient({ workspaceId: WS, brandId: B1, userId: U2 }, conv)).toBe(false);
    expect(await renommerConversation({ workspaceId: WS, brandId: B1, userId: U2 }, conv, 'Pirate')).toBe(false);
    expect((await listerConversations({ workspaceId: WS, brandId: B1, userId: U2 })).some((c) => c.id === conv)).toBe(false);

    // B2 (même personne, autre marque) non plus.
    expect(await messagesDeConversation({ workspaceId: WS, brandId: B2, userId: U1 }, conv)).toEqual([]);
    expect(await conversationAppartient({ workspaceId: WS, brandId: B2, userId: U1 }, conv)).toBe(false);
    expect((await listerConversations({ workspaceId: WS, brandId: B2, userId: U1 })).some((c) => c.id === conv)).toBe(false);

    // Le titre réel, lui, est resté lisible pour u1/B1.
    expect(await conversationAppartient(p1, conv)).toBe(true);
  });

  it('effacer le fil d’une conversation ne touche pas une autre', async () => {
    const a = await creerConversation(p1);
    const b = await creerConversation(p1);
    await message(a, U1, B1, 'user', 'A1', new Date('2026-01-04T10:00:00Z'));
    await message(b, U1, B1, 'user', 'B1', new Date('2026-01-04T10:00:00Z'));
    await effacerMessagesConversation(p1, a);
    expect(await messagesDeConversation(p1, a)).toEqual([]);
    expect((await messagesDeConversation(p1, b)).map((m) => m.content)).toEqual(['B1']);
  });
});

describe('onboarding (sans marque) · fil portée espace + personne', () => {
  it('écrit, restitue dans l’ordre, et efface · un autre membre ne voit rien', async () => {
    const pu1 = { workspaceId: WS, userId: U1 };
    const pu2 = { workspaceId: WS, userId: U2 };
    await insererMessageOnboarding(pu1, 'user', 'Par où je commence ?');
    await insererMessageOnboarding(pu1, 'assistant', 'Crée ta première marque.');
    const fil = await messagesOnboarding(pu1);
    expect(fil.map((m) => m.content)).toEqual(['Par où je commence ?', 'Crée ta première marque.']);
    // Portée · U2 (même espace) ne lit pas le fil d'onboarding de U1.
    expect(await messagesOnboarding(pu2)).toEqual([]);
    // Effacement scopé.
    await effacerOnboarding(pu1);
    expect(await messagesOnboarding(pu1)).toEqual([]);
  });

  // Défaut réparé · la lecture triait en ascendant PUIS bornait à 120 · au-delà
  // de 120 messages, l'écran d'onboarding montrait les 120 plus anciens et le
  // contexte du modèle (`.slice(-40)` de la route) figeait les messages 81 à 120.
  // Mutation (faite sur copie, restaurée) : remettre `asc` + borne fait tomber ce
  // cas sur « le dernier message du fil d'onboarding doit être rendu » ; garder
  // `desc` sans l'inversion le fait tomber sur « les 120 derniers, du plus ancien
  // au plus récent ».
  it('130 messages · le dernier est rendu, le premier non, en ordre chronologique', async () => {
    const pu2 = { workspaceId: WS, userId: U2 };
    const t0 = Date.parse('2026-03-01T10:00:00Z');
    await db.insert(schema.jarvisOnboardingMessages).values(Array.from({ length: 130 }, (_, k) => ({
      workspaceId: WS, userId: U2, role: k % 2 ? 'assistant' : 'user',
      content: `Onboarding ${k + 1}`, createdAt: new Date(t0 + (k + 1) * 1000),
    })));
    const contenus = (await messagesOnboarding(pu2)).map((m) => m.content);

    // Même borne qu'avant · le coût du contexte ne change pas, seuls les bons messages.
    expect(contenus).toHaveLength(120);
    expect(contenus, 'le dernier message du fil d’onboarding doit être rendu').toContain('Onboarding 130');
    expect(contenus, 'le premier message (hors des 120 derniers) ne doit pas être rendu').not.toContain('Onboarding 1');
    expect(contenus, 'les 120 derniers, du plus ancien au plus récent').toEqual(
      Array.from({ length: 120 }, (_, k) => `Onboarding ${k + 11}`),
    );
    await effacerOnboarding(pu2);
  });
});
