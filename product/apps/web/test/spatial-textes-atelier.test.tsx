// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Atelier textes Spatial (`spatial/vues/projet/Textes.tsx`) · les comportements
 * que gardaient les écrans V5 retirés (`EcranTextes`, `TextesAssistant` ·
 * tests `l8a-ecrans-rendu` et `livrables-prototype-rendu`), PORTÉS sur la vue
 * Spatial et lus dans le DOM monté :
 *
 *  · argent · prix dit avant le clic, ton et langue partent avec la demande,
 *    rien n'est enregistré avant « Retenir » ; réponse perdue ou incertaine ·
 *    verrou d'appel payant (même après remontage), aucun second appel ;
 *  · refus · IA indisponible ou plafond atteint, raison dite, écriture à la
 *    main ouverte ; « Ajouter » inactif dit pourquoi (relié au bouton) ;
 *  · nommage · « Écrire à la main » est nommée par son titre ;
 *  · hors ligne · ajout, export et proposition disent l'échec, la saisie reste ;
 *  · conflit · « Conflit de version », le brouillon survit au rechargement.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({ ecrireTextes: vi.fn(), enregistrerTextes: vi.fn(), exporterTextes: vi.fn(), injecterTexte: vi.fn() }));
vi.mock('../app/actions/studios/textes', () => m);
vi.mock('next/navigation', () => ({ usePathname: () => '/sp/studio/projets/p1/textes', useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: unknown }) => <a href={href} {...(r as object)}>{children as never}</a> }));

import { cleBrouillonTextes, disponibiliteTextes, erreurStudio, TONS_ECRITURE } from '@tiktrends/core';
import { MESSAGE_APPEL_PAYANT } from '../lib/studios/appel-payant';
import { avecSpatial } from './spatial/fournisseur';

const { Textes } = await import('../spatial/vues/projet/Textes');
type VueTextes = import('../lib/studios/textes/textes').VueTextes;

const ATELIER = [{ segment: 'textes', href: '/studio/projets/p1/textes' }];
const DISPO = (o: Partial<Parameters<typeof disponibiliteTextes>[0]> = {}) =>
  disponibiliteTextes({ briefPresent: true, peutProposer: true, releasePubliee: true, fournisseurConfigure: true, plafondAtteint: false, modele: 'claude-sonnet-4-5', ...o });
function vueTextes(o: Partial<VueTextes> = {}): VueTextes {
  return {
    projet: { id: 'p1', title: 'Sérum · visuel', marque: 'Éclat' }, version: { id: 'v1', n: 1 },
    brief: { objectif: 'Tester une accroche', audience: 'Peaux mixtes', hypothese: 'La douleur convertit', variable: 'Accroche', faits: [{ id: 'produit.nom', claim: 'Nom : Sérum Clarté', kind: 'declared' }], invariants: [], exclusions: [] },
    briefIllisible: false,
    textes: [{ id: 't1', type: 'hook', langue: 'fr', texte: 'Fini les boutons au réveil', sources: [] }],
    calques: [{ id: 'l_titre', nom: 'Accroche' }] as VueTextes['calques'],
    limites: [{ type: 'hook', libelle: 'Hook', max: 46, mesuree: true }, { type: 'body', libelle: 'Corps', max: 400, mesuree: false }, { type: 'cta', libelle: 'CTA', max: 30, mesuree: false }, { type: 'script', libelle: 'Script', max: 2000, mesuree: false }] as VueTextes['limites'],
    disponibilite: DISPO(), peutEcrire: true, peutExporter: true, ...o,
  } as VueTextes;
}

let hote: HTMLDivElement;
let racine: Root | null = null;
beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  window.sessionStorage.clear();
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(() => { if (racine) act(() => racine!.unmount()); racine = null; hote.remove(); });

const monter = (v: VueTextes) => { act(() => { racine = createRoot(hote); racine.render(avecSpatial(<Textes vue={v} atelier={ATELIER} />)); }); };
const demonter = () => { act(() => racine!.unmount()); racine = null; };
const q = <T extends Element = HTMLElement>(s: string) => hote.querySelector(s) as T | null;
const bouton = (texte: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte) as HTMLButtonElement | undefined;
const cliquer = async (b: Element | null | undefined) => { expect(b, 'bouton introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };
const saisir = (el: HTMLTextAreaElement, valeur: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, valeur);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const choisir = (libelle: string, valeur: string) => act(() => {
  const s = [...hote.querySelectorAll('label.field')].find((l) => l.textContent?.startsWith(libelle))!.querySelector('select')!;
  s.value = valeur; s.dispatchEvent(new Event('change', { bubbles: true }));
});
const zoneManuelle = () => q<HTMLTextAreaElement>('[data-zone="ecrire-main"] textarea')!;
/** « Écrire » arme la confirmation (prix dit), le second clic lance l'appel payant. */
async function ecrireAvecConfirmation() {
  await cliquer(q('[data-bouton="ecrire"]'));
  await cliquer(q('[data-confirmation="ecrire"] .btn.pri'));
}

describe('argent · prix avant le clic, ton et langue, rien sans « Retenir »', () => {
  it('le prix est dit, ton et langue partent avec la demande, la sauvegarde n’arrive qu’au « Retenir »', async () => {
    m.ecrireTextes.mockResolvedValue({ ok: true, statut: 'variantes', variantes: [{ id: 'n1', type: 'hook', langue: 'fr', texte: 'Notre accroche', sources: [], longueur: 14, horsVariable: false }], ecartees: [] });
    m.enregistrerTextes.mockResolvedValue({ ok: true, version: { id: 'v2', n: 2 }, textes: [], inchange: false });
    monter(vueTextes());
    expect(q('[data-cout="texte"]')!.textContent).toContain('$');
    expect(m.ecrireTextes).not.toHaveBeenCalled();
    choisir('Ton', 'Pédagogique');
    choisir('Langue', 'en');
    await ecrireAvecConfirmation();
    expect(m.ecrireTextes).toHaveBeenCalledWith({ projectId: 'p1', baseVersionId: 'v1', type: 'hook', nombre: 3, maxCaracteres: 46, langue: 'en', ton: 'Pédagogique' });
    expect(m.enregistrerTextes).not.toHaveBeenCalled();
    expect(hote.textContent).toContain('Notre accroche');
    await cliquer(bouton('Retenir'));
    expect(m.enregistrerTextes).toHaveBeenCalledTimes(1);
    expect(TONS_ECRITURE).toContain('Pédagogique');
  });

  it('réponse perdue · coût incertain dit, aucun second appel payant', async () => {
    m.ecrireTextes.mockRejectedValue(new Error('offline'));
    monter(vueTextes());
    await ecrireAvecConfirmation();
    expect(hote.textContent).toContain(MESSAGE_APPEL_PAYANT);
    expect((q('[data-bouton="ecrire"]') as HTMLButtonElement).disabled).toBe(true);
    await cliquer(q('[data-bouton="ecrire"]'));
    expect(m.ecrireTextes).toHaveBeenCalledTimes(1);
  });

  it('PROVIDER_UNCERTAIN · verrou maintenu après remontage', async () => {
    m.ecrireTextes.mockResolvedValue({ ok: false, code: 'PROVIDER_UNCERTAIN', status: 409, message: 'Fournisseur incertain', targetIds: [], recoverable: true, traceId: 't' });
    monter(vueTextes());
    await ecrireAvecConfirmation();
    demonter();
    monter(vueTextes());
    expect((q('[data-bouton="ecrire"]') as HTMLButtonElement).disabled).toBe(true);
    expect(hote.textContent).toContain(MESSAGE_APPEL_PAYANT);
    expect(m.ecrireTextes).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.sessionStorage.getItem('tt-appel-payant:p1:textes')!)).toMatchObject({ etat: 'uncertain' });
  });
});

describe('refus · raison dite, écriture à la main ouverte', () => {
  it('IA désactivée par le serveur · motif dit, aucun appel', async () => {
    monter(vueTextes({ disponibilite: { ...DISPO(), disponible: false, raison: 'Budget atteint' } }));
    expect(hote.textContent).toContain('Indisponible · Budget atteint');
    await cliquer(q('[data-bouton="ecrire"]'));
    expect(m.ecrireTextes).not.toHaveBeenCalled();
  });

  it('plafond atteint · la raison est dite, « Écrire » inactif, l’écriture à la main reste ouverte', () => {
    monter(vueTextes({ disponibilite: DISPO({ plafondAtteint: true }) }));
    expect(q('[data-zone="ecrire-ia"]')!.textContent).toContain('Indisponible · Le plafond de dépense est atteint');
    expect((q('[data-bouton="ecrire"]') as HTMLButtonElement).disabled).toBe(true);
    expect(zoneManuelle().disabled).toBe(false);
  });

  it('« Ajouter » inactif dit pourquoi, relié au bouton, et la raison disparaît quand le texte est écrit', () => {
    monter(vueTextes());
    const ajouter = bouton('Ajouter aux textes retenus')!;
    expect(ajouter.disabled).toBe(true);
    const raison = document.getElementById(ajouter.getAttribute('aria-describedby') ?? '');
    expect(raison?.textContent, '« Ajouter » inactif sans raison reliée').toBe('Écris un texte pour pouvoir l’ajouter.');
    saisir(zoneManuelle(), 'Ton teint change dès le premier flacon');
    expect(bouton('Ajouter aux textes retenus')!.disabled).toBe(false);
    expect(q('[data-raison="ajout"]')).toBeNull();
  });

  it('« Écrire à la main » est nommée par son titre, pas par tout son contenu', () => {
    monter(vueTextes());
    const section = q('[data-zone="ecrire-main"]')!;
    const cible = document.getElementById(section.getAttribute('aria-labelledby') ?? '');
    expect(cible, 'aria-labelledby ne désigne aucun élément').not.toBeNull();
    expect(cible, 'la section se nomme par elle-même').not.toBe(section);
    expect(cible!.textContent).toBe('Écrire à la main');
  });
});

describe('hors ligne et conflit', () => {
  it('hors ligne · l’ajout, l’export et la proposition disent l’échec, le texte saisi reste', async () => {
    m.exporterTextes.mockRejectedValue(new TypeError('Failed to fetch'));
    m.injecterTexte.mockRejectedValue(new TypeError('Failed to fetch'));
    m.enregistrerTextes.mockRejectedValue(new TypeError('Failed to fetch'));
    monter(vueTextes());
    saisir(zoneManuelle(), 'Brouillon en cours');
    await cliquer(bouton('Ajouter aux textes retenus'));
    expect(q('[role="alert"]')?.textContent).toMatch(/^Hors ligne · Le serveur n’a pas répondu/);
    expect(zoneManuelle().value).toBe('Brouillon en cours');
    await cliquer(bouton('Exporter en CSV'));
    expect(q('[role="alert"]')?.textContent, 'export hors ligne muet').toContain('aucun fichier exporté');
    await cliquer(bouton('Proposer dans ce calque'));
    expect(q('[role="alert"]')?.textContent, 'proposition hors ligne muette').toContain('ne crée jamais de doublon');
    expect(zoneManuelle().value).toBe('Brouillon en cours');
  });

  it('conflit · « Conflit de version », « Recharger la version courante » garde le brouillon et le rend après le rechargement', async () => {
    m.enregistrerTextes.mockResolvedValue(erreurStudio('VERSION_CONFLICT', { traceId: 't', conflit: { versionCouranteId: 'v2', differences: [] } }));
    const recharge = vi.fn();
    const origine = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...origine, reload: recharge } });
    try {
      monter(vueTextes());
      saisir(zoneManuelle(), 'Ton teint change dès le premier flacon');
      await cliquer(bouton('Ajouter aux textes retenus'));
      expect(q('[role="alert"]')?.textContent).toMatch(/^Conflit de version · /);
      await cliquer(bouton('Recharger la version courante'));
      expect(recharge).toHaveBeenCalledTimes(1);
      expect(window.sessionStorage.getItem(cleBrouillonTextes('p1')) ?? '', 'brouillon perdu au rechargement').toContain('Ton teint change');
      demonter();
      monter(vueTextes({ version: { id: 'v2', n: 2 } }));
      expect(zoneManuelle().value, 'brouillon perdu au rechargement').toBe('Ton teint change dès le premier flacon');
      expect(q('[role="status"]')?.textContent).toContain('ton brouillon est remis en place');
      expect(window.sessionStorage.getItem(cleBrouillonTextes('p1')), 'le brouillon est rendu une seule fois').toBeNull();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: origine });
    }
  });
});
