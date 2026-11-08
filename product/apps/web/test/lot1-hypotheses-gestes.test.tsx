// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { InspoAd } from '@tiktrends/integrations';
import { REFUS_HYPOTHESE_VIDE, sousNavResultats, type CarteHypothese } from '@tiktrends/core';

/**
 * Lot 1 V5 · les GESTES « en faire une hypothèse », prouvés au rendu (jsdom) ·
 * on clique, on tape, on lit le DOM et ce que reçoivent les actions serveur.
 * Le toast ne dit « rangée » qu'après le oui du serveur · un refus s'affiche
 * tel quel et le formulaire reste. Pendant l'appel, le bouton pressé garde le
 * focus (`aria-disabled` + `aria-busy`, pas `disabled`).
 */

const actions = vi.hoisted(() => ({
  saveAd: vi.fn(async (_i: unknown) => ({ ok: true }) as { ok: boolean; error?: string }),
  unsaveAd: vi.fn(async () => ({ ok: true })), followBrand: vi.fn(async () => ({ ok: true })), unfollowBrand: vi.fn(async () => ({ ok: true })),
}));
const hyp = vi.hoisted(() => ({
  creerHypotheseAction: vi.fn(async (_i: unknown) => ({ ok: true, adId: 'nouvelle' }) as { ok?: true; adId?: string; error?: string }),
  completerHypotheseAction: vi.fn(async (_i: unknown) => ({ ok: true }) as { ok?: true; error?: string }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/veille', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/inspo', () => actions);
vi.mock('../app/actions/adsmap-hypotheses', () => hyp);
vi.mock('../app/actions/veille-vues', () => ({ garderVueVeille: vi.fn(), renommerVueVeilleAction: vi.fn(), supprimerVueVeille: vi.fn() }));

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { CarteVeille } = await import('../spatial/vues/veille/client');
const { ChoixPersona } = await import('../spatial/vues/marque/personas-client');
const { Hypotheses } = await import('../spatial/vues/resultats/Hypotheses');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toasts: string[] = [];
const CTX = {
  utilisateur: { nom: 'U', initiales: 'U', email: 'u@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); },
};
let racine: HTMLDivElement; let root: Root;
beforeEach(() => { racine = document.createElement('div'); document.body.appendChild(racine); root = createRoot(racine); toasts.length = 0; vi.clearAllMocks(); });
afterEach(() => { act(() => root.unmount()); racine.remove(); document.body.innerHTML = ''; });
const monter = async (n: React.ReactNode) => { await act(async () => { root.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); }); };
const cliquer = async (e: Element | null | undefined) => { if (!e) throw new Error('élément absent'); await act(async () => { (e as HTMLElement).click(); }); };
const bouton = (texte: string, dans: ParentNode = document) => [...dans.querySelectorAll('button')].find((b) => b.textContent?.includes(texte));
const saisir = async (el: Element | null, v: string) => {
  if (!el) throw new Error('champ absent');
  await act(async () => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
};

const AD: InspoAd = { id: 'a1', platform: 'meta', status: 'active', daysRunning: 34, body: 'Le texte réel de la pub', advertiserName: 'Ploufy' };
const carteVeille = (hypothese?: { ouvert: true; raison: null } | { ouvert: false; raison: string }) => ({
  cle: 'meta:a1', ancre: null, ad: AD, marque: { nom: 'Ploufy', initiale: 'P', fond: 'var(--acc)' }, active: true, jours: '34 j', signaux: [],
  pays: null, portee: null, depense: null, croissance: null, texte: AD.body!, image: null, ratio: '' as const, tendance: false, style: 'Image',
  domaine: null, titre: 'Ploufy', cta: null, iterer: '/studio/projets/nouveau', sauvee: false, suivie: false,
  detail: { statut: 'Active', liens: [], kpis: [] as Array<[string, string]>, lecture: 'Lecture', annonceur: null, jarvis: [], texte: AD.body!, ...(hypothese ? { hypothese } : {}) },
});

describe('Veille · détail d’une pub · « Ajouter aux hypothèses »', () => {
  it('ouvre le formulaire avec le début de phrase du geste · garde la pub, puis crée l’hypothèse depuis la Veille', async () => {
    await monter(<CarteVeille c={carteVeille({ ouvert: true, raison: null })} coutJarvis="c" />);
    await cliquer(racine.querySelector('button.xv'));
    const m = document.querySelector('.xmod')!;
    const geste = bouton('Ajouter aux hypothèses', m)!;
    expect(geste.getAttribute('aria-expanded')).toBe('false');
    await cliquer(geste);
    const si = m.querySelector('textarea[name="si"]') as HTMLTextAreaElement;
    expect(si.value).toBe('on reprend la structure de la pub de Ploufy');
    expect(m.querySelector('[data-completude]')?.textContent).toBe('Il manque le résultat attendu (alors…), la raison (parce que…) et la variable testée');
    await saisir(m.querySelector('textarea[name="alors"]'), 'le taux de clic monte');
    await saisir(m.querySelector('select[name="variable"]'), 'hook');
    await cliquer(bouton('Ranger dans « À formuler »', m));
    expect(actions.saveAd).toHaveBeenCalledWith({ platform: 'meta', externalId: 'a1', snapshot: AD });
    expect(hyp.creerHypotheseAction).toHaveBeenCalledWith({
      source: { type: 'veille', platform: 'meta', externalId: 'a1' },
      saisie: expect.objectContaining({ si: 'on reprend la structure de la pub de Ploufy', alors: 'le taux de clic monte', variable: 'hook' }),
    });
    expect(toasts).toEqual(['Hypothèse rangée dans « À formuler »']);
    expect(m.querySelector('textarea[name="si"]'), 'le formulaire reste ouvert après le oui').toBeNull();
  });

  it('un refus du serveur s’affiche tel quel · le formulaire reste, aucun « rangée »', async () => {
    hyp.creerHypotheseAction.mockResolvedValueOnce({ error: 'Adsmap est disponible à partir de l’offre Plus.' });
    await monter(<CarteVeille c={carteVeille({ ouvert: true, raison: null })} coutJarvis="c" />);
    await cliquer(racine.querySelector('button.xv'));
    const m = document.querySelector('.xmod')!;
    await cliquer(bouton('Ajouter aux hypothèses', m));
    await cliquer(bouton('Ranger dans « À formuler »', m));
    expect(m.querySelector('[role="alert"]')?.textContent).toBe('Adsmap est disponible à partir de l’offre Plus.');
    expect(m.querySelector('textarea[name="si"]')).not.toBeNull();
    expect(toasts).toEqual([]);
  });

  it('une sauvegarde refusée n’est pas suivie d’une hypothèse', async () => {
    actions.saveAd.mockResolvedValueOnce({ ok: false, error: 'Annonce déjà sauvegardée pour une autre marque de l’espace.' });
    await monter(<CarteVeille c={carteVeille({ ouvert: true, raison: null })} coutJarvis="c" />);
    await cliquer(racine.querySelector('button.xv'));
    const m = document.querySelector('.xmod')!;
    await cliquer(bouton('Ajouter aux hypothèses', m));
    await cliquer(bouton('Ranger dans « À formuler »', m));
    expect(hyp.creerHypotheseAction).not.toHaveBeenCalled();
    expect(m.querySelector('[role="alert"]')?.textContent).toMatch(/autre marque/);
  });

  it('fermé · le geste dit pourquoi et n’ouvre rien', async () => {
    await monter(<CarteVeille c={carteVeille({ ouvert: false, raison: 'Les hypothèses vivent dans Adsmap, ouvert à partir de l’offre Plus' })} coutJarvis="c" />);
    await cliquer(racine.querySelector('button.xv'));
    const m = document.querySelector('.xmod')!;
    const geste = bouton('Ajouter aux hypothèses', m)!;
    expect(geste.getAttribute('aria-disabled')).toBe('true');
    expect(geste.textContent).toMatch(/offre Plus/);
    await cliquer(geste);
    expect(m.querySelector('textarea[name="si"]')).toBeNull();
  });

  it('pendant l’appel · le bouton pressé GARDE le focus (aria-disabled + aria-busy), une seule requête', async () => {
    let finir: (v: { ok: true }) => void = () => {};
    hyp.creerHypotheseAction.mockImplementationOnce(() => new Promise((r) => { finir = r as typeof finir; }));
    await monter(<CarteVeille c={carteVeille({ ouvert: true, raison: null })} coutJarvis="c" />);
    await cliquer(racine.querySelector('button.xv'));
    const m = document.querySelector('.xmod')!;
    await cliquer(bouton('Ajouter aux hypothèses', m));
    const envoyer = bouton('Ranger dans « À formuler »', m)!;
    envoyer.focus();
    await act(async () => { envoyer.click(); });
    await act(async () => { envoyer.click(); });
    expect(envoyer.getAttribute('aria-busy')).toBe('true');
    expect(envoyer.getAttribute('aria-disabled')).toBe('true');
    expect((envoyer as HTMLButtonElement).disabled, 'un bouton `disabled` rendrait le focus au document').toBe(false);
    expect(document.activeElement).toBe(envoyer);
    expect((bouton('Annuler', m) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { finir({ ok: true }); });
    expect(hyp.creerHypotheseAction).toHaveBeenCalledTimes(1);
  });
});

describe('Persona · « Tester une accroche »', () => {
  const P = { id: 'p1', initiale: 'L', teinte: 'var(--acc)', nom: 'Léa, 34 ans', statut: { libelle: 'Validé', classe: 'g' as const }, description: 'd',
    desirs: [], freins: [], objections: [], citations: ['ça ne colle pas', 'enfin une crème légère'], sources: 2 };
  const choix = (hypothese: Parameters<typeof ChoixPersona>[0]['hypothese']) => (
    <ChoixPersona brandId="b1" personas={[P]} scenarios={[]} jarvis={null} creerPub={null} ajouterPersona={null} ajouterScenario={null} hypothese={hypothese} />
  );

  it('l’accroche choisie part avec le persona · le « Si… » suit le choix', async () => {
    const creer = vi.fn(async (_i: unknown) => ({ ok: true as const }));
    await monter(choix({ creer, raison: null }));
    await cliquer(bouton('Tester une accroche'));
    const d = document.querySelector('[role="dialog"]')!;
    expect(d.querySelector('h2')?.textContent).toBe('Tester une accroche · Léa');
    expect((d.querySelector('textarea[name="si"]') as HTMLTextAreaElement).value).toBe('l’accroche reprend ses mots « ça ne colle pas »');
    await saisir(d.querySelector('select:not([name])'), 'enfin une crème légère');
    expect((d.querySelector('textarea[name="si"]') as HTMLTextAreaElement).value).toBe('l’accroche reprend ses mots « enfin une crème légère »');
    expect((d.querySelector('select[name="variable"]') as HTMLSelectElement).value).toBe('hook');
    await cliquer(bouton('Ranger dans « À formuler »', d));
    expect(creer).toHaveBeenCalledWith({ source: { type: 'persona', personaId: 'p1', accroche: 'enfin une crème légère' }, saisie: expect.objectContaining({ si: 'l’accroche reprend ses mots « enfin une crème légère »', variable: 'hook' }) });
    expect(toasts).toEqual(['Hypothèse rangée dans « À formuler »']);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('marque non active · fermé, la raison au survol, rien ne s’ouvre', async () => {
    await monter(choix({ creer: null, raison: 'Une hypothèse se range dans la marque active · ouvre d’abord cette marque' }));
    const b = bouton('Tester une accroche')!;
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.getAttribute('title')).toMatch(/marque active/);
    await cliquer(b);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('sans la prop · aucun bouton (écran de la maquette)', async () => {
    await monter(choix(undefined));
    expect(bouton('Tester une accroche')).toBeUndefined();
  });
});

describe('Hypothèses · « Nouvelle hypothèse » et « Compléter la phrase »', () => {
  const NAV = sousNavResultats({ admin: true });
  const libre: CarteHypothese = {
    cle: 'h1', colonne: 'formuler', categorie: 'Variable à choisir', priorite: 0, texte: 'Si on tutoie, alors… ?', meta: 'Il manque … · Idée d’équipe',
    action: null, conclusion: null,
    edition: { adId: 'h1', parties: { si: 'on tutoie', alors: '', parceQue: '' }, variable: null, estimation: { impact: null, confiance: null, effort: null }, libelle: 'Compléter la phrase' },
  };
  it('une phrase vide est refusée par la règle du noyau, sans appel serveur · une phrase écrite part en hypothèse libre', async () => {
    const creer = vi.fn(async (_i: unknown) => ({ ok: true as const }));
    await monter(<Hypotheses sousNav={NAV} jarvis={false} note="n" cartes={[]} creer={creer} completer={null} />);
    await cliquer(bouton('Nouvelle hypothèse'));
    const d = document.querySelector('[role="dialog"]')!;
    await cliquer(bouton('Ranger dans « À formuler »', d));
    expect(d.querySelector('[role="alert"]')?.textContent).toBe(REFUS_HYPOTHESE_VIDE);
    expect(creer).not.toHaveBeenCalled();
    await saisir(d.querySelector('textarea[name="si"]'), 'on montre le prix barré');
    await cliquer(bouton('Ranger dans « À formuler »', d));
    expect(creer).toHaveBeenCalledWith({ source: { type: 'libre' }, saisie: expect.objectContaining({ si: 'on montre le prix barré' }) });
  });
  it('« Compléter la phrase » rouvre SA phrase et l’envoie à son ad', async () => {
    const completer = vi.fn(async (_i: unknown) => ({ ok: true as const }));
    await monter(<Hypotheses sousNav={NAV} jarvis={false} note="n" cartes={[libre]} creer={null} completer={completer} />);
    await cliquer(bouton('Compléter la phrase'));
    const d = document.querySelector('[role="dialog"]')!;
    expect((d.querySelector('textarea[name="si"]') as HTMLTextAreaElement).value).toBe('on tutoie');
    await saisir(d.querySelector('textarea[name="parceQue"]'), 'les concurrents tutoient');
    await saisir(d.querySelector('select[name="impact"]'), '3');
    await cliquer(bouton('Enregistrer', d));
    expect(completer).toHaveBeenCalledWith({ adId: 'h1', saisie: expect.objectContaining({ si: 'on tutoie', parceQue: 'les concurrents tutoient', impact: '3' }) });
    expect(toasts).toEqual(['Hypothèse mise à jour']);
  });
  it('sans action de création · « Nouvelle hypothèse » reste le lien vers les suites (écran d’avant)', async () => {
    await monter(<Hypotheses sousNav={NAV} jarvis={false} note="n" cartes={[]} />);
    expect(racine.querySelector('a.btn.pri')?.getAttribute('href')).toBe('/adsmap/suites');
  });
});
