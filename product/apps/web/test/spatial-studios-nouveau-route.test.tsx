import { beforeEach, expect, it, vi } from 'vitest';
/**
 * Spatial · « Nouveau projet » (page serveur) · la relecture du contexte de
 * l'adresse sous les droits du serveur, sans aucune écriture. Gardes PORTÉES
 * de la page V5 retirée (même relecture, mêmes refus dits) sur la page Spatial.
 */
const h = vi.hoisted(() => ({ sources: vi.fn(), portee: vi.fn(), detail: vi.fn(), ouvrir: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(to); } }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', role: 'admin' }) }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: 'b1', name: 'Marque' }), listBrands: async () => [{ id: 'b1', name: 'Marque' }] }));
vi.mock('../lib/access', () => ({ effectiveAccess: () => ({}) }));
vi.mock('../lib/rbac', () => ({ FEATURES: [{ key: 'adsmap' }], canAccess: () => true, roleAtLeast: () => true }));
vi.mock('../lib/studios/sources/acces', () => ({ gardeSources: async () => ({ ok: true, ctx: { workspaceId: 'w', marques: ['b1','b2'], permissions: { espace: new Set(['studio.read','studio.propose']) } }, veilleOuverte: true }) }));
vi.mock('../lib/studios/interrupteurs', () => ({ refusCapacite: async () => null }));
vi.mock('../lib/studios/sources/sources', () => ({ chargerSources: h.sources }));
vi.mock('../lib/adsmap-marque', () => ({ adsDeLaMarque: h.portee }));
vi.mock('../app/actions/adsmap-verdict', () => ({ adDetailAction: h.detail }));
vi.mock('../app/actions/studios/assistant', () => ({ ouvrirAssistantProjet: h.ouvrir }));
vi.mock('../spatial/vues/studios/NouveauProjet', () => ({ NouveauProjet: () => null }));
import Page from '../app/(spatial)/sp/studio/projets/nouveau/page';
const ref = '00000000-0000-4000-8000-000000000001';
beforeEach(() => { vi.clearAllMocks(); h.ouvrir.mockResolvedValue({ ok: true, props: { etat: { etat: 'pret' }, personas: [], produits: [], initial: { type: 'image', titre: '', intention: '' } } }); });
it('le départ sans contexte rejoint le même assistant, sans écriture', async () => {
 const r: any = await Page({ searchParams: Promise.resolve({ type: 'image' }) }); expect(r.props.contexte).toMatchObject({ depart: null, references: [] }); expect(h.sources).not.toHaveBeenCalled(); expect(h.detail).not.toHaveBeenCalled();
});
it('la référence du lien est relue dans la marque active et transmise avec son identifiant', async () => {
 h.sources.mockResolvedValue({ ok: true, sources: [{ annonceur: 'Annonce réelle' }] });
 const r: any = await Page({ searchParams: Promise.resolve({ ref, angle: 'Mon objectif' }) });
 expect(h.sources).toHaveBeenCalledWith(expect.objectContaining({ marques: ['b1'] }), [{ type: 'sauvegarde', id: ref }], expect.anything());
 expect(r.props.contexte.references).toEqual([expect.objectContaining({ id: ref, sources: [{ type: 'sauvegarde', id: ref }] })]); expect(r.props.initial.intention).toContain('Mon objectif');
});
it('une source refusée est signalée sans transmettre une référence fictive', async () => {
 h.sources.mockResolvedValue({ ok: false, message: 'Source hors marque' });
 const r: any = await Page({ searchParams: Promise.resolve({ ref }) }); expect(r.props.contexte.references).toEqual([]); expect(r.props.contexte.notes.length).toBeGreaterThan(0);
});
it('un test hors marque ne lit pas le verdict et conserve la note de refus', async () => {
 h.portee.mockResolvedValue(new Set());
 const r: any = await Page({ searchParams: Promise.resolve({ iter: ref }) }); expect(h.detail).not.toHaveBeenCalled(); expect(r.props.contexte.depart).toBeNull(); expect(r.props.contexte.notes.length).toBeGreaterThan(0);
});

it('ref + test éligible : une seule référence, provenance et revalidation du test conservées', async () => {
 h.sources.mockResolvedValue({ ok: true, sources: [{ annonceur: 'Annonce' }] }); h.portee.mockResolvedValue(new Set([ref]));
 h.detail.mockResolvedValue({ detail: { id: ref, variantCode: 'V1', concept: 'Concept réel', angle: 'Angle', persona: 'Audience', personaId: null, verdictStatus: 'validated', validated: 'winner', comparable: true, testedVariable: 'hook', variableValue: 'Court', metrics: { cpa: 10, hookRate: 0.5, ctr: 0.02 }, learnings: [{ statement: 'Accroche efficace', confidence: 'high', scope: 'brand' }] } });
 const r: any = await Page({ searchParams: Promise.resolve({ ref, iter: ref }) });
 expect(r.props.contexte.depart).toMatchObject({ origine: 'iteration', id: ref, testId: ref, sources: [] }); expect(r.props.contexte.references).toHaveLength(1); expect(r.props.initial.intention).toContain(`Test source Adsmap : ${ref}`);
});
