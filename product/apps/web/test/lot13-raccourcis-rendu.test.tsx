// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { DELAI_SEQUENCE_MS, RACCOURCIS, PORTEES_RACCOURCIS, entreesRail, entreesRailEspace, touchesAffichees } from '@tiktrends/core';

/**
 * Lot 13 V5 · raccourcis clavier et aide · prouvés en RENDANT la vraie
 * coquille (jsdom) · on tape des touches sur `window`, on lit le DOM (palette,
 * tiroir, fenêtre d'aide, rail, toast) et les navigations demandées ·
 * jamais « une fonction est appelée quelque part ».
 */

const h = vi.hoisted(() => ({
  chemin: '/dashboard',
  push: vi.fn(), refresh: vi.fn(),
  thread: vi.fn(async () => ({ thread: { turns: [], starters: [], measuredAds: 0, brandName: 'Neva', contexte: {}, conversationId: null, conversations: [] } })),
}));
vi.mock('@tiktrends/db', () => ({ db: undefined, schema: {} }));
vi.mock('next/navigation', () => ({ usePathname: () => h.chemin, useRouter: () => ({ push: h.push, refresh: h.refresh }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/brands', () => ({ setActiveBrand: vi.fn(async () => {}) }));
vi.mock('../app/actions/notifications', () => ({ fetchNotifications: vi.fn(async () => ({ items: [], unread: 0 })), markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn() }));
vi.mock('../app/actions/studios/projets', () => ({ listerProjets: vi.fn(async () => ({ ok: true, projets: [] })) }));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: h.thread }));
// Ce qui scale (le « / » respecte la coupure) · ses actions, jamais appelées ici.
vi.mock('../app/actions/inspo', () => ({ saveAd: vi.fn(), unsaveAd: vi.fn(), followBrand: vi.fn(), unfollowBrand: vi.fn(), setSavedAdFolder: vi.fn() }));
vi.mock('../app/actions/adsmap-hypotheses', () => ({ creerHypotheseAction: vi.fn(), completerHypotheseAction: vi.fn() }));
vi.mock('../app/actions/veille-vues', () => ({ garderVueVeille: vi.fn(), renommerVueVeilleAction: vi.fn(), supprimerVueVeille: vi.fn() }));
vi.mock('../app/actions/brief-marque', () => ({ briefMarqueAction: vi.fn() }));
vi.mock('../app/actions/tracker', () => ({ markTrackerSeenAction: vi.fn(), scanTrackerAction: vi.fn() }));
vi.mock('../app/actions/decouverte', () => ({ decouverteMarcheAction: vi.fn() }));
vi.mock('../app/actions/layout-marche', () => ({ grammaireCategorieAction: vi.fn() }));
vi.mock('../app/actions/video-marche', () => ({ grammaireVideoAction: vi.fn() }));

const { Coquille } = await import('../spatial/coquille/Coquille');
const { BoutonAideRaccourcis } = await import('../spatial/coquille/Raccourcis');
const { ScaleInteractif } = await import('../spatial/vues/veille/scale-client');
const { Profil } = await import('../spatial/vues/reglages/Profil');
type DonneesCoquille = import('../spatial/coquille/Coquille').DonneesCoquille;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root | null = null;
let hote: HTMLDivElement;
const effacerCookies = () => { for (const n of ['tt_raccourcis', 'tt_rail']) document.cookie = `${n}=; path=/; max-age=0`; };
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); vi.clearAllMocks(); effacerCookies(); });
afterEach(() => { act(() => racine?.unmount()); racine = null; hote.remove(); document.body.className = ''; effacerCookies(); vi.restoreAllMocks(); });

const monter = async (n: React.ReactNode) => { await act(async () => { racine = createRoot(hote); racine.render(n); }); };
/** Une frappe sur la cible (le focus, sinon `body`) · elle remonte jusqu'à `window`, comme au clavier. */
const touche = async (key: string, o: KeyboardEventInit = {}, cible: Element | null = document.activeElement) => {
  await act(async () => { (cible ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o })); });
};
const attendre = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const aide = () => document.getElementById('raccourcis');
const toast = () => document.getElementById('toast')?.textContent ?? '';

const TOUS = ['/studio/projets', '/veille', '/adsmap', '/adsmap/import', '/assets', '/jarvis', '/brands', '/settings'];
function donnees(ouvertes: string[] = TOUS, jarvis = true): DonneesCoquille {
  const ouverts = new Set(ouvertes);
  const marque = { id: 'b1', nom: 'Neva' };
  return {
    entrees: entreesRail({ ouverts, marque }), espace: entreesRailEspace({ ouverts, marque }),
    marque: { ...marque, logoUrl: null, imageUrl: null }, marques: [{ id: 'b1', nom: 'Neva' }],
    peutGererMarques: true, admin: false, passer: null, railOuvert: true,
    utilisateur: { nom: 'Kevin', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, espaceNom: 'GLX',
    credits: { solde: 10, dotation: 100, illimite: false }, nonLues: 0, deconnexion: async () => {},
    ouverts: [...ouverts], jarvis, demarrage: null,
  };
}
const coquille = (d = donnees(), enfants: React.ReactNode = <button id="avant" type="button">avant</button>) => monter(<Coquille donnees={d}>{enfants}</Coquille>);
const focaliser = (id: string) => { (document.getElementById(id) as HTMLElement).focus(); };

describe('Lot 13 · chaque raccourci de la coquille déclenche son action', () => {
  it('Ctrl K ouvre la recherche · « ? » l’aide · J le tiroir Jarvis · [ replie le rail (cookie, annonce)', async () => {
    await coquille();
    await touche('k', { ctrlKey: true });
    expect(document.getElementById('pal'), 'Ctrl K n’ouvre pas la recherche').not.toBeNull();
    await touche('Escape');
    await attendre();
    await touche('?', { shiftKey: true });
    expect(aide()?.getAttribute('role'), '« ? » n’ouvre pas l’aide').toBe('dialog');
    await touche('Escape');
    await attendre();
    await touche('j');
    expect(document.getElementById('jdraw')?.hidden, 'J n’ouvre pas le tiroir Jarvis').toBe(false);
    expect(document.body.classList.contains('jd-open')).toBe(true);
    await touche('Escape');
    await attendre();
    expect(document.body.classList.contains('rail-open')).toBe(true);
    await touche('[');
    expect(document.body.classList.contains('rail-open'), '[ ne replie pas le rail').toBe(false);
    expect(document.cookie).toContain('tt_rail=1');
    expect(toast()).toBe('Menu réduit');
    await touche('[');
    expect(document.body.classList.contains('rail-open')).toBe(true);
    expect(toast()).toBe('Menu déployé');
  });

  it('« g » puis une lettre mène à la section du rail · N et I aux pages d’action', async () => {
    await coquille();
    const attendu: Record<string, string> = { accueil: '/dashboard', studios: '/studio/projets', veille: '/veille', resultats: '/adsmap', bibliotheque: '/assets', jarvis: '/jarvis', marque: '/brands/b1' };
    for (const r of RACCOURCIS.filter((x) => x.portee === 'aller')) {
      h.push.mockClear();
      const [g, lettre] = r.touches[0]!;
      await touche(g!);
      await touche(lettre!);
      const section = r.action?.type === 'aller' ? r.action.section : '';
      expect(h.push.mock.calls, `${r.id} ne mène pas à ${attendu[section]}`).toEqual([[attendu[section]]]);
    }
    h.push.mockClear();
    await touche('n');
    await touche('i');
    expect(h.push.mock.calls).toEqual([['/studio/projets/nouveau'], ['/adsmap/import']]);
    expect(Object.keys(attendu).length, 'une section « aller » n’est pas éprouvée').toBe(RACCOURCIS.filter((x) => x.portee === 'aller').length);
  });

  it('les droits ne bougent pas · une section ou une page fermée ne s’ouvre pas, le toast le dit', async () => {
    await coquille(donnees(['/veille'], false));
    await touche('j');
    expect(document.getElementById('jv')).toBeNull();
    expect(toast()).toBe('Demander à Jarvis sur cette page n’est pas ouvert à ton accès');
    await touche('g'); await touche('r');
    expect(toast(), '« g » puis « r » ne dit pas que Résultats est fermé').toBe('Résultats n’est pas ouvert à ton accès');
    await touche('i');
    expect(toast(), 'Importer s’ouvre sans le droit').toBe('Importer des résultats n’est pas ouvert à ton accès');
    await touche('n');
    expect(h.push, 'une page fermée a été ouverte').not.toHaveBeenCalled();
    await touche('g'); await touche('v');
    expect(h.push.mock.calls).toEqual([['/veille']]);
  });

  it('« g » oublié après le délai · la lettre seule ne navigue pas (horloge simulée)', async () => {
    await coquille();
    const t0 = 1_000_000;
    const horloge = vi.spyOn(Date, 'now').mockReturnValue(t0);
    await touche('g');
    horloge.mockReturnValue(t0 + DELAI_SEQUENCE_MS + 1);
    await touche('a');
    expect(h.push, '« g » est gardé au-delà du délai').not.toHaveBeenCalled();
    await touche('g');
    horloge.mockReturnValue(t0 + DELAI_SEQUENCE_MS + 200);
    await touche('a');
    expect(h.push.mock.calls).toEqual([['/dashboard']]);
  });
});

describe('Lot 13 · jamais dans une saisie, un lecteur, ni avec un modificateur imprévu', () => {
  const Champs = () => (
    <>
      <input id="champ" />
      <textarea id="zone" />
      <div id="editable" contentEditable suppressContentEditableWarning tabIndex={0}><span id="dedans">texte</span></div>
      <video id="lecteur" tabIndex={0} />
      <button id="avant" type="button">avant</button>
    </>
  );
  it('dans un champ, une zone éditable ou le lecteur vidéo · rien ne part (Ctrl K oui, comme avant)', async () => {
    await coquille(donnees(), <Champs />);
    for (const id of ['champ', 'zone', 'editable', 'dedans', 'lecteur']) {
      const el = document.getElementById(id)!;
      for (const k of ['j', '?', '[', 'n', 'i']) await touche(k, {}, el);
      await touche('g', {}, el); await touche('a', {}, el);
      expect(aide(), `« ? » dans ${id}`).toBeNull();
      expect(document.getElementById('jdraw')?.hidden, `J dans ${id}`).toBe(true);
      expect(document.body.classList.contains('rail-open'), `[ dans ${id}`).toBe(true);
      expect(h.push, `navigation depuis ${id}`).not.toHaveBeenCalled();
    }
    await touche('k', { metaKey: true }, document.getElementById('champ'));
    expect(document.getElementById('pal'), 'Ctrl K ne marche plus dans un champ').not.toBeNull();
  });
  it('Ctrl J, ⌘ J, Alt J, Maj J, Ctrl ? · ignorés, et la touche reste au navigateur', async () => {
    await coquille();
    focaliser('avant');
    for (const o of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }] as KeyboardEventInit[]) {
      const ev = new KeyboardEvent('keydown', { key: o.shiftKey ? 'J' : 'j', bubbles: true, cancelable: true, ...o });
      await act(async () => { document.activeElement!.dispatchEvent(ev); });
      expect(ev.defaultPrevented, JSON.stringify(o)).toBe(false);
    }
    await touche('?', { ctrlKey: true });
    expect(document.getElementById('jdraw')?.hidden).toBe(true);
    expect(aide()).toBeNull();
  });
  it('une frappe déjà prise par une vue (← → de la Veille, Échap d’un menu) n’est pas reprise', async () => {
    const Vue = () => <button id="avant" type="button" onKeyDown={(e) => { if (e.key === 'j') e.preventDefault(); }}>vue</button>;
    await coquille(donnees(), <Vue />);
    focaliser('avant');
    await touche('j');
    expect(document.getElementById('jdraw')?.hidden).toBe(true);
  });
});

describe('Lot 13 · l’aide « ? » · la table entière, focus piégé, Échap rend le focus', () => {
  it('liste EXACTEMENT la table, groupée par portée, touches écrites depuis la table', async () => {
    await coquille();
    focaliser('avant');
    await touche('?', { shiftKey: true });
    const d = aide()!;
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)?.textContent).toBe('Raccourcis clavier');
    const lignes = [...d.querySelectorAll('[data-raccourci]')];
    expect(lignes.map((l) => l.getAttribute('data-raccourci')), 'l’aide ne liste pas la table').toEqual(PORTEES_RACCOURCIS.flatMap((p) => RACCOURCIS.filter((r) => r.portee === p.cle).map((r) => r.id)));
    expect([...d.querySelectorAll('section[data-portee] h3')].map((x) => x.textContent)).toEqual(PORTEES_RACCOURCIS.map((p) => p.libelle));
    for (const r of RACCOURCIS) {
      const l = d.querySelector(`[data-raccourci="${r.id}"]`)!;
      expect(l.closest('section')!.getAttribute('data-portee'), r.id).toBe(r.portee);
      expect(l.textContent, r.id).toContain(r.libelle);
      expect([...l.querySelectorAll('kbd')].map((k) => k.textContent), r.id).toEqual(r.touches.flatMap((s) => s.flatMap((a) => touchesAffichees(a))));
    }
  });

  it('le focus entre, Tab et Maj Tab tournent dans la fenêtre, le reste est inerte, Échap ferme et rend le focus', async () => {
    await coquille();
    focaliser('avant');
    await touche('?', { shiftKey: true });
    await attendre();
    const d = aide()!;
    expect(document.activeElement, 'le focus n’est pas entré dans l’aide').toBe(d);
    expect(document.querySelector('.app')!.hasAttribute('inert'), 'la coquille reste atteignable derrière l’aide').toBe(true);
    const f = [...d.querySelectorAll<HTMLElement>('button')];
    const premier = f[0]!; const dernier = f[f.length - 1]!;
    dernier.focus();
    await touche('Tab');
    expect(document.activeElement, 'Tab sort de la fenêtre').toBe(premier);
    await touche('Tab', { shiftKey: true });
    expect(document.activeElement, 'Maj Tab sort de la fenêtre').toBe(dernier);
    await touche('j');
    expect(document.getElementById('jdraw')?.hidden, 'une touche simple agit derrière la fenêtre modale').toBe(true);
    await touche('Escape');
    await attendre();
    expect(aide(), 'Échap ne ferme pas l’aide').toBeNull();
    expect(document.querySelector('.app')!.hasAttribute('inert')).toBe(false);
    expect(document.activeElement?.id, 'le focus n’est pas rendu').toBe('avant');
  });

  it('le bouton visible du rail ouvre l’aide · « Fermer » rend le focus au bouton', async () => {
    await coquille();
    const b = document.getElementById('raccourcis-aide') as HTMLButtonElement;
    expect(b.getAttribute('aria-label')).toBe('Raccourcis clavier');
    b.focus();
    await act(async () => { b.click(); });
    expect(aide()).not.toBeNull();
    expect(b.getAttribute('aria-expanded')).toBe('true');
    await act(async () => { (document.querySelector('[data-fermer-raccourcis]') as HTMLButtonElement).click(); });
    await attendre();
    expect(aide()).toBeNull();
    expect(document.activeElement).toBe(b);
  });

  it('le bouton d’une vue (Support, Mon profil) ouvre la même aide et récupère le focus', async () => {
    await coquille(donnees(), <BoutonAideRaccourcis />);
    const b = document.querySelector('[data-ouvrir-raccourcis]') as HTMLButtonElement;
    b.focus();
    await act(async () => { b.click(); });
    expect(aide()?.querySelectorAll('[data-raccourci]').length).toBe(RACCOURCIS.length);
    await touche('Escape');
    await attendre();
    expect(document.activeElement).toBe(b);
  });
});

describe('Lot 13 · la préférence de coupure (WCAG 2.1.4) · cookie tt_raccourcis', () => {
  it('coupés depuis l’aide · plus aucune touche simple, Ctrl K reste, le bouton ouvre toujours l’aide · rallumés, tout revient', async () => {
    await coquille();
    focaliser('avant');
    await touche('?', { shiftKey: true });
    const inter = aide()!.querySelector('[data-preference-raccourcis]') as HTMLButtonElement;
    expect(inter.getAttribute('role')).toBe('switch');
    expect(inter.getAttribute('aria-checked')).toBe('true');
    await act(async () => { inter.click(); });
    expect(inter.getAttribute('aria-checked')).toBe('false');
    expect(document.cookie).toContain('tt_raccourcis=0');
    expect(aide()!.querySelector('[role="status"]')?.textContent).toContain('coupés');
    await touche('Escape');
    await attendre();
    for (const k of ['?', 'j', '[', 'n', 'i']) await touche(k);
    await touche('g'); await touche('a');
    expect(aide(), '« ? » part malgré la coupure').toBeNull();
    expect(document.getElementById('jdraw')?.hidden, 'J part malgré la coupure').toBe(true);
    expect(document.body.classList.contains('rail-open'), '[ part malgré la coupure').toBe(true);
    expect(h.push, 'une navigation part malgré la coupure').not.toHaveBeenCalled();
    await touche('k', { metaKey: true });
    expect(document.getElementById('pal'), 'Ctrl K coupé à tort').not.toBeNull();
    await touche('Escape');
    await attendre();
    await act(async () => { (document.getElementById('raccourcis-aide') as HTMLButtonElement).click(); });
    expect(aide(), 'le bouton n’ouvre plus l’aide').not.toBeNull();
    await act(async () => { (aide()!.querySelector('[data-preference-raccourcis]') as HTMLButtonElement).click(); });
    await touche('Escape');
    await attendre();
    await touche('j');
    expect(document.getElementById('jdraw')?.hidden, 'rallumés, J ne revient pas').toBe(false);
  });

  it('un cookie déjà à « 0 » au montage est respecté', async () => {
    document.cookie = 'tt_raccourcis=0; path=/';
    await coquille();
    await touche('j'); await touche('?');
    expect(document.getElementById('jdraw')?.hidden).toBe(true);
    expect(aide()).toBeNull();
  });

  it('le « / » de Ce qui scale se tait aussi quand les raccourcis sont coupés', async () => {
    await monter(<ScaleInteractif lignes={[]} initial={{ type: 'all', annonceur: 'all', angle: 'all', texte: '', tri: 'duration' }} annonceurs={[]} angles={[]} />);
    const champ = () => document.querySelector('.tile[aria-label="Filtrer et trier"] input') as HTMLInputElement;
    document.cookie = 'tt_raccourcis=0; path=/';
    await touche('/', {}, document.body);
    expect(document.activeElement, '« / » vole le focus malgré la coupure').not.toBe(champ());
    document.cookie = 'tt_raccourcis=1; path=/';
    await touche('/', {}, document.body);
    expect(document.activeElement, '« / » ne marche plus une fois rallumé').toBe(champ());
  });

  it('« Mon profil » sert l’interrupteur dans l’état du cookie, et le bouton de l’aide', () => {
    const p = { identite: { nom: 'K', email: 'k@x.fr', avatar: '', masquer: false }, acces: { espace: 'GLX', role: 'Propriétaire', abonnement: 'Core' }, liens: [], enregistrer: null, changerMotDePasse: null, motDePasseMin: 8, retours: {} };
    const coupe = renderToStaticMarkup(<Profil {...p} raccourcis={false} />);
    expect(/<button[^>]*aria-checked="false"[^>]*data-preference-raccourcis/.test(coupe), 'l’interrupteur ne dit pas « coupés »').toBe(true);
    expect(/<button[^>]*aria-checked="true"[^>]*data-preference-raccourcis/.test(renderToStaticMarkup(<Profil {...p} raccourcis />))).toBe(true);
    expect(coupe).toContain('data-ouvrir-raccourcis');
    expect(renderToStaticMarkup(<Profil {...p} />)).not.toContain('data-preference-raccourcis');
  });
});
