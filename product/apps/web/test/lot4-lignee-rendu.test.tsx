// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 4b · canvas de LIGNÉE, au RÉSULTAT · le HTML réellement peint (jsdom).
 *
 *  · les nœuds de lignée attendus sont rendus avec leur VRAIE donnée ;
 *  · le gagnant porte sa pastille, le nœud pointe vers sa destination réelle ;
 *  · aucun SECOND MOTEUR (pas de `@xyflow` / react-flow) · c'est notre SVG ;
 *  · AUCUNE action d'écriture (pas de disposition enregistrée, pas de geste
 *    payant) · la lignée est en lecture seule ;
 *  · la liste est la vue par défaut (premier rendu, SSR).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  projeterLignee,
  type EntreeLignee, type DonneesVariantes, type VarianteLue, type Lecture, type VerdictLu,
} from '@tiktrends/core';
import { CanvasLignee } from '../components/studios/canvas/CanvasLignee';

const verdict = (v: VerdictLu['validated']): VerdictLu => ({ computed: v, validated: v, comparable: true, failedStage: null, killFlag: null, computedAt: '2026-10-10' });
const lecture = (eff: Lecture['verdictEffectif']): Lecture => ({ conclusion: 'soutenue', motif: 'tient_les_reperes', phrase: 'Hypothèse soutenue · gagnante.', verdictEffectif: eff, reference: 'reperes_marque', variableSuivante: 'hook', garderVariable: false, prudence: 'Mesuré, pas prouvé.' });
const variante = (o: Partial<VarianteLue> & Pick<VarianteLue, 'id' | 'versionId' | 'jobId' | 'lot' | 'position'>): VarianteLue => ({
  assetId: `a_${o.id}`, parentVariantId: null, mime: 'image/png', largeur: 1080, hauteur: 1350, sha256: 'f'.repeat(64),
  hypothese: null, variable: null, qualite: 'passed', etatTechnique: 'completed', creeLe: '2026-10-05', test: null, lecture: null, relecture: null, ...o,
});

function modele() {
  const donnees: DonneesVariantes = {
    projet: { id: 'p1', titre: 'Sérum éclat', versionCouranteId: 'v2' },
    versions: [{ id: 'v1', n: 1, parentId: null, creeLe: '2026-10-01' }, { id: 'v2', n: 2, parentId: 'v1', creeLe: '2026-10-06' }],
    lots: [
      { jobId: 'j1', lot: 1, versionId: 'v1', etat: 'completed', qualite: 'passed', creeLe: '2026-10-02', attendues: 2, sorties: [] },
    ],
    variantes: [
      variante({ id: 'va1', versionId: 'v1', jobId: 'j1', lot: 1, position: 1, hypothese: 'Produit en gros plan',
        test: { linkId: 'tl1', adsmapAdId: 'ad1', adStatus: 'live', hypothese: 'x', variable: 'hook', valeurVariable: null, objectif: null, protocole: null, periode: null, metrique: null, isolation: null, verdict: verdict('winner'), lot: null },
        lecture: lecture('winner'), relecture: { conclusion: 'soutenue', apprentissage: 'Le gros plan gagne.', variableSuivante: 'opening_visual', ecart: null, le: '2026-10-09' } }),
    ],
    adsmap: { acces: false, protocoleMarque: null, offres: [], pages: [] },
    droits: { proposer: true },
    relecture: { disponible: false, raison: null, coutMaxUsd: null },
  };
  const e: EntreeLignee = {
    projet: { id: 'p1', titre: 'Sérum éclat', marque: 'Neva' },
    sources: [{ sourceId: 'src1', titre: 'Annonce concurrente', presentation: 'Annonce Meta observée.', lien: '/veille' }],
    briefs: { v1: { objectif: 'Faire connaître le sérum', hypothese: 'Le gros plan convertit', hypotheseId: 'hyp_1', variable: 'hook', direction: 'Lumineux, pastel' } },
    donnees,
  };
  return projeterLignee(e);
}

let largeEcran = false;
function matchMediaFactice(q: string) {
  const matches = q.includes('max-width: 719px') ? false : q.includes('min-width: 900px') ? largeEcran : false;
  return { matches, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } as unknown as MediaQueryList;
}

let root: Root;
let hote: HTMLDivElement;
beforeEach(() => {
  largeEcran = false;
  window.matchMedia = matchMediaFactice;
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
});
afterEach(() => { act(() => root.unmount()); hote.remove(); document.body.innerHTML = ''; });

describe('Lot 4b · canvas de lignée · ce qu’on voit', () => {
  it('SSR · liste par défaut, nœuds attendus avec leur vraie donnée', () => {
    const html = renderToStaticMarkup(<CanvasLignee projectId="p1" projet={{ id: 'p1', titre: 'Sérum éclat', marque: 'Neva' }} modele={modele()} />);
    expect(html).toContain('data-vue-lignee="liste"');
    expect(html).not.toContain('data-lignee-zone'); // pas de canvas au premier rendu
    const noeuds = [...html.matchAll(/data-noeud="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ['marque', 'reference:src1', 'brief:v1', 'hypothese:v1', 'direction:v1', 'iteration:v2', 'brief:v2', 'groupe:j1', 'creation:va1', 'resultat:va1', 'apprentissage:va1']) {
      expect(noeuds, `nœud ${id}`).toContain(id);
    }
    // Vraie donnée, pas de simulation.
    expect(html).toContain('Neva');
    expect(html).toContain('Le gros plan gagne.');
    expect(html).toContain('Gagnant'); // pastille du résultat gagnant
    expect(html).toContain('Lumineux, pastel');
  });

  it('aucun second moteur · notre SVG, jamais @xyflow / react-flow', () => {
    largeEcran = true;
    act(() => root.render(<CanvasLignee projectId="p1" projet={{ id: 'p1', titre: 'Sérum éclat', marque: 'Neva' }} modele={modele()} />));
    expect(document.querySelector('[data-canvas-lignee]')).toBeTruthy();
    const html = document.body.innerHTML.toLowerCase();
    expect(html).not.toContain('xyflow');
    expect(html).not.toContain('react-flow');
    expect(html).not.toContain('reactflow');
  });

  it('sélection · le détail dit « Vient de » et « A donné », et pointe vers la destination réelle', () => {
    largeEcran = true;
    act(() => root.render(<CanvasLignee projectId="p1" projet={{ id: 'p1', titre: 'Sérum éclat', marque: 'Neva' }} modele={modele()} />));
    const resultat = document.querySelector<HTMLButtonElement>('[data-vue-lignee-liste] [data-noeud="resultat:va1"], [data-noeud="resultat:va1"]');
    expect(resultat).toBeTruthy();
    act(() => { resultat!.click(); });
    const detail = document.querySelector('[data-detail-noeud="resultat:va1"]');
    expect(detail, 'détail du résultat').toBeTruthy();
    expect(detail!.textContent).toContain('Vient de');
    expect(detail!.textContent).toContain('A donné');
    // destination réelle (lecture) vers la fiche Adsmap.
    const dest = detail!.querySelector('[data-destination]');
    expect(dest?.getAttribute('data-destination')).toContain('/adsmap?ad=ad1');
  });

  it('lecture seule · le composant n’importe aucune action d’écriture', () => {
    const src = readFileSync(resolve(process.cwd(), 'components/studios/canvas/CanvasLignee.tsx'), 'utf8');
    // Aucun IMPORT d'action d'écriture, de devis ou d'un second moteur (les commentaires peuvent les nommer).
    const imports = src.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n');
    expect(imports).not.toMatch(/enregistrerDisposition|reinitialiserDisposition/);
    expect(imports).not.toMatch(/xyflow|react-flow|reactflow/i);
    expect(imports).not.toMatch(/creerDevis|approuver|iterer|rattacher|proposerPatch/);
  });
});
