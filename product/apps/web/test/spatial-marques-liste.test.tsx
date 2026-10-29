// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { messagesListeMarques, refusNouvelleMarque } from '@tiktrends/core';

/**
 * Vague 3 · la liste des marques `/brands` dans Spatial · lister, créer, rendre
 * active, ouvrir, supprimer. Les gardes lisent le DOM rendu et l'appel
 * réellement parti, jamais la seule présence d'une fonction.
 */
const h = vi.hoisted(() => ({ refresh: vi.fn(), toast: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/brands', useRouter: () => ({ push: () => {}, refresh: h.refresh }), useSearchParams: () => new URLSearchParams('ok=deleted') }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { ListeMarques, type MarqueListe } from '../spatial/vues/marque/ListeMarques';

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 10, dotation: 20, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: h.toast,
};
const marque = (id: string, nom: string, active = false): MarqueListe => ({ id, nom, initiale: nom[0]!, ligne: 'Beauté · neva.fr', domaine: 'neva.fr', active, comptes: { pub: 1, scenarios: 2, personas: 0, concurrents: 3 } });
const props = (extra = {}) => ({ marques: [marque('b1', 'Neva', true), marque('b2', 'Ploufy')], retours: messagesListeMarques(), choisir: vi.fn(async () => {}), supprimer: vi.fn(async () => {}), ...extra });

let el: HTMLDivElement; let root: Root;
afterEach(() => { root?.unmount(); el?.remove(); vi.restoreAllMocks(); h.refresh.mockClear(); h.toast.mockClear(); });
async function monter(n: React.ReactNode) {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); });
}

describe('Spatial · liste des marques', () => {
  it('droits du forfait (29/10) · la limite atteinte se lit AVANT le clic · plus de bouton de création, le motif et le forfait qui la lève, un lien vers les forfaits', () => {
    const limite = refusNouvelleMarque('essentiel', 1)!;
    const html = renderToStaticMarkup(<FournisseurSpatial value={CTX}><ListeMarques {...props({ limite, retours: messagesListeMarques({ limiteMarques: limite }) })} /></FournisseurSpatial>);
    expect(html).not.toContain('href="/brands/new"');
    expect(html).toContain('href="/billing"');
    expect(/<p[^>]*data-limite="marques"[^>]*>([^<]*)<\/p>/.exec(html)?.[1]).toBe('Ton forfait Essentiel inclut 1 marque. Le forfait Pro en ouvre 3 · change de forfait depuis Réglages · Forfaits.');
    expect(messagesListeMarques({ limiteMarques: limite })['e:limite_marques']).toBe(limite);
    expect(renderToStaticMarkup(<FournisseurSpatial value={CTX}><ListeMarques {...props()} /></FournisseurSpatial>)).not.toContain('data-limite');
  });

  it('liste les vraies marques, leurs comptages, la marque active marquée · créer mène à /brands/new', () => {
    const html = renderToStaticMarkup(<FournisseurSpatial value={CTX}><ListeMarques {...props()} /></FournisseurSpatial>);
    expect(html).toContain('Tes marques (2)');
    expect(html).toContain('href="/brands/new"');
    expect(html).toContain('href="/brands/b1"');
    expect(html).toContain('1 compte pub · 2 scénarios · 0 persona · 3 concurrents');
    expect(html.match(/class="pill g"[^>]*>Active</g)).toHaveLength(1);
    expect(html).toMatch(/data-marque="b1" aria-current="true"/);
    // La marque déjà active n'a pas de bouton « Rendre active ».
    expect(html.match(/Rendre active/g)).toHaveLength(1);
  });
  it('sans marque · un état vide honnête, un seul geste de création', () => {
    const html = renderToStaticMarkup(<FournisseurSpatial value={CTX}><ListeMarques {...props({ marques: [] })} /></FournisseurSpatial>);
    expect(html).toContain('Aucune marque pour l’instant');
    expect(html).toContain('Créer la première marque');
    // Porté de l'écran V5 · l'état vide n'a qu'UN geste de création.
    const vide = /<div class="dempty">[\s\S]*?<\/div><\/div>/.exec(html)?.[0] ?? '';
    expect(vide.match(/href="\/brands\/new"/g)).toHaveLength(1);
  });
  it('« Rendre active » appelle l’action réelle avec l’identifiant, puis relit l’écran · le retour de suppression est annoncé', async () => {
    const p = props();
    await monter(<ListeMarques {...p} />);
    expect(h.toast).toHaveBeenCalledWith('Marque supprimée.');
    await act(async () => { (el.querySelector('button[aria-label="Rendre « Ploufy » active"]') as HTMLButtonElement).click(); });
    expect(p.choisir).toHaveBeenCalledWith('b2');
    expect(h.refresh).toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith('Ploufy est la marque active');
  });
  it('supprimer demande confirmation · refusée, rien ne part · acceptée, l’action reçoit l’identifiant', async () => {
    const p = props();
    await monter(<ListeMarques {...p} />);
    const b = el.querySelector('button[aria-label="Supprimer la marque Ploufy"]') as HTMLButtonElement;
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await act(async () => { b.click(); });
    expect(p.supprimer).not.toHaveBeenCalled();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    await act(async () => { b.click(); });
    expect((p.supprimer.mock.calls[0] as unknown as [FormData])[0].get('id')).toBe('b2');
  });
});
