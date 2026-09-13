import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * « Type de pub · au moins un » est le SEUL champ requis de l'étape message
 * (l'assistant bloque sans lui, cf. assistant-pub.ts). Il portait le marqueur
 * `Facultatif` (estompé, gris), le même que l'Angle et l'Offre juste en dessous
 * · il se lisait donc comme optionnel. On exige un marqueur `Requis` distinct.
 *
 * Sous-composant client non exporté · non rendable isolément. Adoption par la
 * source, bornée au label « Type de pub ».
 */
const src = readFileSync(
  join(process.cwd(), 'app/(app)/studio/ads/AssistantPub.tsx'),
  'utf8',
);
const i = src.indexOf('<Label>Type de pub');
const ligne = src.slice(i, i > -1 ? i + 90 : undefined);

describe('Assistant · le champ requis ne se déguise plus en facultatif', () => {
  it('le label « Type de pub » existe', () => {
    expect(i, 'label « Type de pub » introuvable').toBeGreaterThan(-1);
  });

  it('« Type de pub » est marqué Requis, pas Facultatif', () => {
    expect(ligne, 'le champ requis porte encore le marqueur Facultatif').not.toContain('<Facultatif>');
    expect(ligne, 'le champ requis n’est pas marqué comme requis').toContain('<Requis>');
  });

  it('le marqueur Requis est en accent, distinct du gris des facultatifs', () => {
    const j = src.indexOf('function Requis');
    expect(j, 'composant Requis absent').toBeGreaterThan(-1);
    expect(src.slice(j, j + 160)).toContain('var(--accent-strong)');
  });
});
