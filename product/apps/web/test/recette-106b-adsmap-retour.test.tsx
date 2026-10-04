// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Recette #106b · Adsmap · le bouton Retour du navigateur, fiche ouverte,
 * referme la fiche et garde la liste (vue comprise) au lieu de quitter l'écran.
 *
 * Mesuré avant correctif (Chrome, 1280) · fiche ouverte depuis « À décider »,
 * Retour → /dashboard ; les vues Table / Carte absentes de l'URL.
 *
 * On monte le panneau et les vues pour de vrai (jsdom, actions simulées) et on
 * lit l'URL, `history` et l'état rendu · pas la présence d'un appel.
 */
vi.mock('../app/actions/adsmap-verdict', () => ({
  adDetailAction: async () => ({ error: 'Chargement impossible · réessaie dans un instant.' }),
  validateVerdictAction: async () => ({}), createIterationAction: async () => ({}),
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }));
vi.mock('next/dynamic', () => ({ default: () => () => <div data-vue="carte">carte</div> }));
vi.mock('../app/(app)/adsmap/Inbox', () => ({ Inbox: () => <div data-vue="decider">file</div> }));
vi.mock('../app/(app)/adsmap/AdsMapTable', () => ({ AdsMapTable: () => <div data-vue="table">table</div> }));
vi.mock('../app/(app)/adsmap/BuildPanel', () => ({ BuildPanel: () => null }));

import { AdDrawer } from '../app/(app)/adsmap/AdDrawer';
import { Views } from '../app/(app)/adsmap/Views';
import { useRouvrirFiche } from '../app/(app)/adsmap/useRouvrirFiche';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ID = '11111111-2222-4333-8444-555555555555';
let root: Root | null = null; let hote: HTMLDivElement | null = null;
const monter = async (el: React.ReactElement) => {
  hote = document.createElement('div'); document.body.appendChild(hote); root = createRoot(hote);
  await act(async () => { root!.render(el); });
  return hote;
};
const demonter = async () => { await act(async () => { root?.unmount(); }); hote?.remove(); root = null; hote = null; };
const attendre = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
// jsdom ne dépile pas pour de vrai · `back` est observé, jamais exécuté (un
// popstate tardif d'un test précédent fausserait le suivant).
let back: ReturnType<typeof vi.spyOn>;
beforeEach(() => { back = vi.spyOn(window.history, 'back').mockImplementation(() => {}); });
afterEach(async () => { await demonter(); await attendre(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/adsmap'); });

describe('Fiche ouverte depuis la liste · Retour la referme sans quitter Adsmap', () => {
  it('ouvrir empile une entrée `?ad=` qui garde la vue', async () => {
    window.history.replaceState(null, '', '/adsmap?vue=table');
    const avant = window.history.length;
    await monter(<AdDrawer adId={ID} onClose={() => {}} onChanged={() => {}} />);
    expect(window.history.length, 'aucune entrée d’historique · Retour quitterait Adsmap').toBe(avant + 1);
    expect(window.location.search).toBe(`?vue=table&ad=${ID}`);
  });

  it('Retour (popstate) referme la fiche, sans dépiler une seconde fois', async () => {
    window.history.replaceState(null, '', '/adsmap?vue=carte');
    const fermer = vi.fn();
    await monter(<AdDrawer adId={ID} onClose={fermer} onChanged={() => {}} />);
    // Le navigateur dépile, puis prévient.
    window.history.replaceState(null, '', '/adsmap?vue=carte');
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
    expect(fermer, 'Retour ne referme pas la fiche').toHaveBeenCalledTimes(1);
    await demonter(); await attendre();
    expect(back, 'la fiche a dépilé une entrée de trop').not.toHaveBeenCalled();
  });

  it('fermée à la main, elle consomme son entrée (Avant ne rouvre rien)', async () => {
    await monter(<AdDrawer adId={ID} onClose={() => {}} onChanged={() => {}} />);
    await demonter(); await attendre();
    expect(back, 'l’entrée de la fiche reste dans l’historique').toHaveBeenCalledTimes(1);
  });

  it('ouverte par lien profond (carte du Studio) · n’empile rien', async () => {
    const avant = window.history.length;
    await monter(<AdDrawer adId={ID} onClose={() => {}} onChanged={() => {}} origine="lien-profond" />);
    expect(window.history.length).toBe(avant);
  });
});

describe('Vues Adsmap · dans l’URL', () => {
  it('la vue de l’URL est rétablie, et changer d’onglet la remplace sans empiler', async () => {
    window.history.replaceState(null, '', '/adsmap?vue=table');
    const h = await monter(<Views batches={[]} />);
    const onglet = (t: string) => [...h.querySelectorAll('button')].find((b) => b.textContent === t)!;
    expect(onglet('Table').getAttribute('aria-pressed'), 'la vue de l’URL n’est pas rétablie').toBe('true');
    expect(h.querySelector('[data-vue="table"]')).toBeTruthy();
    const avant = window.history.length;
    await act(async () => { onglet('Carte').click(); });
    expect(window.location.search, 'la vue choisie n’est pas dans l’URL').toBe('?vue=carte');
    expect(window.history.length, 'changer d’onglet empile une entrée').toBe(avant);
    await act(async () => { onglet('À décider').click(); });
    expect(window.location.search).toBe('');
  });
});

describe('Échap puis Avant · la fiche se rouvre (recette #106)', () => {
  it('l’entrée de la fiche porte la vue qui l’a ouverte', async () => {
    window.history.replaceState(null, '', '/adsmap?vue=table');
    await monter(<AdDrawer adId={ID} onClose={() => {}} onChanged={() => {}} />);
    expect(window.history.state, 'l’entrée ne dit pas quelle vue rouvrir').toMatchObject({ ficheAdsmap: ID, vueAdsmap: 'table' });
  });

  function Liste({ vue }: { vue: 'table' | 'decider' }) {
    const [ouverte, setOuverte] = useState<string | null>(null);
    useRouvrirFiche(vue, setOuverte);
    return <p data-ouverte={ouverte ?? ''} />;
  }
  it('Avant vers cette entrée rouvre la fiche dans SA vue, pas dans une autre', async () => {
    const h = await monter(<><Liste vue="table" /><Liste vue="decider" /></>);
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate', { state: { ficheAdsmap: ID, vueAdsmap: 'table' } })); });
    const [table, decider] = [...h.querySelectorAll('p')];
    expect(table!.getAttribute('data-ouverte'), 'Avant ne rouvre pas la fiche').toBe(ID);
    expect(decider!.getAttribute('data-ouverte'), 'une autre vue a rouvert la fiche').toBe('');
  });

  it('entrée réécrite par le routeur (action serveur) · Avant rouvre d’après l’URL', async () => {
    const h = await monter(<><Liste vue="table" /><Liste vue="decider" /></>);
    // Next 15.5 réécrit l'entrée sans notre état · seule l'URL garde `?ad=`.
    window.history.replaceState({ __NA: true }, '', `/adsmap?vue=table&ad=${ID}`);
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate', { state: { __NA: true } })); });
    const [table, decider] = [...h.querySelectorAll('p')];
    expect(table!.getAttribute('data-ouverte'), 'entrée réécrite · Avant ne rouvre pas la fiche').toBe(ID);
    expect(decider!.getAttribute('data-ouverte')).toBe('');
  });

  it('entrée réécrite par le routeur · fermer consomme quand même l’entrée, rouvrir n’en empile pas une seconde', async () => {
    window.history.replaceState(null, '', '/adsmap?vue=table');
    await monter(<AdDrawer adId={ID} onClose={() => {}} onChanged={() => {}} />);
    window.history.replaceState({ __NA: true }, '', window.location.href);
    await demonter(); await attendre();
    expect(back, 'entrée réécrite · la fiche fermée laisse `?ad=` dans l’historique').toHaveBeenCalledTimes(1);
    const avant = window.history.length;
    await monter(<AdDrawer adId={ID} onClose={() => {}} onChanged={() => {}} />);
    expect(window.history.length, 'rouverte sur son entrée réécrite, la fiche empile un doublon').toBe(avant);
  });

  it('chaque liste (À décider, Table, Carte) rouvre ses fiches', () => {
    for (const [f, v] of [['Inbox', 'decider'], ['AdsMapTable', 'table'], ['Canvas', 'carte']]) {
      const src = readFileSync(join(process.cwd(), `app/(app)/adsmap/${f}.tsx`), 'utf8');
      expect(src, `${f} ne rouvre pas ses fiches`).toContain(`useRouvrirFiche('${v}', setOuverte)`);
    }
  });
});
