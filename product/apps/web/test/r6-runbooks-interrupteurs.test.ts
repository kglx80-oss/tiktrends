import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAPACITES_STUDIOS, DEFINITIONS_CAPACITES, ENV_INTERRUPTEURS } from '@tiktrends/core';
import { lireEnvFile, lireYaml, environnement, CAPACITES_ESSAI_RECETTE } from '../scripts/recette/compose';

/**
 * R6 · les runbooks disent les interrupteurs Studios tels que le CODE les lit :
 *  · `ops/README.md` (production) · chaque variable lue par le noyau, NOM
 *    seulement, et chaque capacité coupée par défaut (lue dans
 *    `DEFINITIONS_CAPACITES`, pas une liste recopiée) ;
 *  · `ops/recette/README.md` · ce que le compose de recette ouvre, lu dans le
 *    compose RÉEL, et pourquoi.
 */

const PRODUIT = join(process.cwd(), '..', '..');
const lire = (...p: string[]) => readFileSync(join(PRODUIT, ...p), 'utf8');
const section = (texte: string, titre: string) => {
  const i = texte.indexOf(titre);
  if (i < 0) return '';
  const j = texte.indexOf('\n## ', i + titre.length);
  return texte.slice(i, j < 0 ? undefined : j);
};
const PROD = section(lire('ops', 'README.md'), '## Interrupteurs Studios');
const RECETTE = section(lire('ops', 'recette', 'README.md'), '### Interrupteurs Studios');

describe('ops/README.md · interrupteurs de production', () => {
  it('chaque variable lue par le noyau est nommée, sans valeur', () => {
    expect(PROD, 'section « Interrupteurs Studios » absente de ops/README.md').not.toBe('');
    for (const v of Object.values(ENV_INTERRUPTEURS)) expect(PROD, `variable ${v} non documentée`).toContain(`\`${v}\``);
    expect(PROD, 'une valeur d’interrupteur est écrite dans le runbook').not.toMatch(/STUDIOS_[A-Z_]+=\S/);
    expect(PROD).not.toContain('—');
  });

  it('chaque capacité coupée par défaut au premier déploiement est dite, avec sa raison', () => {
    const incompletes = CAPACITES_STUDIOS.filter((c) => DEFINITIONS_CAPACITES[c].maturite === 'incomplete');
    expect(incompletes.length).toBeGreaterThan(0);
    for (const c of incompletes) expect(PROD, `capacité coupée par défaut « ${c} » non dite`).toContain(`| \`${c}\` | ${DEFINITIONS_CAPACITES[c].raison} |`);
  });
});

describe('ops/recette/README.md · ce que la recette ouvre, et pourquoi', () => {
  it('les valeurs posées par le compose réel sont celles que le runbook annonce', () => {
    expect(RECETTE, 'section « Interrupteurs Studios » absente du runbook de recette').not.toBe('');
    const outils = environnement((lireYaml(lire('docker-compose.recette.yml')) as { services: Record<string, Record<string, never>> }).services.outils_recette!);
    for (const c of [...CAPACITES_ESSAI_RECETTE.pas1, ...CAPACITES_ESSAI_RECETTE.pas2]) {
      expect(`${outils.STUDIOS_CAPACITES_PILOTES},${outils.STUDIOS_CAPACITES_GENERALES}`).toContain(c);
      expect(RECETTE, `capacité ouverte « ${c} » non expliquée`).toContain(`\`${c}\``);
    }
    for (const v of Object.values(ENV_INTERRUPTEURS)) {
      expect(RECETTE, `variable ${v} non dite`).toContain(`\`${v}\``);
      expect(lireEnvFile(lire('ops', 'recette', 'neutralise.env'))[v]).toBe('');
    }
    expect(RECETTE).toContain('Restent coupées en recette : `video`, `voix`, `shadow`.');
    expect(RECETTE).not.toContain('—');
  });
});
