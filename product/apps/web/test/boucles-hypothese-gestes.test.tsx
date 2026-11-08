// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { InspoAd } from '@tiktrends/integrations';

/**
 * VB F26 · le geste « Itérer à partir de cette pub », prouvé au rendu (jsdom) ·
 * pendant la sauvegarde, le bouton pressé GARDE le focus (`aria-disabled` +
 * `aria-busy`, pas `disabled`), une seule requête · un refus se dit et ne mène
 * nulle part · fermé, il dit pourquoi à côté et n'appelle rien.
 */

const actions = vi.hoisted(() => ({
  saveAd: vi.fn(async (_i: unknown) => ({ ok: true }) as { ok: boolean; error?: string }),
  unsaveAd: vi.fn(async () => ({ ok: true })), followBrand: vi.fn(async () => ({ ok: true })), unfollowBrand: vi.fn(async () => ({ ok: true })),
}));
const nav = vi.hoisted(() => ({ push: [] as string[] }));
vi.mock('next/navigation', () => ({ usePathname: () => '/veille', useRouter: () => ({ push: (u: string) => { nav.push.push(u); }, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/inspo', () => actions);
vi.mock('../app/actions/adsmap-hypotheses', () => ({ creerHypotheseAction: vi.fn(), completerHypotheseAction: vi.fn() }));
vi.mock('../app/actions/veille-vues', () => ({ garderVueVeille: vi.fn(), renommerVueVeilleAction: vi.fn(), supprimerVueVeille: vi.fn() }));

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { CarteVeille } = await import('../spatial/vues/veille/client');
const { lienIterationVeille } = await import('@tiktrends/core');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CTX = {
  utilisateur: { nom: 'U', initiales: 'U', email: 'u@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
let racine: HTMLDivElement; let root: Root;
beforeEach(() => { racine = document.createElement('div'); document.body.appendChild(racine); root = createRoot(racine); vi.clearAllMocks(); nav.push.length = 0; });
afterEach(() => { act(() => root.unmount()); racine.remove(); document.body.innerHTML = ''; });
const monter = async (n: React.ReactNode) => { await act(async () => { root.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); }); };

const AD: InspoAd = { id: 'a1', platform: 'meta', status: 'active', daysRunning: 34, body: 'Le texte réel de la pub', advertiserName: 'Ploufy' };
const HREF = lienIterationVeille({ platform: 'meta', externalId: 'a1' });
const carte = (acces: { ouvert: true; raison: null } | { ouvert: false; raison: string }) => ({
  cle: 'meta:a1', ancre: null, ad: AD, marque: { nom: 'Ploufy', initiale: 'P', fond: 'var(--acc)' }, active: true, jours: '34 j', signaux: [],
  pays: null, portee: null, depense: null, croissance: null, texte: AD.body!, image: null, ratio: '' as const, tendance: false, style: 'Image',
  domaine: null, titre: 'Ploufy', cta: null, iterer: '/studio/projets/nouveau', sauvee: false, suivie: false,
  detail: { statut: 'Active', liens: [], kpis: [] as Array<[string, string]>, lecture: 'Lecture', annonceur: null, jarvis: [], texte: AD.body!, hypothese: acces, iterationVeille: { acces, href: HREF } },
});
const ouvrirDetail = async (c: ReturnType<typeof carte>) => {
  await monter(<CarteVeille c={c} coutJarvis="c" />);
  await act(async () => { racine.querySelector<HTMLButtonElement>('button.xv')!.click(); });
  return document.querySelector('.xmod [data-geste="iterer-veille"]') as HTMLButtonElement;
};

describe('Veille · détail · « Itérer à partir de cette pub »', () => {
  it('garde la pub (action existante) puis ouvre l’écran Itérer avec elle en source', async () => {
    const b = await ouvrirDetail(carte({ ouvert: true, raison: null }));
    expect(b.textContent).toContain('Je garde sa structure, je remplace une seule variable');
    await act(async () => { b.click(); });
    expect(actions.saveAd).toHaveBeenCalledWith({ platform: 'meta', externalId: 'a1', snapshot: AD });
    expect(nav.push, 'le geste ne mène pas à l’écran Itérer').toEqual([HREF]);
  });

  it('pendant la sauvegarde · le bouton pressé GARDE le focus (aria-disabled + aria-busy), une seule requête', async () => {
    let finir: (v: { ok: true }) => void = () => {};
    actions.saveAd.mockImplementationOnce(() => new Promise((r) => { finir = r as typeof finir; }));
    const b = await ouvrirDetail(carte({ ouvert: true, raison: null }));
    b.focus();
    await act(async () => { b.click(); });
    await act(async () => { b.click(); });
    expect(b.getAttribute('aria-busy'), 'pas d’aria-busy pendant l’appel').toBe('true');
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.disabled, 'un bouton `disabled` rendrait le focus au document').toBe(false);
    expect(document.activeElement).toBe(b);
    await act(async () => { finir({ ok: true }); });
    expect(actions.saveAd, 'double requête').toHaveBeenCalledTimes(1);
    expect(nav.push).toEqual([HREF]);
  });

  it('une sauvegarde refusée se dit et ne mène nulle part', async () => {
    actions.saveAd.mockResolvedValueOnce({ ok: false, error: 'Annonce déjà sauvegardée pour une autre marque de l’espace.' });
    const b = await ouvrirDetail(carte({ ouvert: true, raison: null }));
    await act(async () => { b.click(); });
    expect(document.querySelector('.xmod [role="alert"]')?.textContent).toMatch(/autre marque/);
    expect(nav.push).toEqual([]);
  });

  it('fermé · focalisable, la raison écrite à côté, rien n’est appelé', async () => {
    const raison = 'Ton rôle ne permet pas d’écrire dans Adsmap';
    const b = await ouvrirDetail(carte({ ouvert: false, raison }));
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.disabled).toBe(false);
    expect(document.getElementById(b.getAttribute('aria-describedby')!)?.textContent, 'la raison n’est pas écrite à côté').toBe(raison);
    await act(async () => { b.click(); });
    expect(actions.saveAd).not.toHaveBeenCalled();
    expect(nav.push).toEqual([]);
  });
});
