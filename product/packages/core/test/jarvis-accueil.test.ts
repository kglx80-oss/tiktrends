import { describe, expect, it } from 'vitest';
import {
  completudeFicheJarvis, encartKpiJarvis, AUTOMATISATIONS_JARVIS, AUTOMATISATION_A_VENIR,
  DESTINATION_FICHE_MARQUE, LIEN_CONNEXIONS_KPI,
  type SourceDepenseJarvis,
} from '../src/jarvis-accueil';
import { ELEMENTS_FICHE_MARQUE, completudeFicheMarque, type FicheMarqueLue } from '../src/accueil-v5';

/**
 * UX V5 · le panneau d'accueil de Jarvis · les règles pures.
 * On vérifie ce qui SORT · un score réel (jamais figé), un état KPI vide tant
 * qu'aucune source n'est lue, trois automatisations inertes.
 */

const ficheVide: FicheMarqueLue = {
  description: null, usp: null, audience: null, category: null, categoryNeeds: null, tone: null,
  industryTags: 0, colors: 0, scenarios: 0, personas: 0, produits: 0, concurrents: 0,
};

const fichePleine: FicheMarqueLue = {
  description: 'd', usp: 'u', audience: 'a', category: 'c', categoryNeeds: 'n', tone: 't',
  industryTags: 2, colors: 3, scenarios: 1, personas: 1, produits: 4, concurrents: 2,
};

describe('completudeFicheJarvis · le score RÉEL, les manques cliquables', () => {
  it('fiche vide · 0 %, les 12 éléments manquent, chacun avec son lien vers la fiche', () => {
    const c = completudeFicheJarvis(ficheVide, 'B1');
    expect(c.score).toBe(0);
    expect(c.faits).toBe(0);
    expect(c.total).toBe(12);
    expect(c.manques).toHaveLength(12);
    for (const m of c.manques) {
      expect(m.href).toBe(`/brands/B1${DESTINATION_FICHE_MARQUE[m.cle]}`);
    }
  });

  it('fiche pleine · 100 %, aucun manque', () => {
    const c = completudeFicheJarvis(fichePleine, 'B1');
    expect(c.score).toBe(100);
    expect(c.faits).toBe(12);
    expect(c.manques).toEqual([]);
  });

  it('le score SUIT completudeFicheMarque · remplir un élément bouge le pourcentage', () => {
    const avant = completudeFicheJarvis(ficheVide, 'B1').score;
    const apres = completudeFicheJarvis({ ...ficheVide, description: 'une description' }, 'B1').score;
    expect(apres).toBeGreaterThan(avant);
    // Pas un nombre figé · c'est bien la règle noyau qui tranche.
    expect(apres).toBe(completudeFicheMarque({ ...ficheVide, description: 'une description' }).score);
  });

  it('un manque porte le vrai libellé de l’élément et pointe vers sa destination', () => {
    const c = completudeFicheJarvis({ ...fichePleine, colors: 0 }, 'B9');
    expect(c.manques).toHaveLength(1);
    const colors = ELEMENTS_FICHE_MARQUE.find((e) => e.cle === 'colors')!;
    expect(c.manques[0]!.libelle).toBe(colors.libelle);
    expect(c.manques[0]!.href).toBe('/brands/B9?tab=overview#charte');
  });
});

describe('encartKpiJarvis · vide honnête tant qu’aucune source n’est agrégée', () => {
  it('sans source · état vide, squelette des 4 cartes (libellés seuls), raison et mention honnêtes', () => {
    const e = encartKpiJarvis(null);
    expect(e.etat).toBe('vide');
    if (e.etat !== 'vide') throw new Error('attendu vide');
    expect(e.lien).toBe(LIEN_CONNEXIONS_KPI);
    expect(e.raison).not.toMatch(/\d/); // aucun chiffre inventé
    // Les 4 cartes de la maquette existent en LIBELLÉ · aucune valeur fabriquée.
    expect(e.cartes.map((c) => c.libelle)).toEqual(['Dépense', 'CPA', 'ROAS', 'Valeur d’achat']);
    expect(e.cartes).not.toHaveProperty('0.valeur');
    expect(e.plateforme).toBe('Meta Ads');
    expect(e.periode).toBe('14 derniers jours');
    expect(e.mention).toMatch(/production/i);
    // La mention ne promet pas de montant · elle dit d'où viendront les chiffres.
    expect(e.mention).not.toMatch(/€|\d+ ?%/);
  });

  it('source sans aucun KPI lu · reste vide (ne fabrique rien)', () => {
    expect(encartKpiJarvis({ plateforme: 'Meta', periode: '14 derniers jours', kpis: [] }).etat).toBe('vide');
  });

  it('source lue · l’état vide disparaît, les KPI réels s’affichent', () => {
    const source: SourceDepenseJarvis = {
      plateforme: 'Meta', periode: '14 derniers jours',
      kpis: [{ cle: 'depense', libelle: 'Dépense', valeur: '10 416 €' }],
    };
    const e = encartKpiJarvis(source);
    expect(e.etat).toBe('source');
    if (e.etat !== 'source') throw new Error('attendu source');
    expect(e.kpis).toHaveLength(1);
    expect(e.plateforme).toBe('Meta');
  });
});

describe('AUTOMATISATIONS_JARVIS · trois lignes, toutes à venir', () => {
  it('exactement les trois lignes de la maquette', () => {
    expect(AUTOMATISATIONS_JARVIS.map((a) => a.cle)).toEqual(['iterations', 'rapport', 'nommage']);
  });
  it('chaque ligne a un libellé d’action présenté, mais la note commune dit qu’elles arrivent', () => {
    for (const a of AUTOMATISATIONS_JARVIS) expect(a.action.trim().length).toBeGreaterThan(0);
    expect(AUTOMATISATION_A_VENIR).toMatch(/venir/i);
  });
});
