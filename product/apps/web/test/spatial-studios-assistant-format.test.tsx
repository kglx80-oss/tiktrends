// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ligneTexte, lireLigneTexte, type BriefCanonique, type ChangementPatch } from '@tiktrends/core';
import type { VueLotImages } from '../lib/studios/image/lot-images';
import type { CyclePropositionsBrief } from '../lib/studios/propositions/use-propositions-brief';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Spatial · « Nouveau projet » · format multi-formats, style (direction) et
 * photo produit, au RÉSULTAT. Gardes PORTÉES de l'assistant V5 retiré :
 *  · ex-`assistant-multi-formats-rendu` · deux formats × deux variantes = un
 *    lot de quatre, un seul format garde le lot simple, au moins un format,
 *    quatre au plus, un devis arrivé après un changement de version est
 *    refusé, le refus serveur est montré, la confirmation dit les formats ;
 *  · ex-`direction-champs-rendu` · chaque champ de direction devient une
 *    proposition MANUELLE bornée qui préserve le reste du brief ;
 *  · ex-`assistant-photo-produit` · lecture à l'ouverture, épinglage et
 *    import seulement par un geste, conflit dit, version relue avant de notifier.
 */

const h = vi.hoisted(() => ({
  multi: vi.fn(), simple: vi.fn(), manuel: vi.fn(), approuver: vi.fn(), lire: vi.fn(), epingler: vi.fn(), importer: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/nouveau', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../app/actions/studios/lot-formats', () => ({ preparerLotFormats: h.multi }));
vi.mock('../app/actions/studios/lot-images', () => ({ preparerLotImages: h.simple, approuverLotImages: h.approuver }));
vi.mock('../app/actions/studios/propositions', () => ({ creerPropositionManuelle: h.manuel, appliquerProposition: vi.fn(), inspecterProposition: vi.fn() }));
vi.mock('../app/actions/studios/image', () => ({
  lireParcoursImage: async () => ({ ok: true, vue: { version: { id: 'v1', n: 1 }, format: { depuisBrief: true, libelle: '4:5' }, retenue: { verdict: { ok: true } }, controleVision: { disponible: false }, modes: [], disponibilite: { compilation: { disponible: true }, retenir: { disponible: true } }, enAttente: null, coutCompilationUsd: 0.1 } }),
  demanderDevisImage: vi.fn(), compilerConsigneImage: vi.fn(), retenirConsigneImage: vi.fn(), approuverEtLancerImage: vi.fn(),
}));
vi.mock('../app/actions/studios/produit', () => ({ lireProduitProjet: h.lire, epinglerProduit: h.epingler }));
vi.mock('../app/actions/studios/departs-assistant', () => ({ listerDepartsAssistant: vi.fn(), lireDepartAssistant: vi.fn() }));
vi.mock('../spatial/vues/projet/Produit', () => ({
  ImportPhoto: (p: { onReussi: (id: string) => void; occupe: boolean }) => <button type="button" disabled={p.occupe} onClick={() => { h.importer(); p.onReussi('photo'); }}>Importer explicitement</button>,
}));

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { FormatDevis } = await import('../spatial/vues/studios/assistant/FormatDevis');
const { ConfirmationLot } = await import('../spatial/vues/studios/assistant/Confirmation');
const { Direction } = await import('../spatial/vues/studios/assistant/Direction');
const { PhotoProduitAssistant } = await import('../spatial/vues/studios/assistant/Panneaux');
type CtxSpatial = import('../spatial/coquille/contexte').CtxSpatial;
const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 100, dotation: 200, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};

const brief: BriefCanonique = { objective: 'Créer', audience: '', hypothesisId: null, testedVariable: '', facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: ['4:5'], exclusions: [] };
const lot = { id: 'lot', projectId: 'p', versionId: 'v1', nombre: 4, type: 'images-formats', formats: ['4:5', '4:5', '9:16', '9:16'], devis: [], totalCredits: 20, totalUsdMicros: 500000, qualification: { nature: 'borne', libelle: 'Maximum', raison: null }, expiresAt: new Date('2099-01-01'), empreinte: 'hash' } as unknown as VueLotImages;

let root: Root; let el: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  const orn = document.createElement('div'); orn.id = 'orn'; orn.hidden = true; document.body.appendChild(orn);
  h.multi.mockResolvedValue({ ok: true, lot });
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ''; });
const rendre = async (n: ReactNode) => { await act(async () => { root.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); }); await act(async () => { await Promise.resolve(); }); };
const clic = async (sel: string | Element | null) => {
  const e = typeof sel === 'string' ? document.querySelector<HTMLElement>(sel) : sel;
  expect(e, String(sel)).toBeTruthy();
  await act(async () => { (e as HTMLElement).click(); }); await act(async () => { await Promise.resolve(); });
};

describe('format · le devis réel d’un lot multi-formats', () => {
  const format = (onLotPret = vi.fn(), version = 'v1', b = brief) => rendre(<FormatDevis projectId="p" version={{ id: version, n: 1 }} brief={b} onBriefChange={vi.fn()} onDevisPret={vi.fn()} onLotPret={onLotPret} onRetour={vi.fn()} />).then(() => onLotPret);

  it('deux formats et deux variantes : quatre sorties, sans réécrire la consigne primaire', async () => {
    const onLot = await format();
    await clic('[data-format="9:16"]'); await clic('[data-nombre="1"]');
    expect(document.querySelector('[data-format="4:5"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.textContent).toContain('4 images');
    await clic('[data-bouton="voir-devis"]');
    expect(h.multi).toHaveBeenCalledWith({ projectId: 'p', formats: ['4:5', '9:16'], nombreParFormat: 2, controleVision: false });
    expect(onLot).toHaveBeenCalledWith(lot);
    expect(h.simple).not.toHaveBeenCalled(); expect(h.manuel).not.toHaveBeenCalled(); expect(h.approuver).not.toHaveBeenCalled();
  });

  it('un seul format avec deux variantes conserve le devis de lot simple', async () => {
    h.simple.mockResolvedValue({ ok: true, lot: { ...lot, type: 'images-meme-consigne', nombre: 2 } });
    const onLot = await format();
    await clic('[data-nombre="1"]'); await clic('[data-bouton="voir-devis"]');
    expect(h.simple).toHaveBeenCalledWith({ projectId: 'p', nombre: 2, controleVision: false });
    expect(h.multi).not.toHaveBeenCalled(); expect(onLot).toHaveBeenCalledTimes(1);
  });

  it('refuse un devis reçu après changement de version du projet', async () => {
    let resoudre!: (v: unknown) => void;
    h.multi.mockImplementation(() => new Promise((r) => { resoudre = r; }));
    const onLot = await format();
    await clic('[data-format="9:16"]'); await clic('[data-bouton="voir-devis"]');
    await format(onLot, 'v2');
    await act(async () => resoudre({ ok: true, lot }));
    expect(onLot).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('montre le refus serveur de cadrage sans inventer de devis', async () => {
    h.multi.mockResolvedValue({ ok: false, message: 'La consigne impose un autre cadrage.' });
    const onLot = await format();
    await clic('[data-format="9:16"]'); await clic('[data-bouton="voir-devis"]');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('autre cadrage');
    expect(onLot).not.toHaveBeenCalled();
  });

  it('les aperçus affichent le texte décodé, sans sérialisation ni langue technique', async () => {
    const texte = 'Votre rituel, simplement';
    await format(vi.fn(), 'v1', { ...brief, texts: [ligneTexte({ type: 'hook', langue: 'fr', texte, sources: [] })] });
    const bandes = [...el.querySelectorAll('[data-apercu-format] .band')];
    expect(bandes.length).toBeGreaterThan(0);
    for (const b of bandes) expect(b.textContent).toBe(texte);
    expect(el.textContent).not.toContain('Hook (fr)');
  });

  it('la confirmation affiche les formats attestés sans répéter les variantes', async () => {
    await rendre(<ConfirmationLot lot={lot} onModifier={vi.fn()} onLance={vi.fn()} />);
    expect(el.textContent).toContain('Formats : 4:5 · 9:16');
    expect(el.textContent).toContain('4 images');
    expect(h.approuver).not.toHaveBeenCalled();
  });
});

describe('style (direction) · champs raccordés sans écraser le brief', () => {
  const briefD: BriefCanonique = { ...brief, composition: 'Produit au centre', styleIntent: 'Pastel', texts: ['Hook (fr) · Ancienne accroche · sources : fait1', 'CTA (fr) · Découvrir · sources : fait2', 'Corps (fr) · Texte secondaire', 'Hook (en) · Keep this'] };
  async function monter(b = briefD, permission = true) {
    const changements: ChangementPatch[] = []; const adopter = vi.fn(async () => {}); const jarvis = vi.fn(async () => {});
    const cycle: CyclePropositionsBrief = {
      liste: { ok: true, projectId: 'p', versionCourante: { id: 'v', n: 1 }, propositions: [], jarvis: { disponible: true, motif: null, raison: '', coutMaxUsd: 0.13, mentionCout: 'Appel texte payant' }, peutProposer: permission, cibles: [] },
      version: { id: 'v', n: 1 }, occupe: null, retour: null, recharger: async () => {}, demanderJarvis: jarvis, adopter, rejeter: async () => {}, ecrireManuel: async (c) => { changements.push(c); },
    };
    await rendre(<Direction brief={b} cycle={cycle} onApplied={() => {}} apercuProduitUrl="/api/brands/b/media?kind=photo" />);
    return { changements, adopter, jarvis };
  }
  const saisir = async (sel: string, valeur: string) => { const i = el.querySelector(sel) as HTMLInputElement; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, valeur); i.dispatchEvent(new Event('input', { bubbles: true })); }); };

  it('concept facultatif : `add` puis proposition relue, jamais appliquée directement', async () => {
    const x = await monter(); await saisir('[data-champ="concept-libre"]', 'Été doux'); await clic('[data-bouton="ecrire-concept"]');
    expect(x.changements[0]).toMatchObject({ op: 'add', path: '/brief/concept', newValue: 'Été doux' });
    expect(x.adopter).not.toHaveBeenCalled(); expect(x.jarvis).not.toHaveBeenCalled();
  });
  it('accroche modifiée : préserve CTA, corps, autres langues et sources', async () => {
    const x = await monter(); await saisir('[data-champ="accroche-libre"]', 'Nouvelle accroche'); await clic('[data-bouton="ecrire-accroche"]');
    const c = x.changements[0]!; expect(c.path).toBe('/brief/texts');
    const texts = c.newValue as string[];
    expect(lireLigneTexte(texts[0]!)).toMatchObject({ type: 'hook', langue: 'fr', texte: 'Nouvelle accroche', sources: ['fait1'] });
    expect(texts.slice(1)).toEqual(briefD.texts.slice(1)); expect(x.adopter).not.toHaveBeenCalled();
  });
  it('CTA existant : remplacé sans altérer les autres lignes', async () => {
    const x = await monter(); await saisir('[data-champ="cta-libre"]', 'Voir la routine'); await clic('[data-bouton="ecrire-cta"]');
    const texts = x.changements[0]!.newValue as string[];
    expect(lireLigneTexte(texts[1]!)).toMatchObject({ type: 'cta', texte: 'Voir la routine', sources: ['fait2'] });
    expect(texts.filter((_, i) => i !== 1)).toEqual(briefD.texts.filter((_, i) => i !== 1));
  });
  it('CTA absent : ajoute une ligne sans inventer de CTA ni remplacer le corps · l’aperçu dit « pas une image générée »', async () => {
    const x = await monter({ ...briefD, texts: ['Texte original'] });
    expect((el.querySelector('[data-champ="cta-libre"]') as HTMLInputElement).value).toBe('');
    await saisir('[data-champ="cta-libre"]', 'En savoir plus'); await clic('[data-bouton="ecrire-cta"]');
    expect(x.changements[0]!.newValue).toEqual(['Texte original', 'CTA (fr) · En savoir plus']);
    expect(el.querySelector('img')?.alt).toContain('pas une image générée');
  });
  it('sans droit : aucune proposition manuelle', async () => {
    const x = await monter({ ...briefD, concept: 'Existant' }, false);
    for (const nom of ['concept', 'accroche', 'cta']) { const b = el.querySelector(`[data-bouton="ecrire-${nom}"]`) as HTMLButtonElement; expect(b.disabled).toBe(true); await clic(b); }
    expect(x.changements).toHaveLength(0);
  });
});

describe('photo produit du projet créé', () => {
  const vue = { projet: { id: 'proj', title: 'Projet', marque: 'Marque' }, version: { id: 'v1', n: 1 }, produits: [{ id: 'p1', nom: 'Produit réel', photos: [{ assetId: 'photo', apercu: '/photo', position: 1 }] }], epingle: null, peutModifier: true };
  beforeEach(() => { h.lire.mockResolvedValue({ ok: true, vue }); });
  const monter = async (projectId: string | null = 'proj') => { const cb = vi.fn(); await rendre(<PhotoProduitAssistant projectId={projectId} productId="p1" onChoisie={cb} />); return cb; };
  const bouton = (re: RegExp) => [...el.querySelectorAll('button')].find((b) => re.test(b.textContent ?? ''))!;

  it('sans projet, aucun catalogue ni import ; ouvrir un projet ne fait que lire', async () => {
    await monter(null);
    expect(h.lire).not.toHaveBeenCalled(); expect(el.textContent).toContain('Enregistre le brief');
    await act(async () => root.render(null));
    await monter();
    expect(h.lire).toHaveBeenCalledWith({ projectId: 'proj' }); expect(h.epingler).not.toHaveBeenCalled(); expect(h.importer).not.toHaveBeenCalled();
  });
  it('la lecture seule interdit épinglage et import', async () => {
    h.lire.mockResolvedValue({ ok: true, vue: { ...vue, peutModifier: false } });
    await monter();
    const b = [...el.querySelectorAll('button')].filter((x) => /Épingler|Importer/.test(x.textContent!));
    expect(b).toHaveLength(2); expect(b.every((x) => x.disabled)).toBe(true);
  });
  it('un conflit ne notifie pas une photo épinglée ; la relecture rétablit la version', async () => {
    const cb = await monter();
    h.epingler.mockResolvedValue({ ok: false, message: 'Version modifiée' });
    await clic(bouton(/Épingler/));
    expect(h.epingler).toHaveBeenCalledWith(expect.objectContaining({ baseVersionId: 'v1', productId: 'p1', photoId: 'photo' }));
    expect(cb).not.toHaveBeenCalled(); expect(el.textContent).toContain('Version modifiée');
    h.lire.mockResolvedValue({ ok: true, vue: { ...vue, version: { id: 'v2', n: 2 }, epingle: { productId: 'p1', photo: { assetId: 'photo' } } } });
    await clic(bouton(/Recharger le catalogue/));
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ version: { id: 'v2', n: 2 }, photo: expect.objectContaining({ assetId: 'photo' }) }));
  });
  it('après un import explicite, relit la version réelle avant de notifier', async () => {
    const cb = await monter();
    h.lire.mockResolvedValue({ ok: true, vue: { ...vue, version: { id: 'v3', n: 3 }, epingle: { productId: 'p1', photo: { assetId: 'photo' } } } });
    await clic(bouton(/Importer/));
    expect(h.importer).toHaveBeenCalledTimes(1); expect(h.epingler).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ version: { id: 'v3', n: 3 } }));
  });
});
