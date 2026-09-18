import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v7 · N07 · le langage ne promet plus au-delà de ce qui est établi.
 *
 * Les écrans clamaient « Crée des pubs qui performent », « gabarits gagnants »,
 * « Clone ce gagnant », « classées par ce que le prochain euro rapportera » ·
 * autant de promesses de résultat ou de revenu que rien ne prouve (une
 * variation d'un seul élément ne prouve pas seule une causalité · diffusion,
 * audience, contexte et taille d'échantillon comptent).
 *
 * On tient le vocabulaire commun · source observée, piste, hypothèse,
 * prometteuse relative, résultat conforme au protocole, priorité de revue ·
 * et on interdit le retour des formulations qui sur-promettent. Garde sur les
 * chaînes EXACTES des écrans concernés (S07 studio, S25 onboarding, plan
 * d'itération) · les autres emplois de « gagnant » (verdict validé, ROAS
 * mesuré, prompts internes) restent légitimes et hors périmètre.
 */

const lire = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const STUDIO = lire('app/(app)/studio/ads/AdsStudio.tsx');
const ONBOARDING = lire('app/onboarding/OnboardingWizard.tsx');
const PLAN = lire('app/actions/adsmap-iterate.ts');
const ENTRAINEMENT = lire('app/(app)/jarvis/JarvisTraining.tsx');

describe('N07 · le studio ne promet plus la performance', () => {
  it('l’accroche parle de pubs À TESTER, pas de pubs « qui performent »', () => {
    expect(STUDIO, 'l’accroche promet encore la performance').not.toContain('pubs qui performent');
    expect(STUDIO, 'l’accroche ne dit pas qu’on génère pour tester').toContain('Génère des pubs à tester');
  });

  it('le corps parle d’un format REPÉRÉ sur le marché, pas de « gabarits gagnants »', () => {
    expect(STUDIO, 'le corps qualifie encore les gabarits de « gagnants »').not.toContain('gabarits gagnants');
    expect(STUDIO, 'le corps ne nomme pas la source observée').toContain('format repéré sur le marché');
  });
});

describe('N07 · l’onboarding ne promet plus la performance', () => {
  it('l’accroche guide par la donnée, du repérage au test · pas « des créas qui performent »', () => {
    expect(ONBOARDING, 'l’onboarding promet encore la performance').not.toContain('créas qui performent');
    expect(ONBOARDING).toContain('guidées par la donnée, du repérage au test');
  });
});

describe('N07 · le plan d’itération classe par revue, pas par revenu', () => {
  it('le résumé parle de PRIORITÉ DE REVUE, pas de « ce que le prochain euro rapportera »', () => {
    expect(PLAN, 'le plan promet encore un revenu').not.toContain('prochain euro rapportera');
    expect(PLAN, 'le plan ne dit pas sa méthode de priorité').toContain('classées par priorité de revue');
  });
});

describe('N07 (v8) · les promesses absolues restantes sont retirées', () => {
  const APPSHELL = lire('components/AppShell.tsx');
  const ACCUEIL = lire('components/AssistantHome.tsx');

  it('« Cloner une pub gagnante » devient « une pub qui tient » (studio + palette)', () => {
    expect(STUDIO, 'le studio qualifie encore la source de « gagnante »').not.toContain('Cloner une pub gagnante');
    expect(APPSHELL, 'la palette de commandes qualifie encore la source de « gagnante »').not.toContain('Cloner une pub gagnante');
    expect(STUDIO).toContain('Cloner une pub qui tient');
  });

  it('l’accueil ne promet plus « ta prochaine créative gagnante »', () => {
    expect(ACCUEIL).not.toContain('créative gagnante');
    expect(ACCUEIL).toContain('Crée ta prochaine créative, teste');
  });

  it('la fiche ne dit plus qu’une variation « rend l’écart attribuable »', () => {
    expect(STUDIO, 'la fiche promet encore l’attribution automatique').not.toContain('rend l’écart attribuable');
    expect(STUDIO).toContain('l’écart devient interprétable');
  });
});

describe('N07 · l’entraînement de Jarvis ne promet plus la performance', () => {
  it('les pubs sources sont « qui tiennent », pas « qui performent » ni « gagnantes »', () => {
    expect(ENTRAINEMENT, 'l’écran promet encore la performance').not.toContain('pubs qui <b>performent</b>');
    expect(ENTRAINEMENT, 'le bouton promet encore des « pubs gagnantes »').not.toContain('pubs gagnantes');
    expect(ENTRAINEMENT).toContain('tiennent dans la durée');
  });
  it('on distille des PISTES, pas des « patterns gagnants », et on ORIENTE, pas « tirer la performance »', () => {
    expect(ENTRAINEMENT, '« patterns gagnants » subsiste').not.toContain('patterns gagnants');
    expect(ENTRAINEMENT, '« tirer la performance vers le haut » subsiste').not.toContain('tirer la performance');
    expect(ENTRAINEMENT).toMatch(/distille des <b>pistes<\/b>/);
  });
  it('le compte rendu parle de pubs ANALYSÉES, pas « performantes »', () => {
    expect(ENTRAINEMENT, 'le toast promet encore des « pub(s) performante(s) »').not.toContain('pub(s) performante(s)');
    expect(ENTRAINEMENT).toContain('pub(s) analysée(s)');
  });
});
