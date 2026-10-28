import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantAccueil } from '../spatial/vues/accueil/assistant';

vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));

/**
 * CDC v7 · N08 · navigation mobile et formulaire assistant.
 *
 * À 360 px, le tiroir s'ouvrait mais Escape ne le fermait pas, son état n'était
 * pas annoncé, le focus restait au déclencheur ; le champ assistant n'avait pas
 * de libellé associé ; les liens actifs n'exposaient pas aria-current ; des
 * boutons ne se nommaient que « Déplier ».
 *
 * Le champ assistant se REND et se lit dans le HTML. La navigation (AppShell)
 * dépend du routeur pour se rendre · on tient son contrat par une garde de
 * source, comme les autres gardes du rail (rail-actif, rail-replie).
 */

describe('N08 · le champ assistant a un libellé PERSISTANT associé', () => {
  // Vague 2 Spatial v4 · l'assistant de l'Accueil Spatial (porté de l'ancien `AssistantChat`).
  const html = renderToStaticMarkup(<AssistantAccueil pret prix="1 crédit par question" suggestions={['Une question']} />);

  it('un label est lié au champ (htmlFor ↔ id), pas un simple placeholder', () => {
    const idMatch = html.match(/<input[^>]*\sid="([^"]+)"/);
    expect(idMatch, 'le champ n’a pas d’id à associer').toBeTruthy();
    const id = idMatch![1];
    expect(html, 'aucun label n’est lié au champ').toContain(`for="${id}"`);
    expect(html).toContain('Ta question à l’assistant');
  });

  it('le champ ne coupe pas son anneau de focus au clavier', () => {
    expect(html, 'le champ supprime son indicateur de focus').not.toContain('outline:none');
  });
});

// Le contrat de navigation mobile de la coquille V5 (`AppShell`, `lib/chrome-coquille`) est retiré avec elle ·
// la coquille Spatial garde le sien au rendu (`spatial-coquille` · aria-current, Échap, aria-expanded).
