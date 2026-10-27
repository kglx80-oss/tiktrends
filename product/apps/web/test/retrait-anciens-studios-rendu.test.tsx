// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Retrait des anciens studios (10/10) · au HTML RENDU.
 *
 *  · Préparer un projet · le contexte repris est montré (source jointe, test
 *    Adsmap repris), ce qui ne l'est pas est DIT, l'objectif est modifiable ;
 *    le seul geste qui écrit (« Créer le projet ») envoie le contexte relu par
 *    le serveur, rien à l'ouverture ; sans contexte ni objectif, un projet vide.
 *  · Lecture seule ou sans marque · le motif, aucun bouton.
 *  · Bibliothèque · une création historique se lit et se télécharge, sans
 *    suppression, bascule IA, template ni analyse.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({ contexte: vi.fn(), vide: vi.fn(), push: vi.fn() }));
vi.mock('../app/actions/studios/sources', () => ({ creerProjetDepuisContexte: m.contexte }));
vi.mock('../app/actions/studios/projets', () => ({ creerProjet: m.vide }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push, refresh() {}, replace() {} }), usePathname: () => '/assets', useSearchParams: () => new URLSearchParams() }));
const { stub } = vi.hoisted(() => ({ stub: () => new Proxy({}, { has: (_t: object, k: string | symbol) => k !== 'then', get: (_t: object, k: string | symbol) => (k === 'then' ? undefined : k === '__esModule' ? true : async () => ({})) }) }));
vi.mock('../app/actions/assets', () => ({ ...stub() }));

import { PreparationProjet, type ProprietesPreparationProjet } from '../components/studios/projet/PreparationProjet';
// Vague 2 · l'écran V5 `/assets` est retiré · la création historique se lit dans la Bibliothèque Spatiale.
import { connexionDrive, donneesDrive } from '@tiktrends/core';
import { Bibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

const REF = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const pret: ProprietesPreparationProjet['etat'] = { etat: 'pret', marque: { id: 'b1', nom: 'Neva' }, libelle: 'Nouveau projet' };
const props = (o: Partial<ProprietesPreparationProjet> = {}): ProprietesPreparationProjet => ({
  etat: pret, initial: { type: 'ads', titre: 'D’après Glow', objectif: 'Avant/après en 3 s' },
  annonce: { ref: REF, annonceur: 'Glow' }, iterationReprise: false,
  notes: ['Le test Adsmap n’a pas été repris · Ce test n’a pas de verdict arbitré.'],
  retourVeille: { href: '/veille?q=serum', rv: 'q=serum' }, ...o,
});
const html = (p: ProprietesPreparationProjet) => { const d = document.createElement('div'); d.innerHTML = renderToStaticMarkup(<PreparationProjet {...p} />); return d; };
const q = (d: ParentNode, s: string) => d.querySelector(s) as HTMLElement | null;

describe('préparer un projet · rendu', () => {
  it('contexte repris montré, non repris dit, champs préremplis, retour Veille', () => {
    const d = html(props());
    expect(q(d, '[data-source="sauvegarde"]')?.textContent).toBe('Source jointe au projet · l’annonce sauvegardée de Glow.');
    expect([...d.querySelectorAll('[data-champ="notes-contexte"] li')].map((x) => x.textContent)).toEqual(['Le test Adsmap n’a pas été repris · Ce test n’a pas de verdict arbitré.']);
    expect((q(d, '[data-champ="objectif"]') as HTMLTextAreaElement).value).toBe('Avant/après en 3 s');
    expect((q(d, '[data-champ="titre"]') as HTMLInputElement).value).toBe('D’après Glow');
    expect(q(d, '[data-lien="retour-veille"]')?.getAttribute('href')).toBe('/veille?q=serum');
    expect(q(d, '[data-bouton="creer-projet"]')?.textContent).toBe('Créer le projet');
    expect(d.textContent).toContain('Gratuit');
    expect(d.textContent).not.toMatch(/Pubs IA|Image IA|Vidéo IA|Textes IA/);
  });

  it('lecture seule ou sans marque · le motif, aucun bouton de création', () => {
    const lecture = html(props({ etat: { etat: 'lecture-seule', message: 'Ton rôle permet de lire les projets, pas d’en créer.' } }));
    expect(q(lecture, '[data-bouton="creer-projet"]')).toBeNull();
    expect(lecture.textContent).toContain('Ton rôle permet de lire les projets');
    const sansMarque = html(props({ etat: { etat: 'sans-marque', message: 'Choisis une marque.', lien: { href: '/brands', libelle: 'Choisir une marque' } } }));
    expect(q(sansMarque, '[data-bouton="creer-projet"]')).toBeNull();
    expect(q(sansMarque, 'a[href="/brands"]')?.textContent).toBe('Choisir une marque');
  });
});

let racine: HTMLDivElement;
let root: Root;
beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.contexte.mockResolvedValue({ ok: true, projet: { id: 'p9' }, versionId: 'v1', deja: false });
  m.vide.mockResolvedValue({ ok: true, projet: { id: 'p8' }, version: { id: 'v1' } });
  racine = document.createElement('div');
  document.body.appendChild(racine);
  root = createRoot(racine);
});
afterEach(() => { act(() => root.unmount()); racine.remove(); });
const monter = async (p: ProprietesPreparationProjet) => { await act(async () => { root.render(<PreparationProjet {...p} />); }); };
const clic = async () => { await act(async () => { (q(racine, '[data-bouton="creer-projet"]') as HTMLButtonElement).click(); }); };

describe('préparer un projet · le seul geste qui écrit', () => {
  it('transmet le produit choisi avec le brief et garde le choix après un refus', async () => {
    await monter(props({ produits: [{ id: 'produit-1', nom: 'Lunettes', photoDisponible: true }] }));
    const select = racine.querySelector<HTMLSelectElement>('[data-champ="produit"]')!;
    act(() => { select.value = 'produit-1'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    m.contexte.mockResolvedValueOnce({ ok: false, message: 'Réessaie' });
    await clic();
    expect(m.contexte).toHaveBeenCalledWith(expect.objectContaining({ productId: 'produit-1', objectif: 'Avant/après en 3 s' }));
    expect(select.value).toBe('produit-1');
    expect(racine.querySelector('[role=alert]')?.textContent).toContain('Réessaie');
  });

  it('à l’ouverture rien ; un clic ⇒ UNE création avec le contexte, puis le projet s’ouvre', async () => {
    await monter(props());
    expect(m.contexte).not.toHaveBeenCalled();
    await clic();
    expect(m.contexte).toHaveBeenCalledTimes(1);
    expect(m.contexte).toHaveBeenCalledWith({ brandId: 'b1', kind: 'ads', titre: 'D’après Glow', objectif: 'Avant/après en 3 s', ref: REF, retourVeille: 'q=serum', cleClic: expect.stringMatching(/^[A-Za-z0-9_-]{8,100}$/) });
    expect(m.vide).not.toHaveBeenCalled();
    expect(m.push).toHaveBeenCalledWith('/studio/projets/p9');
  });

  it('sans contexte ni objectif ⇒ un projet vide (même geste que « Nouveau projet »)', async () => {
    await monter(props({ annonce: null, notes: [], retourVeille: null, initial: { type: 'video', titre: 'Vidéo · Neva', objectif: '' } }));
    await clic();
    expect(m.vide).toHaveBeenCalledWith({ brandId: 'b1', kind: 'video', title: 'Vidéo · Neva' });
    expect(m.contexte).not.toHaveBeenCalled();
  });

  it('refus du serveur ⇒ message et identifiant support, rien d’ouvert', async () => {
    m.contexte.mockResolvedValue({ ok: false, code: 'NOT_FOUND', message: 'Introuvable.', traceId: 'st_x' });
    await monter(props());
    await clic();
    expect(q(racine, '[role="alert"]')?.textContent).toBe('Introuvable. · identifiant support : st_x');
    expect(m.push).not.toHaveBeenCalled();
  });
});

describe('bibliothèque · création historique en lecture seule', () => {
  it('ouvrir et télécharger · ni suppression, ni droits, ni bascule IA, ni template, ni analyse', async () => {
    const donnees = donneesDrive({ dossiers: [], medias: [{
      id: 'g1', name: 'Pub · 12/09/2026', kind: 'image', mimeType: 'image/png', source: 'historique', url: '/api/ad/g1', thumbUrl: null, sizeBytes: null,
      createdAt: '2026-09-12T10:00:00Z', historique: { libelle: 'Création historique · pub', telecharger: '/api/ad/g1' },
    }] });
    const ctx: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
    const el = document.createElement('div'); document.body.appendChild(el);
    const r = createRoot(el);
    await act(async () => { r.render(<FournisseurSpatial value={ctx}><Bibliotheque donnees={donnees} lectureSeule={null} stockage={false} drive={connexionDrive(null)} maintenant="2026-10-20T10:00:00Z" gestion={{ analyse: { cout: 1, raison: null, sansTags: 0, maxLot: 20 }, selecteurDrive: false, admin: true, messageDrive: null }} /></FournisseurSpatial>); });
    // L'ancienne création vit sous « Anciens studios ».
    await act(async () => { [...el.querySelectorAll('nav.btabs button')].find((b) => b.textContent?.includes('Anciens'))!.click(); });
    await act(async () => { (el.querySelector('button[aria-label="Aperçu de Pub · 12/09/2026"]') as HTMLButtonElement).click(); });
    const apercu = q(el, 'aside[aria-label="Aperçu"]')!;
    expect(apercu.querySelector('.pill')?.textContent).toBe('Ancien studio');
    expect(q(apercu, 'a[download]')?.getAttribute('href')).toBe('/api/ad/g1');
    expect(apercu.textContent).not.toMatch(/Supprimer|Droits d’usage|Ranger dans|Template|Analyser|Utilisable par l’IA/);
    expect(apercu.querySelector('input[type="checkbox"], select')).toBeNull();
    act(() => { r.unmount(); }); el.remove();
  });
});
