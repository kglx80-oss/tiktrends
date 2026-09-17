import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { CreditsMenu } from '../components/CreditsMenu';

/**
 * CDC v7 · N09 · la puce du rail et l'écran de pilotage disent la MÊME vérité ·
 * un compte illimité montre « Illimité » partout, jamais « 0 ».
 */

describe('N09 · la puce de crédits ne contredit pas l’état illimité', () => {
  it('un compte illimité affiche « Illimité », jamais un solde de zéro', () => {
    const h = renderToStaticMarkup(<CreditsMenu balance={0} unlimited planLabel="Business" showUpgrade={false} />);
    expect(h).toContain('Illimité');
    // Le « 0 » du solde ne doit pas apparaître comme valeur de crédits.
    expect(h).not.toMatch(/>\s*0\s*</);
  });

  it('un compte normal affiche son solde réel', () => {
    const h = renderToStaticMarkup(<CreditsMenu balance={1240} unlimited={false} planLabel="Core" showUpgrade={false} />);
    expect(h).toMatch(/1\s?240/);
  });
});

describe('N09 · l’écran de pilotage passe par la décision commune (garde de source)', () => {
  it('le « Solde crédits » du fondateur passe par afficherCredits · plus de fmt(balance) brut', () => {
    const page = readFileSync(join(process.cwd(), 'app/(app)/admin/plans/page.tsx'), 'utf8');
    expect(page, 'le solde ne passe pas par la décision commune').toMatch(/afficherCredits\(\{ balance, unlimited: unlimitedCredits/);
    expect(page).toMatch(/value=\{soldeAffiche\}/);
    expect(page, 'le solde brut fmt(balance) est encore affiché').not.toMatch(/value=\{fmt\(balance\)\}/);
  });
});
