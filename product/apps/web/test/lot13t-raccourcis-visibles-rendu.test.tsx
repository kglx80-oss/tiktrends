// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  RACCOURCIS, RAISON_GESTE_RIEN_A_CONCLURE, RAISON_ITERER_TEST_SANS_GAGNANTE, RAISON_TEST_HORS_LOT,
  entreesRail, entreesRailEspace, lienIterationVariable, lienLotSpatial, messageBorneListeLots, messageRaccourciFerme, toucheVisible,
  type GesteClavierLot, type PreferencesTouches,
} from '@tiktrends/core';

/**
 * Lot 13 ter V5 · des raccourcis qu'on VOIT, prouvés en RENDANT les vraies vues
 * sous la vraie coquille (jsdom) · on lit le DOM (`<kbd>`, `aria-keyshortcuts`),
 * on tape des touches, on clique, on lit le focus, le toast et les navigations.
 *  · les touches visibles = la TABLE (`toucheVisible`) · recherche, tiroir
 *    Jarvis, aide, rail, fiche d'un lot, fiche d'un test · absentes quand les
 *    raccourcis à une touche sont coupés (cookie lu au rendu serveur, ET bascule
 *    en direct), Ctrl K / ⌘ K reste ;
 *  · la fiche d'un test · T et L · une navigation, fermée avec sa raison,
 *    ignorée dans un champ et sous une fenêtre modale, coupée, aucune action ;
 *  · la liste des lots (filtre « À conclure ») · ↓ ↑ dans l'ordre de la liste,
 *    bornes dites, rien dans un champ, rien d'écrit ;
 *  · aucune touche écrite à la main dans les vues (garde de source).
 * La page réelle de la fiche d'un test (base pglite) · `lot13t-raccourcis-test-db.test.tsx`.
 */

const h = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), ecrire: vi.fn(async () => ({})) }));
vi.mock('@tiktrends/db', () => ({ db: undefined, schema: {} }));
vi.mock('next/navigation', () => ({ usePathname: () => '/adsmap/lots', useRouter: () => ({ push: h.push, refresh: h.refresh }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/brands', () => ({ setActiveBrand: vi.fn(async () => {}) }));
vi.mock('../app/actions/notifications', () => ({ fetchNotifications: vi.fn(async () => ({ items: [], unread: 0 })), markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn() }));
vi.mock('../app/actions/studios/projets', () => ({ listerProjets: vi.fn(async () => ({ ok: true, projets: [] })) }));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: vi.fn(async () => ({ thread: { turns: [], starters: [], measuredAds: 0, brandName: 'Neva', contexte: {}, conversationId: null, conversations: [] } })) }));
// Les gestes qui ÉCRIVENT · jamais appelés par une touche ni par un geste au clavier · comptés.
vi.mock('../app/actions/adsmap-verdict', () => ({ validateVerdictAction: h.ecrire, createIterationAction: h.ecrire }));
vi.mock('../app/actions/adsmap-batch', () => ({ createBatchAction: h.ecrire, duplicateBatchAction: h.ecrire, launchBatchAction: h.ecrire, prepareBatchAction: h.ecrire, setBatchAdAction: h.ecrire }));

const { Coquille } = await import('../spatial/coquille/Coquille');
const { EnTete, Vue } = await import('../spatial/communs');
const { RaccourcisLot } = await import('../spatial/vues/resultats/RaccourcisLot');
const { RaccourcisTest } = await import('../spatial/vues/resultats/RaccourcisTest');
const { Lots } = await import('../spatial/vues/resultats/Lots');
type DonneesCoquille = import('../spatial/coquille/Coquille').DonneesCoquille;
type LigneLot = import('../spatial/vues/resultats/Lots').LigneLot;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root | null = null;
let hote: HTMLDivElement;
const effacerCookies = () => { for (const n of ['tt_raccourcis', 'tt_rail']) document.cookie = `${n}=; path=/; max-age=0`; };
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); vi.clearAllMocks(); effacerCookies(); window.location.hash = ''; });
afterEach(() => { act(() => racine?.unmount()); racine = null; hote.remove(); document.body.className = ''; effacerCookies(); });

const monter = async (n: React.ReactNode) => { await act(async () => { racine = createRoot(hote); racine.render(n); }); await act(async () => { await new Promise((r) => setTimeout(r, 10)); }); };
const touche = async (key: string, o: KeyboardEventInit = {}, cible: Element | null = document.activeElement) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o });
  await act(async () => { (cible ?? document.body).dispatchEvent(ev); });
  return ev;
};
const cliquer = async (el: Element | null) => { expect(el).toBeTruthy(); await act(async () => { (el as HTMLElement).click(); }); };
const toast = () => document.getElementById('toast')?.textContent ?? '';
const kbd = (sel: string) => document.querySelector(`${sel} kbd`);
const aria = (sel: string) => document.querySelector(sel)?.getAttribute('aria-keyshortcuts') ?? null;

const TOUS = ['/studio/projets', '/veille', '/adsmap', '/adsmap/import', '/assets', '/jarvis', '/brands', '/settings'];
function donnees(raccourcis?: PreferencesTouches): DonneesCoquille {
  const ouverts = new Set(TOUS);
  const marque = { id: 'b1', nom: 'Neva' };
  return {
    entrees: entreesRail({ ouverts, marque }), espace: entreesRailEspace({ ouverts, marque }),
    marque: { ...marque, logoUrl: null, imageUrl: null }, marques: [{ id: 'b1', nom: 'Neva' }],
    peutGererMarques: true, admin: false, passer: null, railOuvert: true,
    utilisateur: { nom: 'Kevin', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, espaceNom: 'GLX',
    credits: { solde: 10, dotation: 100, illimite: false }, nonLues: 0, deconnexion: async () => {},
    ouverts: [...ouverts], jarvis: true, demarrage: null, ...(raccourcis ? { raccourcis } : {}),
  };
}
const coquille = (enfants: React.ReactNode, d = donnees()) => monter(<Coquille donnees={d}>{enfants}</Coquille>);
const page = (n?: React.ReactNode) => <Vue><EnTete titre="Écran" />{n}</Vue>;
const ACTIFS: PreferencesTouches = { actifs: true, mac: false };
const COUPES: PreferencesTouches = { actifs: false, mac: false };
const vue = (id: string, p: PreferencesTouches = ACTIFS) => toucheVisible(id, p)!;

/* ───────────── 1 · la coquille · touches = la table ───────────── */

describe('Lot 13 ter · les touches de la coquille se voient, lues dans la table', () => {
  it('actifs · recherche Ctrl K, tiroir Jarvis J, aide ?, rail [ · `<kbd>` ET `aria-keyshortcuts`, tous deux de la table', async () => {
    await coquille(page(), donnees(ACTIFS));
    const cas: Array<[string, string]> = [['#srch', 'recherche'], ['#jv', 'jarvis'], ['#raccourcis-aide', 'aide'], ['#railtg', 'rail']];
    for (const [sel, id] of cas) {
      expect(aria(sel), `${sel} · aria-keyshortcuts`).toBe(vue(id).aria);
      expect(kbd(sel)?.textContent, `${sel} · la touche dessinée`).toBe(vue(id).touches.join(' '));
      expect(kbd(sel)?.getAttribute('aria-hidden'), `${sel} · dite deux fois au lecteur d’écran`).toBe('true');
    }
    expect(aria('#srch')).toBe('Control+K');
    expect(kbd('#srch')?.textContent, 'le « ⌘K » de la maquette, écrit à la main, est revenu').toBe('Ctrl K');
    expect(kbd('#jv')?.textContent).toBe('J');
    // Le nom accessible de la recherche ne double pas la touche.
    expect(document.querySelector('#srch')?.getAttribute('aria-label')).toBeNull();
  });

  it('Mac · ⌘ K et Meta+K', async () => {
    // jsdom n'est pas un Mac · la coquille relit la plateforme au montage ; on lit le rendu SERVEUR (en-têtes d'un Mac).
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(<Coquille donnees={donnees({ actifs: true, mac: true })}>{page()}</Coquille>);
    expect(html).toContain('aria-keyshortcuts="Meta+K"');
    expect(html).toMatch(/<kbd aria-hidden="true" data-touche="recherche">⌘ K<\/kbd>/);
    expect(html).not.toContain('Control+K');
  });

  it('coupés (cookie lu au rendu serveur) · ni `<kbd>` ni `aria-keyshortcuts` pour J ? [ · Ctrl K reste', async () => {
    document.cookie = 'tt_raccourcis=0; path=/';
    await coquille(page(), donnees(COUPES));
    for (const sel of ['#jv', '#raccourcis-aide', '#railtg']) {
      expect(kbd(sel), `${sel} · une touche coupée est encore dessinée`).toBeNull();
      expect(aria(sel), `${sel} · une touche coupée est encore promise`).toBeNull();
    }
    expect(aria('#srch')).toBe('Control+K');
    expect(kbd('#srch')?.textContent).toBe('Ctrl K');
  });

  it('la bascule de l’aide · les touches disparaissent et reviennent EN DIRECT, sans rechargement', async () => {
    await coquille(page(), donnees(ACTIFS));
    await cliquer(document.getElementById('raccourcis-aide'));
    const inter = document.querySelector('[data-preference-raccourcis]')!;
    await cliquer(inter);
    expect(document.cookie).toContain('tt_raccourcis=0');
    expect(aria('#jv'), 'coupé dans l’aide, J est encore promis').toBeNull();
    expect(kbd('#jv')).toBeNull();
    expect(aria('#srch')).toBe('Control+K');
    await cliquer(inter);
    expect(aria('#jv'), 'rallumé, J ne revient pas').toBe('J');
    expect(kbd('#railtg')?.textContent).toBe('[');
  });
});

/* ───────────── 2 · la fiche d'un lot · les deux gestes se voient ───────────── */

const OUVERT_ITERER: GesteClavierLot = { href: lienIterationVariable({ adId: '11111111-1111-4111-8111-111111111111' }), raison: null };
const FERME_CONCLURE: GesteClavierLot = { href: null, raison: RAISON_GESTE_RIEN_A_CONCLURE };

describe('Lot 13 ter · la fiche d’un lot · « Conclure le lot » et « Itérer » portent leur touche', () => {
  it('C et T dessinés et promis (table) · le clic fait ce que fait la touche · fermé, la raison écrite et dite', async () => {
    await coquille(page(<><RaccourcisLot conclure={{ href: '#conclure', raison: null }} iterer={OUVERT_ITERER} /><section id="conclure" tabIndex={-1} aria-label="Conclure le lot">x</section></>));
    const conclure = document.querySelector('[data-geste-clavier="lot-conclure"]')!;
    const iterer = document.querySelector('[data-geste-clavier="lot-iterer"]')!;
    expect([conclure.getAttribute('aria-keyshortcuts'), conclure.querySelector('kbd')?.textContent]).toEqual([vue('lot-conclure').aria, 'C']);
    expect([iterer.getAttribute('aria-keyshortcuts'), iterer.querySelector('kbd')?.textContent]).toEqual([vue('lot-iterer').aria, 'T']);
    expect(iterer.getAttribute('href')).toBe(OUVERT_ITERER.href);
    await cliquer(conclure);
    expect(document.activeElement?.id, 'le clic ne mène pas à « Conclure le lot »').toBe('conclure');
    expect(window.location.hash).toBe('#conclure');
    await cliquer(iterer);
    expect(h.push.mock.calls).toEqual([[OUVERT_ITERER.href]]);
    expect(h.ecrire).not.toHaveBeenCalled();
  });

  it('fermé · un bouton `aria-disabled`, la raison à côté (décrite), le clic la dit comme la touche', async () => {
    await coquille(page(<RaccourcisLot conclure={FERME_CONCLURE} iterer={OUVERT_ITERER} />));
    const b = document.querySelector('button[data-geste-clavier="lot-conclure"]')!;
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(b.getAttribute('aria-describedby')!)?.textContent).toBe(RAISON_GESTE_RIEN_A_CONCLURE);
    await cliquer(b);
    const parClic = toast();
    expect(parClic).toBe(messageRaccourciFerme(RACCOURCIS.find((r) => r.id === 'lot-conclure')!, RAISON_GESTE_RIEN_A_CONCLURE));
    await touche('c', {}, document.body);
    expect(toast(), 'la touche et le clic ne disent pas la même chose').toBe(parClic);
  });

  it('coupés · plus de touche dessinée ni promise · les gestes restent cliquables', async () => {
    document.cookie = 'tt_raccourcis=0; path=/';
    await coquille(page(<RaccourcisLot conclure={FERME_CONCLURE} iterer={OUVERT_ITERER} />), donnees(COUPES));
    for (const id of ['lot-conclure', 'lot-iterer']) {
      const el = document.querySelector(`[data-geste-clavier="${id}"]`)!;
      expect(el.getAttribute('aria-keyshortcuts'), `${id} · promis coupé`).toBeNull();
      expect(el.querySelector('kbd'), `${id} · dessiné coupé`).toBeNull();
    }
    await touche('t', {}, document.body);
    expect(h.push, 'T part coupé').not.toHaveBeenCalled();
    await cliquer(document.querySelector('[data-geste-clavier="lot-iterer"]'));
    expect(h.push.mock.calls).toEqual([[OUVERT_ITERER.href]]);
  });
});

/* ───────────── 3 · la fiche d'un test · T et L ───────────── */

const LOT_ID = '22222222-2222-4222-8222-222222222222';
const LOT_OUVERT = { href: lienLotSpatial(LOT_ID), numero: 3, raison: null };
const ficheTest = (iterer: GesteClavierLot, lot: GesteClavierLot & { numero: number | null }) => page(<>
  <RaccourcisTest iterer={iterer} lot={lot} />
  <textarea aria-label="Ce que ce test t’apprend" data-champ="" />
</>);

describe('Lot 13 ter · la fiche d’un test · T et L, une navigation', () => {
  it('T ouvre Itérer pré-rempli, L la fiche du lot · touches dessinées et promises (table) · rien d’écrit', async () => {
    await coquille(ficheTest(OUVERT_ITERER, LOT_OUVERT));
    const it_ = document.querySelector('[data-geste-clavier="test-iterer"]')!;
    const lot = document.querySelector('[data-geste-clavier="test-lot"]')!;
    expect([it_.getAttribute('aria-keyshortcuts'), it_.querySelector('kbd')?.textContent]).toEqual([vue('test-iterer').aria, 'T']);
    expect([lot.getAttribute('aria-keyshortcuts'), lot.querySelector('kbd')?.textContent]).toEqual([vue('test-lot').aria, 'L']);
    expect(lot.textContent).toContain('Voir son lot · #3');
    const t = await touche('t', {}, document.body);
    expect(t.defaultPrevented).toBe(true);
    await touche('l', {}, document.body);
    expect(h.push.mock.calls, 'T puis L ne mènent pas où il faut').toEqual([[OUVERT_ITERER.href], [lienLotSpatial(LOT_ID)]]);
    expect(h.ecrire, 'une touche a écrit').not.toHaveBeenCalled();
  });

  it('fermés · la raison dite (toast) et écrite à côté · rien ne part', async () => {
    await coquille(ficheTest({ href: null, raison: RAISON_ITERER_TEST_SANS_GAGNANTE }, { href: null, numero: null, raison: RAISON_TEST_HORS_LOT }));
    await touche('t', {}, document.body);
    expect(toast()).toBe(messageRaccourciFerme(RACCOURCIS.find((r) => r.id === 'test-iterer')!, RAISON_ITERER_TEST_SANS_GAGNANTE));
    await touche('l', {}, document.body);
    expect(toast()).toBe(messageRaccourciFerme(RACCOURCIS.find((r) => r.id === 'test-lot')!, RAISON_TEST_HORS_LOT));
    expect(document.querySelector('[data-raison-ferme="test-lot"]')?.textContent).toBe(RAISON_TEST_HORS_LOT);
    expect(document.querySelector('[data-geste-clavier="test-lot"]')?.textContent, 'sans lot, pas de numéro inventé').not.toContain('#');
    expect(h.push).not.toHaveBeenCalled();
  });

  it('ignorées dans un champ, sous une fenêtre modale (l’aide « ? »), et coupées par le cookie', async () => {
    await coquille(ficheTest(OUVERT_ITERER, LOT_OUVERT));
    const champ = document.querySelector('[data-champ]')!;
    (champ as HTMLElement).focus();
    const ev = await touche('t', {}, champ);
    expect(ev.defaultPrevented, 'la frappe est volée au champ').toBe(false);
    await touche('l', {}, champ);
    expect(h.push, 'T ou L parti depuis un champ').not.toHaveBeenCalled();
    await cliquer(document.getElementById('raccourcis-aide'));
    expect(document.querySelector('[aria-modal="true"]')).not.toBeNull();
    await touche('l', {}, document.getElementById('raccourcis'));
    expect(h.push, 'L parti sous la fenêtre d’aide').not.toHaveBeenCalled();
    await act(async () => { (document.querySelector('[data-fermer-raccourcis]') as HTMLElement).click(); });
    document.cookie = 'tt_raccourcis=0; path=/';
    await touche('t', {}, document.body);
    expect(h.push, 'T parti coupé').not.toHaveBeenCalled();
    expect(h.ecrire).not.toHaveBeenCalled();
  });
});

/* ───────────── 4 · la liste des lots · ↓ ↑ ───────────── */

const IMG = 'https://cdn.exemple.test/v.jpg';
const ligne = (id: string, etat: LigneLot['etat'], libelle: string): LigneLot => ({
  id, etat, titre: `Lot ${id}`, hypothese: null, categorie: 'Accroche', statut: { libelle, classe: 'g' }, anneau: { part: 50, libelle: 'J6', classe: 'g' },
  action: { libelle: 'Conclure', href: `/adsmap/lots/${id}`, primaire: true }, pubs: [{ texte: ' ', image: IMG }], mesure: 'Meta',
});
const LOTS: LigneLot[] = [ligne('l1', 'a_conclure', 'À conclure'), ligne('l2', 'diffusion', 'En diffusion'), ligne('l3', 'a_conclure', 'À conclure'), ligne('l4', 'a_conclure', 'À conclure')];
const liens = () => [...document.querySelectorAll<HTMLAnchorElement>('[data-lot-lien]')];
const filtre = (libelle: string) => [...document.querySelectorAll('.seg button')].find((b) => b.textContent?.startsWith(libelle))!;

describe('Lot 13 ter · « À conclure » · ↓ ↑ d’un lot à l’autre, dans l’ordre de la liste', () => {
  it('filtre « À conclure » · ↓ suivant, ↑ précédent, bornes dites, focus sur le lien du lot (Entrée l’ouvre)', async () => {
    await coquille(<Lots sousNav={[]} sous="4 lots" lots={LOTS} peutCreer note="n" />);
    await cliquer(filtre('À conclure'));
    expect(liens().map((a) => a.dataset.lotLien), 'le filtre « À conclure »').toEqual(['l1', 'l3', 'l4']);
    liens()[0]!.focus();
    const ev = await touche('ArrowDown');
    expect(ev.defaultPrevented).toBe(true);
    expect((document.activeElement as HTMLElement).dataset.lotLien, '↓ ne passe pas au lot suivant DE LA LISTE').toBe('l3');
    await touche('ArrowDown');
    expect((document.activeElement as HTMLElement).dataset.lotLien).toBe('l4');
    await touche('ArrowDown');
    expect((document.activeElement as HTMLElement).dataset.lotLien, 'la liste boucle').toBe('l4');
    expect(toast()).toBe(messageBorneListeLots('dernier', 3));
    await touche('ArrowUp'); await touche('ArrowUp');
    expect((document.activeElement as HTMLElement).dataset.lotLien).toBe('l1');
    await touche('ArrowUp');
    expect(toast()).toBe(messageBorneListeLots('premier', 3));
    // Entrée · le lien natif du lot (touche de composant) · le lien porte son lot, décrit par son titre.
    const a = document.activeElement as HTMLAnchorElement;
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('/adsmap/lots/l1');
    expect(document.getElementById(a.getAttribute('aria-describedby')!)?.textContent).toBe('Lot l1');
    expect(h.ecrire).not.toHaveBeenCalled();
  });

  it('l’aide sous la liste dit ↓ ↑ (table) · coupés, elles restent (flèches) · une liste d’un lot ne la montre pas', async () => {
    document.cookie = 'tt_raccourcis=0; path=/';
    await coquille(<Lots sousNav={[]} sous="4 lots" lots={LOTS} peutCreer note="n" />, donnees(COUPES));
    const aide = document.querySelector('[data-aide-liste-lots]')!;
    expect([...aide.querySelectorAll('kbd')].map((k) => [k.getAttribute('data-touche'), k.textContent])).toEqual([['liste-lot-suivant', vue('liste-lot-suivant', COUPES).touches.join(' ')], ['liste-lot-precedent', '↑']]);
    expect(aide.querySelector('kbd')?.getAttribute('aria-hidden'), 'une touche d’aide sans contrôle doit être lue').toBeNull();
    liens()[0]!.focus();
    await touche('ArrowDown');
    expect((document.activeElement as HTMLElement).dataset.lotLien, 'les flèches coupées à tort').toBe('l2');
    act(() => racine?.unmount());
    await coquille(<Lots sousNav={[]} sous="1 lot" lots={LOTS.slice(0, 1)} peutCreer note="n" />);
    expect(document.querySelector('[data-aide-liste-lots]')).toBeNull();
  });

  it('jamais dans un champ (« Nouveau lot ») ni hors d’un lot · rien n’est créé', async () => {
    await coquille(<Lots sousNav={[]} sous="4 lots" lots={LOTS} peutCreer note="n" />);
    await cliquer([...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Nouveau lot'))!);
    const champ = document.querySelector('textarea[aria-label="Objectif du lot"]') as HTMLTextAreaElement;
    champ.focus();
    const ev = await touche('ArrowDown', {}, champ);
    expect(ev.defaultPrevented, 'la flèche est volée au champ').toBe(false);
    expect(document.activeElement).toBe(champ);
    const ev2 = await touche('ArrowDown', {}, document.body);
    expect(ev2.defaultPrevented, 'la page ne défile plus').toBe(false);
    expect(h.ecrire, 'une flèche a créé un lot').not.toHaveBeenCalled();
  });
});

/* ───────────── 5 · aucune touche écrite à la main ───────────── */

const RACINE = join(__dirname, '..', 'spatial');
function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}
/** Les fichiers qui DESSINENT une touche · le composant partagé, l'aide « ? » (la table entière) et l'astuce de l'Accueil (lue dans la table). */
const KBD_PERMIS = ['communs/touches.tsx', 'coquille/Raccourcis.tsx', 'vues/accueil/Accueil.tsx'];

describe('Lot 13 ter · garde de source · touches et `aria-keyshortcuts` viennent de la table', () => {
  const sources = fichiers(RACINE).map((f) => ({ rel: relative(RACINE, f).split('\\').join('/'), src: readFileSync(f, 'utf8') }));
  it('aucun `aria-keyshortcuts` littéral dans les vues', () => {
    const litteraux = sources.flatMap(({ rel, src }) => [...src.matchAll(/aria-keyshortcuts=(?:"[^"]*"|\{[^}]*['"`][^}]*\})/g)].map((m) => `${rel} · ${m[0]}`));
    expect(litteraux, 'aria-keyshortcuts écrit à la main · le lire dans la table (useToucheVisible)').toEqual([]);
    // Le motif voit ce qu'il doit voir.
    expect('aria-keyshortcuts="J"'.match(/aria-keyshortcuts=(?:"[^"]*"|\{[^}]*['"`][^}]*\})/)).not.toBeNull();
    expect(`aria-keyshortcuts={sens === 'a' ? 'ArrowLeft' : 'ArrowRight'}`.match(/aria-keyshortcuts=(?:"[^"]*"|\{[^}]*['"`][^}]*\})/)).not.toBeNull();
    expect('aria-keyshortcuts={t?.aria}'.match(/aria-keyshortcuts=(?:"[^"]*"|\{[^}]*['"`][^}]*\})/)).toBeNull();
  });
  it('un `<kbd>` seulement dans le composant partagé, l’aide et l’astuce de l’Accueil', () => {
    const hors = sources.filter(({ rel, src }) => /<kbd\b/.test(src) && !KBD_PERMIS.includes(rel)).map((x) => x.rel);
    expect(hors, 'un <kbd> écrit à la main · passer par <Touche> (communs/touches.tsx)').toEqual([]);
    for (const f of KBD_PERMIS) expect(sources.some((x) => x.rel === f && /<kbd\b/.test(x.src)), `${f} ne dessine plus de touche · retire-le de la liste`).toBe(true);
  });
});
