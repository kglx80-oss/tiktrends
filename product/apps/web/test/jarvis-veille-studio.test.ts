import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ session: vi.fn(), brand: vi.fn(), access: vi.fn(), create: vi.fn() }));
vi.mock('../lib/auth', () => ({ getSession: m.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: m.brand }));
vi.mock('../lib/jarvis-acces', () => ({ refusJarvis: m.access }));
vi.mock('../app/actions/studios/sources', () => ({ creerProjetDepuisSources: m.create }));
import { creerStudioDepuisJarvis } from '../app/actions/jarvis-veille-studio';
const input = { params: { action: 'cloner', annonce: JSON.stringify({ id: 'a1', platform: 'meta', mediaType: 'image', mediaUrl: 'https://example.com/a.jpg' }) }, brandId: 'b1', objectif: 'Composition conservée, produit de ma marque', kind: 'image', cleClic: 'clic-stable' };
beforeEach(() => { vi.resetAllMocks(); m.session.mockResolvedValue({ workspaceId: 'w1' }); m.brand.mockResolvedValue({ id: 'b1', name: 'Neva' }); m.access.mockReturnValue(null); m.create.mockResolvedValue({ ok: true, projet: { id: 'p1' } }); });
it('transmet brief et référence au créateur canonique avec la clé stable', async () => {
 expect((await creerStudioDepuisJarvis(input)).ok).toBe(true);
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ brandId: 'b1', objectif: input.objectif, kind: 'image', cleClic: 'clic-stable', sources: [expect.objectContaining({ type: 'veille', annonce: expect.objectContaining({ id: 'a1', mediaUrl: 'https://example.com/a.jpg' }) })] }));
});
it('refuse la marque changée avant toute création', async () => { m.brand.mockResolvedValue({ id: 'b2' }); expect((await creerStudioDepuisJarvis(input)).ok).toBe(false); expect(m.create).not.toHaveBeenCalled(); });
it('refuse un rôle sans accès Jarvis', async () => { m.access.mockReturnValue('refus'); expect((await creerStudioDepuisJarvis(input)).ok).toBe(false); expect(m.create).not.toHaveBeenCalled(); });
it.each([{ objectif: '' }, { objectif: 'x'.repeat(2001) }, { kind: 'invalide' }, { params: { action: 'cloner', annonce: '{}' } }])('refuse le transfert invalide %j', async change => { expect((await creerStudioDepuisJarvis({ ...input, ...change })).ok).toBe(false); expect(m.create).not.toHaveBeenCalled(); });
it('rend le refus de source ou de capacité de la commande canonique', async () => { m.create.mockResolvedValue({ ok: false, message: 'Source hors espace' }); expect(await creerStudioDepuisJarvis(input)).toEqual({ ok: false, message: 'Source hors espace' }); });
