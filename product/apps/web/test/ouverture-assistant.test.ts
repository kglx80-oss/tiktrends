import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ garde: vi.fn(), marque: vi.fn(), personas: vi.fn(), select: vi.fn() }));
vi.mock('../lib/studios/garde', () => ({ gardeStudio: h.garde }));
vi.mock('../lib/brands', () => ({ getActiveBrand: h.marque }));
vi.mock('../lib/studios/personas-marque', () => ({ personasDeLaMarque: h.personas }));
vi.mock('../lib/studios/produit/catalogue', () => ({ hacherImage: () => 'empreinte' }));
vi.mock('../lib/asset-ai-url', () => ({ assetAiUrl: (url: string) => url }));
vi.mock('@tiktrends/db', async (original) => ({ ...await original<object>(), db: { select: h.select } }));
import { ouvrirAssistantProjet } from '../app/actions/studios/assistant';
beforeEach(() => { vi.clearAllMocks(); h.marque.mockResolvedValue({ id: 'b2', name: 'Autre marque' }); });
describe('Ouverture assistant : lecture et portée', () => {
  it('renvoie le refus sans lire marque, persona ou produit', async () => {
    h.garde.mockResolvedValue({ ok: false, code: 'FORBIDDEN', message: 'Refus' });
    expect(await ouvrirAssistantProjet()).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(h.garde).toHaveBeenCalledWith('studio.read', 'projets');
    expect(h.marque).not.toHaveBeenCalled(); expect(h.personas).not.toHaveBeenCalled(); expect(h.select).not.toHaveBeenCalled();
  });
  it('une marque active hors droits ne charge ni produits ni personas', async () => {
    h.garde.mockResolvedValue({ ok: true, ctx: { workspaceId: 'w1', marques: ['b1'], permissions: { espace: new Set(['studio.propose']), plateforme: new Set() } } });
    const r = await ouvrirAssistantProjet();
    expect(r).toMatchObject({ ok: true, props: { etat: { etat: 'sans-marque' }, produits: [], personas: [] } });
    expect(h.personas).not.toHaveBeenCalled(); expect(h.select).not.toHaveBeenCalled();
  });
});
