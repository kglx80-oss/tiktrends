import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Recette N · /admin/plans à 390 px. Mesuré dans le navigateur · la fenêtre de
 * mise en page s'élargissait à 509 px (contenu plus large que l'écran) · le
 * formulaire « Ajuster les crédits » posait ses trois éléments (montant 130 px,
 * motif 230 px, bouton) sur une ligne qui ne pouvait PAS passer à la ligne ·
 * le motif sortait de la carte et « Appliquer » partait hors écran.
 *
 * On REND la vraie page (session fondateur simulée, ni base ni réseau) et on lit
 * le formulaire · il doit pouvoir passer à la ligne, aucun champ ne doit dépasser
 * la largeur disponible, et chaque étiquette doit nommer son champ.
 */
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error('redirect ' + u); } }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', workspaceName: 'Espace démo', role: 'owner', plan: 'business', user: { id: 'u', email: 'fondateur@exemple.invalid', name: 'K' } }) }));
vi.mock('@tiktrends/db', () => ({ db: null, schema: {} }));
vi.mock('../lib/founder', () => ({ isFounder: () => true }));
vi.mock('../lib/credits', () => ({ unlimitedCredits: () => true }));
vi.mock('../app/actions/billing', () => ({ changePlanAction: async () => {} }));
vi.mock('../app/actions/credits', () => ({ grantCreditsAction: async () => {}, rechargeAllocationAction: async () => {} }));

import AdminPlansPage from '../app/(app)/admin/plans/page';

async function rendu() {
  return renderToStaticMarkup(await AdminPlansPage({ searchParams: Promise.resolve({}) }));
}

/** Le <form> qui contient le champ `name`, balise ouvrante et contenu. */
function formulaireDe(html: string, name: string): { ouverture: string; corps: string } {
  const i = html.indexOf(`name="${name}"`);
  const debut = html.lastIndexOf('<form', i);
  const fin = html.indexOf('</form>', i);
  const bloc = html.slice(debut, fin);
  return { ouverture: bloc.slice(0, bloc.indexOf('>') + 1), corps: bloc };
}

describe('Recette N · /admin/plans · « Ajuster les crédits » tient à 390 px', () => {
  it('la ligne du formulaire passe à la ligne au lieu de sortir de la carte', async () => {
    const { ouverture } = formulaireDe(await rendu(), 'amount');
    expect(ouverture, 'le formulaire « Ajuster les crédits » ne passe pas à la ligne · le motif sort de l’écran à 390').toContain('flex-wrap:wrap');
  });

  it('aucun champ ne dépasse la largeur disponible', async () => {
    const { corps } = formulaireDe(await rendu(), 'amount');
    for (const nom of ['amount', 'reason']) {
      const champ = corps.match(new RegExp(`<input[^>]*name="${nom}"[^>]*>`))?.[0] ?? '';
      expect(champ, `le champ ${nom} garde une largeur fixe sans borne · il déborde à 390`).toContain('max-width:100%');
    }
  });

  it('chaque étiquette nomme son champ', async () => {
    const { corps } = formulaireDe(await rendu(), 'amount');
    for (const nom of ['amount', 'reason']) {
      const id = corps.match(new RegExp(`<input[^>]*id="([^"]+)"[^>]*name="${nom}"`))?.[1];
      expect(id, `le champ ${nom} n’a pas d’identifiant`).toBeTruthy();
      expect(corps, `l’étiquette du champ ${nom} ne le nomme pas`).toContain(`for="${id}"`);
    }
  });
});
