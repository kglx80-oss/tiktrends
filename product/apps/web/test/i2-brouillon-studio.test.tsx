// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * I2 · retour Codex #3 · le VRAI Studio, monté (jsdom, actions serveur simulées,
 * aucune n'est appelée par ce qu'on teste). On lit ce qu'on VOIT · valeur du
 * champ d'angle, pastille d'audience, avis de reprise, focus · et ce qui est
 * écrit dans l'onglet (sessionStorage), jamais ailleurs.
 *
 * Défauts mesurés en recette réelle au head 94d659b · saisies perdues sans un
 * mot au retour navigateur ; ?iter=A → ?iter=B gardait les champs de A sous le
 * brief de B (clé de montage par marque seule).
 */
const { stub } = vi.hoisted(() => ({ stub: () => new Proxy({}, { has: (_t: object, k: string | symbol) => k !== 'then', get: (_t: object, k: string | symbol) => (k === 'then' ? undefined : k === '__esModule' ? true : async () => ({})) }) }));
vi.mock('../app/actions/ads', stub);
vi.mock('../app/actions/ads-faits', stub);
vi.mock('../app/actions/adsmap-bridge', stub);
vi.mock('../app/actions/image', stub);
vi.mock('../app/actions/creatives', stub);
vi.mock('../app/actions/preflight', stub);
vi.mock('../app/actions/presets', stub);
vi.mock('../app/actions/universe-previews', stub);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => '/studio/ads', useSearchParams: () => new URLSearchParams() }));

import { AdsStudio } from '../app/(app)/studio/ads/AdsStudio';
import { ToastProvider } from '../components/Toast';
import { EVT_MODIFIER_BRIEF, brouillonAEcrire, cleBrouillonIteration, conseilMoteur } from '@tiktrends/core';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom n'implémente pas le défilement · le Studio y amène l'angle avant d'y placer le focus.
window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};

const CLE = cleBrouillonIteration('neva', 'ad-A');
const PREFILL = { angle: 'Angle 1', personaId: 'p-s' };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; window.sessionStorage.clear(); });

function monter(iteration: { cle: string } | null = { cle: CLE }) {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  act(() => {
    root!.render(
      <ToastProvider><AdsStudio ready aiReady brandName="Neva" initial={[]} products={[]} savedRefs={[]}
        personas={[{ id: 'p-s', name: 'Sportifs pressés' }, { id: 'p-p', name: 'Parents fatigués' }]}
        initialAngle={PREFILL.angle} initialPersonaId={PREFILL.personaId} iteration={iteration}
        conseilMoteurs={conseilMoteur(null)} conseilModes={{ defaut: 'entiere', mesure: false, motif: '' }} /></ToastProvider>,
    );
  });
}
const angle = () => (el!.querySelector('textarea') as HTMLTextAreaElement).value;
const audience = () => (el!.querySelector('button[title="À qui on parle"]')?.textContent ?? '').replace('▾', '').trim();
const avis = () => el!.querySelector('[data-brouillon-iteration]');
const taper = (v: string) => act(() => {
  const ta = el!.querySelector('textarea') as HTMLTextAreaElement;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, v);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('I2 · le Studio garde et reprend les saisies du brief, et le dit', () => {
  it('sans rien de gardé · le prérempli, aucun avis de reprise', () => {
    monter();
    expect(angle()).toBe('Angle 1');
    expect(audience()).toBe('Sportifs pressés');
    expect(avis()).toBeNull();
  });

  it('au retour sur le même brief · angle ET audience repris, et un avis le dit', () => {
    window.sessionStorage.setItem(CLE, brouillonAEcrire({ angle: 'Angle 1 · variante matin', personaId: 'p-p' }, PREFILL)!);
    monter();
    expect(angle()).toBe('Angle 1 · variante matin');
    expect(audience()).toBe('Parents fatigués');
    expect(avis()?.textContent).toContain('Tes modifications de ce brief sont reprises');
    expect(avis()?.getAttribute('role')).toBe('status');
  });

  it('une saisie est gardée dans l’onglet · et effacée quand elle revient au prérempli', () => {
    monter();
    taper('Angle 1 · variante soir');
    expect(JSON.parse(window.sessionStorage.getItem(CLE)!)).toMatchObject({ angle: 'Angle 1 · variante soir', personaId: 'p-s' });
    taper('Angle 1');
    expect(window.sessionStorage.getItem(CLE)).toBeNull();
  });

  it('« Revenir au prérempli » rétablit les deux champs et retire l’avis', () => {
    window.sessionStorage.setItem(CLE, brouillonAEcrire({ angle: 'Autre angle', personaId: 'p-p' }, PREFILL)!);
    monter();
    const b = [...el!.querySelectorAll('button')].find((x) => x.textContent === 'Revenir au prérempli')!;
    act(() => { b.click(); });
    expect(angle()).toBe('Angle 1');
    expect(audience()).toBe('Sportifs pressés');
    expect(avis()).toBeNull();
    expect(window.sessionStorage.getItem(CLE)).toBeNull();
  });

  it('le brief d’un AUTRE test ne reprend pas ces saisies (clé par test)', () => {
    window.sessionStorage.setItem(CLE, brouillonAEcrire({ angle: 'Saisie de A', personaId: 'p-p' }, PREFILL)!);
    monter({ cle: cleBrouillonIteration('neva', 'ad-B') });
    expect(angle()).toBe('Angle 1');
    expect(avis()).toBeNull();
  });

  it('sans brief · rien n’est lu ni écrit dans l’onglet', () => {
    window.sessionStorage.setItem(CLE, brouillonAEcrire({ angle: 'Saisie de A', personaId: 'p-p' }, PREFILL)!);
    monter(null);
    expect(angle()).toBe('Angle 1');
    taper('Libre');
    expect(window.sessionStorage.length).toBe(1);
  });
});

describe('I2 · retour Codex #2 · « Modifier l’angle et l’audience » mène aux vrais champs', () => {
  it('ouvre les réglages repliés et place le focus sur l’angle · rien n’est généré', () => {
    monter();
    const reglages = el!.querySelector('textarea')!.closest('[hidden]');
    expect(reglages, 'les réglages sont repliés au départ').not.toBeNull();
    act(() => { window.dispatchEvent(new Event(EVT_MODIFIER_BRIEF)); });
    expect(el!.querySelector('textarea')!.closest('[hidden]'), 'réglages toujours repliés').toBeNull();
    expect(document.activeElement).toBe(el!.querySelector('textarea'));
  });
});

describe('I2 · la page remonte le Studio quand le test demandé change', () => {
  it('la clé de montage porte la marque ET le test demandé', () => {
    const page = readFileSync(join(__dirname, '../app/(app)/studio/ads/page.tsx'), 'utf8');
    expect(page).toMatch(/<AdsStudio\s+key=\{cleMontageStudio\(brand\?\.id \?\? null, iterDemande\)\}/);
  });
});
