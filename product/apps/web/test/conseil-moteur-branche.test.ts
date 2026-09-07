import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le conseil mesuré arrive jusqu'au choix du moteur.
 *
 * ── Ce qu'il remplace, et ce qu'il ne remplace pas ───────────────────────────
 *
 * Le catalogue porte un drapeau `recommended`, écrit une fois, identique pour
 * toutes les marques, et qui ne sait rien de ce que le moteur a produit ici. Ce
 * n'est pas mauvais · il faut bien un défaut pour une marque neuve.
 *
 * Mais dès qu'il y a des relectures, cet avis figé doit pouvoir être contredit
 * par ce qui s'est réellement passé. Le conseil ne remplace donc pas le
 * réglage · il s'affiche à côté, avec ses chiffres, et laisse choisir.
 *
 * Un réglage qui bouge tout seul entre deux visites se lit comme un bug, et la
 * fois d'après on ne fait plus confiance à l'écran.
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

describe('il ne se substitue pas au réglage', () => {
  it('le désaccord s’écrit au lieu de changer le moteur', () => {
    // C'est la règle · on le DIT, on ne l'applique pas.
    expect(ASSISTANT).toMatch(/contredit\(p\.conseilMoteurs, IMAGE_MODELS\.find/);
    expect(ASSISTANT).toMatch(/la mesure ne dit pas la même chose/);
  });

  it('aucun `onMoteur` n’est déclenché par le conseil', () => {
    // Un réglage qui change tout seul entre deux visites se lit comme un bug.
    // Le seul `onMoteur` admis est celui du clic sur un moteur.
    const appels = (ASSISTANT.match(/p\.onMoteur\(/g) ?? []).length;
    expect(appels, 'le conseil pilote le réglage au lieu de l’éclairer').toBe(1);
    expect(ASSISTANT).toMatch(/onClick=\{\(\) => p\.onMoteur\(m\.key\)\}/);
  });

  it('le drapeau du catalogue reste affiché', () => {
    // Il reste le défaut · l'effacer priverait une marque neuve de tout repère.
    expect(ASSISTANT).toMatch(/m\.recommended \? ' · recommandé' : ''/);
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
