// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useGaleriePaginee } from '../components/useGaleriePaginee';

/**
 * Lot 13 · galeries Image/Vidéo paginées CÔTÉ SERVEUR. Le hook tient une page
 * et sa borne · on vérifie ce qu'il DEMANDE au serveur et ce qu'il AFFICHE.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type P = { items: string[]; page: number; jusqua: string };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });

function monter(charger: (q: { page: number; jusqua?: string }) => Promise<P>) {
  const api: { g?: ReturnType<typeof useGaleriePaginee<string, P>> } = {};
  function Hote() { api.g = useGaleriePaginee<string, P>({ items: ['a1'], page: 0, jusqua: 'B0' }, charger); return <p>{api.g.etat.items.join(',')}|{api.g.etat.page}</p>; }
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  act(() => { root!.render(<Hote />); });
  return api;
}
const differe = () => { let r!: (v: P) => void; const p = new Promise<P>((res) => { r = res; }); return { p, r }; };

describe('Galerie paginée · borne, ordre des réponses, relecture', () => {
  it('changer de page garde la borne de consultation ; depuisLeDebut la laisse au serveur', async () => {
    const charger = vi.fn(async (q: { page: number; jusqua?: string }) => ({ items: [`p${q.page}`], page: q.page, jusqua: q.jusqua ?? 'B1' }));
    const api = monter(charger);
    await act(async () => { await api.g!.aller(2); });
    expect(charger).toHaveBeenLastCalledWith({ page: 2, jusqua: 'B0' });
    expect(el!.textContent).toBe('p2|2');
    await act(async () => { await api.g!.depuisLeDebut(); });
    expect(charger).toHaveBeenLastCalledWith({ page: 0, jusqua: undefined });
    await act(async () => { await api.g!.aller(1); });
    expect(charger, 'la nouvelle borne n’est pas reprise').toHaveBeenLastCalledWith({ page: 1, jusqua: 'B1' });
  });
  it('une réponse lente d’une demande plus ancienne n’écrase pas la plus récente', async () => {
    const lente = differe(); const rapide = differe();
    const charger = vi.fn().mockReturnValueOnce(lente.p).mockReturnValueOnce(rapide.p);
    const api = monter(charger);
    let a!: Promise<void>, b!: Promise<void>;
    act(() => { a = api.g!.aller(1); b = api.g!.aller(2); });
    await act(async () => { rapide.r({ items: ['p2'], page: 2, jusqua: 'B0' }); await b; });
    await act(async () => { lente.r({ items: ['p1'], page: 1, jusqua: 'B0' }); await a; });
    expect(el!.textContent, 'la page 1, arrivée en retard, a remplacé la page 2').toBe('p2|2');
  });
  it('recharger relit la page courante sous la même borne', async () => {
    const charger = vi.fn(async (q: { page: number; jusqua?: string }) => ({ items: [`p${q.page}`], page: q.page, jusqua: q.jusqua ?? 'B1' }));
    const api = monter(charger);
    await act(async () => { await api.g!.aller(3); });
    await act(async () => { await api.g!.recharger(); });
    expect(charger).toHaveBeenLastCalledWith({ page: 3, jusqua: 'B0' });
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
describe('Studios Image et Vidéo · la galerie n’est plus le reliquat des 24 dernières générations', () => {
  it('lectures serveur paginées, sans coupe fixe ; studios sans découpe locale', () => {
    for (const a of ['app/actions/image.ts', 'app/actions/video.ts']) {
      expect(src(a), `${a} · coupe fixe aux 24 dernières générations`).not.toMatch(/orderBy\(desc\(schema\.generations\.createdAt\)\)\.limit\(24\)/);
    }
    expect(src('app/actions/image.ts')).toMatch(/limit \$\{TAILLE_PAGE_GALERIE\} offset \$\{f\.offset\}/);
    expect(src('app/actions/video.ts')).toMatch(/\.limit\(TAILLE_PAGE_GALERIE\)\.offset\(f\.offset\)/);
    for (const s of ['app/(app)/studio/image/ImageStudio.tsx', 'app/(app)/studio/video/VideoStudioFull.tsx']) {
      expect(src(s), `${s} · découpe locale d’une liste chargée`).not.toMatch(/\.slice\([^)]*PAGE_SIZE/);
      expect(src(s)).toContain('useGaleriePaginee');
    }
    // Changer de marque remonte le studio · plus la galerie de la marque précédente.
    for (const p of ['app/(app)/studio/image/page.tsx', 'app/(app)/studio/video/page.tsx']) expect(src(p)).toContain("key={brand?.id ?? 'sans-marque'}");
  });
});

import { focusApresRetrait } from '../components/focusApresRetrait';
describe('Retrait d’une carte · le focus reste dans la galerie (lot 13)', () => {
  const grille = (n: number) => { const g = document.createElement('div'); for (let i = 0; i < n; i++) { const c = document.createElement('div'); const b = document.createElement('button'); b.textContent = `c${i}`; c.appendChild(b); g.appendChild(c); } document.body.appendChild(g); return g; };
  const titre = () => { const h = document.createElement('h2'); h.tabIndex = -1; h.textContent = 'Tes visuels'; document.body.appendChild(h); return h; };
  it('même rang, sinon la dernière carte, sinon le titre · jamais body', () => {
    const raf = globalThis.requestAnimationFrame; globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 0; }) as typeof requestAnimationFrame;
    try {
      const g = grille(3); const h = titre();
      focusApresRetrait(g, 1, h); expect(document.activeElement?.textContent).toBe('c1');
      focusApresRetrait(g, 9, h); expect(document.activeElement?.textContent, 'au-delà · la dernière carte').toBe('c2');
      const vide = grille(0); focusApresRetrait(vide, 0, h); expect(document.activeElement, 'grille vide · le titre').toBe(h);
    } finally { globalThis.requestAnimationFrame = raf; document.body.innerHTML = ''; }
  });
  it('les deux studios l’appellent après le rechargement de la page', () => {
    for (const s of ['app/(app)/studio/image/ImageStudio.tsx', 'app/(app)/studio/video/VideoStudioFull.tsx']) {
      expect(src(s)).toMatch(/await galerie\.recharger\(\);\n\s*focusApresRetrait\(grilleRef\.current/);
    }
  });
});
