// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { boutonAction, FERME, focaliserApres, pendantAction, replacerFocus, type OptionsBoutonAction } from '../spatial/vues/projet/action-serveur';
import * as ancien from '../spatial/vues/projet/focus';
import { Message } from '../spatial/vues/projet/briques';

/**
 * La brique « bouton d'action serveur » MONTÉE (jsdom) · on lit ce que le
 * doigt et le clavier rencontrent · où est le focus pendant l'action, ce que
 * dit le bouton, combien de fois le geste part · pas la présence d'un appel.
 * La règle elle-même est rejouée écran par écran dans le noyau
 * (`spatial-projet-bouton-action`).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null; let hote: HTMLDivElement | null = null;
afterEach(() => { act(() => root?.unmount()); hote?.remove(); root = null; hote = null; document.body.innerHTML = ''; vi.useRealTimers(); });
function monter(el: React.ReactElement) { hote = document.createElement('div'); document.body.appendChild(hote); root = createRoot(hote); act(() => root!.render(el)); }
const q = (s: string) => document.querySelector(s) as HTMLButtonElement;

/** Deux boutons d'un même geste · « A » lance une action serveur qui ne répond pas encore, « B » est son voisin. */
function Geste({ appel, options = {} }: { appel: () => Promise<void>; options?: Partial<OptionsBoutonAction> }) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const lancer = (cle: string) => { setEnCours(cle); void appel().finally(() => setEnCours(null)); };
  return (
    <div>
      <button className="btn" type="button" data-b="a" {...boutonAction({ ...options, presse: enCours === 'a', occupe: !!enCours, surClic: () => lancer('a') })}>{enCours === 'a' ? 'Envoi…' : 'Envoyer'}</button>
      <button className="btn" type="button" data-b="b" {...boutonAction({ ...options, presse: enCours === 'b', occupe: !!enCours, surClic: () => lancer('b') })}>Autre</button>
      <button className="btn" type="button" data-b="voisin" {...boutonAction({ occupe: !!enCours })}>Annuler</button>
    </div>
  );
}

describe('brique · le bouton pressé pendant une action serveur', () => {
  it('garde le focus, dit qu’il travaille (`aria-busy`), n’est jamais `disabled` · ses voisins sont fermés', async () => {
    let finir: () => void = () => {};
    monter(<Geste appel={() => new Promise<void>((r) => { finir = r; })} />);
    const a = q('[data-b="a"]');
    a.focus();
    act(() => a.click());
    expect(a.textContent).toBe('Envoi…');
    expect(a.hasAttribute('disabled'), 'le bouton pressé est `disabled` · le focus tombe au document').toBe(false);
    expect(a.getAttribute('aria-busy'), 'le bouton pressé ne dit pas qu’il travaille (`aria-busy`)').toBe('true');
    expect(a.getAttribute('aria-disabled'), 'le bouton pressé ne se dit pas fermé (`aria-disabled`)').toBe('true');
    expect(document.activeElement, 'le focus a quitté le bouton pressé').toBe(a);
    expect(q('[data-b="b"]').disabled, 'l’autre bouton du geste reste ouvert pendant l’action').toBe(true);
    expect(q('[data-b="voisin"]').disabled, 'le voisin reste ouvert pendant l’action').toBe(true);
    expect(q('[data-b="b"]').hasAttribute('aria-busy'), 'seul le pressé dit qu’il travaille').toBe(false);
    await act(async () => { finir(); await new Promise((r) => setTimeout(r, 0)); });
    expect(a.hasAttribute('aria-busy'), 'l’action finie, le bouton doit se rouvrir').toBe(false);
    expect(q('[data-b="voisin"]').disabled).toBe(false);
  });

  it('le second clic pendant l’action est ignoré · le geste ne part qu’une fois', () => {
    const appel = vi.fn(() => new Promise<void>(() => {}));
    monter(<Geste appel={appel} />);
    act(() => q('[data-b="a"]').click());
    act(() => q('[data-b="a"]').click());
    act(() => q('[data-b="a"]').click());
    expect(appel, 'second clic non ignoré · le geste serveur part deux fois').toHaveBeenCalledTimes(1);
  });

  it('`focalisable: occupe` · pendant l’action, l’autre bouton reste FOCALISABLE et atténué (`FERME`), son clic est ignoré', () => {
    const appel = vi.fn(() => new Promise<void>(() => {}));
    monter(<Geste appel={appel} options={{ focalisable: 'occupe' }} />);
    act(() => q('[data-b="a"]').click());
    const b = q('[data-b="b"]');
    expect(b.disabled, '`occupe` · l’autre bouton ne doit pas sortir de la tabulation').toBe(false);
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.style.opacity, '`occupe` · l’aspect fermé n’est pas posé').toBe(String(FERME.opacity));
    expect(q('[data-b="a"]').style.opacity, 'le pressé garde son aspect').toBe('');
    act(() => b.click());
    expect(appel).toHaveBeenCalledTimes(1);
  });

  it('`focalisable: tout` · fermé pour une autre raison, il garde le focus et l’aspect fermé · `aspect: feuille` laisse la feuille faire', () => {
    const surClic = vi.fn();
    monter(<div>
      <button className="btn" type="button" data-b="t" {...boutonAction({ ferme: true, focalisable: 'tout', surClic })}>T</button>
      <button className="chip" type="button" data-b="f" {...boutonAction({ ferme: true, focalisable: 'tout', aspect: 'feuille', surClic })}>F</button>
      <button className="btn" type="button" data-b="d" style={{ marginTop: 8 }} {...boutonAction({ ferme: true, surClic })}>D</button>
    </div>);
    const t = q('[data-b="t"]');
    expect(t.disabled).toBe(false);
    expect(t.getAttribute('aria-disabled')).toBe('true');
    expect(t.style.opacity).toBe('0.5');
    expect(q('[data-b="f"]').getAttribute('style'), '`feuille` · aucun style en ligne').toBeNull();
    expect(q('[data-b="d"]').disabled, '`aucun` · fermé = `disabled`').toBe(true);
    expect(q('[data-b="d"]').style.marginTop, 'la brique n’écrase pas un style écrit avant elle').toBe('8px');
    act(() => t.click());
    expect(surClic, 'un bouton fermé ne lance rien').not.toHaveBeenCalled();
  });

  it('l’ancien `./focus` réexporte la brique (écrans hors rubrique) · `pendantAction` rend le même bouton', () => {
    expect(ancien.FERME).toBe(FERME);
    expect(ancien.pendantAction).toBe(pendantAction);
    expect(ancien.focaliserApres).toBe(focaliserApres);
    expect(pendantAction({ presse: true, occupe: true, ferme: true })).toEqual({ disabled: false, 'aria-disabled': true, 'aria-busy': true });
    expect(pendantAction({ presse: false, occupe: true })).toEqual({ disabled: true, 'aria-disabled': undefined, 'aria-busy': undefined });
  });
});

describe('brique · le replacement du focus', () => {
  function scene() {
    monter(<div><button type="button" data-c="ferme" disabled>X</button><button type="button" data-c="cible">Cible</button><button type="button" data-c="ailleurs">Ailleurs</button></div>);
  }
  const attendre = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  it('`toujours` · prend le focus même s’il est déjà sur un élément vivant, en sautant un sélecteur fermé', async () => {
    scene();
    q('[data-c="ailleurs"]').focus();
    replacerFocus('toujours', '[data-c="absent"]', '[data-c="ferme"]', '[data-c="cible"]');
    await attendre();
    expect(document.activeElement, '`toujours` · le focus n’a pas été replacé').toBe(q('[data-c="cible"]'));
  });

  it('`si-perdu` · laisse un focus repris (aperçu, message) et ne replace qu’un focus tombé au document', async () => {
    scene();
    const ailleurs = q('[data-c="ailleurs"]');
    ailleurs.focus();
    replacerFocus('si-perdu', '[data-c="cible"]');
    await attendre();
    expect(document.activeElement, '`si-perdu` · un focus repris a été volé').toBe(ailleurs);
    ailleurs.blur();
    expect(document.activeElement).toBe(document.body);
    replacerFocus('si-perdu', '[data-c="cible"]');
    await attendre();
    expect(document.activeElement, '`si-perdu` · un focus tombé sur <body> n’a pas été replacé').toBe(q('[data-c="cible"]'));
  });
});

describe('brique · la variante « Hors ligne » de Message', () => {
  it('sans réponse du serveur, la pastille dit « Hors ligne » · sinon « Refusé », ou l’étiquette donnée', () => {
    expect(renderToStaticMarkup(<Message ton="err" horsLigne>Le serveur ne répond pas.</Message>)).toBe('<p role="alert" class="muted" style="font-size:12.5px"><span class="pill w">Hors ligne</span> Le serveur ne répond pas.</p>');
    expect(renderToStaticMarkup(<Message ton="err" horsLigne={false}>Non.</Message>)).toContain('<span class="pill w">Refusé</span>');
    expect(renderToStaticMarkup(<Message ton="ok" etiquette="Prêt">Oui.</Message>)).toContain('<span class="pill g">Prêt</span>');
  });
});
