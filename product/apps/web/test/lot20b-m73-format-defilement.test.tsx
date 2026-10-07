// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Message 73 · choix « Format » · échec d'enregistrement ALORS QUE le focus est
 * parti ailleurs pendant l'attente.
 *
 * Constat de code sur cdb65a5d · `rendreFocusApresEchec` respecte un focus parti
 * hors de la carte (il ne le reprend pas), mais incrémente quand même
 * `montrerEchec` · l'effet `scrollIntoView({block:'nearest'})` du message d'état
 * de la carte s'exécute et fait défiler la page vers une carte que l'utilisateur
 * a quittée. On MONTE deux choix (deux cartes), on enregistre depuis la
 * première, la réponse est DIFFÉRÉE, le focus part sur la seconde, puis le
 * serveur échoue (exception et refus `ok:false`) · on lit l'élément actif, les
 * défilements demandés et l'annonce de l'échec. Contre-épreuve · focus resté
 * dans la carte · le message est toujours amené à l'écran.
 */
const appel = vi.hoisted(() => ({ repondre: (_r: unknown) => {}, echouer: (_e: Error) => {}, defile: [] as string[] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock('../app/actions/inspo', () => ({
  classerFormatSauvegarde: () => new Promise((ok, ko) => { appel.repondre = ok; appel.echouer = ko; }),
}));

import { FormatChoix } from '../app/(app)/saved/FormatChoix';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(Element.prototype as unknown as { scrollIntoView: (o?: unknown) => void }).scrollIntoView = function (this: Element) { appel.defile.push(this.id || this.tagName); };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; appel.defile = []; });

async function scenario(partir: boolean) {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<div>
    <div data-carte="1"><FormatChoix platform="meta" externalId="e1" mediaType="image" initial={null} /></div>
    <div data-carte="2"><FormatChoix platform="meta" externalId="e2" mediaType="image" initial={null} /></div>
  </div>); });
  const h = el;
  const [s1, s2] = [...h.querySelectorAll('select')] as HTMLSelectElement[];
  await act(async () => { s1!.value = 'packshot'; s1!.dispatchEvent(new Event('change', { bubbles: true })); });
  const b = [...h.querySelector('[data-carte="1"]')!.querySelectorAll('button')].find((x) => x.textContent === 'Enregistrer')!;
  b.focus();
  await act(async () => { b.click(); });
  // Pendant l'attente · le focus part sur une AUTRE carte (Tab, ou clic sur une commande éloignée).
  if (partir) s2!.focus();
  appel.defile = [];
  return { h, s1: s1!, s2: s2! };
}
const lire = (h: HTMLElement, s1: HTMLSelectElement) => {
  const etat = h.querySelector('[data-carte="1"] [role="status"]')!;
  return { etat, lie: (s1.getAttribute('aria-describedby') ?? '').split(' ').includes(etat.id) };
};

describe('FormatChoix · échec pendant que le focus est ailleurs · aucun défilement volé', () => {
  for (const [cas, liberer] of [
    ['exception (réseau)', () => appel.echouer(new Error('réseau'))],
    ['refus ok:false', () => appel.repondre({ ok: false, error: 'Annonce introuvable dans les sauvegardes de cette marque · recharge la page.' })],
  ] as const) {
    it(`${cas} · le focus reste sur l’autre carte, la page ne défile pas, l’échec est dit et lié au champ`, async () => {
      const { h, s1, s2 } = await scenario(true);
      await act(async () => { liberer(); });
      for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      expect(document.activeElement, 'le focus a été repris à l’autre carte').toBe(s2);
      expect(appel.defile, 'la page défile vers la carte quittée · le défilement est volé').toEqual([]);
      const { etat, lie } = lire(h, s1);
      expect(etat.textContent, 'l’échec n’est plus annoncé').toMatch(/Échec de l’enregistrement|Annonce introuvable/);
      expect(lie, 'le message d’échec n’est plus lié au champ').toBe(true);
      expect(s1.value).toBe('non_classe');
    });
  }

  it('contre-épreuve · focus resté dans la carte · focus au choix et message amené à l’écran', async () => {
    const { h, s1 } = await scenario(false);
    await act(async () => { appel.echouer(new Error('réseau')); });
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(document.activeElement).toBe(s1);
    expect(appel.defile, 'le message d’échec n’est plus amené à l’écran dans le cas normal').toContain(lire(h, s1).etat.id);
  });
});
