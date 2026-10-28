// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Spatial · fiche projet · onglet « Créations », MONTÉ ou rendu · les
 * comportements que gardaient les tests des panneaux V5 retirés, portés :
 *
 *  · tâches (`taches-rendu`) · une ligne par tâche avec son état réel, état
 *    vide honnête, une tâche interrompue dit « relance bloquée » sans AUCUN
 *    contrôle, un bandeau le dit, jamais « aucun débit » ; un pourcentage
 *    n'apparaît que s'il est réel ;
 *  · lot d'essai (`studios-essai-reprise`) · une erreur réseau garde les
 *    choix et permet une nouvelle demande ; une réponse reçue après un
 *    changement de sélection est ignorée.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ preparer: vi.fn() }));
vi.mock('../app/actions/studios/tests', () => ({ preparerLotEssai: h.preparer, rattacherVarianteAuTest: vi.fn(), relireApprentissage: vi.fn() }));
vi.mock('../app/actions/studios/variantes', () => ({ creerVariante: vi.fn(), iterer: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => '/studio/projets/p1' }));

const { OngletCreations } = await import('../spatial/vues/projet/OngletCreations');
const { LotEssai } = await import('../spatial/vues/projet/Rattachement');
const { avecSpatial } = await import('./spatial/fournisseur');
type PropsCreationsProjet = import('../spatial/vues/projet/types').PropsCreationsProjet;
type TacheSpatiale = import('../spatial/vues/projet/types').TacheSpatiale;

const props = (taches: TacheSpatiale[] | null): PropsCreationsProjet => ({
  projectId: 'p1', versionCouranteId: 'v1', lots: [], messageVide: 'Aucune création pour ce projet.', editeurHref: null, preparerHref: null, videoHref: null,
  variantes: [], erreurVariantes: null, relecture: { disponible: false, mention: null, raison: null, coutMaxUsd: null }, taches, erreurTaches: null,
  peutProposer: false, adsmap: null, relire: false,
});
const tache = (o: Partial<TacheSpatiale> & { id: string }): TacheSpatiale => ({ titre: 'En cours', classe: 'c', detail: 'Image · lancée le 17/10 11:00', explication: 'La génération travaille.', interrompue: false, ...o });
const rendre = (taches: TacheSpatiale[] | null) => { const d = document.createElement('div'); d.innerHTML = renderToStaticMarkup(avecSpatial(<OngletCreations {...props(taches)} />)); return d; };

describe('tâches · état réel et liste', () => {
  it('une ligne par tâche, avec le libellé d’état réel ; vide · on le dit', () => {
    const d = rendre([tache({ id: 'a', titre: 'En cours' }), tache({ id: 'b', titre: 'Terminé', classe: 'g' }), tache({ id: 'c', titre: 'Échec', classe: 'w' })]);
    expect([...d.querySelectorAll('[data-tache]')].map((x) => x.querySelector('.pill')?.textContent)).toEqual(['En cours', 'Terminé', 'Échec']);
    const vide = rendre([]);
    expect(vide.querySelector('#taches')!.textContent).toMatch(/Aucune tâche lancée pour ce projet/);
    expect(vide.querySelectorAll('[data-tache]')).toHaveLength(0);
  });

  it('une tâche interrompue dit « relance bloquée », sans AUCUN contrôle ; le bandeau le dit ; jamais « aucun débit »', () => {
    const d = rendre([tache({ id: 'r', titre: 'Interrompue', classe: 'w', interrompue: true, explication: 'Le coût est en cours de rapprochement.' })]);
    const ligne = d.querySelector('[data-tache="r"]')!;
    expect(ligne.getAttribute('data-interrompu')).toBe('oui');
    expect(ligne.querySelector('[data-relance="bloquee"]')?.textContent).toMatch(/relance bloquée/);
    expect(ligne.querySelectorAll('button, a')).toHaveLength(0);
    expect(d.querySelector('[data-bandeau="interrompues"]')?.textContent).toBe('Une tâche est interrompue · le coût est en cours de rapprochement · la relance reste bloquée jusque-là.');
    expect(d.querySelector('#taches')!.textContent!.toLowerCase()).not.toMatch(/aucun débit|aucun crédit|gratuit/);
    expect(rendre([tache({ id: 'x' })]).querySelector('[data-bandeau]')).toBeNull();
  });

  it('un pourcentage n’apparaît que s’il est réel', () => {
    const sans = rendre([tache({ id: 'x', progression: null })]);
    expect(sans.querySelector('[data-tache="x"]')!.hasAttribute('data-progression')).toBe(false);
    expect(sans.querySelector('[data-tache="x"]')!.textContent).not.toMatch(/%/);
    const avec = rendre([tache({ id: 'y', progression: 40, detail: 'Image · lancée le 17/10 11:00 · avancement 40 %' })]);
    expect(avec.querySelector('[data-tache="y"]')!.getAttribute('data-progression')).toBe('40');
    expect(avec.querySelector('[data-tache="y"]')!.textContent).toMatch(/40 %/);
  });
});

describe('lot d’essai · reprise et réponses périmées', () => {
  let root: Root;
  let el: HTMLDivElement;
  beforeEach(() => { h.preparer.mockReset(); });
  afterEach(() => { act(() => root?.unmount()); el?.remove(); });
  function monter() {
    el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
    act(() => root.render(avecSpatial(<LotEssai projectId="p1" variantes={['a', 'b', 'c'].map((id) => ({ id, libelle: id, version: 'V1' }))} ouvrirRattachement={() => {}} />)));
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-essai-variable]')!.click();
      el.querySelector<HTMLButtonElement>('[data-essai-variante="a"]')!.click();
      el.querySelector<HTMLButtonElement>('[data-essai-variante="b"]')!.click();
    });
  }
  const preparer = () => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Préparer le lot d’essai'))!;
  const choisies = () => el.querySelectorAll('[data-essai-variante][aria-pressed="true"]').length;

  it('une erreur réseau garde les choix et permet une nouvelle demande', async () => {
    h.preparer.mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce({ ok: false, message: 'Variante à compléter' });
    monter();
    await act(async () => preparer().click());
    expect(el.querySelector('[role=alert]')?.textContent).toContain('tes choix sont conservés');
    expect(choisies()).toBe(2);
    expect(preparer().disabled).toBe(false);
    await act(async () => preparer().click());
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Variante à compléter');
    expect(h.preparer).toHaveBeenCalledTimes(2);
  });

  it('une réponse reçue après un changement de sélection est ignorée', async () => {
    let terminer!: (r: unknown) => void;
    h.preparer.mockImplementation(() => new Promise((r) => { terminer = r; }));
    monter();
    act(() => preparer().click());
    act(() => el.querySelector<HTMLButtonElement>('[data-essai-variante="c"]')!.click());
    await act(async () => terminer({ ok: false, message: 'Ancienne sélection refusée' }));
    expect(el.querySelector('[role=alert]')).toBeNull();
    expect(choisies()).toBe(3);
  });
});
