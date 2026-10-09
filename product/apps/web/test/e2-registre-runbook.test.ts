import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bilanBudgetEssai } from '@tiktrends/core';
import { lireEnvFile, lireYaml, nomsProduction, violationsComposeRecette, violationsRegistre, BUDGET_ESSAI_USD } from '../scripts/recette/compose';
import { CITATION_AUTORISATION, coherenceRegistre, fusionnerRegistre, lireRegistre, registreVierge } from '../scripts/recette/registre';
import { deciderBench } from '../scripts/recette/bench';

/**
 * E2 · le budget d'essai de 15 $ AU TOTAL est tenu par un registre qui
 * survit à la destruction de la recette, et le runbook le dit.
 *
 * On lit les fichiers RÉELS (compose, runbook, script de vérification,
 * `.gitignore`) : le registre est monté depuis la machine, aucune commande
 * de nettoyage n'y touche, l'autorisation est citée, le plafond de passe de
 * 1 $ a disparu, la liste des variables est donnée sans valeur.
 */

const PRODUIT = join(process.cwd(), '..', '..');
const lire = (...p: string[]) => readFileSync(join(PRODUIT, ...p), 'utf8');
const COMPOSE = lire('docker-compose.recette.yml');
const RUNBOOK = lire('ops', 'recette', 'README.md');
const PROD = nomsProduction(lireYaml(lire('docker-compose.yml')));
const NEUTRE = lireEnvFile(lire('ops', 'recette', 'neutralise.env'));
const violations = (t: string) => violationsComposeRecette(lireYaml(t), PROD, { neutralise: NEUTRE, externes: [] });

describe('registre · monté depuis la machine, jamais nettoyé, ignoré par git', () => {
  it('le compose réel monte ops/recette/registre dans les outils (RECETTE_REGISTRE) ; le retirer ⇒ refus nommé', () => {
    expect(violations(COMPOSE)).toEqual([]);
    const sans = COMPOSE.replace('      - ./ops/recette/registre:/registre\n', '');
    expect(sans).not.toBe(COMPOSE);
    expect(violations(sans)).toContain('Service « outils_recette » : RECETTE_REGISTRE doit être le dossier ./ops/recette/registre de la machine, monté (lu « /registre ») · sans lui, une base neuve rouvrirait un budget déjà dépensé.');
    expect(violations(COMPOSE.replace('      - ./ops/recette/registre:/registre\n', '      - registre_recette:/registre\n'))).not.toEqual([]);
  });

  it('aucune commande du runbook, du compose ou des scripts de recette ne touche au registre', () => {
    const dossier = join(PRODUIT, 'ops', 'recette');
    const fichiers: Array<[string, string]> = [
      ['docker-compose.recette.yml', COMPOSE],
      ...readdirSync(dossier).filter((f) => /\.(md|sh)$/.test(f)).map((f): [string, string] => [`ops/recette/${f}`, readFileSync(join(dossier, f), 'utf8')]),
    ];
    expect(fichiers.map(([f]) => f)).toEqual(expect.arrayContaining(['ops/recette/README.md', 'ops/recette/verifier-environnement.sh']));
    expect(fichiers.flatMap(([f, t]) => violationsRegistre(t, f)), 'une commande de nettoyage touche au registre du budget').toEqual([]);
    // La commande de destruction est toujours là, et elle épargne le registre.
    expect(RUNBOOK).toContain('rm -rf ops/recette/sorties');
  });

  it('les nettoyages qui l’emporteraient sont refusés, nommés', () => {
    const v = (cmd: string) => violationsRegistre(`\`\`\`bash\n${cmd}\n\`\`\``, 'r.md');
    for (const cmd of ['rm -rf ops/recette', 'rm -rf ./ops/recette/', 'rm -rf ops/recette/*', 'rm -f ops/recette/registre/budget-essais.json', 'mv ops/recette/registre /tmp', 'find ops -name "*.json" -delete', 'sudo rm -rf ops']) {
      expect(v(cmd), cmd).toEqual([`r.md:2 · « ${cmd} » : touche au registre cumulatif du budget (ops/recette/registre) · il ne se supprime jamais.`]);
    }
    expect(v('rm -rf ops/recette/sorties')).toEqual([]);
    expect(v('rm -f ops/recette/.env.recette')).toEqual([]);
  });

  it('ops/recette/.gitignore ignore le registre', () => {
    expect(lire('ops', 'recette', '.gitignore').split('\n')).toContain('registre/');
  });
});

describe('runbook · 15 $ au total, cité ; plus de plafond de passe de 1 $', () => {
  it('l’autorisation du 9 octobre est citée mot pour mot ; ni 0,36 $ figé, ni plafond de passe proposé', () => {
    const texte = RUNBOOK.replace(/\n> /g, ' ').replace(/'/g, '’');
    expect(texte, 'autorisation non citée').toContain(CITATION_AUTORISATION.replace(/'/g, '’'));
    expect(RUNBOOK).not.toMatch(/0,36 \$/);
    expect(RUNBOOK).not.toMatch(/plafond de passe PROPOSÉ|1 \$ au plus pour une passe/);
    expect(RUNBOOK).toContain('estimation');
    expect(RUNBOOK).toContain('réservation maximale');
    expect(RUNBOOK).toContain('coût réglé');
    expect(RUNBOOK).not.toContain('—');
  });

  it('la liste EXACTE des variables est donnée, sans aucune valeur', () => {
    for (const n of ['POSTGRES_PASSWORD', 'AUTH_SECRET', 'FOUNDER_EMAILS', 'ANTHROPIC_GEN_MODEL', 'FAL_IMAGE_MODEL', 'FAL_IMAGE_MODEL_EDIT', 'FAL_QUEUE_URL', 'FAL_KEY', 'ANTHROPIC_API_KEY', 'STUDIO_FOURNISSEUR_REEL']) expect(RUNBOOK, n).toContain(`\`${n}`);
    // Aucune affectation d'une valeur littérale à une clé (seules les saisies `read -rs` et la valeur fixe d'autorisation).
    expect(RUNBOOK.match(/\b(FAL_KEY|ANTHROPIC_API_KEY|POSTGRES_PASSWORD|AUTH_SECRET)=[A-Za-z0-9]/g)).toBeNull();
    expect(RUNBOOK).toContain('bash ops/recette/verifier-environnement.sh');
    expect(RUNBOOK).toContain('recette:budget');
    expect(RUNBOOK).toContain('Ce que tu transmets ensuite');
  });
});

describe('plafond du processus · ≤ 15 $ et égal au restant calculé', () => {
  it('base neuve, budget = restant ⇒ AI_SPEND_CAP_USD du processus = restant ; au-delà ⇒ refus', () => {
    const b = bilanBudgetEssai({ autoriseMicros: 15_000_000, anterieuresMicros: 400_000, lignes: [{ regleMicros: 320_000, incertainMicros: 147_024 }] });
    expect(b.restantMicros).toBe(14_132_976);
    const d = deciderBench(['--reel', '--budget-usd', '14,13'], b, 0);
    expect(d).toEqual({ ok: true, reel: true, budgetMicros: 14_130_000, capProcessusUsd: 14.13 });
    expect(d.ok && d.reel && d.capProcessusUsd).toBeLessThanOrEqual(BUDGET_ESSAI_USD);
    // Même base (0,47 $ déjà comptés en base) : le plafond suit ce que la base compte, jamais plus que le restant.
    expect(deciderBench(['--reel', '--budget-usd', '14,13'], b, 0.467024)).toMatchObject({ ok: true, capProcessusUsd: 14.597024 });
    const r = deciderBench(['--reel', '--budget-usd', '14,14'], b, 0);
    expect(r.ok).toBe(false);
    expect(deciderBench(['--plan'], b, 0)).toEqual({ ok: true, reel: false });
    expect(deciderBench(['--reel'], b, 0)).toMatchObject({ ok: false });
  });

  it('cohérence du registre : absent + base vide ⇒ initialisation ; absent + dépenses ⇒ refus ; lisible ⇒ il fait foi', () => {
    expect(coherenceRegistre({ etat: 'absent' }, 0, '/r')).toEqual({ ok: true, initialiser: true });
    expect(coherenceRegistre({ etat: 'absent' }, 3, '/r')).toMatchObject({ ok: false });
    expect(coherenceRegistre({ etat: 'illisible' }, 0, '/r')).toMatchObject({ ok: false });
    const reg = registreVierge(new Date('2026-10-09T10:00:00Z'));
    expect(lireRegistre(JSON.stringify(reg))).toEqual(reg);
    expect(lireRegistre(JSON.stringify({ ...reg, autorisation: { ...reg.autorisation, usdMicros: 50_000_000 } })), 'une autorisation relevée à la main est acceptée').toBeNull();
    // Une ligne vue puis disparue (base détruite) reste à son dernier état.
    const l = { id: 'a', provider: 'anthropic', model: 'm', action: 'x', estimatedUsd: 0.15, actualUsd: 0.15, inputTokens: null, outputTokens: null, reconcileReason: 'coupure', createdAt: new Date() };
    const un = fusionnerRegistre(reg, [l], 'b1', new Date()).registre;
    const deux = fusionnerRegistre(un, [], 'b2', new Date()).registre;
    expect(deux.lignes.a).toMatchObject({ etat: 'a_reconcilier', incertainMicros: 150_000, base: 'b1' });
  });
});
