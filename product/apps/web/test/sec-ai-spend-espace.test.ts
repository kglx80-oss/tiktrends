import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `ai_spend.workspace_id` · chaque dépense Anthropic est imputée à un espace.
 *
 * ── Le défaut reproduit (L0-B §4) ────────────────────────────────────────────
 * 24 appels `guardedAnthropic({ action })` omettaient `workspaceId` · la ligne
 * `ai_spend` était écrite avec un espace NUL, et la génération des Pubs IA
 * n'était imputable à personne.
 *
 * ── Trois gardes, du plus fort au plus large ─────────────────────────────────
 *  1. Le TYPE · `ImputationDepense.workspaceId: string` est obligatoire ; la
 *     ligne `@ts-expect-error` ci-dessous fait échouer `typecheck` si quelqu'un
 *     le rend de nouveau facultatif.
 *  2. Le RÉSULTAT · un appel réel au client gardé écrit une ligne `ai_spend`
 *     portant l'espace (client IA simulé, base pglite).
 *  3. Chaque POINT D'APPEL, paramétré · tout `guardedAnthropic(` de `app/` et
 *     `lib/` doit nommer `workspaceId` dans son argument (y compris un fichier
 *     ajouté demain).
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('@tiktrends/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/ai')>();
  return {
    ...actual,
    anthropicFromEnv: () => ({
      messages: { create: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1000, output_tokens: 100 } }) },
    }),
  };
});

import { db, schema, eq } from '@tiktrends/db';
import { guardedAnthropic, sousPlafond } from '../lib/spend-guard';

const ESPACE = '0b8a7e8e-5b2c-4f0e-9d5e-4b1c2a3d4e5f';

// Garde 1 · ne compile plus si `workspaceId` redevient facultatif.
// @ts-expect-error · l'espace est obligatoire
const _sansEspace = () => guardedAnthropic({ action: 'oubli' });
void _sansEspace;

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ESPACE, name: 'Imputé' });
});

describe('ai_spend · l’espace est écrit sur la ligne (résultat)', () => {
  it('un appel Anthropic gardé écrit workspace_id', async () => {
    const client = guardedAnthropic({ workspaceId: ESPACE, action: 'sec:anthropic' })!;
    await client.messages.create({ model: 'claude-sonnet-5', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] });
    const lignes = await db!.select().from(schema.aiSpend).where(eq(schema.aiSpend.action, 'sec:anthropic'));
    expect(lignes.map((l) => l.workspaceId)).toEqual([ESPACE]);
    expect(lignes[0]!.actualUsd, 'le montant doit rester celui des jetons consommés').toBeGreaterThan(0);
  });

  it('une dépense fal sous plafond écrit workspace_id', async () => {
    await sousPlafond('fal_image', { workspaceId: ESPACE, action: 'sec:fal' }, async () => 'ok');
    const lignes = await db!.select().from(schema.aiSpend).where(eq(schema.aiSpend.action, 'sec:fal'));
    expect(lignes.map((l) => l.workspaceId)).toEqual([ESPACE]);
  });
});

/* ── Garde 3 · chaque point d'appel ───────────────────────────────────────── */

const RACINE = join(__dirname, '..');
function fichiers(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === 'test') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fichiers(p, out);
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Chaque `guardedAnthropic(` et le texte de son argument, jusqu'à la parenthèse fermante. */
function appels(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const p of [...fichiers(join(RACINE, 'app')), ...fichiers(join(RACINE, 'lib'))]) {
    const s = readFileSync(p, 'utf8');
    const rel = p.slice(RACINE.length + 1);
    const re = /guardedAnthropic\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      // Définition de la fonction elle-même · pas un appel.
      if (s.slice(Math.max(0, m.index - 16), m.index).includes('function ')) continue;
      let i = m.index + m[0].length;
      let prof = 1;
      const debut = i;
      while (i < s.length && prof > 0) { if (s[i] === '(') prof++; else if (s[i] === ')') prof--; i++; }
      const ligne = s.slice(0, m.index).split('\n').length;
      out.push([`${rel}:${ligne}`, s.slice(debut, i - 1)]);
    }
  }
  return out;
}

const POINTS = appels();

describe('ai_spend · chaque point d’appel nomme l’espace', () => {
  // Mesuré : 31 appels avant le retrait des anciens studios (10/10), dont 11 dans
  // les actions retirées (ads 6, image 3, video 1, studio 1) · 20 restent.
  it('le relevé couvre au moins les 20 appels connus (31 mesurés, 11 retirés avec les anciens studios)', () => {
    expect(POINTS.length).toBeGreaterThanOrEqual(20);
  });
  it.each(POINTS)('%s', (_ou, argument) => {
    expect(argument, 'appel sans workspaceId · la dépense ne serait imputée à aucun espace').toMatch(/\bworkspaceId\b/);
    expect(argument, 'workspaceId ne doit pas être forcé à null').not.toMatch(/workspaceId\s*:\s*(null|undefined)\b/);
  });
});
