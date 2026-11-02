// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { annonceLogosAReimporter, bilanLogosCharte, entreesRail, entreesRailEspace, logoParDefautAffiche, RAISONS_LOGO_CHARTE, type BriefCanonique, type LogoParDefautAffiche } from '@tiktrends/core';
import type { VueParcoursImage } from '../lib/studios/image/parcours';

/**
 * Le logo de la marque active dans la COQUILLE, et l'annonce de l'étape
 * Format & devis de l'assistant, au RÉSULTAT (DOM monté) :
 *  - l'image qui échoue cède la place à l'initiale ; pour un logo importé
 *    (`logoAVerifier`), la raison est demandée UNE fois (`etatLogo`) et
 *    « Logo à réimporter » se lit sur le bouton de marque et dans la feuille
 *    « Changer de marque », avec le lien vers l'Identité ;
 *  - une image qui s'affiche · aucune demande ; un logo sans empreinte · aucune ;
 *  - l'image en échec avant l'hydratation (aucun `onError`) est relue au montage ;
 *  - Format & devis · l'annonce au-dessus de « Préparer la consigne avec Jarvis ».
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ vue: null as unknown }));
vi.mock('@tiktrends/db', () => ({ db: undefined, schema: {} }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../app/actions/brands', () => ({ setActiveBrand: vi.fn(async () => {}) }));
vi.mock('../app/actions/notifications', () => ({ fetchNotifications: vi.fn(async () => ({ items: [], unread: 0 })), markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn() }));
vi.mock('../app/actions/studios/projets', () => ({ listerProjets: vi.fn(async () => ({ ok: true, projets: [] })) }));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: vi.fn() }));
vi.mock('../app/actions/studios/image', () => ({
  lireParcoursImage: async () => ({ ok: true, vue: h.vue }), compilerConsigneImage: vi.fn(), retenirConsigneImage: vi.fn(), demanderDevisImage: vi.fn(), approuverEtLancerImage: vi.fn(),
}));
vi.mock('../app/actions/studios/propositions', () => ({ creerPropositionManuelle: vi.fn(), appliquerProposition: vi.fn() }));
vi.mock('../app/actions/studios/lot-formats', () => ({ preparerLotFormats: vi.fn() }));
vi.mock('../app/actions/studios/lot-images', () => ({ preparerLotImages: vi.fn(), approuverLotImages: vi.fn() }));

import { Coquille, type DonneesCoquille } from '../spatial/coquille/Coquille';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { FormatDevis } from '../spatial/vues/studios/assistant/FormatDevis';

const CTX: CtxSpatial = { utilisateur: { nom: 'Kevin', initiales: 'KG', email: 'k@x.fr', role: 'Admin' }, credits: { solde: 10, dotation: 20, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const URL_LOGO = 'https://cdn.exemple.test/bucket/assets/ws/1-ab-logo.png';
const APERCU = `/api/brands/b1/media?url=${encodeURIComponent(URL_LOGO)}`;
const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
/** Ce que rend l'action pour un logo REMPLACÉ · le bilan du noyau, tel que le serveur le calcule. */
const REMPLACE: LogoParDefautAffiche = logoParDefautAffiche({
  bilan: bilanLogosCharte({ logos: [], defaut: URL_LOGO, empreintes: { [URL_LOGO]: MD5 }, verifications: new Map([[URL_LOGO, { ok: false, raison: 'remplace' } as const]]) }),
  brandId: 'b1', peutGerer: true,
});

function donnees(o: { logoAVerifier?: boolean; etatLogo?: DonneesCoquille['etatLogo'] } = {}): DonneesCoquille {
  const ouverts = new Set(['/studio/projets', '/brands', '/settings']);
  const marque = { id: 'b1', nom: 'Neva' };
  return {
    entrees: entreesRail({ ouverts, marque }), espace: entreesRailEspace({ ouverts, marque }),
    marque: { ...marque, logoUrl: APERCU, imageUrl: APERCU, logoAVerifier: o.logoAVerifier ?? true },
    marques: [{ id: 'b1', nom: 'Neva' }], peutGererMarques: true, admin: false, passer: null, railOuvert: true,
    utilisateur: CTX.utilisateur, espaceNom: 'GLX', credits: CTX.credits, nonLues: 0, deconnexion: async () => {},
    ouverts: [...ouverts], jarvis: false, etatLogo: o.etatLogo,
  };
}

let racine: Root | null = null;
let hote: HTMLDivElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); });
afterEach(() => { act(() => racine?.unmount()); racine = null; hote.remove(); document.body.innerHTML = ''; document.body.removeAttribute('style'); vi.restoreAllMocks(); });
const monter = async (n: React.ReactNode) => { await act(async () => { racine = createRoot(hote); racine.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); }); };
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const bouton = () => document.getElementById('brandsw') as HTMLButtonElement;
const echouer = async () => { await act(async () => { bouton().querySelector('img')!.dispatchEvent(new Event('error')); }); await flush(); };
const ouvrirFeuille = async () => { await act(async () => { bouton().click(); }); };

describe('Coquille · le logo de la marque active ne s’affiche pas', () => {
  it('logo importé REMPLACÉ · initiale, « Logo à réimporter » sur le bouton et dans la feuille, lien vers l’Identité · une seule demande', async () => {
    const etatLogo = vi.fn(async () => REMPLACE);
    await monter(<Coquille donnees={donnees({ etatLogo })}><div /></Coquille>);
    expect(bouton().querySelector('img')!.getAttribute('src'), 'la route média, jamais l’adresse privée').toBe(APERCU);
    expect(etatLogo, 'rien n’est demandé tant que l’image s’affiche').not.toHaveBeenCalled();
    await echouer();
    expect(etatLogo).toHaveBeenCalledTimes(1);
    expect(etatLogo).toHaveBeenCalledWith({ brandId: 'b1' });
    expect(bouton().querySelector('img')).toBeNull();
    expect(bouton().className).toBe('logo');
    expect(bouton().textContent).toContain('N');
    expect(bouton().getAttribute('data-logo-etat')).toBe('a_reimporter');
    expect(bouton().getAttribute('aria-label')).toBe('Changer de marque · Neva · Logo à réimporter');
    expect(bouton().getAttribute('title')).toBe(`Logo à réimporter · ${RAISONS_LOGO_CHARTE.remplace}`);
    expect(bouton().querySelector('.rbadge')).not.toBeNull();
    expect(document.querySelector('.brandrow .lab small')!.textContent).toBe('Logo à réimporter');
    expect(document.body.style.getPropertyValue('--img'), 'un logo refusé ne sert pas de fond').toBe('');
    await ouvrirFeuille();
    const lien = document.querySelector('#sheet a[data-logo-etat="a_reimporter"]') as HTMLAnchorElement;
    expect(lien, 'la feuille « Changer de marque » le dit').not.toBeNull();
    expect(lien.getAttribute('href')).toBe('/brands/b1/identite');
    expect(lien.textContent).toContain(`Logo à réimporter · ${RAISONS_LOGO_CHARTE.remplace}`);
    expect(etatLogo, 'une fois par marque').toHaveBeenCalledTimes(1);
  });

  it('image en échec AVANT l’hydratation (aucun onError) · relue au montage, la raison est demandée', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    const etatLogo = vi.fn(async () => REMPLACE);
    await monter(<Coquille donnees={donnees({ etatLogo })}><div /></Coquille>);
    await flush();
    expect(etatLogo).toHaveBeenCalledTimes(1);
    expect(bouton().getAttribute('data-logo-etat')).toBe('a_reimporter');
  });

  it('logo SANS empreinte · l’initiale à la place de l’image cassée, AUCUNE demande, aucun signal', async () => {
    const etatLogo = vi.fn(async () => REMPLACE);
    await monter(<Coquille donnees={donnees({ logoAVerifier: false, etatLogo })}><div /></Coquille>);
    await echouer();
    expect(etatLogo).not.toHaveBeenCalled();
    expect(bouton().querySelector('img')).toBeNull();
    expect(bouton().hasAttribute('data-logo-etat')).toBe(false);
    expect(document.querySelector('.brandrow .lab small')!.textContent).toBe('Changer de marque');
  });

  it('logo servi selon le serveur (image refusée pour une autre raison) · l’initiale, aucun signal', async () => {
    await monter(<Coquille donnees={donnees({ etatLogo: async () => ({ image: true, signal: null }) })}><div /></Coquille>);
    await echouer();
    expect(bouton().querySelector('img')).toBeNull();
    expect(bouton().hasAttribute('data-logo-etat')).toBe(false);
    await ouvrirFeuille();
    expect(document.querySelector('#sheet [data-logo-etat]')).toBeNull();
  });
});

describe('Assistant · Format & devis · un logo lié à réimporter', () => {
  const brief: BriefCanonique = { objective: 'o', audience: '', hypothesisId: null, testedVariable: '', facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: [], exclusions: [] };
  const vue = (logosAReimporter: VueParcoursImage['logosAReimporter']): VueParcoursImage => ({
    projet: { id: 'proj-1' }, version: { id: 'v1', n: 1 }, modes: [{ mode: 'generative_scene', libelle: 'Mise en scène', pret: true }],
    format: { largeur: 1080, hauteur: 1350, libelle: 'Portrait · 4:5', depuisBrief: false },
    disponibilite: { compilation: { disponible: true, raison: '' }, retenir: { disponible: true, raison: '' }, devis: { disponible: true, raison: '' }, lancement: { disponible: true, raison: '' } },
    coutCompilationUsd: 0.14, prix: { credits: 4, usdMicros: 600_000 }, enAttente: null, retenue: null, devis: null, jobs: [],
    controleVision: { disponible: false, borneParImageUsdMicros: 0 }, composantsObligatoires: [], peutRelire: true, logosAReimporter,
  });
  const ANNONCE = annonceLogosAReimporter({
    utilises: ['logo_1'], logos: [{ assetId: 'logo_1', url: URL_LOGO, libelle: 'Logo principal' }],
    bilan: bilanLogosCharte({ logos: [URL_LOGO], defaut: null, empreintes: { [URL_LOGO]: MD5 }, verifications: new Map([[URL_LOGO, { ok: false, raison: 'remplace' } as const]]) }),
    brandId: 'b1', peutGerer: true,
  });

  it('l’annonce et le lien vers l’Identité, AVANT « Préparer la consigne avec Jarvis », qui reste ouvert', async () => {
    expect(ANNONCE).not.toBeNull();
    h.vue = vue(ANNONCE);
    const orn = document.createElement('div'); orn.id = 'orn'; orn.hidden = true; document.body.appendChild(orn);
    await monter(<FormatDevis projectId="proj-1" version={{ id: 'v1', n: 1 }} brief={brief} onBriefChange={() => {}} onDevisPret={() => {}} onRetour={() => {}} />);
    await flush();
    const annonce = document.querySelector('[data-logo-a-reimporter="logo_1"]');
    const preparer = document.querySelector('[data-bouton="compiler-consigne"]') as HTMLButtonElement;
    expect(annonce, 'annonce absente').not.toBeNull();
    expect(annonce!.textContent).toContain(ANNONCE!.message);
    expect(annonce!.querySelector('a')!.getAttribute('href')).toBe('/brands/b1/identite');
    expect(annonce!.compareDocumentPosition(preparer) & Node.DOCUMENT_POSITION_FOLLOWING, 'l’annonce précède le geste payant').toBeTruthy();
    expect(preparer.disabled, 'rien n’est bloqué').toBe(false);
  });

  it('rien à réimporter · aucune annonce', async () => {
    h.vue = vue(null);
    await monter(<FormatDevis projectId="proj-1" version={{ id: 'v1', n: 1 }} brief={brief} onBriefChange={() => {}} onDevisPret={() => {}} onRetour={() => {}} />);
    await flush();
    expect(document.querySelector('[data-bouton="compiler-consigne"]')).not.toBeNull();
    expect(document.querySelector('[data-logo-a-reimporter]')).toBeNull();
  });
});
