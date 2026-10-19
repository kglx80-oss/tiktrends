// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { etatReprise } from '@tiktrends/core';
import { PanneauTaches } from '../components/studios/taches/PanneauTaches';
import type { TachePresentee } from '../lib/studios/execution/commandes';

/**
 * Garde de rendu · Lot 5 · on REND le panneau des tâches et on lit le HTML.
 * On vérifie ce qu'on VOIT :
 *  · l'état réel de chaque tâche et la liste complète ;
 *  · une tâche interrompue affiche « relance bloquée » et AUCUN contrôle de
 *    relance actif ;
 *  · un pourcentage n'apparaît que quand il est réel · jamais fabriqué.
 */
const PID = '33333333-3333-3333-3333-333333333331';

const tache = (o: Partial<TachePresentee> & { etat: TachePresentee['etat'] }): TachePresentee => ({
  id: o.id ?? 't1', libelleOperation: o.libelleOperation ?? 'Image',
  progression: o.progression ?? null, creeLe: o.creeLe ?? '2026-10-17T09:00:00.000Z',
  finiLe: o.finiLe ?? null, aProduit: o.aProduit ?? false, etat: o.etat,
});

const rendre = (taches: TachePresentee[]) => {
  const html = renderToStaticMarkup(<PanneauTaches taches={taches} projectId={PID} />);
  const d = document.createElement('div'); d.innerHTML = html; return d;
};

describe('PanneauTaches · état réel et liste', () => {
  it('rend une carte par tâche, avec le libellé d’état réel', () => {
    const d = rendre([
      tache({ id: 'a', etat: etatReprise('running') }),
      tache({ id: 'b', etat: etatReprise('completed') }),
      tache({ id: 'c', etat: etatReprise('failed') }),
    ]);
    expect(d.querySelectorAll('[data-tache]').length).toBe(3);
    expect(d.querySelector('[data-tache="a"] [data-pastille-etat]')?.textContent).toBe('En cours');
    expect(d.querySelector('[data-tache="b"] [data-pastille-etat]')?.textContent).toBe('Terminé');
    expect(d.querySelector('[data-tache="c"] [data-pastille-etat]')?.textContent).toBe('Échec');
  });

  it('état vide honnête quand il n’y a aucune tâche', () => {
    const d = rendre([]);
    expect(d.querySelector('[data-etat="sans-tache"]')?.textContent).toMatch(/aucune tâche/i);
    expect(d.querySelectorAll('[data-tache]').length).toBe(0);
  });

  it('un lien vers les créations apparaît quand la tâche a livré un fichier', () => {
    const d = rendre([tache({ id: 'm', etat: etatReprise('completed'), aProduit: true })]);
    const lien = d.querySelector('[data-tache="m"] [data-lien="creations"]') as HTMLAnchorElement | null;
    expect(lien?.getAttribute('href')).toBe(`/studio/projets/${PID}`);
  });
});

describe('PanneauTaches · interruption, relance bloquée', () => {
  it('une tâche en réconciliation dit « relance bloquée » et n’offre AUCUN contrôle de relance', () => {
    const d = rendre([tache({ id: 'r', etat: etatReprise('reconciliation_required') })]);
    const carte = d.querySelector('[data-tache="r"]') as HTMLElement;
    expect(carte.getAttribute('data-interrompu')).toBe('oui');
    const bloc = carte.querySelector('[data-interruption="r"]') as HTMLElement;
    expect(bloc).not.toBeNull();
    expect(bloc.querySelector('[data-relance="bloquee"]')?.textContent).toMatch(/relance bloquée/i);
    // Aucun bouton de relance (ni d'action) sur une tâche interrompue · lecture seule.
    expect(carte.querySelectorAll('button').length).toBe(0);
    const bandeau = d.querySelector('[data-bandeau="interrompues"]');
    expect(bandeau?.textContent).toMatch(/interrompue/i);
    // Jamais la promesse « aucun débit ».
    expect(carte.textContent?.toLowerCase()).not.toMatch(/aucun débit|aucun crédit|gratuit/);
  });
});

describe('PanneauTaches · pas de pourcentage fabriqué', () => {
  it('n’affiche un % que lorsqu’il est réel', () => {
    const d1 = rendre([tache({ id: 'x', etat: etatReprise('running'), progression: null })]);
    expect(d1.querySelector('[data-tache="x"] [data-progression]')).toBeNull();
    expect(d1.querySelector('[data-tache="x"]')?.textContent).not.toMatch(/%/);

    const d2 = rendre([tache({ id: 'y', etat: etatReprise('running'), progression: 40 })]);
    expect(d2.querySelector('[data-tache="y"] [data-progression]')?.getAttribute('data-progression')).toBe('40');
    expect(d2.querySelector('[data-tache="y"]')?.textContent).toMatch(/40 %/);
  });
});
