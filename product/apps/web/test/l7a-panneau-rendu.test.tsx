// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * L7-A · le panneau d'export au HTML RENDU.
 *
 *  · préflight refusé : chaque point nomme sa CIBLE (calque, police, média),
 *    les boutons d'export sont inactifs, rien n'est envoyé ;
 *  · préflight prêt : un clic appelle l'export de CETTE version, puis le
 *    panneau montre le fichier vérifié (format, dimensions, poids,
 *    empreinte) et son lien de téléchargement par version + empreinte ;
 *  · refus au clic (ressource révoquée entre-temps) : la cible s'affiche ;
 *  · lecteur sans `studio.export` : aucun bouton, la raison est dite ;
 *  · historique : chaque export, version et empreinte ; interface en
 *    français, sans tiret cadratin ni marque tierce.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({ exporter: vi.fn(), refresh: vi.fn() }));
vi.mock('../app/actions/studios/export', () => ({ exporterVersion: m.exporter, lireExportProjet: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh, push: () => {} }) }));

import type { ViolationExport } from '@tiktrends/core';
import type { ExportRealise, VueExport } from '../lib/studios/export/export';
import { PanneauExport } from '../components/studios/export/PanneauExport';

const SHA = '3f2a9c1e04ab'.padEnd(64, '7');
const realise = (o: Partial<ExportRealise> = {}): ExportRealise => ({
  projectId: 'p1', versionId: 'v2', versionN: 2, format: 'png', mime: 'image/png', largeur: 1080, hauteur: 1080, octets: 812 * 1024,
  sha256: SHA, empreinteCourte: SHA.slice(0, 12), nomFichier: 'serum-v2-png.png', url: `/api/studios/export/v2?format=png&empreinte=${SHA}`, le: '2026-10-08T09:30:00.000Z', ...o,
});

const POLICE: ViolationExport = { cible: { type: 'calque', calqueId: 'titre', nom: 'Titre', kind: 'text', fontId: 'f_titre', famille: 'Inter' }, cause: 'police_absente', message: 'Calque texte « Titre » · police « Inter » absente du serveur d’export.' };
const MEDIA: ViolationExport = { cible: { type: 'calque', calqueId: 'logo', nom: 'Logo', kind: 'logo', assetId: 'a_logo' }, cause: 'media_absent', message: 'Calque logo « Logo » · média introuvable ou hors de la marque du projet.' };

const vue = (o: Partial<VueExport> = {}): VueExport => ({
  projet: { id: 'p1', title: 'Sérum', marque: 'Éclat Peau' },
  version: { id: 'v2', n: 2, courante: true },
  versions: [{ id: 'v2', n: 2, courante: true }, { id: 'v1', n: 1, courante: false }],
  document: { largeur: 1080, hauteur: 1080, calques: 5 },
  preflight: { ok: true, medias: 3, polices: 2 },
  historique: [],
  peutExporter: true,
  ...o,
});

let racine: HTMLDivElement;
let root: Root;
beforeEach(() => { m.exporter.mockReset(); m.refresh.mockReset(); racine = document.createElement('div'); document.body.appendChild(racine); root = createRoot(racine); });
afterEach(() => { act(() => root.unmount()); racine.remove(); });

const monter = async (v: VueExport) => { await act(async () => { root.render(<PanneauExport vue={v} />); }); };
const bouton = (f: string) => racine.querySelector(`button[data-format="${f}"]`) as HTMLButtonElement | null;
const clic = async (f: string) => { await act(async () => { bouton(f)!.click(); }); };

describe('panneau d’export · rendu', () => {
  it('préflight refusé · chaque cible affichée, boutons inactifs, aucun envoi', async () => {
    await monter(vue({ preflight: { ok: false, violations: [POLICE, MEDIA] } }));
    const section = racine.querySelector('[data-preflight]')!;
    expect(section.getAttribute('data-preflight')).toBe('refus');
    const cibles = [...racine.querySelectorAll('[data-cible]')].map((li) => [li.getAttribute('data-cause'), li.getAttribute('data-cible'), li.textContent]);
    expect(cibles).toEqual([
      ['police_absente', 'titre', `${POLICE.message}Police Inter`],
      ['media_absent', 'logo', `${MEDIA.message}Média a_logo`],
    ]);
    expect(racine.textContent).toContain('2 points à corriger');
    expect(bouton('png')!.disabled).toBe(true);
    expect(bouton('jpeg')!.disabled).toBe(true);
    await clic('png');
    expect(m.exporter).not.toHaveBeenCalled();
  });

  it('prêt · le clic exporte CETTE version, puis le fichier vérifié est montré avec son empreinte', async () => {
    m.exporter.mockResolvedValue({ ok: true, export: realise() });
    await monter(vue());
    expect(racine.textContent).toContain('Tout est prêt · 3 médias relus et décodés, 2 polices embarquées.');
    expect(bouton('png')!.disabled).toBe(false);
    await clic('png');
    expect(m.exporter).toHaveBeenCalledWith({ projectId: 'p1', versionId: 'v2', format: 'png' });
    const fait = racine.querySelector(`[data-export="${SHA}"]`)!;
    expect(fait.textContent).toContain('Fichier vérifié · PNG · 1080 × 1080 · 812 Ko');
    expect(fait.textContent).toContain('Empreinte 3f2a9c1e04ab');
    expect(fait.querySelector('a')!.getAttribute('href')).toBe(`/api/studios/export/v2?format=png&empreinte=${SHA}`);
    expect(m.refresh).toHaveBeenCalled();
  });

  it('refus au clic (ressource révoquée entre-temps) · message et cible, aucun fichier annoncé', async () => {
    m.exporter.mockResolvedValue({ ok: false, code: 'MISSING_REFERENCE', status: 422, message: 'Export refusé · Calque logo « Logo » · média introuvable. Aucun fichier n’a été produit.', targetIds: [], recoverable: true, traceId: 'st_x', preflight: [MEDIA] });
    await monter(vue());
    await clic('jpeg');
    expect(m.exporter).toHaveBeenCalledWith({ projectId: 'p1', versionId: 'v2', format: 'jpeg' });
    const alerte = racine.querySelector('[role="alert"]')!;
    expect(alerte.textContent).toContain('Aucun fichier n’a été produit');
    expect(alerte.querySelector('[data-cible="logo"]')).not.toBeNull();
    expect(racine.querySelector('[data-export]')).toBeNull();
  });

  it('lecteur sans droit d’export · aucun bouton, la raison est dite', async () => {
    await monter(vue({ peutExporter: false }));
    expect(bouton('png')).toBeNull();
    expect(racine.textContent).toContain('Ton rôle permet de consulter ce contrôle, pas d’exporter');
  });

  it('historique · version, format, empreinte et téléchargement ; versions antérieures sélectionnables', async () => {
    await monter(vue({ historique: [realise(), realise({ versionId: 'v1', versionN: 1, format: 'jpeg', mime: 'image/jpeg', sha256: 'b'.repeat(64), empreinteCourte: 'bbbbbbbbbbbb', nomFichier: 'serum-v1-jpeg.jpg', url: `/api/studios/export/v1?format=jpeg&empreinte=${'b'.repeat(64)}` })] }));
    const h = [...racine.querySelectorAll('[data-historique]')].map((li) => [li.getAttribute('data-historique'), li.querySelector('a')!.getAttribute('href')]);
    expect(h).toEqual([
      ['v2', `/api/studios/export/v2?format=png&empreinte=${SHA}`],
      ['v1', `/api/studios/export/v1?format=jpeg&empreinte=${'b'.repeat(64)}`],
    ]);
    expect(racine.querySelector('[data-historique="v1"]')!.textContent).toContain('Version 1 · JPEG · 1080 × 1080');
    expect(racine.querySelector('[data-version-n="1"] a')!.getAttribute('href')).toBe('/studio/projets/p1/export?version=v1');
    expect(racine.innerHTML, 'tiret cadratin à l’écran').not.toContain('—');
    expect(racine.innerHTML).not.toMatch(/Trendtrack/i);
  });
});
