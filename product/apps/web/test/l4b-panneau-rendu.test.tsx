// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * L4-B · le panneau « Préparer une création », monté dans un vrai DOM (jsdom),
 * actions serveur remplacées par des réponses CONTRÔLÉES (on choisit quand
 * elles arrivent). On lit ce qui est PEINT.
 *
 *  · ressources réellement disponibles et absentes (FLOW-02), plafond de coût
 *    annoncé avant le clic, choix de marque visible avant toute écriture ;
 *  · FLOW-03 · une proposition demandée pour A1 qui arrive APRÈS le passage à
 *    A2 n'est jamais peinte ; les produits suivent la marque ;
 *  · le brouillon rédigé reste dans SA marque ;
 *  · double clic sur « Créer » · une seule clé de clic ;
 *  · la carte de Veille porte le bouton sans perdre son lien historique.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  appels: { preparer: [] as any[], proposer: [] as any[], creer: [] as any[] },
  attentes: [] as Array<{ resoudre: (v: unknown) => void; entree: any }>,
}));

vi.mock('../app/actions/studios/sources', () => ({
  preparerCreation: async (e: any) => { h.appels.preparer.push(e); return preparation(e.brandId ?? 'b_a1'); },
  proposerHypotheses: (e: any) => { h.appels.proposer.push(e); return new Promise((resoudre) => h.attentes.push({ resoudre, entree: e })); },
  creerProjetDepuisSources: async (e: any) => { h.appels.creer.push(e); return { ok: true, projet: { id: 'p_cree', title: e.titre, kind: e.kind, brandId: e.brandId }, versionId: 'v1', deja: h.appels.creer.length > 1 }; },
}));
vi.mock('../components/InspoButtons', () => ({ SaveButton: () => <button type="button">★</button>, FollowButton: () => <button type="button">+ Suivre</button> }));

import { annonceObservee, referenceSource, faitsProduit } from '@tiktrends/core';
import { PreparerCreation } from '../components/studios/PreparerCreation';
import { AdCard } from '../components/AdCard';

const ANNONCE = {
  id: '9001', platform: 'meta', daysRunning: 64, mediaType: 'image', thumbnailUrl: 'https://cdn.exemple.test/v.jpg',
  advertiserName: 'Lumière Botanique', body: 'Votre peau mérite mieux. Notre sérum efface les taches.', callToAction: 'Acheter', landingDomain: 'lbcosmetiques.fr',
};
const source = referenceSource({ type: 'veille_ad', annonce: annonceObservee(ANNONCE)!, savedAdId: null, portee: { workspaceId: 'ws', brandId: null }, observeLe: new Date('2026-10-01T09:00:00Z'), format: null, retourVeille: null });
const produit = (id: string, nom: string) => ({ id, nom, ...faitsProduit({ id, name: nom, description: null, usp: null, price: null, url: null, imageUrl: null, imageUrls: null }), photoDisponible: false });
function preparation(brandId: string) {
  return {
    ok: true, brandId, marques: [{ id: 'b_a1', nom: 'Marque A1' }, { id: 'b_a2', nom: 'Marque A2' }], sources: [source],
    produits: brandId === 'b_a1' ? [produit('p1', 'Crème Douce')] : [produit('p2', 'Produit A2')],
    ia: { disponible: true, raison: null, plafondUsd: 0.14, modele: 'claude-sonnet-5' }, metriques: ['Taux de clic (CTR)'],
  };
}
const hypotheses = (brandId: string, n: number) => ({
  ok: true, brandId, jeton: `jeton-${brandId}`, runId: 'r', avertissements: [],
  hypotheses: Array.from({ length: n }, (_, i) => ({ id: `hyp_${i + 1}`, statement: `Hypothèse ${brandId} ${i + 1}`, sourceIds: [source.sourceId], variable: 'Accroche', control: 'A', treatment: 'B', invariants: [], metric: 'Taux de clic (CTR)', decisionRule: '', limitations: [], isolee: true })),
});

let root: Root;
let hote: HTMLDivElement;
const corps = () => document.body;
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const bouton = (texte: string | RegExp) => [...corps().querySelectorAll('button')].find((b) => (typeof texte === 'string' ? b.textContent?.includes(texte) : texte.test(b.textContent ?? ''))) as HTMLButtonElement;
function changer(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string, evenement: 'input' | 'change') {
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
  set.call(el, v);
  el.dispatchEvent(new Event(evenement, { bubbles: true }));
}
const selectMarque = () => corps().querySelector('#pc-marque-choix') as HTMLSelectElement;

beforeAll(async () => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
  await act(async () => root.render(<PreparerCreation annonce={ANNONCE} retour="q=serum#ad-meta-9001" />));
});
afterAll(() => { act(() => root.unmount()); hote.remove(); });

describe('Préparer une création · ce qui est montré avant toute écriture', () => {
  it('ouvre sur la source, les ressources disponibles ET absentes, la marque cible et le coût annoncé', async () => {
    await act(async () => bouton('Préparer une création').click());
    await flush();
    expect(h.appels.preparer[0]).toEqual({ sources: [{ type: 'veille', annonce: ANNONCE, retour: 'q=serum#ad-meta-9001' }] });
    const txt = corps().textContent!;
    expect(txt).toContain('Lumière Botanique');
    expect(txt).toContain('observée le 01/10/2026');
    const etat = (m: string) => corps().querySelector(`[data-modalite="${m}"]`)?.getAttribute('data-disponible');
    expect([etat('image'), etat('video'), etat('transcription'), etat('texte'), etat('lien')]).toEqual(['oui', 'non', 'non', 'oui', 'oui']);
    expect(corps().querySelector('[data-modalite="transcription"]')?.textContent).toBe('Transcription · absente');
    expect(corps().querySelector('[data-absent="narration"]')?.textContent).toContain('Narration · absente · Aucune transcription ni piste audio');
    expect(selectMarque().value).toBe('b_a1');
    expect(txt).toContain('environ 0,14 $ (estimation) · borne exacte réservée avant l’envoi, sous le plafond · aucun crédit débité');
    expect(bouton('Créer le projet').textContent).toBe('Créer le projet pour Marque A1');
    expect(h.appels.creer).toHaveLength(0);
  });
});

describe('FLOW-03 · marque changée pendant une réponse tardive', () => {
  it('la proposition demandée pour A1, arrivée après le passage à A2, n’est jamais peinte', async () => {
    await act(async () => bouton('Proposer des hypothèses').click());
    expect(h.attentes).toHaveLength(1);
    expect(h.attentes[0]!.entree.brandId).toBe('b_a1');
    await act(async () => changer(selectMarque(), 'b_a2', 'change'));
    await flush();
    expect(corps().querySelector('[data-produit="p2"]'), 'produits de A2 absents').not.toBeNull();
    expect(corps().querySelector('[data-produit="p1"]'), 'produit de A1 resté affiché').toBeNull();
    // L'ancienne réponse arrive maintenant.
    await act(async () => h.attentes[0]!.resoudre(hypotheses('b_a1', 3)));
    await flush();
    expect(corps().querySelectorAll('[data-hypothese]').length, 'proposition de A1 peinte sous A2').toBe(0);
    expect(corps().textContent).not.toContain('Hypothèse b_a1');
    expect(bouton('Créer le projet').textContent).toBe('Créer le projet pour Marque A2');
  });

  it('la proposition demandée pour A2 s’affiche', async () => {
    await act(async () => bouton('Proposer des hypothèses').click());
    await act(async () => h.attentes[1]!.resoudre(hypotheses('b_a2', 2)));
    await flush();
    expect([...corps().querySelectorAll('[data-hypothese]')].map((x) => x.textContent?.slice(0, 18))).toEqual(['Hypothèse b_a2 1Va', 'Hypothèse b_a2 2Va']);
  });
});

describe('brouillon rédigé · il reste dans sa marque', () => {
  it('rédigé sous A2, absent sous A1, retrouvé en revenant à A2 · et une proposition de A2 ne survit pas au passage à A1', async () => {
    const rediger = [...corps().querySelectorAll('label')].find((l) => l.textContent === 'Rédiger mon hypothèse')!.querySelector('input')!;
    await act(async () => rediger.click());
    await act(async () => changer(corps().querySelector('#pc-s-enonce') as HTMLTextAreaElement, 'Le prix barré rassure', 'input'));
    await act(async () => changer(corps().querySelector('#pc-s-variable') as HTMLInputElement, 'Prix affiché', 'input'));
    await act(async () => changer(selectMarque(), 'b_a1', 'change'));
    await flush();
    expect(corps().querySelectorAll('[data-hypothese]').length).toBe(0);
    expect((corps().querySelector('#pc-s-enonce') as HTMLTextAreaElement).value).toBe('');
    await act(async () => changer(selectMarque(), 'b_a2', 'change'));
    await flush();
    expect((corps().querySelector('#pc-s-enonce') as HTMLTextAreaElement).value).toBe('Le prix barré rassure');
  });

  it('double clic sur « Créer » · une seule clé de clic, la marque et l’hypothèse rédigée partent ensemble', async () => {
    await act(async () => (corps().querySelector('[data-produit="p2"] input') as HTMLInputElement).click());
    const creer = bouton('Créer le projet');
    await act(async () => { creer.click(); creer.click(); });
    await flush();
    expect(h.appels.creer.length).toBeGreaterThanOrEqual(1);
    expect(new Set(h.appels.creer.map((c) => c.cleClic)).size, 'deux clés pour un même panneau').toBe(1);
    expect(h.appels.creer[0]).toMatchObject({
      brandId: 'b_a2', productId: 'p2', kind: 'ads', titre: 'D’après Lumière Botanique',
      sources: [{ type: 'veille', annonce: ANNONCE, retour: 'q=serum#ad-meta-9001' }],
      hypothese: { origine: 'saisie', saisie: { statement: 'Le prix barré rassure', variable: 'Prix affiché' } },
    });
    expect(corps().querySelector('a[href="/studio/projets/p_cree"]')?.textContent).toBe('Ouvrir le projet');
  });
});

describe('carte de Veille · le bouton s’ajoute, rien ne se perd', () => {
  const carte = (props: Record<string, unknown>) => {
    const d = document.createElement('div');
    d.innerHTML = renderToStaticMarkup(<AdCard ad={{ ...ANNONCE, status: 'active' } as never} {...props} />);
    return d;
  };
  it('en Veille et en Sauvegardes · « Préparer une création » est LE geste (aucun lien vers un ancien studio)', () => {
    for (const d of [carte({ contexteRetour: 'q=serum', ctaSobre: true, cibles44: true }), carte({ cloneRef: '11111111-1111-4111-8111-111111111111', saved: true })]) {
      expect([...d.querySelectorAll('button')].some((b) => b.textContent?.includes('Préparer une création'))).toBe(true);
      expect(d.querySelector('a[href^="/studio"]')).toBeNull();
    }
  });
  it('hors source accessible (découverte, tracker) · pas de bouton, le lien vers la préparation d’un projet', () => {
    const d = carte({});
    expect([...d.querySelectorAll('button')].some((b) => b.textContent?.includes('Préparer une création'))).toBe(false);
    // Une piste qui tient (diffusée depuis 64 j) garde son libellé « Décline cette piste ».
    expect(d.querySelector('a[href^="/studio/projets/nouveau?"]')?.textContent).toMatch(/Décline cette piste|Préparer une création/);
  });
});
