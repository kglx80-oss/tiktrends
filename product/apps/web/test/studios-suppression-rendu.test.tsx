// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Archivage (suppression RÉVERSIBLE) d'un projet depuis les cartes · porté de la
 * liste V5 (`ListeProjets`, retirée en vague 2) sur la grille Spatial
 * (`GrilleProjets`). Mêmes comportements : sans droit, aucun contrôle ; le
 * contrôle est hors du lien de navigation ; le projet quitte la liste et ses
 * compteurs, puis se restaure ; un refus du serveur est dit et le projet
 * reste ; une réponse en attente ne double pas la demande.
 */
const actions = vi.hoisted(() => ({ supprimerProjet: vi.fn(), restaurerProjet: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('../app/actions/studios/archivage', () => actions);
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { GrilleProjets, type ProjetSpatial } from '../spatial/vues/studios/GrilleProjets';
import { avecSpatial, CTX_TEST } from './spatial/fournisseur';

const carte: ProjetSpatial = {
  id: 'projet-1', href: '/studio/projets/projet-1', title: 'Projet test', marque: 'Neva', libelleType: 'Pub statique', etape: 'production',
  couverture: [], version: 'V1', pastille: { libelle: 'En production', classe: 'c' }, segments: ['on', 'on', 'cur'], libelleStp: 'Neva', reprise: '0 source',
};
let host: HTMLDivElement; let root: Root;
const bouton = (texte: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === texte)!;
const archiver = () => document.querySelector('[aria-label="Archiver Projet test"]') as HTMLButtonElement | null;
async function clic(el: Element) { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
async function monter(droit = true) { await act(async () => root.render(avecSpatial(<GrilleProjets projets={[carte]} archives={[]} nouveau={null} peutArchiver={droit} vide={null} />, { ...CTX_TEST, toast }))); }
beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  actions.supprimerProjet.mockReset().mockResolvedValue({ ok: true }); actions.restaurerProjet.mockReset().mockResolvedValue({ ok: true }); toast.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe('archivage de projet depuis les cartes (Spatial)', () => {
  it('cache le contrôle sans droit et le sépare du lien de navigation', async () => {
    await monter(false); expect(archiver()).toBeNull();
    await monter(); expect(archiver()!.closest('a')).toBeNull();
  });
  it('retire le projet et ses compteurs, le range dans « Archivés », puis permet de le restaurer', async () => {
    await monter(); await clic(archiver()!);
    expect(actions.supprimerProjet).toHaveBeenCalledWith({ projectId: carte.id });
    expect(document.querySelector('.pcard')).toBeNull();
    expect(document.querySelector('[data-pf="tous"]')?.textContent).toBe('Tous · 0');
    expect(document.querySelector('[data-pf="archive"]')?.textContent).toBe('Archivés · 1');
    await clic(bouton('Annuler'));
    expect(actions.restaurerProjet).toHaveBeenCalledWith({ projectId: carte.id });
    expect(document.querySelector('.pcard h3')?.textContent).toBe('Projet test');
    expect(document.querySelector('[data-pf="archive"]')?.textContent).toBe('Archivés · 0');
  });
  it('garde le projet et dit le refus du serveur', async () => {
    actions.supprimerProjet.mockResolvedValue({ ok: false, message: 'Une génération est en cours.' });
    await monter(); await clic(archiver()!);
    expect(toast).toHaveBeenCalledWith('Une génération est en cours.');
    expect(document.querySelector('.pcard h3')?.textContent).toBe('Projet test');
  });
  it('ne double pas la demande pendant une réponse en attente', async () => {
    let terminer!: (v: { ok: true }) => void; actions.supprimerProjet.mockReturnValue(new Promise((r) => { terminer = r; }));
    await monter(); const b = archiver()!; await clic(b); await clic(b);
    expect(actions.supprimerProjet).toHaveBeenCalledTimes(1); await act(async () => terminer({ ok: true }));
  });
});
