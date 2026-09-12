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
// La grille de cartes du moteur vit désormais dans son propre composant · l'assistant
// la lui délègue. Les propriétés d'AFFICHAGE (ligne mesurée, bandeau, badge recommandé)
// sont couvertes par le garde de RENDU `selecteur-moteur-rendu` · ici on garde le
// câblage : où le conseil arrive, et qu'aucun réglage ne bouge tout seul.
const SEL = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/SelecteurMoteur.tsx'), 'utf8');

describe('le conseil traverse jusqu’à l’écran', () => {
  it('la page le calcule depuis le bilan', () => {
    // Le bilan est lu UNE fois puis partagé avec le conseil de mode · le moteur
    // se calcule donc de la variable, pas d'un appel inline. La lecture est
    // menée en parallèle des deux autres, mais reste UNIQUE.
    expect((PAGE.match(/bilanCopieAction\(\)/g) ?? []).length, 'le bilan doit être lu une seule fois').toBe(1);
    expect(PAGE).toMatch(/conseilMoteur\(bilanCopie\)/);
  });

  it('une lecture en échec laisse le catalogue décider', () => {
    // Un bilan illisible ne doit pas priver du studio · il prive du conseil,
    // ce qui ramène au comportement d'avant.
    expect(PAGE).toMatch(/bilanCopieAction\(\).*\.catch\(/);
  });

  it('le studio le transmet, l’assistant le passe au sélecteur, qui l’affiche', () => {
    expect(STUDIO).toMatch(/conseilMoteurs=\{conseilMoteurs\}/);
    // L'assistant passe le conseil au sélecteur · il ne l'affiche plus en propre.
    expect(ASSISTANT, 'le conseil n’arrive plus jusqu’au sélecteur').toMatch(/conseil=\{p\.conseilMoteurs\}/);
    // Le sélecteur rend la ligne mesurée · le garde de rendu le prouve sur le HTML.
    expect(SEL, 'le conseil arrive sans jamais s’afficher').toMatch(/\{ligne\.texte\}/);
  });
});

describe('le mesuré devient le défaut, sans se cacher', () => {
  it('le défaut du studio est le moteur mesuré quand il tranche EN ENTIÈRE, sinon le mode-aware', () => {
    // C'est le cœur du changement · l'état INITIAL du moteur suit la mesure via
    // moteurParDefaut, qui ne laisse la reco par marque piloter le défaut QU'EN
    // ENTIÈRE (la relecture ne tourne que là) et retombe sinon sur le recommandé
    // SELON LE MODE. La règle de scoping vit dans le noyau (garde moteur-par-defaut).
    expect(STUDIO).toMatch(/useState\(moteurParDefaut\(fabrication, conseilMoteurs\.recommande\)\)/);
  });

  it('l’adoption est annoncée, jamais silencieuse · et seulement en entière', () => {
    // Un défaut qui suit la mesure sans le dire se lit comme un bug · le sélecteur
    // dit qu'on a retenu le moteur mesuré, et montre ses chiffres. La comparaison
    // se fait au recommandé DU MODE, et le bandeau ne s'affiche QU'EN ENTIÈRE · en
    // composée la mesure ne pilote pas, donc prétendre l'avoir retenue serait faux.
    // L'assistant garde le scoping « entière » au point de câblage, le sélecteur
    // consomme ce drapeau.
    expect(ASSISTANT, 'le scoping entière n’est plus câblé').toMatch(/mesureActive=\{p\.etat\.mode === 'entiere'\}/);
    expect(SEL).toMatch(/mesureActive && contredit\(conseil, recommande\)/);
    expect(SEL).toMatch(/On a retenu le moteur que ta mesure désigne/);
  });

  it('aucun `onMoteur` réactif · le défaut se pose une fois, le clic seul change ensuite', () => {
    // Le mesuré fixe l'état initial · il ne doit PAS écraser le choix de
    // l'utilisateur par un setter réactif. L'assistant ne fait que PASSER le
    // rappel (référence, sans parenthèse) · il ne l'appelle jamais lui-même.
    const appelsAssistant = (ASSISTANT.match(/p\.onMoteur\(/g) ?? []).length;
    expect(appelsAssistant, 'l’assistant appelle onMoteur en dehors d’un clic').toBe(0);
    expect(ASSISTANT, 'le rappel n’est plus passé au sélecteur').toMatch(/onChoisir=\{p\.onMoteur\}/);
    // Dans le sélecteur, le seul appel au rappel est le clic · pas d'effet réactif.
    const appelsSel = (SEL.match(/onChoisir\(/g) ?? []).length;
    expect(appelsSel, 'le sélecteur appelle le rappel ailleurs qu’au clic').toBe(1);
    expect(SEL).toMatch(/onClick=\{\(\) => onChoisir\(m\.key\)\}/);
  });

  it('le recommandé du mode reste affiché pour la marque neuve', () => {
    // Sans mesure, le recommandé SELON LE MODE reste le repère · l'effacer
    // priverait une marque neuve de tout point de départ. Le sélecteur marque la
    // carte recommandée à partir du `recommande` passé par l'assistant.
    expect(SEL).toMatch(/recommande === m\.key/);
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
