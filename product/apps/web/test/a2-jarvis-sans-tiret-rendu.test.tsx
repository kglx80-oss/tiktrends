// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * A2 · ce qu'on VOIT d'une réponse de Jarvis · plus de « — » dans la prose,
 * code et URL intacts, saisie de l'utilisateur intacte. On rend le VRAI
 * composant de message (`Tour`) et le VRAI fil pendant le flux (`JarvisChat`),
 * puis on lit le HTML. La carte de proposition studio (fiche V5 retirée) est
 * gardée sur l'écran Spatial par `spatial-projet-propositions`.
 */

vi.mock('@tiktrends/db', () => ({ db: undefined, schema: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
const h = vi.hoisted(() => ({ thread: null as unknown }));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: async () => ({ thread: h.thread }), clearChatAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-draft', () => ({ draftConceptAction: async () => ({}) }));

import { JarvisChat, Tour } from '../app/(app)/jarvis/JarvisChat';

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
      h.thread = { turns: [{ id: '1', role: 'user', content: 'Q', at: T }], starters: [], measuredAds: 0, brandName: 'Neva', contexte: { brandId: 'b1', identity: null, rules: null, hooks: null, connaissances: null }, sources: {}, conversationId: null, conversations: [] };
      let pousser: (s: string) => void = () => {};
      const corps = new ReadableStream<Uint8Array>({
        start(c) { pousser = (s) => c.enqueue(new TextEncoder().encode(s)); },
      });
      vi.stubGlobal('fetch', vi.fn(async () => new Response(corps, { status: 200 })));

      hote = document.createElement('div');
      document.body.appendChild(hote);
      const r = createRoot(hote);
      root = r;
      await act(async () => { r.render(<JarvisChat fiche={null} brandId="b1" brandName="Neva" kpiSource={null} projets={[]} />); });
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
