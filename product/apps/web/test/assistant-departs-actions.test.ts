import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ garde: vi.fn(), marque: vi.fn(), sources: vi.fn(), portee: vi.fn(), detail: vi.fn(), ads: vi.fn() }));
vi.mock('@tiktrends/db', () => ({ db: {}, schema: {} }));
vi.mock('../lib/studios/sources/acces', () => ({ gardeSources: h.garde }));
vi.mock('../lib/studios/interrupteurs', () => ({ refusCapacite: async () => null }));
vi.mock('../lib/brands', () => ({ getActiveBrand: h.marque }));
vi.mock('../lib/adsmap-marque', () => ({ adsDeLaMarque: h.portee }));
vi.mock('../lib/studios/sources/sources', () => ({ chargerSources: h.sources }));
vi.mock('../lib/asset-ai-url', () => ({ assetAiUrl: (url: string) => url }));
vi.mock('../app/actions/adsmap', () => ({ listAdsAction: h.ads }));
vi.mock('../app/actions/adsmap-verdict', () => ({ adDetailAction: h.detail }));
import { lireDepartAssistant, listerDepartsAssistant } from '../app/actions/studios/departs-assistant';
const id = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks();
  h.garde.mockResolvedValue({ ok: true, ctx: { workspaceId: 'w1', marques: ['b1'] }, veilleOuverte: true });
  h.marque.mockResolvedValue({ id: 'b1' });
});
it('un refus de lecture ne consulte aucun catalogue', async () => {
  h.garde.mockResolvedValue({ ok: false, message: 'Accès refusé' });
  expect(await listerDepartsAssistant('iteration')).toEqual({ ok: false, message: 'Accès refusé' });
  expect(h.ads).not.toHaveBeenCalled(); expect(h.sources).not.toHaveBeenCalled();
});
it('relit la sauvegarde via le résolveur de portée, sans faire confiance au client', async () => {
  h.sources.mockResolvedValue({ ok: true, sources: [{ annonceur: 'Source réelle' }] });
  const r = await lireDepartAssistant('veille', id);
  expect(h.sources).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w1' }), [{ type: 'sauvegarde', id }], expect.objectContaining({ veilleOuverte: true }));
  expect(r).toMatchObject({ ok: true, depart: { titre: 'D’après Source réelle', sources: [{ type: 'sauvegarde', id }], testId: null } });
});
it('un test hors marque est refusé avant lecture de ses détails', async () => {
  h.portee.mockResolvedValue(new Set());
  expect(await lireDepartAssistant('iteration', id)).toMatchObject({ ok: false });
  expect(h.detail).not.toHaveBeenCalled();
});
it('liste seulement les gagnantes arbitrées comparables avec apprentissage', async () => {
  const base = { id, concept: 'Concept', variantCode: 'V1', verdict: 'winner', verdictStatus: 'validated', comparable: true, learnings: ['Un apprentissage'], assetUrl: null };
  h.ads.mockResolvedValue({ rows: [base, { ...base, id: 'perdante', verdict: 'loser' }, { ...base, id: 'calcule', verdictStatus: 'computed' }, { ...base, id: 'sansappris', learnings: [] }] });
  const r = await listerDepartsAssistant('iteration');
  expect(r).toMatchObject({ ok: true, choix: [{ id }] });
  if (r.ok) expect(r.choix).toHaveLength(1);
});
