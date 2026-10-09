// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * L8-D · canvas métier, au RÉSULTAT · le HTML réellement peint (jsdom).
 *
 *  · liste et canvas montrent les MÊMES cartes dans le MÊME ordre ;
 *  · la liste est la vue par défaut (premier rendu, mobile) ;
 *  · consulter (ajuster, zoomer, choisir, centrer, basculer, molette)
 *    n'appelle AUCUNE écriture ; déplacer une carte (flèche) en appelle une,
 *    avec la seule position de cette carte ;
 *  · les liens sont dessinés DANS la zone rognée ; le détail et le panneau
 *    Jarvis sont hors de cette zone ;
 *  · le détail cible explicitement Jarvis · dans le VRAI formulaire de
 *    propositions, sans rien envoyer.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const appels = vi.hoisted(() => ({ enregistrer: [] as unknown[], reinitialiser: [] as unknown[] }));
vi.mock('../app/actions/studios/canvas', () => ({
  enregistrerDispositionCanvas: async (e: { disposition: unknown; rev: number }) => { appels.enregistrer.push(e); return { ok: true, disposition: e.disposition, rev: e.rev + 1 }; },
  reinitialiserDispositionCanvas: async (e: { rev: number }) => { appels.reinitialiser.push(e); return { ok: true, disposition: { positions: {} }, rev: e.rev + 1 }; },
  lireCanvasProjet: async () => { throw new Error('non utilisé'); },
}));

import { ciblesDisponibles, deriverCanvas, disponibiliteJarvis, type DispositionCanvas } from '@tiktrends/core';
import { CanvasMetier } from '../components/studios/canvas/CanvasMetier';
import { FormulaireDemande } from '../components/studios/propositions/FormulaireDemande';
import { contenuVideo } from '../../../packages/core/test/studios-fixtures';

const contenu = contenuVideo();
const modele = deriverCanvas(contenu);
const props = (d: DispositionCanvas = { positions: {} }) => ({ projectId: 'p1', version: { id: 'v1', n: 3, courante: true }, modele, disposition: d, rev: 0 });

let largeEcran = false;
let etroit = false;
function matchMediaFactice(q: string) {
  const matches = q.includes('max-width: 719px') ? etroit : q.includes('min-width: 900px') ? largeEcran : false;
  return { matches, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } as unknown as MediaQueryList;
}

let root: Root;
let hote: HTMLDivElement;
beforeEach(() => {
  appels.enregistrer.length = 0;
  appels.reinitialiser.length = 0;
  largeEcran = false;
  etroit = false;
  window.matchMedia = matchMediaFactice;
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
});
afterEach(() => { act(() => root.unmount()); hote.remove(); document.body.innerHTML = ''; });

const ids = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].map((e) => e.dataset.carte);
const bouton = (texte: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texte || b.getAttribute('aria-label') === texte);
const cliquer = (b: HTMLElement | undefined | null) => { expect(b, 'bouton introuvable').toBeTruthy(); act(() => { b!.click(); }); };
const monter = (el: React.ReactElement) => act(() => root.render(el));

describe('canvas · la liste est la vue par défaut', () => {
  it('premier rendu (serveur) · la liste, toutes les cartes du modèle, dans l’ordre', () => {
    const html = renderToStaticMarkup(<CanvasMetier {...props()} />);
    expect(html).toContain('data-vue-canvas="liste"');
    expect(html).not.toContain('data-canvas-zone');
    const ordre = [...html.matchAll(/data-carte="([^"]+)"/g)].map((m) => m[1]);
    expect(ordre).toEqual(modele.cartes.map((c) => c.id));
  });

  it('mobile (390 px) · la liste reste après montage', () => {
    etroit = true;
    monter(<CanvasMetier {...props()} />);
    expect(document.querySelector('[data-vue-canvas="liste"]')).not.toBeNull();
    expect(document.querySelector('[data-canvas-zone]')).toBeNull();
  });

  it('écran large et pointeur précis · le canvas est proposé d’office', () => {
    largeEcran = true;
    monter(<CanvasMetier {...props()} />);
    expect(document.querySelector('[data-canvas-zone]')).not.toBeNull();
  });
});

describe('canvas · liste et canvas montrent les mêmes cartes, dans le même ordre', () => {
  it('mêmes identifiants, même ordre, et autant de liens dessinés que de dépendances', () => {
    monter(<CanvasMetier {...props()} />);
    const liste = ids('[data-vue-canvas="liste"] [data-carte]');
    cliquer(bouton('Canvas'));
    const canvas = ids('[data-canvas-zone] [data-carte]');
    expect(canvas, 'le canvas ne montre pas les cartes de la liste dans le même ordre').toEqual(liste);
    expect(liste).toEqual(modele.cartes.map((c) => c.id));
    expect(document.querySelectorAll('[data-liens-canvas] polyline').length).toBe(modele.liens.length);
    // Le statut d'un média est écrit, jamais porté par la seule couleur.
    expect(document.querySelector('[data-carte="keyframe:s_produit"]')!.textContent).toContain('Pas encore produit');
  });

  it('les liens vivent dans la zone rognée · le détail est hors de la zone', () => {
    largeEcran = true;
    monter(<CanvasMetier {...props()} />);
    const zone = document.querySelector<HTMLElement>('[data-canvas-zone]')!;
    expect(zone.style.overflow).toBe('hidden');
    expect(zone.contains(document.querySelector('[data-liens-canvas]'))).toBe(true);
    const detail = document.querySelector('[data-canvas-detail]')!;
    expect(detail, 'le détail de la carte a disparu').not.toBeNull();
    expect(zone.contains(detail), 'le détail est DANS la zone du canvas · des liens pourraient le traverser').toBe(false);
  });
});

describe('canvas · consulter n’écrit rien, déplacer écrit la seule position', () => {
  it('ajuster, zoomer, molette, choisir, centrer, basculer · aucune écriture', async () => {
    largeEcran = true;
    monter(<CanvasMetier {...props()} />);
    cliquer(bouton('Ajuster'));
    cliquer(bouton('Zoom avant'));
    cliquer(bouton('Zoom arrière'));
    const zone = document.querySelector<HTMLElement>('[data-canvas-zone]')!;
    act(() => { zone.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 50, clientY: 50, bubbles: true, cancelable: true })); });
    cliquer(document.querySelector<HTMLElement>('[data-canvas-zone] [data-carte="clip:s_produit"]'));
    cliquer(bouton('Centrer la sélection'));
    cliquer(bouton('Centrer sur cette carte'));
    cliquer(bouton('Liste'));
    cliquer(bouton('Canvas'));
    await act(async () => { await Promise.resolve(); });
    expect(appels.enregistrer, 'une consultation a écrit la disposition').toEqual([]);
    expect(appels.reinitialiser).toEqual([]);
  });

  it('flèche sur la carte choisie · une écriture, la seule position de cette carte', async () => {
    largeEcran = true;
    monter(<CanvasMetier {...props()} />);
    const carte = document.querySelector<HTMLButtonElement>('[data-canvas-zone] [data-carte="mix"]')!;
    // Non choisie · la flèche ne déplace rien.
    act(() => { carte.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(appels.enregistrer).toEqual([]);
    cliquer(carte);
    const avant = { left: carte.style.left, top: carte.style.top };
    await act(async () => { carte.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(appels.enregistrer).toHaveLength(1);
    const e = appels.enregistrer[0] as { disposition: DispositionCanvas; rev: number };
    expect(Object.keys(e.disposition.positions)).toEqual(['mix']);
    expect(e.rev).toBe(0);
    expect(carte.style.left).toBe(`${parseFloat(avant.left) + 16}px`);
    expect(carte.style.top).toBe(avant.top);
    expect(ids('[data-canvas-zone] [data-carte]'), 'déplacer a réordonné les cartes').toEqual(modele.cartes.map((c) => c.id));
    expect(document.querySelector('[data-canvas-message]')!.textContent).toContain('Position enregistrée');
  });

  it('réinitialiser · une écriture explicite, et seulement si une carte a été déplacée', async () => {
    largeEcran = true;
    monter(<CanvasMetier {...props({ positions: { mix: { x: 5, y: 5 } } })} rev={4} />);
    await act(async () => { bouton('Réinitialiser la disposition')!.click(); });
    expect(appels.reinitialiser).toEqual([{ projectId: 'p1', rev: 4 }]);
    expect(bouton('Réinitialiser la disposition')!.disabled).toBe(true);
  });
});

describe('canvas · le détail cible explicitement Jarvis, sans rien envoyer', () => {
  it('choisit la cible du plan dans le VRAI formulaire Jarvis et place le focus dans la demande', () => {
    const demander = vi.fn(async () => true);
    const cibles = ciblesDisponibles(contenu).map((c) => ({ ...c, champs: [] }));
    const jarvis = disponibiliteJarvis({ releasePubliee: true, fournisseurConfigure: true, plafondAtteint: false, peutProposer: true, modele: 'modele-test' });
    monter(
      <>
        <div data-emplacement="propositions">
          <FormulaireDemande cibles={cibles} jarvis={jarvis} peutProposer enCours={false} onDemanderJarvis={demander} onProposerMain={async () => true} />
        </div>
        <CanvasMetier {...props()} />
      </>,
    );
    window.HTMLElement.prototype.scrollIntoView = () => {};
    const select = document.querySelector<HTMLSelectElement>('[data-emplacement="propositions"] select')!;
    expect(select.value).toBe('shot:s_ouverture');
    cliquer(document.querySelector<HTMLElement>('[data-vue-canvas="liste"] [data-carte="clip:s_produit"]'));
    const detail = document.querySelector('[data-canvas-detail]')!;
    expect(detail.textContent).toContain('Cible Jarvis · Plan 2');
    cliquer(bouton('Préparer une demande à Jarvis · Plan 2'));
    expect(select.value, 'la cible Jarvis n’a pas été choisie').toBe('shot:s_produit');
    expect(document.activeElement?.tagName).toBe('TEXTAREA');
    expect(demander, 'cibler Jarvis a envoyé une demande').not.toHaveBeenCalled();
    expect(detail.textContent).toContain('Rien n’est envoyé avant ton clic');
    // Le RÉSULTAT : ce que le formulaire enverrait. On saisit une demande (re-rendu
    // du formulaire) puis on clique · la cible transmise doit être celle du plan.
    const zone = document.activeElement as HTMLTextAreaElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(zone, 'Plus court');
      zone.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(select.value, 'le formulaire Jarvis a gardé son ancienne cible').toBe('shot:s_produit');
    cliquer([...document.querySelectorAll<HTMLButtonElement>('[data-emplacement="propositions"] button:not([role="tab"])')].find((b) => b.textContent === 'Demander à Jarvis'));
    expect(demander, 'la demande ne part pas sur le plan choisi depuis le canvas').toHaveBeenCalledWith({ cible: 'shot:s_produit', demande: 'Plus court' });
  });

  it('sans panneau Jarvis (lecture seule) · on le dit, rien n’est envoyé', () => {
    monter(<CanvasMetier {...props()} />);
    window.HTMLElement.prototype.scrollIntoView = () => {};
    cliquer(document.querySelector<HTMLElement>('[data-carte="plan:s_fin"]'));
    cliquer(bouton('Préparer une demande à Jarvis · Plan 3'));
    expect(document.querySelector('[data-canvas-detail]')!.textContent).toContain('Le panneau Jarvis n’est pas disponible ici');
  });

  it('sans cible Jarvis · une entrée renvoie à son atelier, un calcul à ce qu’il lit', () => {
    monter(<CanvasMetier {...props()} />);
    cliquer(document.querySelector<HTMLElement>('[data-carte="entree:style"]'));
    expect(document.querySelector('[data-canvas-detail]')!.textContent).toContain('Cette entrée se règle dans son atelier');
    cliquer(document.querySelector<HTMLElement>('[data-carte="montage"]'));
    expect(document.querySelector('[data-canvas-detail]')!.textContent).toContain('Cette carte se recalcule depuis ce qu’elle lit');
  });

  it('une version antérieure · pas de bouton, Jarvis propose sur la courante', () => {
    monter(<CanvasMetier {...props()} version={{ id: 'v0', n: 1, courante: false }} />);
    cliquer(document.querySelector<HTMLElement>('[data-carte="plan:s_fin"]'));
    expect(bouton('Préparer une demande à Jarvis · Plan 3')).toBeUndefined();
    expect(document.querySelector('[data-canvas-detail]')!.textContent).toContain('ouvre-la pour lui demander');
  });
});

describe('canvas · mobile · détail en panneau refermable', () => {
  it('cibler Jarvis depuis le panneau mobile · le focus finit dans « Ta demande », pas sur la carte', async () => {
    etroit = true;
    const cibles = ciblesDisponibles(contenu).map((c) => ({ ...c, champs: [] }));
    const jarvis = disponibiliteJarvis({ releasePubliee: true, fournisseurConfigure: true, plafondAtteint: false, peutProposer: true, modele: 'modele-test' });
    monter(
      <>
        <div data-emplacement="propositions">
          <FormulaireDemande cibles={cibles} jarvis={jarvis} peutProposer enCours={false} onDemanderJarvis={async () => true} onProposerMain={async () => true} />
        </div>
        <CanvasMetier {...props()} />
      </>,
    );
    window.HTMLElement.prototype.scrollIntoView = () => {};
    const carte = document.querySelector<HTMLButtonElement>('[data-carte="clip:s_fin"]')!;
    carte.focus();
    cliquer(carte);
    cliquer(bouton('Préparer une demande à Jarvis · Plan 3'));
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector<HTMLSelectElement>('[data-emplacement="propositions"] select')!.value).toBe('shot:s_fin');
    expect(document.activeElement?.tagName, 'le dialogue mobile a repris le focus après le ciblage Jarvis').toBe('TEXTAREA');
  });

  it('choisir ouvre un dialogue ; Échap le ferme et rend le focus à la carte', () => {
    etroit = true;
    monter(<CanvasMetier {...props()} />);
    const carte = document.querySelector<HTMLButtonElement>('[data-carte="voix:s_produit"]')!;
    carte.focus();
    cliquer(carte);
    const dialogue = document.querySelector('[role="dialog"]');
    expect(dialogue, 'le détail ne s’ouvre pas en panneau sur mobile').not.toBeNull();
    expect(dialogue!.getAttribute('aria-modal')).toBe('true');
    expect(dialogue!.textContent).toContain('Voix · plan 2');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(carte);
  });
});
