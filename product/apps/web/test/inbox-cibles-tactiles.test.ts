import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La file de décisions (Inbox adsmap) est le seul des trois écrans qu'on ouvre
 * cinq minutes le matin · ses gestes (Ouvrir la fiche, Fait, Pas un problème,
 * Recalculer) et la croix du tiroir qu'elle ouvre (AdDrawer) se rataient au
 * doigt (~24 px, 28 px). On les porte à la cible tactile du noyau.
 *
 * Ces composants importent des actions serveur · non rendables en test. On
 * éprouve l'ADOPTION par la source, ÉLÉMENT PAR ÉLÉMENT. Le seuil est prouvé par
 * résultat dans le noyau (cible-tactile.test.ts).
 */
const lit = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const inbox = lit('app/(app)/adsmap/Inbox.tsx');
const drawer = lit('app/(app)/adsmap/AdDrawer.tsx');

function styleApres(src: string, ancre: string): string {
  const i = src.indexOf(ancre);
  expect(i, `ancre introuvable · ${ancre}`).toBeGreaterThan(-1);
  const s = src.indexOf('style={{', i);
  return src.slice(s, s + 320);
}

describe('Inbox · les gestes de la file atteignent la cible tactile', () => {
  it('adopte le seuil du noyau', () => {
    expect(inbox).toMatch(/import \{ CIBLE_TACTILE_MIN \} from '@tiktrends\/core'/);
  });

  it('le style partagé des trois actions (Ouvrir/Fait/Pas un problème) porte la hauteur de cible', () => {
    // `petit` est le style commun aux trois boutons d'action de chaque ligne ·
    // le corriger une fois les couvre tous les trois.
    const i = inbox.indexOf('const petit');
    expect(i, 'style petit introuvable').toBeGreaterThan(-1);
    const decl = inbox.slice(i, i + 260);
    expect(decl).toContain('minHeight: CIBLE_TACTILE_MIN');
  });

  it('le bouton Recalculer porte la hauteur de cible', () => {
    const style = styleApres(inbox, 'onClick={recalculer}');
    expect(style).toContain('minHeight: CIBLE_TACTILE_MIN');
  });
});

describe('AdDrawer · la croix du tiroir atteint la cible', () => {
  it('adopte le seuil du noyau', () => {
    expect(drawer).toContain("import { CIBLE_TACTILE_MIN } from '@tiktrends/core'");
  });

  it('la croix n’est plus un carré de 28 px en dur', () => {
    expect(drawer).not.toContain('width: 28, height: 28');
    const style = styleApres(drawer, 'onClick={onClose} aria-label="Fermer"');
    expect(style).toContain('width: CIBLE_TACTILE_MIN');
    expect(style).toContain('height: CIBLE_TACTILE_MIN');
  });
});
