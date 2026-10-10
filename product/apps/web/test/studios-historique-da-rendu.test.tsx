// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * « Préparer une création » · la liste « Créations précédentes », montée dans
 * un vrai DOM (jsdom), actions serveur remplacées par des réponses contrôlées.
 * On lit ce qui est PEINT et ce qui PART au serveur :
 *
 *  · les créations de la marque cible sont listées (libellé, date, aperçu) ;
 *  · cocher une création l'ajoute aux sources envoyées à la création du
 *    projet, à côté de la source d'origine ;
 *  · changer de marque vide la sélection (une création ne passe pas d'une
 *    marque à l'autre).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ creer: [] as any[], proposer: [] as any[] }));

vi.mock('../app/actions/studios/sources', () => ({
  preparerCreation: async (e: any) => preparation(e.brandId ?? 'b_a1'),
  proposerHypotheses: async (e: any) => { h.proposer.push(e); return { ok: true, brandId: e.brandId, hypotheses: [], questions: [], jeton: null, runId: null, avertissements: [] }; },
  creerProjetDepuisSources: async (e: any) => { h.creer.push(e); return { ok: true, projet: { id: 'p_cree', title: e.titre, kind: e.kind, brandId: e.brandId }, versionId: 'v1', deja: false }; },
}));

import { annonceObservee, referenceSource } from '@tiktrends/core';
import { PreparerCreation } from '../components/studios/PreparerCreation';

const ANNONCE = { id: '9001', platform: 'meta', mediaType: 'image', thumbnailUrl: 'https://cdn.exemple.test/v.jpg', advertiserName: 'Lumière Botanique', body: 'Votre peau mérite mieux.' };
const source = referenceSource({ type: 'veille_ad', annonce: annonceObservee(ANNONCE)!, savedAdId: null, portee: { workspaceId: 'ws', brandId: null }, observeLe: new Date('2026-10-01T09:00:00Z'), format: null, retourVeille: null });
function preparation(brandId: string) {
  return {
    ok: true, brandId, marques: [{ id: 'b_a1', nom: 'Marque A1' }, { id: 'b_a2', nom: 'Marque A2' }], sources: [source], produits: [],
    creations: brandId === 'b_a1'
      ? [
        { id: 'gen-a1-pub', libelle: 'Pub IA · Le sérum qui tient', creeLe: '2026-09-28T10:00:00Z', apercu: '/api/ad/gen-a1-pub' },
        { id: 'gen-a1-img', libelle: 'Image IA', creeLe: '2026-09-20T10:00:00Z', apercu: 'https://cdn.test/a1.png' },
      ]
      : [],
    ia: { disponible: false, raison: 'Propositions pas encore activées.', plafondUsd: 0.14, modele: 'claude-sonnet-5' }, metriques: [],
  };
}

let root: Root;
let hote: HTMLDivElement;
const corps = () => document.body;
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const bouton = (texte: string) => [...corps().querySelectorAll('button')].find((b) => b.textContent?.includes(texte)) as HTMLButtonElement;
const section = () => corps().querySelector('[data-section="creations-precedentes"]') as HTMLElement | null;
const caseDe = (id: string) => corps().querySelector(`[data-creation-precedente="${id}"] input[type="checkbox"]`) as HTMLInputElement;

beforeAll(async () => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
  await act(async () => root.render(<PreparerCreation annonce={ANNONCE} />));
  await act(async () => bouton('Préparer une création').click());
  await flush();
});
afterAll(() => { act(() => root.unmount()); hote.remove(); });

describe('Préparer une création · créations précédentes', () => {
  it('liste les créations de la marque cible, avec date et aperçu', () => {
    const s = section();
    expect(s).not.toBeNull();
    expect(s!.querySelector('h3')!.textContent).toBe('Créations précédentes de Marque A1');
    const lignes = [...s!.querySelectorAll('[data-creation-precedente]')].map((l) => l.textContent);
    expect(lignes).toEqual(['Pub IA · Le sérum qui tientCréée le 28/09/2026', 'Image IACréée le 20/09/2026']);
    expect(s!.querySelector('[data-creation-precedente="gen-a1-img"] img')!.getAttribute('src')).toBe('https://cdn.test/a1.png');
  });

  it('une création cochée part avec la source d’origine à la création du projet', async () => {
    await act(async () => caseDe('gen-a1-pub').click());
    expect(caseDe('gen-a1-pub').checked).toBe(true);
    await act(async () => bouton('Créer le projet pour').click());
    await flush();
    expect(h.creer.at(-1).sources).toEqual([
      { type: 'veille', annonce: ANNONCE, retour: null },
      { type: 'creation', id: 'gen-a1-pub' },
    ]);
    expect(corps().querySelector('[data-creation="ok"]')!.textContent).toContain('la source et la création précédente y sont gardés');
  });
});

describe('changer de marque vide la sélection', () => {
  it('A2 n’a pas de création · la liste le dit et rien de A1 ne part', async () => {
    await act(async () => { root.unmount(); });
    root = createRoot(hote);
    await act(async () => root.render(<PreparerCreation annonce={ANNONCE} />));
    await act(async () => bouton('Préparer une création').click());
    await flush();
    await act(async () => caseDe('gen-a1-img').click());
    const select = corps().querySelector('#pc-marque-choix') as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'b_a2');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(section()!.querySelector('[data-creations="aucune"]')!.textContent).toContain('Aucune création réutilisable pour cette marque');
    await act(async () => bouton('Créer le projet pour').click());
    await flush();
    expect(h.creer.at(-1)).toMatchObject({ brandId: 'b_a2', sources: [{ type: 'veille', annonce: ANNONCE, retour: null }] });
  });
});
