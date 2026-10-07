// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Message 71 · « Suivre dans Adsmap » (Sauvegardes) après une ERREUR.
 *
 * Mesuré au navigateur sur bcd12a75 · marque active retirée après le
 * chargement, clic · l'erreur réelle de `adsmapGuard` s'affiche · marque
 * rétablie, nouveau clic · AUCUNE requête ne part (`if (suivi[cle]) return;`,
 * l'erreur est une chaîne non vide) alors que le bouton reste actif. On MONTE
 * Sauvegardes et on compte les appels réels à l'action, le libellé du bouton et
 * l'erreur affichée · erreur puis nouvel essai, double clic pendant l'attente,
 * état « Dans Adsmap » définitif.
 */
type Reponse = { ok?: true; error?: string };
const appel = vi.hoisted(() => ({ n: 0, reponses: [] as Array<() => Promise<Reponse>> }));
vi.mock('../app/actions/adsmap-bridge', () => ({
  trackSavedAdAction: () => { appel.n++; const r = appel.reponses.shift(); return r ? r() : Promise.resolve({ ok: true }); },
}));
vi.mock('../app/actions/inspo', () => ({ setSavedAdFolder: async () => ({ ok: true }), classerFormatSauvegarde: async () => ({ ok: true }) }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => 1 }), useToastSiPresent: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }));
vi.mock('../components/AdCard', () => ({ AdCard: () => <div data-adcard="" /> }));
vi.mock('../app/(app)/saved/FormatChoix', () => ({ FormatChoix: () => null }));

import { SavedBoards, type SavedItem } from '../components/SavedBoards';
import type { InspoAd } from '@tiktrends/integrations';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; appel.n = 0; appel.reponses = []; });
window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const items: SavedItem[] = [{ id: 's1', externalId: 'e1', platform: 'meta', folder: null, ad: { id: 'e1', platform: 'meta', status: 'active', mediaType: 'image', advertiserName: 'Marque' } as InspoAd }];
const ERREUR = 'Sélectionne une marque active pour ouvrir Adsmap.';
const vider = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const differee = () => { let lacher: (r: Reponse) => void = () => {}; const p = new Promise<Reponse>((ok) => { lacher = ok; }); return { lancer: () => p, lacher: (r: Reponse) => lacher(r) }; };

async function monter() {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<SavedBoards items={items} followKeys={[]} adsmap />); });
  return el;
}
const bouton = (h: HTMLElement) => [...h.querySelectorAll('button')].find((b) => /Adsmap|Ajout…/.test(b.textContent ?? ''))!;
const erreur = (h: HTMLElement) => [...h.querySelectorAll('p')].map((p) => p.textContent).find((t) => t === ERREUR) ?? null;

describe('Suivre dans Adsmap · une erreur ne bloque plus le nouvel essai', () => {
  it('erreur réelle → nouvel essai · la requête part, l’erreur disparaît, le succès s’affiche', async () => {
    appel.reponses = [() => Promise.resolve({ error: ERREUR }), () => Promise.resolve({ ok: true })];
    const h = await monter();
    await act(async () => { bouton(h).click(); });
    await vider();
    expect(appel.n).toBe(1);
    expect(erreur(h), 'l’erreur du serveur n’est pas dite').toBe(ERREUR);
    expect(bouton(h).disabled, 'le bouton est désactivé après une erreur').toBe(false);
    await act(async () => { bouton(h).click(); });
    await vider();
    expect(appel.n, 'le nouvel essai ne part pas · l’erreur bloque toute nouvelle tentative').toBe(2);
    expect(erreur(h), 'l’erreur reste affichée après un nouvel essai réussi').toBeNull();
    expect(bouton(h).textContent).toBe('Dans Adsmap');
  });

  it('l’erreur disparaît dès le nouvel essai (pendant l’attente)', async () => {
    const d = differee();
    appel.reponses = [() => Promise.resolve({ error: ERREUR }), d.lancer];
    const h = await monter();
    await act(async () => { bouton(h).click(); });
    await vider();
    await act(async () => { bouton(h).click(); });
    expect(appel.n, 'le nouvel essai ne part pas').toBe(2);
    expect(erreur(h), 'l’ancienne erreur reste affichée pendant le nouvel essai').toBeNull();
    expect(bouton(h).textContent).toBe('Ajout…');
    await act(async () => { d.lacher({ ok: true }); });
    await vider();
  });

  it('double clic pendant l’attente · UNE seule requête', async () => {
    const d = differee();
    appel.reponses = [d.lancer, () => Promise.resolve({ ok: true })];
    const h = await monter();
    const b = bouton(h);
    // Deux clics dans la même tâche, avant tout rendu · le verrou ne doit pas
    // dépendre du rendu (bouton désactivé) pour tenir.
    await act(async () => { b.click(); b.click(); });
    expect(appel.n, 'un double clic envoie deux requêtes (deux concepts possibles)').toBe(1);
    await act(async () => { d.lacher({ ok: true }); });
    await vider();
    expect(appel.n).toBe(1);
    expect(bouton(h).textContent).toBe('Dans Adsmap');
  });

  it('« Dans Adsmap » est définitif · aucun nouvel envoi', async () => {
    appel.reponses = [() => Promise.resolve({ ok: true })];
    const h = await monter();
    await act(async () => { bouton(h).click(); });
    await vider();
    const b = bouton(h);
    expect(b.textContent).toBe('Dans Adsmap');
    expect(b.disabled).toBe(true);
    // Même en forçant l'événement (le bouton désactivé ne le reçoit pas) · on
    // appelle le gestionnaire React directement.
    const props = Object.entries(b).find(([k]) => k.startsWith('__reactProps'))?.[1] as { onClick?: () => void } | undefined;
    await act(async () => { props?.onClick?.(); });
    await vider();
    expect(appel.n, 'un état « Dans Adsmap » renvoie une requête').toBe(1);
  });

  it('exception réseau · le bouton n’est pas bloqué en « Ajout… », l’échec est dit, un nouvel essai part', async () => {
    appel.reponses = [() => Promise.reject(new Error('réseau')), () => Promise.resolve({ ok: true })];
    const h = await monter();
    await act(async () => { bouton(h).click(); });
    await vider();
    expect(bouton(h).textContent, 'le bouton reste bloqué en « Ajout… » après une exception').toBe('Suivre dans Adsmap');
    expect(h.textContent).toContain('Ajout non enregistré · vérifie ta connexion puis réessaie.');
    await act(async () => { bouton(h).click(); });
    await vider();
    expect(appel.n).toBe(2);
    expect(bouton(h).textContent).toBe('Dans Adsmap');
  });
});
