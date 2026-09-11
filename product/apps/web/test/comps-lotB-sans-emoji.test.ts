import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Composants transverses (lot B · onboarding/création de marque) sans emoji
 * d'interface · rollout icônes (retour proprio #2). BrandWizard (✦🎨👥🔭 →
 * sparkles/palette/users/search), BrandOnboarding (🎉🚀 → star/spark),
 * BrandCreated (🎉 → star, via Modal icon=ReactNode), OnboardingWizard (les
 * champs `icon` des options/objectifs + 👋/🚀 → icônes/mots).
 */
const FICHIERS = [
  'components/BrandWizard.tsx',
  'components/BrandOnboarding.tsx',
  'components/BrandCreated.tsx',
  'app/onboarding/OnboardingWizard.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

describe('Composants lot B · plus aucun emoji d’interface', () => {
  it('aucun fichier ne porte de pictogramme', () => {
    for (const { rel, src } of FICHIERS) {
      // On garde le ✓ typographique (U+2713) : le retirer du texte à comparer.
      const nu = src.replace(/✓/g, '');
      const trouves = [...new Set(nu.match(PICTO) ?? [])];
      expect(trouves, `pictogramme(s) encore dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });
  it('les conversions rendent des icônes du jeu', () => {
    const tout = FICHIERS.map((f) => f.src).join('\n');
    expect(tout).toMatch(/<Icon name="sparkles"/);   // BrandWizard
    expect(tout).toMatch(/<Icon name="spark"/);        // BrandOnboarding / Onboarding
    expect(tout).toMatch(/<Icon name="star"/);         // BrandCreated
    expect(tout).toMatch(/<Icon name={icon}/);         // OnboardingWizard Card
  });
});
