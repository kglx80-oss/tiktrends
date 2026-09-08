import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le conseil mesuré arrive jusqu'au choix du moteur, ET devient le défaut.
 *
 * ── Ce qui a changé, et pourquoi ─────────────────────────────────────────────
 *
 * Le catalogue porte un drapeau `recommended`, écrit une fois, identique pour
 * toutes les marques, et qui ne sait rien de ce que le moteur a produit ici. Il
 * reste le défaut d'une marque neuve, tant que rien n'a été mesuré.
 *
 * Mais dès que les relectures TRANCHENT, partir du catalogue en se contentant
 * d'afficher « la mesure dit autre chose » revenait à proposer par défaut un
 * a priori qu'on a déjà prouvé plus faible ici. Le moteur mesuré le meilleur
 * devient donc le défaut · ce n'est pas un réglage qui bouge au hasard, c'est un
 * défaut adossé à une mesure locale qui a tranché, et l'écran le DIT.
 *
 * Ce qui reste interdit · un `onMoteur` réactif qui écraserait le choix de
 * l'utilisateur entre deux rendus. Le mesuré fixe l'état INITIAL, une fois · le
 * clic reste le seul à changer le réglage ensuite.
 */

const ASSISTANT = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AssistantPub.tsx'), 'utf8');
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/page.tsx'), 'utf8');

describe('le conseil traverse jusqu’à l’écran', () => {
  it('la page le calcule depuis le bilan', () => {
    expect(PAGE).toMatch(/conseilMoteur\(\(await bilanCopieAction\(\)/);
  });

  it('une lecture en échec laisse le catalogue décider', () => {
    // Un bilan illisible ne doit pas priver du studio · il prive du conseil,
    // ce qui ramène au comportement d'avant.
    expect(PAGE).toMatch(/bilanCopieAction\(\)\.catch\(/);
  });

  it('le studio le transmet, l’assistant l’affiche', () => {
    expect(STUDIO).toMatch(/conseilMoteurs=\{conseilMoteurs\}/);
    expect(ASSISTANT, 'le conseil arrive sans jamais s’afficher').toMatch(/\{p\.conseilMoteurs\.lignes\[m\.key\]!\.texte\}/);
  });
});

describe('le mesuré devient le défaut, sans se cacher', () => {
  it('le défaut du studio est le moteur mesuré quand il tranche, sinon le mode-aware', () => {
    // C'est le cœur du changement · l'état INITIAL du moteur suit la mesure,
    // et retombe sur le recommandé SELON LE MODE (mode-aware), plus « nano » en
    // dur · Nano proposé partout mettait le mauvais moteur par défaut en entière.
    expect(STUDIO).toMatch(/useState\(conseilMoteurs\.recommande \?\? moteurRecommande\(fabrication\)\)/);
  });

  it('l’adoption est annoncée, jamais silencieuse', () => {
    // Un défaut qui suit la mesure sans le dire se lit comme un bug · l'écran
    // du volume dit qu'on a retenu le moteur mesuré, et montre ses chiffres.
    // La comparaison se fait au recommandé DU MODE, pas au drapeau figé.
    expect(ASSISTANT).toMatch(/contredit\(p\.conseilMoteurs, recommande\)/);
    expect(ASSISTANT).toMatch(/On a retenu le moteur que ta mesure désigne/);
  });

  it('aucun `onMoteur` réactif · le défaut se pose une fois, le clic seul change ensuite', () => {
    // Le mesuré fixe l'état initial · il ne doit PAS écraser le choix de
    // l'utilisateur par un setModel réactif. Le seul `onMoteur` admis est le clic.
    const appels = (ASSISTANT.match(/p\.onMoteur\(/g) ?? []).length;
    expect(appels, 'le conseil pilote le réglage en continu au lieu de fixer le défaut').toBe(1);
    expect(ASSISTANT).toMatch(/onClick=\{\(\) => p\.onMoteur\(m\.key\)\}/);
  });

  it('le recommandé du mode reste affiché pour la marque neuve', () => {
    // Sans mesure, le recommandé SELON LE MODE reste le repère · l'effacer
    // priverait une marque neuve de tout point de départ. Le mode-aware remplace
    // le drapeau figé du catalogue.
    expect(ASSISTANT).toMatch(/recommande === m\.key \? ' · recommandé' : ''/);
  });
});

describe('il ne coûte rien', () => {
  it('la page n’appelle aucun modèle pour le produire', () => {
    // Le conseil additionne ce qui est déjà payé · un conseil qui coûte se
    // consulte une fois, puis plus jamais.
    const bloc = PAGE.slice(PAGE.indexOf('const conseilMoteurs'), PAGE.indexOf('const conseilMoteurs') + 200);
    expect(bloc).not.toMatch(/guardedAnthropic|sousPlafond|scoreCreative/);
  });
});
