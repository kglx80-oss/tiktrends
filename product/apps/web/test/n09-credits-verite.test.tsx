import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CreditsMenu } from '../components/CreditsMenu';

/**
 * CDC v7 · N09 · la puce de crédits dit la vérité ·
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
