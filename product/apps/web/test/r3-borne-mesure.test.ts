import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * R3 · effet MESURÉ de la borne d'entrée sur les plus gros appels du dépôt.
 *
 * Les requêtes sont construites par les VRAIES fonctions des Pubs IA
 * (`@tiktrends/ai`), chaque champ borné à sa longueur maximale (les `slice`
 * du code), avec un client qui CAPTURE la requête au lieu de l'envoyer (0 $).
 * On compare l'ancienne réservation (`estimationAppel`, 3,5 car./jeton) à la
 * nouvelle (`coutMaximalAppel`, octets UTF-8) et au plafond par défaut (50 $).
 * Le tableau imprimé est recopié dans `packages/core/src/depense-prudente.ts`.
 */

vi.mock('@tiktrends/db', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/db')>()), db: null }));

import { generateAdConcepts, analyzeCompetitor, generateBrandProfile, controlePubEntiere, AD_TEMPLATES } from '@tiktrends/ai';
import { coutMaximalAppel, estimationAppel } from '../lib/spend-guard';

const PLAFOND_DEFAUT_USD = 50;
const fr = (n: number) => 'Une crème hydratante légère, testée sous contrôle dermatologique, à l’acide hyaluronique · « résultat visible dès 7 jours ». '.repeat(Math.ceil(n / 120)).slice(0, n);
const emojis = (n: number) => '🔥✨😍🚀💯'.repeat(Math.ceil(n / 10)).slice(0, n);

function capteur() {
  let vu: Anthropic.MessageCreateParamsNonStreaming | null = null;
  const client = { messages: { create: async (p: Anthropic.MessageCreateParamsNonStreaming) => { vu = p; return { content: [], usage: { input_tokens: 0, output_tokens: 0 } }; } } } as unknown as Anthropic;
  return { client, requete: () => vu! };
}

const ctxMax = (texte: (n: number) => string) => ({
  brand: texte(80), tone: texte(80), usp: texte(300), audience: texte(200), category: texte(60), productName: texte(80), productDesc: texte(240), productUsp: texte(240),
  persona: { name: texte(60), pains: [texte(80), texte(80), texte(80), texte(80)], desires: [texte(80), texte(80), texte(80), texte(80)] },
  objective: 'ventes', offer: texte(60), creativeRules: texte(1200), winningPatterns: texte(1400),
});

async function cas(): Promise<Array<{ nom: string; p: Anthropic.MessageCreateParamsNonStreaming }>> {
  const out: Array<{ nom: string; p: Anthropic.MessageCreateParamsNonStreaming }> = [];
  for (const [nom, texte] of [['fr', fr], ['emojis', emojis]] as const) {
    const a = capteur();
    await generateAdConcepts(a.client, ctxMax(texte), {
      templates: [...AD_TEMPLATES, ...AD_TEMPLATES].slice(0, 12), copyBudget: Array.from({ length: 12 }, () => texte(120)),
      winningCopy: Array.from({ length: 10 }, () => texte(180)), competitors: Array.from({ length: 10 }, () => texte(40)),
    }).catch(() => []);
    out.push({ nom: `Pubs IA · generateAdConcepts ×12 (${nom})`, p: a.requete() });
    const b = capteur();
    await analyzeCompetitor(b.client, { name: 'Concurrent', ads: Array.from({ length: 40 }, () => ({ body: texte(500), callToAction: 'Acheter' })) }).catch(() => null);
    out.push({ nom: `Pubs IA · analyzeCompetitor 14 000 car. (${nom})`, p: b.requete() });
  }
  const c = capteur();
  await generateBrandProfile(c.client, { name: 'Marque', siteText: fr(8000) }).catch(() => null);
  out.push({ nom: 'Marque · generateBrandProfile 8 000 car. (fr)', p: c.requete() });
  const d = capteur();
  const img = { mediaType: 'image/png', base64: Buffer.alloc(1_000_000, 7).toString('base64') };
  await controlePubEntiere(d.client, { image: img, reference: img }).catch(() => null);
  out.push({ nom: 'Pubs IA · controlePubEntiere 2 images de 1 Mo', p: d.requete() });
  return out;
}

describe('borne d’entrée · effet mesuré sur les plus gros appels du dépôt', () => {
  it('aucune réservation ne frôle le plafond de 50 $ ; la borne ne descend jamais sous l’estimation', async () => {
    const lignes = (await cas()).map(({ nom, p }) => ({ nom, maxTokens: p.max_tokens, avant: estimationAppel(p), apres: coutMaximalAppel(p) }));
    console.info(['[r3:mesure] appel · max_tokens · estimation (avant) · borne (après) · ×', ...lignes.map((l) => `${l.nom} · ${l.maxTokens} · ${l.avant} $ · ${l.apres} $ · ×${(l.apres / l.avant).toFixed(2)}`)].join('\n'));
    for (const l of lignes) {
      expect(l.apres, `${l.nom} · la borne est sous l’estimation`).toBeGreaterThanOrEqual(l.avant);
      // Seuil choisi sur la mesure : le plus gros appel réserve 0,176799 $ (×1,59 sur l'estimation) · 1 $ laisse ×5,6 de marge et reste à 2 % du plafond.
      expect(l.apres, `${l.nom} · réserve ${l.apres} $ · la borne bloquerait un appel normal`).toBeLessThan(PLAFOND_DEFAUT_USD * 0.02);
    }
  });
});
