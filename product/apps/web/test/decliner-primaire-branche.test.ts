import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'itération attribuable passe devant.
 *
 * Dans le détail d'une créa, la CTA forte était « ✨ Varier (3) » (toolPrimary),
 * placée AVANT « Décliner ». Or le code dit lui-même que Varier change tout à la
 * fois et n'attribue l'écart à rien · c'est « Décliner » (une seule chose change,
 * le reste tenu) qui apprend. Le bouton qui criait était celui qui n'enseigne
 * rien. On vérifie l'emphase : Décliner premier et primaire, Varier secondaire.
 *
 * Le rail d'actions est désormais présentiel (RailFicheCrea) · Décliner et
 * Varier vivent dans la rubrique « Itérer », Décliner en premier (gros bloc de
 * boutons) et Varier en sous-groupe secondaire.
 */
const RAIL = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/RailFicheCrea.tsx'), 'utf8');
const iIterer = RAIL.indexOf('titre="Itérer"'); // la rubrique accentuée qui ouvre le rail d'actions
const iDecliner = RAIL.indexOf('>Décliner</b>'); // l'emphase de Décliner, en tête de la rubrique
const iVarier = RAIL.indexOf('Varier (3) · explorer vite'); // le sous-groupe secondaire

describe('Décliner (attribuable) porte la primauté sur Varier', () => {
  it('Décliner est présenté AVANT Varier dans le détail', () => {
    expect(iDecliner, 'l’emphase de Décliner a disparu').toBeGreaterThan(-1);
    expect(iVarier, 'le libellé secondaire de Varier a disparu').toBeGreaterThan(-1);
    expect(iVarier, 'Varier repasse avant Décliner').toBeGreaterThan(iDecliner);
  });

  it('Varier n’est plus la CTA forte · il porte le style secondaire, jamais toolPrimary', () => {
    const anchor = RAIL.indexOf('onClick={props.onVarier}');
    expect(anchor, 'le bouton Varier a disparu').toBeGreaterThan(-1);
    const bloc = RAIL.slice(anchor - 40, anchor + 180);
    expect(bloc, 'Varier n’est plus en secondaire').toContain('toolBtn');
    expect(bloc, 'Varier reprend la CTA forte').not.toContain('toolPrimary');
  });

  it('Décliner ouvre la rubrique « Itérer » accentuée · devant Varier', () => {
    // La primauté est portée par la rubrique « Itérer » (intitulé en accent),
    // dont Décliner est le premier contenu, Varier le second.
    expect(iIterer, 'la rubrique Itérer a disparu').toBeGreaterThan(-1);
    expect(iIterer, 'Itérer n’ouvre plus le rail avant Décliner').toBeLessThan(iDecliner);
    expect(RAIL, 'l’intitulé de rubrique n’est plus teinté accent').toContain("color: 'var(--accent-strong)'");
  });
});
