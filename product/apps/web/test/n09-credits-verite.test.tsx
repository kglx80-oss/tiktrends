import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CreditsMenu } from '../components/CreditsMenu';
import { AssistantHome } from '../components/AssistantHome';

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

describe('N09 · l’accueil (Dashboard) dit la même vérité que la barre', () => {
  it('un compte illimité affiche « Illimité » sur l’accueil, jamais « 0 crédits »', () => {
    const h = renderToStaticMarkup(
      <AssistantHome firstName="Kevin" credits={0} unlimited brandName="Klorea" brandId={null} aiReady={false} />,
    );
    expect(h).toContain('Illimité');
    expect(h, 'le « 0 crédits » contradictoire subsiste').not.toContain('0 crédits');
  });

  it('un compte normal affiche son solde réel suivi de « crédits »', () => {
    const h = renderToStaticMarkup(
      <AssistantHome firstName="Kevin" credits={1240} unlimited={false} brandName="Klorea" brandId={null} aiReady={false} />,
    );
    expect(h).toMatch(/1\s?240 crédits/);
  });
});

// « L’écran de pilotage passe par la décision commune » · porté au RENDU de « Forfaits & offres »
// (Spatial, vague 3 · l’écran V5 /admin/plans est retiré) · `recette-n-admin-plans-rendu.test.tsx`.
