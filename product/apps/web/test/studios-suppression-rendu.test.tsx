// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ListeProjets } from '../components/studios/projet/ListeProjets';
import type { CarteProjet } from '../lib/studios/sources/projet';
const actions = vi.hoisted(() => ({ supprimerProjet: vi.fn(), restaurerProjet: vi.fn() }));
vi.mock('../app/actions/studios/archivage', () => actions);
vi.mock('../components/studios/projet/NouveauProjet', () => ({ NouveauProjet: () => <button>Nouveau projet</button> }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const carte: CarteProjet = { id: 'projet-1', title: 'Projet test', kind: 'ads', libelleType: 'Pub statique', brandId: 'b1', marque: 'Neva', etape: 'production', libelleEtape: 'En production', manques: [], versionN: 1, sources: 0, updatedAt: '2026-10-22T00:00:00Z' };
let host: HTMLDivElement; let root: Root;
const bouton = (texte: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent === texte)!;
async function clic(el: Element) { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
async function monter(droit = true) { await act(async () => root.render(<ListeProjets cartes={[carte]} nouveau={{ etat: 'pret', marque: { id: 'b1', nom: 'Neva' }, libelle: 'Nouveau projet' }} peutSupprimer={droit} />)); }
beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  actions.supprimerProjet.mockReset().mockResolvedValue({ ok: true }); actions.restaurerProjet.mockReset().mockResolvedValue({ ok: true });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe('suppression de projet depuis les cartes', () => {
  it('cache le contrôle sans droit et le sépare du lien de navigation', async () => {
    await monter(false); expect(document.querySelector('[aria-label="Supprimer le projet Projet test"]')).toBeNull();
    await monter(); const b = document.querySelector('[aria-label="Supprimer le projet Projet test"]')!; expect(b.closest('a')).toBeNull();
    await clic(b); await clic(bouton('Annuler')); expect(document.querySelector('dialog')).toBeNull(); expect(actions.supprimerProjet).not.toHaveBeenCalled();
  });
  it('retire le projet et ses compteurs puis permet de le restaurer', async () => {
    await monter(); await clic(document.querySelector('[aria-label="Supprimer le projet Projet test"]')!); await clic(bouton('Supprimer le projet'));
    expect(actions.supprimerProjet).toHaveBeenCalledWith({ projectId: carte.id }); expect(document.querySelector('[data-projet]')).toBeNull(); expect(document.querySelector('[data-filtre="tous"] [data-compte]')?.textContent).toBe('0');
    await clic(bouton('Annuler la suppression')); expect(actions.restaurerProjet).toHaveBeenCalledWith({ projectId: carte.id }); expect(document.querySelector('[data-projet]')).not.toBeNull();
  });
  it('garde le projet et affiche un refus du serveur', async () => {
    actions.supprimerProjet.mockResolvedValue({ ok: false, message: 'Une génération est en cours.' }); await monter(); await clic(document.querySelector('[aria-label="Supprimer le projet Projet test"]')!); await clic(bouton('Supprimer le projet'));
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Une génération est en cours.'); expect(document.querySelector('[data-projet]')).not.toBeNull();
  });
  it('ne double pas la demande pendant une réponse en attente', async () => {
    let terminer!: (v: {ok: true}) => void; actions.supprimerProjet.mockReturnValue(new Promise(r => { terminer = r; })); await monter(); await clic(document.querySelector('[aria-label="Supprimer le projet Projet test"]')!);
    const b = bouton('Supprimer le projet'); await clic(b); await clic(b); expect(actions.supprimerProjet).toHaveBeenCalledTimes(1); await act(async () => terminer({ ok: true }));
  });
});
