// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * UX V2 · lot 3a · photo produit importée dans le projet · porté sur l'atelier
 * Spatial « Produit » (vague 2, page V5 retirée) · RÉSULTATS lus dans le DOM (jsdom) : ce que l'écran DIT et OFFRE à chaque étape, et ce que
 * l'action reçoit. La compression (canvas, absente de jsdom) est simulée ; la
 * règle de fichier, elle, est la vraie (noyau).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({ importer: vi.fn(), compresser: vi.fn(), refresh: vi.fn(), lireParcours: vi.fn() }));
vi.mock('../app/actions/studios/produit', () => ({ epinglerProduit: vi.fn(), associerReference: vi.fn(), retirerReference: vi.fn(), trancherComposants: vi.fn(), importerPhotoProduit: m.importer }));
vi.mock('../lib/studios/produit/compression-photo', () => ({ compresserPhoto: m.compresser }));
vi.mock('../app/actions/studios/image', () => ({
  lireParcoursImage: m.lireParcours, compilerConsigneImage: vi.fn(), retenirConsigneImage: vi.fn(), demanderDevisImage: vi.fn(), approuverEtLancerImage: vi.fn(), controlerMediaImage: vi.fn(),
}));
vi.mock('../app/actions/studios/execution', () => ({ annulerJob: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1/produit', useRouter: () => ({ refresh: m.refresh, push: () => {} }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: unknown }) => <a href={href} {...(r as object)}>{children as never}</a> }));

import { MESSAGES_REFUS_PHOTO, ACCEPT_PHOTO_IMPORT } from '@tiktrends/core';
import { Produit } from '../spatial/vues/projet/Produit';
import { avecSpatial } from './spatial/fournisseur';
import type { VueProduit } from '../lib/studios/produit/vue';

const DATA = 'data:image/jpeg;base64,/9j/4AAQ';

function vueProduit(o: { peutModifier?: boolean; sansPhoto?: boolean } = {}): VueProduit {
  const prep = { ok: true, violations: [], composantsProteges: [], interditsTransfert: [], avertissements: [] };
  return {
    projet: { id: 'p1', title: 'Sérum', marque: 'Éclat' }, version: { id: 'v1', n: 1 }, briefPresent: true,
    produits: [{ id: 'pr1', nom: 'Sérum Clarté', photos: o.sansPhoto ? [] : [{ assetId: 'ph1', assetVersion: 'v', sha256: 'a'.repeat(64), nature: 'contenu', position: 1, apercu: '/x.png' }] }],
    epingle: null, produitSansPhoto: null, fichiers: [], associations: [],
    preparation: { faithful_composite: prep, generative_scene: prep }, peutModifier: o.peutModifier ?? true,
  } as unknown as VueProduit;
}

let conteneur: HTMLDivElement;
let racine: Root | null = null;
beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.lireParcours.mockResolvedValue({ ok: false, code: 'NOT_FOUND', status: 404, message: 'absent', targetIds: [], recoverable: false, traceId: 't' });
  m.compresser.mockResolvedValue({ ok: true, dataUri: DATA });
});
afterEach(() => {
  if (racine) act(() => racine!.unmount());
  racine = null;
  conteneur?.remove();
});

function monter(vue: VueProduit) {
  conteneur = document.createElement('div');
  document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
  act(() => racine!.render(avecSpatial(<Produit vue={vue} atelier={[]} />)));
}
const zone = () => document.querySelector('[data-zone="import-photo"]') as HTMLElement | null;
const bouton = (libelle: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === libelle) as HTMLButtonElement | undefined;
const champFichier = () => zone()!.querySelector('input[type="file"]') as HTMLInputElement;
const alerte = () => zone()!.querySelector('[role="alert"]')?.textContent ?? null;
const statut = () => zone()!.querySelector('[role="status"]')?.textContent ?? null;
const fichier = (nom: string, type: string, taille = 2048) => new File([new Uint8Array(taille)], nom, { type });
async function deposer(f: File) {
  const champ = champFichier();
  Object.defineProperty(champ, 'files', { configurable: true, value: [f] });
  await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); });
}
const differe = <T,>() => { let resoudre!: (v: T) => void; let rejeter!: (e: unknown) => void; const p = new Promise<T>((r, j) => { resoudre = r; rejeter = j; }); return { p, resoudre, rejeter }; };
const OK = { ok: true, version: { id: 'v2', n: 2 }, inchange: false, photoId: 'pph_nouvelle', ajoutee: true };

describe('le geste existe, il est nommé et borné', () => {
  // La taille des cibles vient de la feuille de la maquette (`.btn`), plus d'un style en ligne de 44 px.
  it('rôle qui peut modifier · zone d’import, bouton nommé, formats limités à JPG, PNG, WebP', () => {
    monter(vueProduit());
    expect(zone(), 'aucune zone d’import de photo produit dans le projet').not.toBeNull();
    const b = bouton('Choisir une photo et l’épingler')!;
    expect(b, 'bouton d’import absent').toBeTruthy();
    expect(b.disabled).toBe(false);
    expect(champFichier().getAttribute('accept')).toBe(ACCEPT_PHOTO_IMPORT);
    expect(zone()!.textContent).toContain('« Sérum Clarté »');
  });

  it('produit sans photo · l’écran renvoie vers l’import, plus vers la fiche de la marque', () => {
    monter(vueProduit({ sansPhoto: true }));
    const t = document.querySelector('[data-etat="produit-sans-photo"]')!.textContent;
    expect(t).toContain('importe-la depuis ton ordinateur');
    expect(t).not.toContain('fiche de la marque');
  });

  it('lecteur · aucun bouton d’import (pas de bouton mort)', () => {
    monter(vueProduit({ peutModifier: false }));
    expect(zone()).toBeNull();
    expect(bouton('Choisir une photo et l’épingler')).toBeUndefined();
  });
});

describe('états · en cours, réussi', () => {
  it('en cours · statut annoncé, bouton « Import… » inactif, épinglage bloqué ; réussi · statut, rafraîchissement, données envoyées', async () => {
    const d = differe<typeof OK>();
    m.importer.mockReturnValue(d.p);
    monter(vueProduit());
    await deposer(fichier('flacon.jpg', 'image/jpeg'));
    expect(statut()).toContain('Import en cours');
    expect(statut()).toContain('« flacon.jpg »');
    expect(bouton('Import…')?.disabled).toBe(true);
    expect(bouton('Utiliser cette photo et continuer')?.disabled).toBe(true);
    expect(m.importer).toHaveBeenCalledTimes(1);
    expect(m.importer.mock.calls[0]![0]).toMatchObject({ projectId: 'p1', baseVersionId: 'v1', productId: 'pr1', dataUri: DATA });
    await act(async () => { d.resoudre(OK); await d.p; });
    expect(statut()).toBe('Photo importée · Elle rejoint le catalogue du produit et devient la photo épinglée · nouvelle version du projet.');
    expect(m.refresh).toHaveBeenCalledTimes(1);
    expect(alerte()).toBeNull();
  });

  it('même contenu déjà au catalogue · le statut dit « sans doublon »', async () => {
    m.importer.mockResolvedValue({ ...OK, ajoutee: false });
    monter(vueProduit());
    await deposer(fichier('flacon.png', 'image/png'));
    expect(statut()).toContain('sans doublon');
  });
});

describe('états · échecs, chacun avec un chemin de récupération', () => {
  it('type refusé (HEIC) · alerte « format », rien compressé, rien envoyé, « Choisir une autre photo » offert', async () => {
    monter(vueProduit());
    await deposer(fichier('IMG_0001.heic', 'image/heic'));
    expect(alerte()).toBe(`Import refusé · ${MESSAGES_REFUS_PHOTO.format}Choisir une autre photo`);
    expect(m.compresser).not.toHaveBeenCalled();
    expect(m.importer).not.toHaveBeenCalled();
    expect(bouton('Choisir une autre photo')).toBeTruthy();
  });

  it('trop lourd même compressé · alerte « trop lourd », rien envoyé', async () => {
    m.compresser.mockResolvedValue({ ok: false, motif: 'trop_lourd' });
    monter(vueProduit());
    await deposer(fichier('geant.png', 'image/png'));
    expect(alerte()).toContain(MESSAGES_REFUS_PHOTO.trop_lourd);
    expect(m.importer).not.toHaveBeenCalled();
  });

  it('réseau · alerte, la photo est gardée : « Réessayer l’envoi » renvoie la MÊME photo sans recompresser, puis réussit', async () => {
    m.importer.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce(OK);
    monter(vueProduit());
    await deposer(fichier('flacon.jpg', 'image/jpeg'));
    expect(alerte()).toContain('Échec réseau · Le serveur n’a pas répondu');
    expect(bouton('Choisir une autre photo')).toBeTruthy();
    const r = bouton('Réessayer l’envoi')!;
    expect(r, 'échec réseau sans « Réessayer »').toBeTruthy();
    await act(async () => { r.click(); });
    expect(m.compresser).toHaveBeenCalledTimes(1);
    expect(m.importer).toHaveBeenCalledTimes(2);
    expect(m.importer.mock.calls[1]![0].dataUri).toBe(DATA);
    expect(statut()).toContain('Photo importée');
  });

  it('conflit de version · alerte, « Recharger la version courante » rafraîchit et efface l’alerte', async () => {
    m.importer.mockResolvedValue({ ok: false, code: 'VERSION_CONFLICT', status: 409, message: 'conflit', targetIds: [], recoverable: true, traceId: 't' });
    monter(vueProduit());
    await deposer(fichier('flacon.jpg', 'image/jpeg'));
    expect(alerte()).toContain('Conflit de version · Le projet a changé');
    await act(async () => { bouton('Recharger la version courante')!.click(); });
    expect(m.refresh).toHaveBeenCalledTimes(1);
    expect(alerte()).toBeNull();
  });

  it('refus du serveur · sa raison est affichée telle quelle', async () => {
    m.importer.mockResolvedValue({ ok: false, code: 'INVALID_SCHEMA', status: 422, message: 'x', targetIds: [], recoverable: true, traceId: 't', violations: [{ chemin: 'productId', raison: MESSAGES_REFUS_PHOTO.complet }] });
    monter(vueProduit());
    await deposer(fichier('flacon.jpg', 'image/jpeg'));
    expect(alerte()).toBe(`Import refusé · ${MESSAGES_REFUS_PHOTO.complet}Choisir une autre photo`);
  });
});
