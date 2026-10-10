import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { placementLanceurSupport, LIBELLE_VERDICT } from '@tiktrends/core';
import { CarteTest } from '../app/(app)/adsmap/AdsMapTable';
import type { AdRow } from '../app/actions/adsmap';

/**
 * Lot UI Adsmap · le cumul long et la table de 14 colonnes rendaient le parcours
 * lourd, surtout mobile. On mène par « À décider », on replie le cumul, et la
 * table se lit en cartes sur petit écran · SANS perdre une donnée, une action, ni
 * substituer une valeur.
 *
 * On cloue le RÉSULTAT là où on peut le rendre (la carte de test, `CarteTest`) et
 * la STRUCTURE à la source pour les gros composants serveur/à actions serveur.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const page = read('app/(app)/adsmap/page.tsx');
const essais = read('app/(app)/jarvis/sections/SectionEssais.tsx');
const table = read('app/(app)/adsmap/AdsMapTable.tsx');
const canvas = read('app/(app)/adsmap/Canvas.tsx');

const base: AdRow = {
  id: 'a1', status: 'live', batchNumber: 3, author: null, concept: 'Concept démo',
  conceptId: 'c1', desire: 'Désir', angle: 'Angle', iterationReason: null, hypothesis: null,
  format: 'video_ugc', adType: 'ideation', briefUrl: null, assetUrl: null, variantCode: 'v7',
  testedVariable: 'hook', platform: 'meta', launchedAt: new Date('2026-09-01').toISOString(),
  verdict: 'winner', verdictStatus: 'validated', comparable: true, failedStage: null,
  killFlag: null, cpa: 14, cpaHi: 22, spend: 300, purchases: 20, learnings: [], legacyFlags: [],
};
const noop = () => {};

describe('Adsmap · la carte de test mobile dit le test sans le tableau (HTML rendu)', () => {
  it('montre le verdict au LIBELLÉ EXACT du noyau · jamais un mot inventé', () => {
    const h = renderToStaticMarkup(<CarteTest r={base} onOpen={noop} onStudio={noop} briefBusy="" />);
    // Le libellé vient de la source unique · pas d'un renommage local.
    expect(h).toContain(LIBELLE_VERDICT.winner.court);
    expect(h).toContain('Concept démo');
    expect(h).toContain('v7');
    // Une gagnante s'arbitre · l'action primaire ouvre la fiche.
    expect(h).toContain('Arbitrer');
  });

  it('la variable testée ne s’affiche QUE si elle est réellement renseignée (jamais substituée)', () => {
    const avec = renderToStaticMarkup(<CarteTest r={base} onOpen={noop} onStudio={noop} briefBusy="" />);
    const sans = renderToStaticMarkup(<CarteTest r={{ ...base, testedVariable: null }} onOpen={noop} onStudio={noop} briefBusy="" />);
    // Mutation : si la variable était rendue en dur, les deux la montreraient.
    expect(avec, 'la variable renseignée n’est pas lue').toContain('Variable testée');
    expect(sans, 'une variable absente est quand même affichée · valeur substituée').not.toContain('Variable testée');
  });

  it('un test sans verdict s’ouvre (fiche), il ne s’« arbitre » pas', () => {
    const h = renderToStaticMarkup(<CarteTest r={{ ...base, verdict: null }} onOpen={noop} onStudio={noop} briefBusy="" />);
    expect(h).toContain('Ouvrir la fiche');
    expect(h).not.toContain('Arbitrer');
  });
});

describe('Adsmap · la table est responsive sans rien perdre (source)', () => {
  it('bascule table ↔ cartes selon la largeur, avec accès au tableau complet', () => {
    expect(table).toContain("from '../../../components/useIsMobile'");
    expect(table).toContain('CarteTest');
    expect(table).toContain('tableauComplet');
    expect(table).toContain('Voir le tableau complet');
  });

  it('les trois états vides distincts (S13) restent intacts', () => {
    // La responsivité ne touche QUE la branche « il y a des lignes ».
    expect(table).toContain('Aucune ad pour ces filtres');
    expect(table).toContain('filtresActifs ? (');
    expect(table).toContain('onClick={reinitialiser}');
  });

  it('les compteurs de la Carte peuvent retomber à la ligne · ils débordaient à 390 (graphe intact)', () => {
    const i = canvas.indexOf('{c.personas} avatar(s)');
    expect(i, 'la ligne de compteurs a disparu').toBeGreaterThan(-1);
    const span = canvas.slice(canvas.lastIndexOf('<span', i), i);
    expect(span, 'les compteurs sont figés en une ligne · débordement à 390').not.toContain('nowrap');
  });
});

describe('Adsmap · en-tête sobre + liens locaux + support ancré (source)', () => {
  it('la page tient la charte · max 1200, sous-titre court orienté tests', () => {
    expect(page).toMatch(/cadrePage/);
    expect(page).toContain('son verdict');
    expect(page, 'la marge latérale figée est revenue').not.toMatch(/padding: '\d+px 36px/);
  });

  it('des raccourcis locaux discrets pointent vers préparer un test, les suites et le cumul', () => {
    expect(page).toContain('Préparer un test');
    expect(page).toContain('Voir les suites');
    expect(page).toContain('href="#appris"');
  });

  it('le support est ANCRÉ sur /adsmap (comme Dashboard, Pubs, Veille)', () => {
    expect(placementLanceurSupport('/adsmap')).toBe('ancre');
  });
});

describe('Adsmap · le cumul « appris » est replié, l’aperçu et le conseil restent visibles (source)', () => {
  it('les trois lectures deviennent des révélations repliées, ancres profondes préservées', () => {
    expect(essais).toContain('<Revelation id="essais"');
    expect(essais).toContain('<Revelation id="bilan-notes"');
    expect(essais).toContain('<Revelation id="bilan-copie"');
    expect(essais).toContain('id="appris"');
  });

  it('le conseil du prochain essai est SORTI du repli · trouvable sans tout ouvrir', () => {
    // Le conseil (et son lien de destination) vit au-dessus des révélations, dans
    // l'aperçu toujours visible.
    const iConseil = essais.indexOf('LE PROCHAIN ESSAI');
    const iPremierDetails = essais.indexOf('<Revelation id="essais"');
    expect(iConseil, 'le conseil a disparu').toBeGreaterThan(-1);
    expect(iConseil, 'le conseil est encore enfermé dans le repli').toBeLessThan(iPremierDetails);
    // Les lots d'essai se lançaient dans les anciennes Pubs IA (retirées le 10/10) · le conseil le dit, sans lien mort.
    expect(essais).toContain('data-essai="indisponible"');
    expect(essais).not.toContain('Lancer cet essai dans Pubs IA');
  });
});

describe('Adsmap · révélation · libellé ouvert/fermé + dégagement d’ancre (recette R3, source)', () => {
  const revel = read('app/(app)/jarvis/sections/Revelation.tsx');

  it('le summary bascule déplier ↔ replier selon l’état d’ouverture', () => {
    expect(revel).toContain('onToggle');
    expect(revel).toMatch(/ouvert \? 'replier[^']*' : 'déplier/);
  });

  it('l’ancre dégage la barre mobile collante (scrollMarginTop = marge d’ancre)', () => {
    // La barre collante mesure 65px · la marge la dépasse pour poser le titre entier.
    expect(revel).toMatch(/MARGE_ANCRE = (7\d|8\d|9\d)/);
    expect(revel).toContain('scrollMarginTop: MARGE_ANCRE');
    expect(essais).toContain('scrollMarginTop: MARGE_ANCRE');
  });
});

describe('Adsmap · cibles tactiles des contrôles filtres / tiroir / aide (recette R2, source)', () => {
  const drawer = read('app/(app)/adsmap/AdDrawer.tsx');
  const partage = read('app/(app)/adsmap/PartageGagnante.tsx');

  it('l’aide « lire cette carte » de /adsmap porte la cible tactile', () => {
    expect(page).toMatch(/title="lire cette carte"[^>]*minHeight=\{CIBLE_TACTILE_MIN\}/);
  });


  it('les selects de filtres de la Table portent la cible tactile', () => {
    const i = table.indexOf('<select value={value}');
    const style = table.slice(i, i + 220);
    expect(style).toContain('minHeight: CIBLE_TACTILE_MIN');
  });

  it('les styles d’action et de champ du tiroir portent la cible tactile', () => {
    for (const decl of ['const champ', 'const bouton', 'const boutonSecondaire']) {
      const i = drawer.indexOf(decl);
      expect(i, `${decl} introuvable`).toBeGreaterThan(-1);
      expect(drawer.slice(i, i + 280), `${decl} sous la cible`).toContain('CIBLE_TACTILE_MIN');
    }
  });

  it('le bouton « Partager au client » du tiroir porte la cible tactile', () => {
    expect(partage).toContain('minHeight: CIBLE_TACTILE_MIN');
  });
});
