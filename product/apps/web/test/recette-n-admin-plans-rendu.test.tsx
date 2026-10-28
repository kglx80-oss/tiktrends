// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Recette N · /admin/plans à 390 px. Mesuré dans le navigateur · le formulaire
 * « Ajuster les crédits » de l'ancien écran posait ses trois éléments (montant
 * 130 px, motif 230 px, bouton) sur une ligne qui ne pouvait PAS passer à la
 * ligne · le motif sortait de la carte et « Appliquer » partait hors écran.
 *
 * Spatial · vague 3 · les leviers vivent dans « Forfaits & offres ». On REND la
 * vraie page (session fondateur simulée, ni base ni réseau) et on lit le
 * formulaire · aucun champ ne garde une largeur fixe (la feuille de la maquette
 * les met à 100 % de leur colonne, et la grille passe à une colonne sous
 * 1 100 px), chaque champ est nommé par son étiquette, et le solde affiché
 * passe par la décision commune (N09 · « Illimité », jamais « 0 »).
 */
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error('redirect ' + u); }, usePathname: () => '/admin/plans' }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', workspaceName: 'Espace démo', role: 'owner', plan: 'business', user: { id: 'u', email: 'fondateur@exemple.invalid', name: 'K' } }), signupOpen: () => true }));
vi.mock('@tiktrends/db', () => ({ db: null, schema: {} }));
vi.mock('../lib/founder', () => ({ isFounder: () => true }));
vi.mock('../lib/credits', () => ({ unlimitedCredits: () => true }));
vi.mock('../lib/settings', () => ({ getPlanConfig: async () => ({ prices: { starter: 0, core: 49, plus: 149, business: 399 }, credits: { starter: 300, core: 2000, plus: 6000, business: 20000 } }) }));
vi.mock('../app/actions/billing', () => ({ changePlanAction: async () => {} }));
vi.mock('../app/actions/credits', () => ({ grantCreditsAction: async () => {}, rechargeAllocationAction: async () => {} }));

import ForfaitsSpatial from '../app/(spatial)/sp/admin/plans/page';
import { avecSpatial } from './spatial/fournisseur';

async function leviers() {
  const t = document.createElement('template');
  t.innerHTML = renderToStaticMarkup(avecSpatial(await ForfaitsSpatial({ searchParams: Promise.resolve({}) })));
  return t.content.querySelector('#leviers')!;
}

describe('Recette N · /admin/plans · « Ajuster les crédits » tient à 390 px', () => {
  it('les champs sont dans une grille qui passe à une colonne · aucun ne garde une largeur fixe', async () => {
    const f = (await leviers()).querySelector('form[data-levier="credits"]')!;
    expect(f.querySelector('.agrid2'), 'la ligne montant + motif n’est pas une grille repliable').not.toBeNull();
    for (const nom of ['amount', 'reason']) {
      const champ = f.querySelector(`input[name="${nom}"]`) as HTMLInputElement;
      expect(champ, nom).toBeTruthy();
      expect(champ.style.width, `le champ ${nom} garde une largeur fixe · il déborde à 390`).toBe('');
      expect(champ.style.minWidth, nom).toBe('');
    }
  });

  it('chaque étiquette nomme son champ', async () => {
    const f = (await leviers()).querySelector('form[data-levier="credits"]')!;
    for (const [nom, libelle] of [['amount', 'Ajustement'], ['reason', 'Motif']] as const) {
      const label = f.querySelector(`input[name="${nom}"]`)!.closest('label');
      expect(label?.textContent, `l’étiquette du champ ${nom} ne le nomme pas`).toContain(libelle);
    }
  });

  it('N09 · un compte illimité voit « Illimité » au solde, jamais « 0 »', async () => {
    const k = [...(await leviers()).querySelectorAll('.akpi')].find((x) => x.querySelector('.lbl')?.textContent === 'Solde crédits')!;
    expect(k.querySelector('b')!.textContent).toBe('Illimité');
  });
});
