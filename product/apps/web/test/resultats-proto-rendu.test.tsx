import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { ongletsResultats, apercuLotsResultats, type FaitsLotApercu } from '@tiktrends/core';
import { BlocJarvisResultats } from '../app/(app)/adsmap/BlocJarvisResultats';
import { ApercuLots } from '../app/(app)/adsmap/ApercuLots';

/**
 * V5 · Résultats · alignement de la vue d'ensemble sur la maquette de Kevin.
 *
 * On cloue le RÉSULTAT là où on peut le rendre (le bloc Jarvis et l'aperçu des
 * lots, rendus en HTML) et la STRUCTURE à la source pour la page serveur. Le
 * raccordement réel est préservé · le bloc Jarvis AMÈNE au vrai `/jarvis`, les
 * cartes de lot ne portent AUCUNE performance, et rien n'est fabriqué.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const page = read('app/(app)/adsmap/page.tsx');

describe('V5 · l’invite « Que disent vos résultats ? » (HTML rendu)', () => {
  const h = renderToStaticMarkup(<BlocJarvisResultats />);

  it('porte le titre, la phrase et les quatre suggestions de la maquette', () => {
    expect(h).toContain('Que disent vos résultats ?');
    expect(h).toContain('sépare ce qui est mesuré');
    for (const chip of ['Pourquoi la V2 fait mieux ?', 'Quelle variante tester ensuite ?', 'Résumé pour le client', 'Ce qui manque pour conclure']) {
      expect(h, `suggestion absente · ${chip}`).toContain(chip);
    }
  });

  it('l’action est RÉELLE · « Analyser avec Jarvis » ouvre le vrai Jarvis', () => {
    expect(h).toContain('Analyser avec Jarvis');
    expect(h).toContain('href="/jarvis"');
  });

  it('rien n’est simulé · aucune réponse ni chiffre de performance dans le bloc', () => {
    // Le proto préremplissait un fil · nous AMENONS à l'outil, nous ne répondons pas.
    // (On ignore le CSS · on vise les indicateurs de performance.)
    expect(h).not.toMatch(/CPA|ROAS|ROI|conversions?|impressions/i);
  });
});

describe('V5 · la bande « Lots de test » (HTML rendu)', () => {
  const lots: FaitsLotApercu[] = [
    { id: 'b1', number: 1, status: 'done', goal: 'Accroche directe ou question ?', launchedAt: '2026-09-01', ads: 3 },
    { id: 'b2', number: 2, status: 'testing', goal: null, launchedAt: '2026-09-10', ads: 2 },
    { id: 'b3', number: 3, status: 'analyzed', goal: 'Historique repris', launchedAt: null, ads: 4 },
  ];

  it('montre l’en-tête, « Tous les lots → » et une carte par lot RÉEL', () => {
    const h = renderToStaticMarkup(<ApercuLots lots={lots} peutVoirLots />);
    expect(h).toContain('Lots de test');
    expect(h).toContain('Tous les lots →');
    expect(h).toContain('Lot #1');
    expect(h).toContain('Lot #2');
    // Le statut vient du noyau, en clair.
    expect(h).toContain('Terminé');
    expect(h).toContain('En diffusion');
    // La nature importée est signalée (statut analysé sans lancement).
    expect(h).toContain('Importé');
    // Chaque carte mène au lot réel.
    expect(h).toContain('href="/adsmap/lots');
  });

  it('un but absent n’est JAMAIS substitué, un but présent est rendu', () => {
    const h = renderToStaticMarkup(<ApercuLots lots={lots} peutVoirLots />);
    // Mutation : un but rendu en dur sur la carte 2 (goal: null) montrerait un texte.
    expect(h).toContain('Accroche directe ou question ?');
    expect(h).not.toContain('Sans but');
  });

  it('aucune performance n’est affichée dans une carte de lot', () => {
    const h = renderToStaticMarkup(<ApercuLots lots={lots} peutVoirLots />);
    expect(h).not.toMatch(/CPA|ROAS|€|\bimpressions\b/);
  });

  it('sans lot, un état vide honnête · pas de carte vide', () => {
    const h = renderToStaticMarkup(<ApercuLots lots={[]} peutVoirLots />);
    expect(h).toContain('Aucun lot pour cette marque');
    expect(h).not.toContain('data-carte-lot');
  });

  it('« Tous les lots → » et « Préparer un lot » n’apparaissent qu’avec le droit lots', () => {
    const sansDroit = renderToStaticMarkup(<ApercuLots lots={lots} peutVoirLots={false} />);
    expect(sansDroit).not.toContain('Tous les lots →');
  });
});

describe('V5 · les onglets de section (noyau pur)', () => {
  it('les six libellés de la maquette mènent aux routes RÉELLES, dans l’ordre', () => {
    const toutes = new Set(['adsmap', 'tri', 'lots', 'protocole', 'import', 'suites']);
    const o = ongletsResultats(toutes, '/adsmap');
    expect(o.map((x) => x.libelle)).toEqual(["Vue d'ensemble", 'Hypothèses', 'Lots de test', 'Protocole', 'Importer', 'Apprentissages']);
    expect(o.map((x) => x.href)).toEqual(['/adsmap', '/adsmap/tri', '/adsmap/lots', '/adsmap/protocole', '/adsmap/import', '/adsmap/suites']);
  });

  it('un onglet n’apparaît QUE si sa fonction est accessible (lots/import = admin)', () => {
    const membre = new Set(['adsmap', 'tri', 'protocole', 'suites']); // ni lots ni import
    const o = ongletsResultats(membre, '/adsmap');
    expect(o.map((x) => x.cle)).not.toContain('lots');
    expect(o.map((x) => x.cle)).not.toContain('import');
    expect(o.map((x) => x.cle)).toContain('hypotheses');
  });

  it('l’onglet courant est marqué par le chemin, le plus précis gagne', () => {
    const toutes = new Set(['adsmap', 'tri', 'lots', 'protocole', 'import', 'suites']);
    expect(ongletsResultats(toutes, '/adsmap').find((x) => x.courant)?.cle).toBe('vue-ensemble');
    expect(ongletsResultats(toutes, '/adsmap/lots').find((x) => x.courant)?.cle).toBe('lots');
  });
});

describe('V5 · apercuLotsResultats (noyau pur)', () => {
  it('ne fabrique rien · but vide → null, statut inconnu → lui-même, importé lu des faits', () => {
    const cartes = apercuLotsResultats([
      { id: 'x', number: 9, status: 'analyzed', goal: '   ', launchedAt: null, ads: 1 },
      { id: 'y', number: 10, status: 'inconnu', goal: 'Un but', launchedAt: '2026-01-01', ads: 0 },
    ]);
    expect(cartes[0]!.but).toBeNull();
    expect(cartes[0]!.importe).toBe(true); // analysé sans lancement = import
    expect(cartes[1]!.statut).toBe('inconnu'); // pas de libellé inventé
    expect(cartes[1]!.importe).toBe(false);
  });

  it('au plus 4 cartes, les premières (plus récentes d’abord)', () => {
    const lots: FaitsLotApercu[] = Array.from({ length: 7 }, (_, i) => ({ id: `b${i}`, number: i, status: 'done', goal: null, launchedAt: null, ads: 0 }));
    expect(apercuLotsResultats(lots)).toHaveLength(4);
  });
});

describe('V5 · la page Résultats câble la vue d’ensemble (source)', () => {
  it('porte la barre d’onglets, filtrée par les droits réels (canAccess)', () => {
    expect(page).toContain('ongletsResultats(accessibles');
    expect(page).toContain('<BarreOnglets');
    expect(page).toContain('canAccess(acces, f)');
  });

  it('l’invite Jarvis n’est rendue que si Jarvis est ouvert (porte réelle)', () => {
    expect(page).toContain('jarvisOuvert && <BlocJarvisResultats');
  });

  it('l’aperçu des lots lit les lots RÉELS et la mention honnête est présente', () => {
    expect(page).toContain('<ApercuLots lots={batches}');
    expect(page).toContain('data-mention-mesure');
    expect(page).toContain('Aucune performance n’est affichée sans mesure importée.');
  });

  it('le bouton « Importer des résultats » mène à l’import réel, réservé aux admins', () => {
    expect(page).toContain('Importer des résultats');
    expect(page).toMatch(/accessibles\.has\('import'\)[\s\S]*href="\/adsmap\/import"/);
  });
});
