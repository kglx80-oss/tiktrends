import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const mocks = vi.hoisted(() => ({
  garde: vi.fn(), charger: vi.fn(), brand: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', role: 'owner' }) }));
vi.mock('../lib/brands', () => ({ getActiveBrand: mocks.brand }));
vi.mock('../lib/jarvis-acces', () => ({ refusJarvis: () => null, TEXTE_REFUS_JARVIS: { plan: '', role: '' } }));
vi.mock('../lib/jarvis-fiche', () => ({ ficheMarqueLue: async () => null }));
vi.mock('../lib/studios/jarvis-projets', () => ({ projetsPourColonneJarvis: async () => [] }));
vi.mock('../lib/studios/sources/acces', () => ({ gardeSources: mocks.garde }));
vi.mock('../lib/studios/sources/sources', () => ({ chargerSources: mocks.charger }));
// Vague 3 · l'écran est servi par Spatial (exclusif) · on rend sa vraie vue, le brouillon est dans le champ.
const { default: Page } = await import('../app/(spatial)/sp/jarvis/veille/page');
const params = { action: 'scripts', ref: 'b10bb82f-31c8-42e1-bf59-99a0438d6abf' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.garde.mockResolvedValue({ ok: true, ctx: { workspaceId: 'w', marques: ['b'] }, veilleOuverte: true });
  mocks.brand.mockResolvedValue({ id: 'b', name: 'Ma marque' });
  mocks.charger.mockResolvedValue({ ok: true, sources: [{ sourceId: 's', cle: 'meta:pub', annonceur: 'Concurrent', extraitAutorise: 'Texte visible' }] });
});

describe('Page de relais Veille : gardes avant contexte', () => {
  it('refus garde : ne lit aucune source', async () => {
    mocks.garde.mockResolvedValue({ ok: false });
    const h = renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
    expect(h).toContain('Source indisponible');
    expect(mocks.charger).not.toHaveBeenCalled();
  });
  it('source hors portée ou supprimée : aucun contexte ni conversation affiché', async () => {
    mocks.charger.mockResolvedValue({ ok: false, code: 'NOT_FOUND' });
    const h = renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
    expect(h).toContain('Source indisponible');
    expect(h).not.toContain('<textarea');
    expect(mocks.brand).not.toHaveBeenCalled();
  });
  it('marque inaccessible : ne passe pas le contexte à Jarvis', async () => {
    mocks.brand.mockResolvedValue({ id: 'autre', name: 'Marque interdite' });
    const h = renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
    expect(h).toContain('Choisis ta marque');
    expect(h).not.toContain('Marque interdite');
    expect(h).not.toContain('<textarea');
  });
  it('source autorisée : chargée sous le contexte de session et préparée pour relecture', async () => {
    const h = renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
    expect(mocks.charger).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w' }), [{ type: 'sauvegarde', id: params.ref }], expect.objectContaining({ veilleOuverte: true }));
    expect(h).toContain('Texte visible');
    expect(h).toContain('Ma marque');
    expect(h).toContain('pas une transcription audio');
    expect(h).toContain('<textarea');
  });
});
