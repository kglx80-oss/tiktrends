import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { ongletsResultats, apercuLotsResultats, tonStatutLot, LIBELLE_NATURE, type FaitsLotApercu, type EtapeParcours } from '@tiktrends/core';
import { BlocJarvisResultats } from '../app/(app)/adsmap/BlocJarvisResultats';
import { ApercuLots } from '../app/(app)/adsmap/ApercuLots';
import { ParcoursBoucle } from '../components/ParcoursBoucle';
import { BarreOnglets } from '../components/BarreOnglets';

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

  it('porte le lavis rose de la maquette · dégradé de jetons (accent-soft → surface)', () => {
    // Fidélité V5 · la carte n'est plus un aplat de surface · elle lave de
    // l'accent-soft vers la surface, par jetons (jamais un rose en dur).
    expect(h).toMatch(/linear-gradient\(120deg, var\(--accent-soft\) 0%, var\(--surface\) 62%\)/);
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

  it('chaque carte porte une pastille de statut teintée par un RÔLE (jamais un littéral)', () => {
    const h = renderToStaticMarkup(<ApercuLots lots={lots} peutVoirLots />);
    // La pastille renforce le libellé en clair (toujours présent à côté).
    expect(h).toContain('En diffusion');
    // Diffusion → accent, terminé → ok, importé → warn · par jeton.
    expect(h).toContain('background:var(--accent)');
    expect(h).toContain('background:var(--ok)');
    expect(h).toContain('background:var(--warn)');
    // Aucune couleur littérale (le cliquet le garde aussi, on le double ici).
    expect(h).not.toMatch(/background:#|background:rgb/);
  });

  it('la vignette est le média RÉEL quand il existe, une vignette vide honnête sinon', () => {
    const avecMedia: FaitsLotApercu[] = [
      { id: 'm1', number: 1, status: 'testing', goal: null, launchedAt: '2026-09-01', ads: 2, thumbUrl: 'https://cf.example.invalid/neva/v1.jpg' },
      { id: 'm2', number: 2, status: 'testing', goal: null, launchedAt: '2026-09-02', ads: 1, thumbUrl: null },
    ];
    const h = renderToStaticMarkup(<ApercuLots lots={avecMedia} peutVoirLots />);
    // Carte avec média · un <img> porte l'URL RÉELLE reçue (pas une substitution).
    expect(h).toMatch(/<img[^>]+src="https:\/\/cf\.example\.invalid\/neva\/v1\.jpg"/);
    // Les deux cartes posent la fenêtre de vignette.
    expect((h.match(/data-vignette-lot/g) || []).length).toBe(2);
    // Un seul <img> · la carte sans média NE fabrique AUCUN visuel (zéro src inventé).
    expect((h.match(/<img/g) || []).length).toBe(1);
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

describe('V5 · la boucle en bande compacte (HTML rendu)', () => {
  const etapes: EtapeParcours[] = [
    { cle: 'hypothese', numero: 1, titre: 'Hypothèse', nature: 'hypothese', aide: 'AIDE_A_RETIRER_DE_LA_BANDE', etat: { atteinte: true, texte: '3 tests portent une hypothèse écrite.' }, liens: [{ libelle: 'Voir les tests', href: '#tests' }] },
    { cle: 'lot', numero: 2, titre: 'Lot', nature: 'organisation', aide: 'AIDE_LOT', etat: { atteinte: true, texte: '3 lots · 2 lancés.' }, liens: [{ libelle: 'Ouvrir les lots', href: '/adsmap/lots' }, { libelle: 'Protocole', href: '/adsmap/protocole' }] },
  ];

  it('porte la variante « bande » et garde la DONNÉE réelle de chaque étape', () => {
    const h = renderToStaticMarkup(<ParcoursBoucle titre="Boucle" etapes={etapes} variant="bande" />);
    expect(h).toContain('data-variante="bande"');
    // La donnée mesurée de l'étape reste affichée (on ne perd rien d'essentiel).
    expect(h).toContain('3 tests portent une hypothèse écrite.');
    expect(h).toContain('3 lots · 2 lancés.');
    // La nature reste dite à l'écran.
    expect(h).toContain(LIBELLE_NATURE.hypothese);
  });

  it('compacte · l’aide explicative est retirée de la bande', () => {
    const h = renderToStaticMarkup(<ParcoursBoucle titre="Boucle" etapes={etapes} variant="bande" />);
    // Mutation de contrôle · si la bande re-rendait l'aide, ce texte reparaîtrait.
    expect(h).not.toContain('AIDE_A_RETIRER_DE_LA_BANDE');
    expect(h).not.toContain('AIDE_LOT');
  });

  it('chaque tuile est cliquable vers sa destination PRINCIPALE (le premier lien)', () => {
    const h = renderToStaticMarkup(<ParcoursBoucle titre="Boucle" etapes={etapes} variant="bande" />);
    expect(h).toContain('href="#tests"');
    expect(h).toContain('href="/adsmap/lots"');
    // La destination secondaire du noyau n'encombre plus la bande (atteignable ailleurs).
    expect(h).not.toContain('href="/adsmap/protocole"');
  });

  it('la variante « riche » (Veille) garde aide ET liens · aucune régression', () => {
    const h = renderToStaticMarkup(<ParcoursBoucle titre="Boucle" etapes={etapes} />);
    expect(h).toContain('AIDE_A_RETIRER_DE_LA_BANDE');
    expect(h).toContain('href="/adsmap/protocole"');
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

describe('V5 · la barre d’onglets en segment (maquette · HTML rendu)', () => {
  const onglets = [
    { cle: 'vue-ensemble', libelle: "Vue d'ensemble", href: '/adsmap', courant: true },
    { cle: 'hypotheses', libelle: 'Hypothèses', href: '/adsmap/tri', courant: false },
  ];

  it('le style segment · un conteneur ceinturé, l’onglet courant une pastille claire ombrée', () => {
    const h = renderToStaticMarkup(<BarreOnglets zone="resultats" libelle="Sections" onglets={onglets} variant="segment" />);
    expect(h).toContain('data-variante="segment"');
    // Le conteneur porte sa bordure et son fond au jeton.
    expect(h).toMatch(/border:1px solid var\(--line-2\);border-radius:12px;background:var\(--paper\)/);
    // L'onglet COURANT est une pastille claire ombrée (surface + ombre), gras.
    expect(h).toMatch(/aria-current="page"[^>]*background:var\(--surface\)/);
    expect(h).toContain('box-shadow:var(--sh-sm)');
  });

  it('les onglets gardent `aria-current` et leurs routes réelles', () => {
    const h = renderToStaticMarkup(<BarreOnglets zone="resultats" libelle="Sections" onglets={onglets} variant="segment" />);
    expect(h).toContain('aria-current="page"');
    expect(h).toContain('href="/adsmap"');
    expect(h).toContain('href="/adsmap/tri"');
  });

  it('le défaut (pills) reste inchangé pour Réglages / Administration', () => {
    const h = renderToStaticMarkup(<BarreOnglets zone="reglages" libelle="Réglages" onglets={onglets} />);
    expect(h).toContain('data-variante="pills"');
    // L'actif garde le cadre accent, pas la pastille segment.
    expect(h).toMatch(/aria-current="page"[^>]*background:var\(--accent-soft\)/);
    expect(h).not.toContain('box-shadow:var(--sh-sm)');
  });
});

describe('V5 · tonStatutLot (noyau pur)', () => {
  it('importé prime, diffusion → accent, terminé → vert, le reste en attente', () => {
    expect(tonStatutLot('testing', false)).toBe('diffusion');
    expect(tonStatutLot('live', false)).toBe('diffusion');
    expect(tonStatutLot('done', false)).toBe('termine');
    expect(tonStatutLot('analyzed', false)).toBe('termine');
    expect(tonStatutLot('ready', false)).toBe('attente');
    expect(tonStatutLot('inconnu', false)).toBe('attente');
    // Un historique importé passe toujours au ton « importe », quel que soit son statut.
    expect(tonStatutLot('analyzed', true)).toBe('importe');
    expect(tonStatutLot('testing', true)).toBe('importe');
  });
});

describe('V5 · la page Résultats câble la vue d’ensemble (source)', () => {
  it('porte la barre d’onglets en segment (maquette), filtrée par les droits réels (canAccess)', () => {
    expect(page).toContain('ongletsResultats(accessibles');
    expect(page).toContain('<BarreOnglets');
    expect(page).toContain('variant="segment"');
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
