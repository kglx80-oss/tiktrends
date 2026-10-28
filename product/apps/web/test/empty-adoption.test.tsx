import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les états vides d'attente n'empilent pas de CTA vers un écran disparu.
 *
 * Le composant `Empty` de l'ancienne interface est retiré avec elle · les
 * écrans Spatial posent leurs états vides (`EtatVide`) et les gardent sur le
 * rendu. Reste ici la doctrine de l'écran « Essais et relectures ».
 */
describe('les états vides d’attente restent explicites, sans CTA mort', () => {
  const lit = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  it('les bilans historiques restent explicites et les essais orientent vers Studios sans empiler de CTA', () => {
    // Ces trois sections d'analyse se remplissent quand on travaille AILLEURS ·
    // ce sont des `wait`. Elles portaient chacune le même bouton « Ouvrir Pubs
    // IA » · trois CTA identiques empilés dès qu'une marque Plus n'avait encore
    // rien fait. Un `wait` ne doit rien qui appelle le clic (doctrine Empty,
    // tenue par le type). L'issue n'a pas disparu pour autant · le `why` de
    // chaque section nomme toujours Pubs IA, en toutes lettres · pas d'impasse,
    // pas de doublon.
    // Les trois états vides (essais/notes/relectures) ont déménagé avec leur
    // section à leur destination (Adsmap) · on les éprouve là où ils vivent.
    // Spatial · l'écran « Essais et relectures » de Résultats.
    const src = lit('spatial/vues/resultats/Essais.tsx');

    const cta = src.split("href: '/studio/ads'").length - 1;
    expect(cta, 'CTA « Ouvrir Pubs IA » empilé dans un état wait · doublon de parcours').toBe(0);

    // Les trois `why` · l'outil d'origine (anciennes Pubs IA) est retiré le 10/10 :
    // chacun le DIT, sans bouton vers un écran disparu, et dit que l'existant reste lu.
    for (const phrase of [
      'Ce bilan lit les essais historiques. Pour préparer un nouvel essai, ouvre les variantes d’un projet Studios',
      'Le Score Jarvis se lançait depuis le panneau d’une pub des anciennes Pubs IA, retirées le 10/10',
      'La relecture tournait sur les pubs « Générée entièrement » des anciennes Pubs IA, retirées le 10/10',
    ]) {
      expect(src, `l’état vide « ${phrase} » a disparu`).toContain(phrase);
    }
    expect(src, 'lien vers un ancien studio retiré').not.toMatch(/['"]\/studio\/(ads|image|video|textes)/);
  });
});
