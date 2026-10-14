// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * A2 · ce qu'on VOIT d'une réponse de Jarvis · plus de « — » dans la prose,
 * code et URL intacts, saisie de l'utilisateur intacte. On rend le VRAI
 * composant de message (`Tour`), le VRAI fil pendant le flux (`JarvisChat`) et
 * la VRAIE carte de proposition studio, puis on lit le HTML.
 */

vi.mock('@tiktrends/db', () => ({ db: undefined, schema: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
const h = vi.hoisted(() => ({ thread: null as unknown }));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: async () => ({ thread: h.thread }), clearChatAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-draft', () => ({ draftConceptAction: async () => ({}) }));

import { JarvisChat, Tour } from '../app/(app)/jarvis/JarvisChat';
import { CarteProposition } from '../components/studios/propositions/CarteProposition';
import type { PropositionPresentee } from '../lib/studios/propositions/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom ne fait pas défiler · le fil suit le bas par `scrollTo`, neutralisé ici.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const T = '2026-10-14T10:00:00.000Z';
const URL_TIRET = 'https://exemple.fr/guide—complet/30–45-ans?q=a—b';
const CODE = '```ts\nconst titre = "hook — offre";\n```';
const REPONSE = [
  'Le hook tient — l’offre, non.',
  `Lis ${URL_TIRET} — c’est court.`,
  'Lance `npm run a—b` — puis relis.',
  CODE,
  '— Teste la variante F01–F24.',
].join('\n');

/** Le texte lu par l'œil · balises retirées, entités décodées. */
const lu = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent ?? '';
};

describe('A2 · réponse de Jarvis affichée sans tiret cadratin', () => {
  it('Tour · prose réécrite, code, code en ligne, URL et intervalle intacts', () => {
    const html = renderToStaticMarkup(
      <Tour turn={{ id: 'a', role: 'assistant', content: REPONSE, at: T }} sources={{}} question="Q" />,
    );
    const t = lu(html);
    expect(t, 'incise du modèle encore affichée en « — »').toContain('Le hook tient · l’offre, non.');
    expect(t).toContain(`Lis ${URL_TIRET} · c’est court.`);
    expect(t).toContain('Lance `npm run a—b` · puis relis.');
    expect(t, 'le bloc de code a été réécrit').toContain(CODE);
    expect(t).toContain('· Teste la variante F01–F24.');
    // Hors URL et code, plus un seul « — ».
    const prose = t.replace(URL_TIRET, '').replace(CODE, '').replace('`npm run a—b`', '');
    expect(prose, 'tiret cadratin dans la prose de Jarvis').not.toContain('—');
  });

  it('Tour · la question de l’utilisateur reste telle qu’il l’a tapée', () => {
    const html = renderToStaticMarkup(<Tour turn={{ id: 'u', role: 'user', content: 'Et le hook — vraiment ?', at: T }} sources={{}} />);
    expect(lu(html)).toBe('Et le hook — vraiment ?');
  });

  describe('JarvisChat · pendant le flux', () => {
    let root: Root | null = null;
    let hote: HTMLDivElement | null = null;
    afterEach(() => {
      if (root) act(() => root!.unmount());
      hote?.remove();
      root = null; hote = null;
      vi.unstubAllGlobals();
    });

    it('le texte partiel est réécrit à mesure qu’il arrive, code et URL intacts', async () => {
      h.thread = { turns: [{ id: '1', role: 'user', content: 'Q', at: T }], starters: [], measuredAds: 0, brandName: 'Neva', contexte: { brandId: 'b1', identity: null, rules: null, hooks: null, connaissances: null }, sources: {} };
      let pousser: (s: string) => void = () => {};
      const corps = new ReadableStream<Uint8Array>({
        start(c) { pousser = (s) => c.enqueue(new TextEncoder().encode(s)); },
      });
      vi.stubGlobal('fetch', vi.fn(async () => new Response(corps, { status: 200 })));

      hote = document.createElement('div');
      document.body.appendChild(hote);
      const r = createRoot(hote);
      root = r;
      await act(async () => { r.render(<JarvisChat />); });
      await act(async () => { await new Promise((x) => setTimeout(x, 0)); });

      const zone = hote.querySelector('textarea')!;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      await act(async () => { setter.call(zone, 'Et ensuite ?'); zone.dispatchEvent(new Event('input', { bubbles: true })); });
      const envoyer = hote.querySelector<HTMLButtonElement>('button[aria-label="Envoyer le message à Jarvis"]')!;
      await act(async () => { envoyer.click(); });
      await act(async () => { pousser(REPONSE); await new Promise((x) => setTimeout(x, 10)); });

      const t = hote.textContent ?? '';
      expect(t, 'le flux n’a pas été affiché').toContain('Le hook tient');
      expect(t, 'incise du modèle encore affichée en « — » pendant le flux').toContain('Le hook tient · l’offre, non.');
      expect(t).toContain(`Lis ${URL_TIRET} · c’est court.`);
      expect(t, 'le bloc de code a été réécrit pendant le flux').toContain(CODE);
    });
  });
});

describe('A2 · carte de proposition studio', () => {
  const base: PropositionPresentee = {
    id: 'p1', projectId: 'pr1', origine: 'jarvis', libelleOrigine: 'Jarvis', etat: 'rejected', libelleEtat: 'Rejetée',
    cible: 'shot:s1', libelleCible: 'Plan 1', baseVersion: { id: 'v1', n: 1 }, libelleCibleVersion: 'Plan 1 · version 1',
    perimee: false,
    changements: [{ op: 'replace', chemin: '/shots/byId/s1/onScreenText', libelle: 'Texte à l’écran', avant: 'Avant — ancien', apres: 'Après — nouveau', raison: 'Plus net — plus court' }],
    explication: 'Le hook porte — on serre le texte.', sources: [], impact: null,
    creeLe: T, expireLe: null, decideLe: null, versionAppliquee: null,
  };
  const carte = (p: PropositionPresentee) => lu(renderToStaticMarkup(<CarteProposition p={p} versionCouranteN={1} peutAgir />));

  it('Jarvis · explication et raison réécrites, avant/après INTACTS (valeur appliquée)', () => {
    const t = carte(base);
    expect(t, 'explication de Jarvis encore en « — »').toContain('Le hook porte · on serre le texte.');
    expect(t).toContain('Plus net · plus court');
    expect(t, 'la valeur qui sera appliquée a été réécrite').toContain('Après — nouveau');
    expect(t).toContain('Avant — ancien');
  });

  it('saisie humaine · rien n’est réécrit', () => {
    const t = carte({ ...base, origine: 'human', libelleOrigine: 'Saisie' });
    expect(t).toContain('Le hook porte — on serre le texte.');
    expect(t).toContain('Plus net — plus court');
  });
});
