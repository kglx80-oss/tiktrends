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
