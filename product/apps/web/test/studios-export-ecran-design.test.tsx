// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Atelier Spatial « Export » (`/studio/projets/[id]/export`) · passe design.
 * On lit le DOM RENDU (jsdom) · ce qu'un lecteur d'écran, un clavier ou un
 * doigt rencontre, pas la présence d'un attribut dans la source :
 *
 *  - le lien « Ouvrir l’Identité de la marque » (logo de la charte remplacé,
 *    #1009) est la cible de 44 px de l'éditeur (#1014), pas un texte de 12 px ;
 *  - l'état du contrôle se lit en mots · « Prêt » ou « Bloqué » (rien n'a été
 *    « fait » ni « refusé » à la visite) ;
 *  - chaque tuile est une région nommée par son titre ;
 *  - les « Télécharger » et « Choisir » répétés ont chacun un nom distinct ;
 *  - pendant l'export, le bouton pressé GARDE le focus (pas `disabled`), dit
 *    qu'il travaille (`aria-busy`) et ignore un second clic ;
 *  - un refus au clic est UNE région d'alerte, sans alerte imbriquée, qui
 *    nomme la sortie (« Corriger dans l’éditeur ») comme le contrôle ;
 *  - bloqué, les boutons fermés disent pourquoi, à côté d'eux.
 * 0 $ · l'action serveur est simulée, rien ne part.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const m = vi.hoisted(() => ({ exporter: vi.fn() }));
vi.mock('../app/actions/studios/export', () => ({ exporterVersion: m.exporter, lireExportProjet: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1/export', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import type { ViolationExport } from '@tiktrends/core';
import type { ExportRealise, VueExport } from '../lib/studios/export/export';
import { Export } from '../spatial/vues/projet/Export';
import { avecSpatial } from './spatial/fournisseur';

const SHA = 'a'.repeat(64);
const IDENTITE = '/brands/b1/identite';
const realise = (o: Partial<ExportRealise> = {}): ExportRealise => ({
  projectId: 'p1', versionId: 'v2', versionN: 2, format: 'png', mime: 'image/png', largeur: 1080, hauteur: 1080, octets: 2048,
  sha256: SHA, empreinteCourte: SHA.slice(0, 12), nomFichier: 'serum-v2-png.png', url: `/api/studios/export/v2?format=png&empreinte=${SHA}`, le: '2026-10-08T09:30:00.000Z', ...o,
});
const LOGO: ViolationExport = { cible: { type: 'calque', calqueId: 'logo', nom: 'Logo', kind: 'logo', assetId: 'logo_abc' }, cause: 'logo_a_reimporter', message: 'Calque logo « Logo » · son fichier a été remplacé.' } as ViolationExport;
const vue = (o: Partial<VueExport> = {}): VueExport => ({
  projet: { id: 'p1', title: 'Sérum', marque: 'Éclat' }, version: { id: 'v2', n: 2, courante: true },
  versions: [{ id: 'v2', n: 2, courante: true }, { id: 'v1', n: 1, courante: false }],
  document: { largeur: 1080, hauteur: 1080, calques: 3 }, preflight: { ok: true, medias: 1, polices: 1 }, historique: [], peutExporter: true, ...o,
});

let racine: HTMLDivElement; let root: Root;
beforeEach(() => { m.exporter.mockReset(); racine = document.createElement('div'); document.body.appendChild(racine); root = createRoot(racine); });
afterEach(() => { act(() => root.unmount()); racine.remove(); });
const monter = async (v: VueExport) => { await act(async () => { root.render(avecSpatial(<Export vue={v} atelier={[]} />)); }); };
const bouton = (f: string) => racine.querySelector(`button[data-format="${f}"]`) as HTMLButtonElement;
/** Le nom accessible d'un lien · `aria-label` s'il existe, sinon son texte. */
const nom = (a: Element) => a.getAttribute('aria-label') ?? a.textContent ?? '';
/** La pastille d'état de la tuile « Contrôle avant export ». */
const etat = () => racine.querySelector('[data-preflight] p .pill')?.textContent;
/** Le lien vers l'Identité de la marque est-il une cible de 44 px (même lien que l'éditeur) ? */
const cible44 = (a: HTMLElement | null) => !!a && a.classList.contains('btn') && a.style.minHeight === '44px';

describe('Export · le lien vers l’Identité de la marque (logo remplacé)', () => {
  it('préflight · admin · le lien est une cible de 44 px, sur sa propre ligne', async () => {
    await monter(vue({ preflight: { ok: false, violations: [LOGO] }, identiteMarque: IDENTITE }));
    const a = racine.querySelector<HTMLElement>('[data-cause="logo_a_reimporter"] a[data-lien="identite-marque"]');
    expect(a?.getAttribute('href')).toBe(IDENTITE);
    expect(a?.textContent).toBe('Ouvrir l’Identité de la marque');
    expect(cible44(a), `le lien n’est pas une cible de 44 px · ${a?.outerHTML}`).toBe(true);
  });

  it('refus au clic · admin · le même lien de 44 px dans l’alerte', async () => {
    m.exporter.mockResolvedValue({ ok: false, code: 'MISSING_REFERENCE', status: 422, message: 'Export refusé · logo remplacé. Aucun fichier n’a été produit.', targetIds: [], recoverable: true, traceId: 'st_x', preflight: [LOGO] });
    await monter(vue({ identiteMarque: IDENTITE }));
    await act(async () => { bouton('png').click(); });
    const a = racine.querySelector<HTMLElement>('[role="alert"] a[data-lien="identite-marque"]');
    expect(cible44(a), `le lien n’est pas une cible de 44 px · ${a?.outerHTML}`).toBe(true);
  });
});

describe('Export · l’état du contrôle se lit en mots', () => {
  it('prêt · la pastille dit « Prêt », pas « Fait » (rien n’a été fait)', async () => {
    await monter(vue());
    expect(etat(), 'la pastille du contrôle prêt ne dit pas « Prêt »').toBe('Prêt');
  });
  it('bloqué · la pastille dit « Bloqué », pas « Refusé » (aucun geste n’a été refusé)', async () => {
    await monter(vue({ preflight: { ok: false, violations: [LOGO] } }));
    expect(etat(), 'la pastille du contrôle bloqué ne dit pas « Bloqué »').toBe('Bloqué');
  });
});

describe('Export · structure et noms accessibles', () => {
  it('chaque tuile est une région nommée par son titre', async () => {
    await monter(vue());
    const noms = [...racine.querySelectorAll('section.tile')].map((s) => {
      const id = s.getAttribute('aria-labelledby');
      return id ? document.getElementById(id)?.textContent ?? `(id ${id} introuvable)` : '(sans nom)';
    });
    expect(noms, 'une tuile n’est pas nommée par son titre').toEqual(['Contrôle avant export', 'Fichier', 'Version à exporter', 'Exports de ce projet']);
  });

  it('les « Télécharger » de l’historique et les « Choisir » des versions ont chacun un nom distinct, qui commence par le mot affiché', async () => {
    await monter(vue({ historique: [realise(), realise({ versionId: 'v1', versionN: 1, format: 'jpeg', mime: 'image/jpeg', nomFichier: 'serum-v1-jpeg.jpg', le: null })] }));
    const telecharger = [...racine.querySelectorAll('[data-historique] a')].map(nom);
    expect(telecharger, 'les liens « Télécharger » ne se distinguent pas').toEqual(['Télécharger la version 2 en PNG, exportée le 08/10 11:30', 'Télécharger la version 1 en JPEG']);
    const choisir = [...racine.querySelectorAll('[data-version-n] a')].map(nom);
    expect(choisir, 'le lien « Choisir » ne dit pas quelle version').toEqual(['Choisir la version 1']);
  });
});

describe('Export · en cours · le clavier ne perd pas sa place', () => {
  it('le bouton pressé garde le focus et dit qu’il travaille ; l’autre format est fermé ; un second clic est ignoré', async () => {
    let finir: (r: unknown) => void = () => {};
    m.exporter.mockImplementation(() => new Promise((r) => { finir = r; }));
    await monter(vue());
    const png = bouton('png');
    png.focus();
    await act(async () => { png.click(); });
    expect(png.textContent).toBe('Export PNG en cours…');
    expect(png.disabled, 'le bouton pressé est `disabled` · il rend le focus au document').toBe(false);
    expect([png.getAttribute('aria-disabled'), png.getAttribute('aria-busy')], 'le bouton pressé ne dit pas qu’il travaille').toEqual(['true', 'true']);
    expect(document.activeElement, 'le focus a quitté le bouton pressé').toBe(png);
    expect(bouton('jpeg').disabled, 'l’autre format reste ouvert pendant l’export').toBe(true);
    await act(async () => { png.click(); });
    expect(m.exporter, 'un second clic pendant l’export a relancé la commande').toHaveBeenCalledTimes(1);
    await act(async () => { finir({ ok: false, code: 'FORBIDDEN', status: 403, message: 'Refusé.', targetIds: [], recoverable: false, traceId: 't' }); });
    expect([png.disabled, png.hasAttribute('aria-disabled'), png.hasAttribute('aria-busy'), bouton('jpeg').disabled]).toEqual([false, false, false, false]);
    expect(document.activeElement, 'le focus a quitté le bouton une fois l’export fini').toBe(png);
  });
});

describe('Export · refus au clic · une seule région d’alerte', () => {
  it('le message et les points à corriger vivent dans UNE alerte, sans alerte imbriquée', async () => {
    m.exporter.mockResolvedValue({ ok: false, code: 'MISSING_REFERENCE', status: 422, message: 'Export refusé · logo remplacé. Aucun fichier n’a été produit.', targetIds: [], recoverable: true, traceId: 'st_x', preflight: [LOGO] });
    await monter(vue());
    await act(async () => { bouton('jpeg').click(); });
    const alertes = [...racine.querySelectorAll('[role="alert"]')];
    expect(alertes.length, 'deux régions d’alerte · le refus est annoncé deux fois').toBe(1);
    expect(alertes[0]!.textContent).toContain('Refusé Export refusé · logo remplacé. Aucun fichier n’a été produit. · identifiant support st_x');
    expect(alertes[0]!.querySelector('[data-cible="logo"]')).not.toBeNull();
    const sortie = alertes[0]!.querySelector('a[data-sortie="editeur"]');
    expect(sortie?.getAttribute('href'), 'le refus au clic ne nomme aucune sortie').toBe('/studio/projets/p1/image');
    expect(sortie?.textContent).toBe('Corriger dans l’éditeur');
  });

  it('un refus SANS point à corriger (droit, panne) ne propose pas l’éditeur', async () => {
    m.exporter.mockResolvedValue({ ok: false, code: 'FORBIDDEN', status: 403, message: 'Refusé.', targetIds: [], recoverable: false, traceId: 't' });
    await monter(vue());
    await act(async () => { bouton('png').click(); });
    expect(racine.querySelector('[role="alert"] a[data-sortie="editeur"]')).toBeNull();
  });
});

describe('Export · bloqué · les boutons fermés disent pourquoi', () => {
  const raison = () => racine.querySelector('[data-raison-ferme]')?.textContent ?? null;
  it('bloqué · la raison suit les boutons, dans la tuile « Fichier »', async () => {
    await monter(vue({ preflight: { ok: false, violations: [LOGO] } }));
    expect([bouton('png').disabled, bouton('jpeg').disabled]).toEqual([true, true]);
    const tuile = bouton('png').closest('section');
    expect(tuile?.querySelector('[data-raison-ferme]')?.textContent, 'les boutons fermés ne disent pas pourquoi').toBe('Les deux formats s’ouvrent dès que le contrôle avant export ne signale plus aucun point.');
  });
  it('prêt · aucune raison (rien n’est fermé)', async () => {
    await monter(vue());
    expect(raison()).toBeNull();
  });
});
