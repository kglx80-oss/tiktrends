// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Lot 20B (point ajouté par l'intégrateur) · le choix « Format » après un
 * ÉCHEC d'enregistrement.
 *
 * Constaté au navigateur (build 58e15c4c, `/veille/formats?format=packshot`,
 * clavier, panne CDP sur la seule Next-Action) · `setValeur(enregistre)` remet
 * `modifie` à faux, le bouton « Enregistrer » qui avait le focus est DÉMONTÉ et
 * le focus retombe sur `<body>` · le message d'échec existe mais le focus n'est
 * plus dans la carte. Même défaut sur un refus `ok:false`. On MONTE le choix, on
 * met le focus sur « Enregistrer » comme au clavier, on fait échouer le serveur
 * et on lit `document.activeElement`, le message d'état et sa liaison au champ.
 */
const appel = vi.hoisted(() => ({ reponse: { ok: true, format: 'packshot', date: '2026-10-05T00:00:00Z' } as unknown, refresh: 0, defile: [] as string[] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => { appel.refresh++; } }) }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock('../app/actions/inspo', () => ({
  classerFormatSauvegarde: async () => { if (appel.reponse instanceof Error) throw appel.reponse; return appel.reponse; },
}));

import { FormatChoix } from '../app/(app)/saved/FormatChoix';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom n'a pas de défilement · on note QUI est amené à l'écran.
(Element.prototype as unknown as { scrollIntoView: (o?: unknown) => void }).scrollIntoView = function (this: Element) { appel.defile.push(this.id || this.tagName); };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; appel.refresh = 0; appel.defile = []; });

async function echouer(reponse: unknown) {
  appel.reponse = reponse;
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  // Une autre commande avant le choix, comme dans une carte.
  await act(async () => { root!.render(<div><button type="button">Avant</button><FormatChoix platform="meta" externalId="e1" mediaType="image" initial={null} /></div>); });
  const h = el;
  const s = h.querySelector('select')!;
  await act(async () => { s.value = 'packshot'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  const b = [...h.querySelectorAll('button')].find((x) => x.textContent === 'Enregistrer')!;
  b.focus();
  expect(document.activeElement, 'le focus n’est pas sur « Enregistrer » avant l’envoi').toBe(b);
  await act(async () => { b.click(); });
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const etat = h.querySelector('[role="status"]')!;
  return { h, s, etat };
}

describe('FormatChoix · échec · le focus revient sur le choix de la même carte', () => {
  it('exception (réseau) · focus sur le <select>, l’échec dit, lié au champ et amené à l’écran', async () => {
    const { s, etat } = await echouer(new Error('réseau'));
    expect(document.activeElement === document.body ? 'BODY' : document.activeElement?.tagName, 'le focus retombe en haut du document après l’échec').toBe('SELECT');
    expect(document.activeElement).toBe(s);
    expect(s.value, 'le choix n’est pas revenu à l’enregistré').toBe('non_classe');
    expect(etat.textContent).toBe('Échec de l’enregistrement · vérifie ta connexion puis réessaie.');
    expect(s.getAttribute('aria-describedby')!.split(' '), 'le message d’échec n’est pas lié au champ').toContain(etat.id);
    expect(appel.defile, 'le message d’échec n’est pas amené à l’écran').toContain(etat.id);
  });

  it('refus ok:false · même retour du focus, raison du serveur', async () => {
    const { s, etat } = await echouer({ ok: false, error: 'Classement réservé à la Veille.' });
    expect(document.activeElement === document.body ? 'BODY' : document.activeElement?.tagName, 'le focus retombe en haut du document après l’échec').toBe('SELECT');
    expect(document.activeElement).toBe(s);
    expect(etat.textContent).toBe('Classement réservé à la Veille.');
    expect(appel.defile).toContain(etat.id);
  });

  it('succès · inchangé · le focus va au choix, aucun défilement ajouté', async () => {
    const { s, etat } = await echouer({ ok: true, format: 'packshot', date: '2026-10-05T00:00:00Z' });
    expect(document.activeElement).toBe(s);
    expect(etat.textContent).toBe('Enregistré · Packshot');
    expect(appel.refresh).toBe(1);
    expect(appel.defile).toEqual([]);
  });
});
