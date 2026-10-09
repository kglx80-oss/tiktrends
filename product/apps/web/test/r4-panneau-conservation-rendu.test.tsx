// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * R4 · le panneau d'export dit, pour chaque export, s'il est CONSERVÉ (servi
 * tel quel) ou refait à la demande · en toutes lettres, au HTML rendu, jamais
 * par la seule couleur. Un export L7-A (sans champ) est dit non conservé.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const m = vi.hoisted(() => ({ exporter: vi.fn() }));
vi.mock('../app/actions/studios/export', () => ({ exporterVersion: m.exporter, lireExportProjet: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import type { ExportRealise, VueExport } from '../lib/studios/export/export';
import { PanneauExport } from '../components/studios/export/PanneauExport';

const SHA = 'c'.repeat(64);
const realise = (o: Partial<ExportRealise> = {}): ExportRealise => ({
  projectId: 'p1', versionId: 'v1', versionN: 1, format: 'png', mime: 'image/png', largeur: 1080, hauteur: 1080, octets: 2048,
  sha256: SHA, empreinteCourte: SHA.slice(0, 12), nomFichier: 'serum-v1-png.png', url: `/api/studios/export/v1?format=png&empreinte=${SHA}`, le: null, ...o,
});
const vue = (historique: ExportRealise[]): VueExport => ({
  projet: { id: 'p1', title: 'Sérum', marque: 'Éclat' }, version: { id: 'v2', n: 2, courante: true }, versions: [{ id: 'v2', n: 2, courante: true }],
  document: { largeur: 1080, hauteur: 1080, calques: 3 }, preflight: { ok: true, medias: 1, polices: 1 }, historique, peutExporter: true,
});

let racine: HTMLDivElement; let root: Root;
beforeEach(() => { racine = document.createElement('div'); document.body.appendChild(racine); root = createRoot(racine); });
afterEach(() => { act(() => root.unmount()); racine.remove(); });

describe('R4 · panneau d’export · conservation dite', () => {
  it('historique · conservé, non conservé, et export L7-A sans champ', async () => {
    await act(async () => {
      root.render(<PanneauExport vue={vue([
        realise({ versionId: 'v2', versionN: 2, conserve: true, sha256: 'd'.repeat(64), url: '/api/studios/export/v2?format=png&empreinte=' + 'd'.repeat(64) }),
        realise({ conserve: false }),
        realise({ versionId: 'v0', sha256: 'e'.repeat(64), url: '/api/studios/export/v0?format=png&empreinte=' + 'e'.repeat(64) }),
      ])} />);
    });
    const etats = [...racine.querySelectorAll('[data-historique]')].map((li) => [li.getAttribute('data-historique'), li.querySelector('[data-conserve]')?.getAttribute('data-conserve') ?? null, li.querySelector('[data-conserve]')?.textContent ?? '']);
    expect(etats, 'la conservation n’est pas dite dans l’historique').toEqual([
      ['v2', 'oui', 'Conservé · le téléchargement sert ce fichier, même si un média change ensuite.'],
      ['v1', 'non', 'Non conservé · refait à la demande, il n’est plus servi si un média a changé depuis.'],
      ['v0', 'non', 'Non conservé · refait à la demande, il n’est plus servi si un média a changé depuis.'],
    ]);
    expect(racine.innerHTML).not.toContain('—');
  });

  it('après un clic · le fichier vérifié dit qu’il est conservé, le lien reste le premier', async () => {
    m.exporter.mockResolvedValue({ ok: true, export: realise({ conserve: true }) });
    await act(async () => { root.render(<PanneauExport vue={vue([])} />); });
    await act(async () => { (racine.querySelector('button[data-format="png"]') as HTMLButtonElement).click(); });
    const fait = racine.querySelector('[data-export]')!;
    expect(fait.querySelector('a')!.getAttribute('href')).toBe(`/api/studios/export/v1?format=png&empreinte=${SHA}`);
    expect(fait.querySelector('[data-conserve]')?.textContent, 'la conservation n’est pas dite après l’export').toBe('Conservé · le téléchargement sert ce fichier, même si un média change ensuite.');
  });
});
