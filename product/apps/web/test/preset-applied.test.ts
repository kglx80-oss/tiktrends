import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un prompt maison consigné doit avoir été appliqué.
 *
 * ── Le défaut trouvé ─────────────────────────────────────────────────────────
 *
 * `startVideoAction` et `startImageVideoAction` écrivaient `presetId` dans la
 * génération et n'appliquaient jamais le prompt. Choisir une scène enregistrée
 * ne changeait rien à la vidéo produite.
 *
 * **C'est pire que de ne rien faire.** La génération portait quand même le
 * preset, et le classement « quel prompt gagne » lui attribuait des verdicts
 * qu'il n'avait pas produits · on mesurait l'effet d'un réglage inopérant, et le
 * chiffre avait l'air d'un chiffre.
 *
 * ── Ce que ce test vérifie ───────────────────────────────────────────────────
 *
 * Que chaque fichier qui CONSIGNE un `presetId` le RÉSOUT aussi. C'est une
 * propriété de structure, vérifiable sans base ni fournisseur · et c'est
 * exactement l'écart qui s'était creusé.
 */
const FICHIERS = ['app/actions/video.ts', 'app/actions/image.ts', 'app/actions/ads.ts'];

describe('un preset consigné est un preset appliqué', () => {
  for (const f of FICHIERS) {
    it(`${f}`, () => {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      if (!src.includes('presetId')) return;
      expect(
        src,
        `${f} consigne un presetId sans jamais le résoudre · la mesure des `
        + 'prompts lui attribuerait des verdicts qu\'il n\'a pas produits.',
      ).toContain('resolvePreset');
    });
  }
});
