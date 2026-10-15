// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Modal, PiedModale } from '../components/Modal';

const actions = vi.hoisted(() => ({ saveProfileAction: vi.fn(), saveWorkspaceNameAction: vi.fn() }));
vi.mock('../app/actions/admin', () => actions);
const { ProfileModal } = await import('../components/ProfileModal');
const { QuickSettingsModal } = await import('../components/QuickSettingsModal');

/**
 * Lot V5 · A3 · la fenêtre modale selon la V5, prouvée au RENDU.
 *
 * On monte la VRAIE `Modal` (portail sur <body>, piège à focus partagé) dans
 * jsdom, derrière un vrai bouton déclencheur, et on lit ce qui en sort · le DOM,
 * `document.activeElement`, les styles posés, les avertissements de React.
 *
 *  1. Échap, clic sur le voile, × ferment · un clic DANS la fenêtre ne ferme pas.
 *  2. Le focus revient au déclencheur à la fermeture.
 *  3. Le Tab reste dans la fenêtre (pied compris).
 *  4. Le pied est HORS du conteneur qui défile · il reste visible quand le
 *     corps déborde (mesure de structure · jsdom ne fait pas de mise en page).
 *  5. Sous 600 px, la feuille est ancrée en bas · au-dessus, centrée.
 *  6. Le défilement de la page est bloqué pendant l'ouverture, puis rendu.
 *  7. Aucun avertissement React de style en conflit (raccourci + longhand) en
 *     passant d'une présentation à l'autre.
 *  8. Profil et Réglages rapides · le bouton « Enregistrer », passé dans le pied
 *     collant (hors du <form>), soumet TOUJOURS le formulaire (attribut `form`).
 *
 * jsdom ne fait aucune mise en page · `offsetParent` y est toujours `null`, ce
 * qui masquerait tous les focusables au filtre du piège. On le rétablit sur les
 * éléments attachés (leur parent), comme `piege-focus.test.tsx`.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let offsetOrigine: PropertyDescriptor | undefined;
beforeAll(() => {
  offsetOrigine = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) { return this.parentNode as Element | null; },
  });
});
afterAll(() => {
  if (offsetOrigine) Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', offsetOrigine);
});

// Une largeur d'écran pilotable · `matchMedia` suit la largeur et prévient ses écouteurs.
let largeur = 1280;
const ecouteurs = new Set<() => void>();
function installerMatchMedia() {
  window.matchMedia = ((q: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(q)?.[1] ?? 0);
    return {
      get matches() { return largeur <= max; },
      media: q, onchange: null,
      addEventListener: (_: string, f: () => void) => { ecouteurs.add(f); },
      removeEventListener: (_: string, f: () => void) => { ecouteurs.delete(f); },
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
}
const changerLargeur = (w: number) => act(() => { largeur = w; ecouteurs.forEach((f) => f()); });

let hote: HTMLDivElement;
let root: Root;
beforeEach(() => {
  largeur = 1280;
  ecouteurs.clear();
  installerMatchMedia();
  vi.useFakeTimers();
});
afterEach(() => {
  act(() => root.unmount());
  hote.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function Banc({ long = false, plein = false }: { long?: boolean; plein?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div>
      <button id="declencheur" type="button" onClick={() => setOuvert(true)}>Ouvrir</button>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Mon profil" subtitle="Banc" pleinEcranTelephone={plein}
        pied={<PiedModale><button id="annuler" type="button">Annuler</button><button id="valider" type="button">Enregistrer</button></PiedModale>}>
        <button id="champ" type="button">Champ</button>
        {long && Array.from({ length: 60 }, (_, i) => <p key={i}>Ligne {i + 1} d’un contenu long qui fait déborder le corps.</p>)}
      </Modal>
    </div>
  );
}

function monter(props: { long?: boolean; plein?: boolean } = {}) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
  act(() => root.render(<Banc {...props} />));
}
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const dialogue = () => $('[role="dialog"]');
/** Le geste réel · focus sur le déclencheur, clic, puis le piège porte le focus dedans. */
function ouvrir() {
  const d = $<HTMLButtonElement>('#declencheur')!;
  act(() => { d.focus(); d.click(); });
  act(() => { vi.advanceTimersByTime(1200); });
}
const touche = (init: KeyboardEventInit) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init })); });

describe('A3 · Modal V5 · fermeture', () => {
  it('Échap ferme la fenêtre', () => {
    monter(); ouvrir();
    expect(dialogue(), 'la fenêtre ne s’ouvre pas').not.toBeNull();
    touche({ key: 'Escape' });
    expect(dialogue(), 'Échap ne ferme pas la fenêtre').toBeNull();
  });

  it('un clic sur le voile ferme, un clic DANS la fenêtre ne ferme pas', () => {
    monter(); ouvrir();
    act(() => { dialogue()!.click(); });
    expect(dialogue(), 'un clic dans la fenêtre l’a fermée').not.toBeNull();
    act(() => { $('[data-modale-voile]')!.click(); });
    expect(dialogue(), 'le clic sur le voile ne ferme pas la fenêtre').toBeNull();
  });

  it('la croix, nommée « Fermer », ferme la fenêtre', () => {
    monter(); ouvrir();
    const x = $<HTMLButtonElement>('[role="dialog"] button[aria-label="Fermer"]');
    expect(x, 'la croix n’a pas de nom accessible « Fermer »').not.toBeNull();
    act(() => { x!.click(); });
    expect(dialogue(), 'la croix ne ferme pas la fenêtre').toBeNull();
  });
});

describe('A3 · Modal V5 · focus', () => {
  it('à l’ouverture le focus entre dans la fenêtre, à la fermeture il REVIENT au déclencheur', () => {
    monter(); ouvrir();
    expect(dialogue()!.contains(document.activeElement), 'le focus n’est pas entré dans la fenêtre').toBe(true);
    touche({ key: 'Escape' });
    expect(document.activeElement?.id, 'le focus n’est pas rendu au déclencheur après Échap').toBe('declencheur');
    ouvrir();
    act(() => { $<HTMLButtonElement>('button[aria-label="Fermer"]')!.click(); });
    expect(document.activeElement?.id, 'le focus n’est pas rendu au déclencheur après ×').toBe('declencheur');
  });

  it('le Tab reste dans la fenêtre · du dernier (pied) au premier (×), et retour', () => {
    monter(); ouvrir();
    act(() => { $<HTMLButtonElement>('#valider')!.focus(); });
    touche({ key: 'Tab' });
    expect(document.activeElement?.getAttribute('aria-label'), 'Tab depuis le dernier bouton du pied sort de la fenêtre').toBe('Fermer');
    touche({ key: 'Tab', shiftKey: true });
    expect(document.activeElement?.id, 'Maj+Tab depuis la croix sort de la fenêtre').toBe('valider');
  });
});

describe('A3 · Modal V5 · structure et présentation', () => {
  it('le pied est HORS du conteneur qui défile · seul le corps défile, en-tête et pied ne rétrécissent pas', () => {
    monter({ long: true }); ouvrir();
    const d = dialogue()!;
    const corps = d.querySelector<HTMLElement>('[data-modale-corps]')!;
    const pied = d.querySelector<HTMLElement>('[data-modale-pied]')!;
    const entete = d.querySelector<HTMLElement>('[data-modale-entete]')!;
    expect(pied, 'pas de pied rendu').not.toBeNull();
    expect(pied.textContent).toContain('Enregistrer');
    // Le panneau est une colonne bornée en hauteur · c'est ce qui fait défiler le corps.
    expect(d.style.display).toBe('flex');
    expect(d.style.flexDirection).toBe('column');
    expect(d.style.maxHeight, 'le panneau n’est pas borné en hauteur').not.toBe('');
    expect(d.style.overflow).toBe('hidden');
    // Le corps défile et peut rétrécir · le pied et l'en-tête non.
    expect(corps.style.overflowY, 'le corps ne défile pas').toBe('auto');
    expect(corps.style.minHeight, 'le corps ne peut pas rétrécir sous son contenu').toBe('0px');
    expect(corps.contains(pied), 'le pied est DANS la zone qui défile · il disparaît quand le corps déborde').toBe(false);
    expect(pied.parentElement, 'le pied n’est pas un enfant direct du panneau').toBe(d);
    expect(pied.style.flexShrink, 'le pied peut être écrasé par le corps').toBe('0');
    expect(entete.style.flexShrink, 'l’en-tête peut être écrasé par le corps').toBe('0');
    // Le contenu du corps n'est jamais écrasé par la colonne · il défile.
    const enveloppe = corps.firstElementChild as HTMLElement;
    expect(enveloppe.style.flexShrink, 'le contenu du corps peut être écrasé').toBe('0');
    expect(enveloppe.textContent).toContain('Ligne 60');
    // L'ordre visuel · en-tête, corps, pied.
    const enfants = [...d.children];
    expect(enfants.indexOf(entete)).toBeLessThan(enfants.indexOf(corps));
    expect(enfants.indexOf(corps)).toBeLessThan(enfants.indexOf(pied));
  });

  it('au-dessus de 600 px · fenêtre centrée sur un voile, marges V5 (24/28)', () => {
    largeur = 1280;
    monter({ long: true }); ouvrir();
    const d = dialogue()!;
    const voile = $('[data-modale-voile]')!;
    expect(d.getAttribute('data-presentation')).toBe('centree');
    expect(voile.style.alignItems, 'la fenêtre n’est pas centrée verticalement').toBe('center');
    expect(voile.style.position).toBe('fixed');
    // Un voile plein écran translucide · soit un rgba littéral, soit la teinte
    // d'un jeton de voile (V5 · T1 · `teinte('voile-teinte', …)`). On vérifie la
    // PRÉSENCE du voile, pas une couleur en dur.
    expect(voile.style.background, 'pas de voile').toMatch(/rgba\(|color-mix\([^;]*var\(--voile/);
    expect(d.querySelector<HTMLElement>('[data-modale-corps]')!.style.padding).toBe('24px 28px 0px');
    expect(d.querySelector<HTMLElement>('[data-modale-pied]')!.style.padding).toBe('14px 28px 18px');
    expect(d.querySelector('[data-modale-poignee]'), 'une poignée de feuille sur une fenêtre centrée').toBeNull();
  });

  it('sous 600 px · la feuille est ancrée EN BAS, pleine largeur, coins hauts arrondis, poignée', () => {
    largeur = 1280;
    monter({ long: true }); ouvrir();
    changerLargeur(600);
    const d = dialogue()!;
    const voile = $('[data-modale-voile]')!;
    expect(d.getAttribute('data-presentation'), 'à 600 px la fenêtre n’est pas une feuille').toBe('feuille');
    expect(voile.style.alignItems, 'la feuille n’est pas ancrée en bas').toBe('flex-end');
    expect(voile.style.padding, 'la feuille ne touche pas le bas de l’écran').toBe('0px');
    expect(d.style.maxWidth, 'la feuille ne prend pas toute la largeur').toBe('none');
    expect(d.style.borderRadius, 'les coins bas de la feuille sont arrondis').toMatch(/ 0px 0px$| 0 0$/);
    expect(d.querySelector('[data-modale-poignee]'), 'pas de poignée sur la feuille').not.toBeNull();
    expect(d.querySelector<HTMLElement>('[data-modale-corps]')!.style.padding).toBe('18px 18px 0px');
    // Et 601 px repasse en fenêtre centrée · le seuil est celui du prototype.
    changerLargeur(601);
    expect(dialogue()!.getAttribute('data-presentation')).toBe('centree');
    expect($('[data-modale-voile]')!.style.alignItems).toBe('center');
  });

  it('le défilement de la page est bloqué pendant l’ouverture, puis rendu', () => {
    document.body.style.overflow = '';
    monter(); ouvrir();
    expect(document.body.style.overflow, 'la page défile derrière la fenêtre').toBe('hidden');
    touche({ key: 'Escape' });
    expect(document.body.style.overflow, 'la page reste bloquée après la fermeture').toBe('');
  });
});

describe('A3 · Modal V5 · aucun style en conflit', () => {
  it('passer centrée → feuille → plein écran → centrée ne lève aucun avertissement React de style en conflit', () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    monter({ long: true, plein: true }); ouvrir();
    changerLargeur(560);
    changerLargeur(390);
    changerLargeur(1280);
    changerLargeur(390);
    touche({ key: 'Escape' });
    const conflits = erreurs.mock.calls.map((a) => a.map(String).join(' ')).filter((m) => /conflicting property/.test(m));
    expect(conflits, `avertissement React · style raccourci et longhand mêlés : ${conflits.join(' | ')}`).toEqual([]);
  });
});

describe('A3 · pied collant · le bouton d’envoi hors du <form> soumet toujours', () => {
  function monterNoeud(n: Parameters<Root['render']>[0]) {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    root = createRoot(hote);
    act(() => root.render(n));
  }
  const enregistrer = () => [...document.querySelectorAll<HTMLButtonElement>('[data-modale-pied] button')].find((b) => b.textContent?.trim() === 'Enregistrer');
  const soumettre = async () => {
    const b = enregistrer();
    expect(b, 'le bouton « Enregistrer » n’est pas dans le pied collant').toBeTruthy();
    expect(b!.closest('form'), 'le bouton du pied est resté dans le formulaire (il défile avec le corps)').toBeNull();
    await act(async () => { b!.click(); for (let i = 0; i < 6; i++) await Promise.resolve(); });
  };

  it('Mon profil · « Enregistrer » du pied envoie le nom saisi', async () => {
    actions.saveProfileAction.mockReset().mockResolvedValue({ ok: true });
    const fermer = vi.fn();
    monterNoeud(<ProfileModal open onClose={fermer} init={{ name: 'Kévin', email: 'k@exemple.invalid', avatarUrl: '', hidePersonalInfo: false }} />);
    await soumettre();
    expect(actions.saveProfileAction, 'le bouton du pied ne soumet pas le formulaire du profil').toHaveBeenCalledTimes(1);
    expect((actions.saveProfileAction.mock.calls[0]![1] as FormData).get('name')).toBe('Kévin');
    expect(fermer).toHaveBeenCalled();
  });

  it('Réglages rapides · « Enregistrer » du pied envoie le nom de l’espace', async () => {
    actions.saveWorkspaceNameAction.mockReset().mockResolvedValue({ ok: true });
    monterNoeud(<QuickSettingsModal open onClose={() => {}} workspaceName="Espace démo" showAdvanced />);
    await soumettre();
    expect(actions.saveWorkspaceNameAction, 'le bouton du pied ne soumet pas le formulaire des réglages').toHaveBeenCalledTimes(1);
    expect((actions.saveWorkspaceNameAction.mock.calls[0]![1] as FormData).get('name')).toBe('Espace démo');
  });
});
