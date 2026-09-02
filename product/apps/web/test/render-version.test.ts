import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RENDER_VERSION } from '../lib/ad-render';

/**
 * Le garde qui aurait évité le cache empoisonné.
 *
 * ── Ce qui s'est passé ───────────────────────────────────────────────────────
 *
 * Les rendus sont rangés dans le bucket sous une clé qui ne portait que
 * l'identifiant, le ratio et l'empreinte du texte. Rien n'y disait avec quelle
 * version de la maquette l'image avait été composée.
 *
 * Les vignettes produites par la première tentative — celle qui ne
 * redimensionnait pas la maquette — sont donc restées dans le bucket sous la
 * même clé, et la correction proportionnelle n'a jamais pu les remplacer. Les
 * pubs récentes s'affichaient bien, les anciennes gardaient leur titre géant.
 *
 * ── Ce que le garde vérifie ──────────────────────────────────────────────────
 *
 * Que `RENDER_VERSION` a été incrémentée quand la maquette a changé. On ne peut
 * pas le déduire, on ne peut que le constater · le fichier est donc empreint, et
 * l'empreinte attendue vit ici, à côté du numéro.
 *
 * **Un rappel dans un commentaire ne s'applique pas tout seul.** Celui-ci, si.
 */

const FICHIERS = ['lib/ad-render.tsx', 'lib/ad-fonts.ts'];

/** Empreinte des sources qui décident de l'apparence d'une pub. */
function empreinteMaquette(): string {
  const h = createHash('sha256');
  for (const f of FICHIERS) h.update(readFileSync(join(process.cwd(), f), 'utf8'));
  return h.digest('hex').slice(0, 16);
}

/**
 * À mettre à jour EN MÊME TEMPS que `RENDER_VERSION`, jamais séparément.
 *
 * Le test dit quoi écrire quand il échoue · si le rendu n'a pas vraiment changé
 * (un commentaire, un renommage), on recopie l'empreinte sans toucher au numéro.
 */
const EMPREINTE_ATTENDUE = 'f60f282c597315a1';
const VERSION_ATTENDUE = 7;

describe('la version de la maquette suit la maquette', () => {
  it('changer la maquette oblige à décider si les rendus rangés restent valables', () => {
    const vue = empreinteMaquette();
    expect(
      vue,
      `La maquette a changé.\n\n`
      + `Si l'APPARENCE change : incrémente RENDER_VERSION (${RENDER_VERSION} → ${RENDER_VERSION + 1}) dans lib/ad-render.tsx,\n`
      + `puis mets VERSION_ATTENDUE à la même valeur et EMPREINTE_ATTENDUE à « ${vue} ».\n\n`
      + `Si seul le CODE change (commentaire, renommage) : recopie « ${vue} » dans EMPREINTE_ATTENDUE et laisse le numéro.\n\n`
      + `Sans ça, les images déjà rangées dans le bucket continueront d'être servies telles quelles ·\n`
      + `c'est exactement ce qui a laissé des vignettes cassées en production après leur correction.`,
    ).toBe(EMPREINTE_ATTENDUE);
  });

  it('le numéro déclaré est celui du fichier', () => {
    expect(RENDER_VERSION).toBe(VERSION_ATTENDUE);
  });

  it('la version entre dans la clé de cache · sinon elle ne sert à rien', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/ad/[id]/route.tsx'), 'utf8');
    expect(route).toContain('RENDER_VERSION');
    expect(route.match(/const cacheKey = `[^`]*RENDER_VERSION/), 'RENDER_VERSION doit figurer dans cacheKey').toBeTruthy();
  });
});
