import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const f = vi.hoisted(() => ({
  session: { role: 'admin', workspaceId: 'w', user: { email: 'a@example.org' } } as { role: string; workspaceId: string; user: { email: string } } | null,
  rows: [] as unknown[][], reserve: vi.fn(), refund: vi.fn(), generate: vi.fn(), update: vi.fn(), lock: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../lib/auth', () => ({ getSession: async () => f.session }));
vi.mock('../lib/credits', () => ({ unlimitedCredits: () => false, reserveCredits: f.reserve, refundCredits: f.refund }));
vi.mock('../lib/spend-guard', () => ({ guardedAnthropic: () => ({}) }));
vi.mock('@tiktrends/ai', () => ({ analyzeCompetitor: vi.fn(), generateBrandProfile: f.generate }));
vi.mock('@tiktrends/integrations', () => ({ ttSearchAds: vi.fn() }));
vi.mock('@tiktrends/db', () => {
  const chain = () => { const x = { from: () => x, where: () => x, limit: () => { const result = Promise.resolve(f.rows.shift() ?? []); return Object.assign(result, { for: (mode: string) => { f.lock(mode); return result; } }); } }; return x; };
  const db = { select: chain, update: () => ({ set: (values: unknown) => { f.update(values); return { where: async () => undefined }; } }), transaction: async (run: (tx: unknown) => unknown) => run(db) };
  return { db, schema: { brands: { id: 'id', workspaceId: 'workspaceId' } } };
});
import { proposerConcurrents, ajouterConcurrents } from '../app/actions/competitor';
// Vague 2 · le sourcing vit sur l'Identité Spatiale (même action, même prix).
import { SourcingConcurrents } from '../spatial/vues/marque/interactifs';

beforeEach(() => {
  vi.clearAllMocks();
  f.session = { role: 'admin', workspaceId: 'w', user: { email: 'a@example.org' } };
  f.rows = [[{ id: 'b' }], [{ id: 'b', name: 'Ma marque', competitors: ['Existant'], category: 'Soins' }]];
  f.reserve.mockResolvedValue(true);
  f.generate.mockResolvedValue({ competitors: ['Existant', 'Ma marque', 'Nouvelle', ' nouvelle ', 12] });
});
describe('Sourcing concurrents', () => {
  it('annonce le prix avant le clic et ne lance aucun appel au rendu', () => {
    const html = renderToStaticMarkup(<SourcingConcurrents brandId="b" prix="5 crédits" proposer={proposerConcurrents} ajouter={ajouterConcurrents} raison={null} />);
    expect(html).toContain('Proposer des concurrents · 5 crédits');
    expect(html).toContain('Aucun ajout automatique');
    expect(f.generate).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled();
  });
  it('produit une sélection non persistée, sans noms existants ni doublons', async () => {
    expect(await proposerConcurrents('b', 'France')).toEqual({ names: ['Nouvelle'] });
    expect(f.reserve).toHaveBeenCalledWith('w', 5, expect.any(String));
    expect(f.update).not.toHaveBeenCalled(); expect(f.generate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ siteText: expect.stringContaining('France') }));
  });
  it('refuse une marque hors espace avant tout débit', async () => {
    f.rows = [[]];
    expect(await proposerConcurrents('b', '')).toHaveProperty('error');
    expect(f.reserve).not.toHaveBeenCalled(); expect(f.generate).not.toHaveBeenCalled();
  });
  it('refuse un rôle lecteur et un ajout sans droits', async () => {
    f.session!.role = 'viewer';
    expect(await proposerConcurrents('b', '')).toHaveProperty('error');
    expect(await ajouterConcurrents('b', ['Nouvelle'])).toHaveProperty('error');
    expect(f.reserve).not.toHaveBeenCalled();
  });
  it('ne consulte pas le fournisseur quand le crédit manque', async () => {
    f.reserve.mockResolvedValue(false);
    expect(await proposerConcurrents('b', '')).toHaveProperty('error'); expect(f.generate).not.toHaveBeenCalled();
  });
  it('ajoute seulement les noms retenus et conserve ceux ajoutés en parallèle', async () => {
    f.rows = [[{ id: 'b' }], [{ name: 'Ma marque', competitors: ['Existant', 'Autre ajout'] }]];
    expect(await ajouterConcurrents('b', ['Nouvelle', ' existant ', 'Ma marque'])).toEqual({ ok: true });
    expect(f.update).toHaveBeenCalledWith({ competitors: ['Existant', 'Autre ajout', 'Nouvelle'] });
    expect(f.lock).toHaveBeenCalledWith('update');
    expect(f.generate).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled();
  });
  it('refuse une sélection invalide sans modifier la fiche', async () => {
    expect(await ajouterConcurrents('b', [''])).toHaveProperty('error');
    expect(f.update).not.toHaveBeenCalled();
  });
  it('rembourse les crédits si la proposition échoue', async () => {
    f.generate.mockRejectedValue(new Error('provider'));
    expect(await proposerConcurrents('b', '')).toHaveProperty('error');
    expect(f.refund).toHaveBeenCalledWith('w', 5, expect.any(String));
  });
});
