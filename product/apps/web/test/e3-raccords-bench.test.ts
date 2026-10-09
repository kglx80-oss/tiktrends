import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executerBench } from '../scripts/recette/bench';
import { FICHIER_REGISTRE, ecrireRegistre, lireRegistre, registreVierge, type LectureBase, type LigneBase } from '../scripts/recette/registre';
import { sousVerrou } from '../scripts/recette/verrou';

/**
 * E3 · `recette:bench` sous la séquence engagement → campagne → règlement.
 * La campagne (processus enfant) est remplacée par un lanceur factice qui
 * LIT le registre sur disque au moment où elle démarrerait : l'engagement
 * doit y être déjà, ouvert, au budget de la campagne. Aucune base, aucun appel.
 */

const ENV = { TIKTRENDS_ENV: 'recette', STUDIOS_PROMPTS_RECETTE_LOCALE: '1', AI_SPEND_CAP_USD: '15', DATABASE_URL: 'postgres://recette:x@127.0.0.1:5432/tiktrends_recette' };
const dossiers: string[] = [];
afterAll(() => { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); });

async function preparer(anterieuresMicros: number): Promise<string> {
  const d = mkdtempSync(join(tmpdir(), 'e3-bench-'));
  dossiers.push(d);
  const r = registreVierge(new Date('2026-10-09T09:00:00Z'));
  if (anterieuresMicros) r.anterieures.push({ id: 'f', usdMicros: anterieuresMicros, motif: 'facture (essai)', saisieLe: '2026-10-09T09:00:00Z' });
  await sousVerrou(d, (v) => ecrireRegistre(d, r, v));
  return d;
}
const lire = (d: string) => lireRegistre(readFileSync(join(d, FICHIER_REGISTRE), 'utf8'))!;
const ligne = (id: string, usd: number, createdAt: Date): LigneBase => ({ id, provider: 'fal', model: 'fal_image', action: 'bench', estimatedUsd: usd, actualUsd: usd, inputTokens: null, outputTokens: null, reconcileReason: null, createdAt });

describe('recette:bench · engagement durable avant la campagne', () => {
  it('campagne terminée ⇒ engagement ouvert AU LANCEMENT, plafond du processus posé, puis réglé au coût des lignes nées', async () => {
    const d = await preparer(1_000_000);
    const base: LectureBase = { lignes: [], base: 'recette@1', depenseFenetreUsd: 0 };
    const vu: { ouverts: unknown[]; cap?: string } = { ouverts: [] };
    const code = await executerBench({
      env: { ...ENV, RECETTE_REGISTRE: d }, argv: ['--reel', '--budget-usd', '2,00'], lecteur: async () => base, dire: () => {},
      lancer: async (env) => {
        vu.ouverts = Object.values(lire(d).engagements).filter((g) => g.etat === 'engage').map((g) => [g.commande, g.reserveMicros]);
        vu.cap = env.AI_SPEND_CAP_USD;
        base.lignes = [ligne('b1', 0.08, new Date(Date.now() + 5)), ligne('b2', 0.08, new Date(Date.now() + 5))];
        return { code: 0, signal: null };
      },
    });
    expect(code).toBe(0);
    expect(vu.ouverts, 'la campagne est partie sans engagement durable au registre').toEqual([['recette:bench', 2_000_000]]);
    expect(vu.cap).toBe('2');
    const [g] = Object.values(lire(d).engagements);
    expect(g, 'la campagne n’a pas été réglée au coût réel').toMatchObject({ etat: 'regle', regleMicros: 160_000 });
  });

  it('campagne TUÉE (signal) ⇒ engagement incertain, compté au maximum', async () => {
    const d = await preparer(0);
    const code = await executerBench({
      env: { ...ENV, RECETTE_REGISTRE: d }, argv: ['--reel', '--budget-usd', '3'], lecteur: async () => ({ lignes: [], base: 'recette@1', depenseFenetreUsd: 0 }), dire: () => {},
      lancer: async () => ({ code: null, signal: 'SIGKILL' }),
    });
    expect(code).toBe(1);
    const [g] = Object.values(lire(d).engagements);
    expect(g, 'une campagne tuée a été réglée').toMatchObject({ etat: 'incertain', reserveMicros: 3_000_000 });
    expect(g!.cause).toContain('campagne interrompue (SIGKILL)');
  });

  it('budget qui ne tient pas dans le restant ⇒ refus, AUCUN lancement, rien d’écrit', async () => {
    const d = await preparer(14_000_000);
    const avant = readFileSync(join(d, FICHIER_REGISTRE), 'utf8');
    let lance = false;
    const dits: string[] = [];
    const code = await executerBench({
      env: { ...ENV, RECETTE_REGISTRE: d }, argv: ['--reel', '--budget-usd', '1,01'], lecteur: async () => ({ lignes: [], base: 'recette@1', depenseFenetreUsd: 0 }), dire: (l) => dits.push(l),
      lancer: async () => { lance = true; return { code: 0, signal: null }; },
    });
    expect(code).toBe(2);
    expect(lance, 'la campagne est partie au-delà du restant').toBe(false);
    expect(dits.join('\n')).toContain('Budget d’essai insuffisant');
    expect(readFileSync(join(d, FICHIER_REGISTRE), 'utf8')).toBe(avant);
  });
});
