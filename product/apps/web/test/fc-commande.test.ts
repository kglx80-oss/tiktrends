import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '@tiktrends/db';
import { decider } from '../scripts/bench-studios';
import { planEtDevis, routageProduction } from '../lib/studios/benchmark/programme';

/**
 * Lot F-C · la commande `bench:studios` : le garde pur des arguments, et le
 * mode `--plan` qui chiffre SANS base (le client de base n'existe même pas ici :
 * aucune requête ne pourrait partir).
 */

const LOCAL = { DATABASE_URL: 'postgres://postgres@127.0.0.1:5433/fc', STUDIOS_PROMPTS_RECETTE_LOCALE: '1' };

describe('garde des arguments', () => {
  it('modes reconnus', () => {
    expect(decider(['--plan'], {}, 'production')).toEqual({ ok: true, mode: 'plan', cas: null });
    expect(decider(['--', '--plan', '--cas', 'f04,F17'], {}, 'production')).toEqual({ ok: true, mode: 'plan', cas: ['F04', 'F17'] });
    expect(decider(['--jeu'], {}, 'production')).toEqual({ ok: true, mode: 'jeu' });
    expect(decider([], LOCAL, 'test')).toMatchObject({ ok: true, mode: 'simule' });
    expect(decider(['--reel', '--budget-usd', '3'], LOCAL, 'production')).toMatchObject({ ok: true, mode: 'reel', budgetBrut: '3', releaseId: null });
  });

  it('refus : option inconnue, deux modes, budget hors réel, simulé hors recette locale, base absente', () => {
    expect(decider(['--vite'], LOCAL, 'test')).toMatchObject({ ok: false, raison: expect.stringMatching(/inconnue/) });
    expect(decider(['--plan', '--reel'], LOCAL, 'test')).toMatchObject({ ok: false });
    expect(decider(['--budget-usd', '5'], LOCAL, 'test')).toMatchObject({ ok: false, raison: expect.stringMatching(/--reel/) });
    expect(decider([], LOCAL, 'production')).toMatchObject({ ok: false, raison: expect.stringMatching(/recette locale/) });
    expect(decider(['--reel'], {}, 'production')).toMatchObject({ ok: false, raison: expect.stringMatching(/DATABASE_URL/) });
    expect(decider(['--reel', '--budget-usd'], LOCAL, 'production')).toMatchObject({ ok: false, raison: expect.stringMatching(/Valeur attendue/) });
  });

  it('la commande est déclarée dans le package.json de l’application', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    expect(pkg.scripts['bench:studios']).toMatch(/scripts\/bench-studios-chargeur\.mjs .*scripts\/bench-studios\.ts$/);
  });
});

describe('--plan · devis sans base', () => {
  it('aucun client de base dans ce processus, et le devis se calcule quand même', () => {
    expect(db).toBeUndefined();
    const pd = planEtDevis(null);
    expect(pd.ok).toBe(true);
    if (!pd.ok) return;
    expect(pd.devis.cas).toHaveLength(24);
    // Lot F-D : vision routée (images comptées dans le devis) · les 24 cas sont chiffrables.
    expect(pd.devis).toMatchObject({ ok: true, totalUsdMicros: 9_925_120 });
  });

  it('routage de production : texte structuré et vision ont un modèle, rien d’autre', () => {
    const r = routageProduction();
    expect(Object.entries(r).filter(([, m]) => m !== null).map(([p]) => p).sort()).toEqual(['reasoning_structured', 'vision_analysis']);
  });

  it('une sélection chiffrable donne un total et une empreinte', () => {
    const pd = planEtDevis(['F04', 'F17', 'F21']);
    expect(pd.ok && pd.devis).toMatchObject({ ok: true, totalUsdMicros: 528_000, empreinte: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });
});
