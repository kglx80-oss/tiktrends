import { describe, expect, it } from 'vitest';
import {
  aFaireMaintenant, carteConfiguration, cartesQuoiIterer, choixRapidesPeriode, chosesQuiAttendent, depuisRelatif,
  etapesBoucleAccueil, fileQuoiDeNeuf, indicateursGagnante, journey, lienQuestionJarvis, ligneAttente, lignesReprendre,
  lireQuestionJarvis, lotsAConclure, periodeReporting, progressionLot, raccourcisAccueil, salutationAccueil,
  sourcesJarvisAccueil, surtitreSpatialAccueil, syntheseReporting, titreJarvisAccueil, NB_FORMATS_VEILLE, ECRANS_SPATIAUX,
  ecranSpatial, VALEUR_ABSENTE,
  type CarteIterationAccueil, type JourneeMesuree, type LotAccueil,
} from '../src';

const NOW = new Date('2026-10-22T10:00:00Z');

describe('Spatial · Accueil · déclaration', () => {
  it('/dashboard est porté, section accueil', () => {
    expect(ECRANS_SPATIAUX).toContainEqual({ chemin: '/dashboard', section: 'accueil' });
    expect(ecranSpatial('/dashboard')).toEqual({ interne: '/sp/dashboard', section: 'accueil' });
  });
});

describe('Spatial · Accueil · Jarvis préremplie, jamais envoyée', () => {
  it('la question voyage dans q, nettoyée et bornée · sans question, /jarvis seul', () => {
    expect(lienQuestionJarvis('  Angles : que me conseilles-tu ?  ')).toBe('/jarvis?q=Angles+%3A+que+me+conseilles-tu+%3F');
    expect(lienQuestionJarvis('   ')).toBe('/jarvis');
    expect(lienQuestionJarvis(42)).toBe('/jarvis');
    const longue = lienQuestionJarvis('x'.repeat(5000));
    expect(new URLSearchParams(longue.split('?')[1]).get('q')!.length).toBe(4000);
  });
  it('l’écran Jarvis relit exactement la question posée', () => {
    const q = 'Quel angle tester ensuite pour « Été » & co ?';
    expect(lireQuestionJarvis(new URLSearchParams(lienQuestionJarvis(q).split('?')[1]))).toBe(q);
    expect(lireQuestionJarvis({ q: ['a', 'b'] })).toBe('a');
    expect(lireQuestionJarvis({})).toBe('');
    expect(lireQuestionJarvis(null)).toBe('');
  });
  it('aucune source prêtée à Jarvis sans marque · le titre suit la marque', () => {
    expect(sourcesJarvisAccueil({ marqueActive: false })).toEqual([]);
    expect(sourcesJarvisAccueil({ marqueActive: true })).toEqual(['Fiche marque']);
    expect(titreJarvisAccueil(' Brasse ')).toBe('Comment je peux t’aider sur Brasse ?');
    expect(titreJarvisAccueil(null)).toBe('Comment je peux t’aider ?');
  });
});

describe('Spatial · Accueil · en-tête et attente', () => {
  it('surtitre en majuscule initiale, date de Paris · salutation au prénom réel', () => {
    expect(surtitreSpatialAccueil({ maintenant: NOW, marque: 'Brasse' })).toBe('Jeudi 22 octobre · Brasse');
    expect(surtitreSpatialAccueil({ maintenant: NOW, marque: null })).toBe('Jeudi 22 octobre');
    expect(salutationAccueil('Camille Martin')).toBe('Bonjour Camille');
    expect(salutationAccueil('  ')).toBe('Bonjour');
  });
  it('la phrase d’attente vient des sources lues · se tait quand aucune ne l’est', () => {
    expect(ligneAttente(chosesQuiAttendent({ iterations: null, veille: null, notifications: null }))).toBeNull();
    expect(ligneAttente(chosesQuiAttendent({ iterations: 0, veille: 0, notifications: null }))).toBe('Rien ne t’attend pour l’instant.');
    expect(ligneAttente(chosesQuiAttendent({ iterations: 1, veille: 5, notifications: 0 })))
      .toBe('6 choses t’attendent : 1 gagnante à itérer et 5 nouvelles pubs chez tes concurrents suivis.');
  });
});

describe('Spatial · Accueil · raccourcis', () => {
  it('un raccourci fermé au droit est absent · la fiche dit ce qui manque', () => {
    const tous = raccourcisAccueil({ nouveauProjet: '/studio/projets/nouveau', formats: true, forfaits: true, importer: true, fiche: { href: '/brands/b', manques: ['la description', 'le ton'] } });
    expect(tous.map((r) => r.cle)).toEqual(['nouveau', 'formats', 'forfaits', 'importer', 'fiche']);
    expect(tous[1]!.sous).toBe(`${NB_FORMATS_VEILLE} formats, concurrents`);
    expect(tous[4]).toMatchObject({ sous: '2 éléments à compléter', pastille: { valeur: '2' } });
    expect(raccourcisAccueil({ nouveauProjet: null, formats: false, forfaits: false, importer: false, fiche: null })).toEqual([]);
    expect(raccourcisAccueil({ nouveauProjet: null, formats: false, forfaits: false, importer: false, fiche: { href: '/b', manques: [] } })[0]!.pastille).toBeNull();
  });
});

const lot = (o: Partial<LotAccueil>): LotAccueil => ({ id: 'l', numero: 1, statut: 'testing', but: null, lanceLe: null, finPrevue: null, variantes: 3, vignette: null, ...o });

describe('Spatial · Accueil · lots et « À faire maintenant »', () => {
  it('à conclure = en diffusion ET fin prévue passée · sans fin prévue, jamais', () => {
    const ls = [
      lot({ id: 'a', numero: 1, finPrevue: '2026-10-20T00:00:00Z' }),
      lot({ id: 'b', numero: 2, finPrevue: '2026-10-30T00:00:00Z' }),
      lot({ id: 'c', numero: 3, finPrevue: null }),
      lot({ id: 'd', numero: 4, statut: 'analyzed', finPrevue: '2026-10-01T00:00:00Z' }),
    ];
    expect(lotsAConclure(ls, NOW).map((l) => l.id)).toEqual(['a']);
  });
  it('l’ordre · lot à conclure, puis verdicts, puis gagnante, puis configuration · rien sinon', () => {
    const base = { lotsAConclure: [], aArbitrer: null, iteration: null, etape: null, maintenant: NOW, lotsOuverts: true };
    expect(aFaireMaintenant(base)).toBeNull();
    expect(aFaireMaintenant({ ...base, etape: { libelle: 'Créer ta marque', pourquoi: 'p', href: '/brands/new' } })).toMatchObject({ titre: 'À faire maintenant : créer ta marque', href: '/brands/new' });
    expect(aFaireMaintenant({ ...base, iteration: { titre: 'C · v2', href: '/studio/x' }, etape: { libelle: 'x', pourquoi: 'p', href: '/x' } })!.titre).toBe('Prochaine étape : itérer sur C · v2');
    expect(aFaireMaintenant({ ...base, aArbitrer: 2, iteration: { titre: 'C', href: '/s' } })).toMatchObject({ titre: 'À faire maintenant : arbitrer 2 verdicts', href: '/adsmap#tests' });
    const l = lot({ id: 'l9', numero: 9, lanceLe: '2026-10-08T09:00:00Z', finPrevue: '2026-10-21T09:00:00Z' });
    expect(aFaireMaintenant({ ...base, lotsAConclure: [l], aArbitrer: 2 })).toEqual({
      titre: 'À faire maintenant : conclure le lot #9', detail: '14 jours écoulés · 3 variantes · fin prévue le 21 oct.', action: 'Conclure le lot', href: '/adsmap/lots?lot=l9',
    });
    expect(aFaireMaintenant({ ...base, lotsAConclure: [l], lotsOuverts: false })!.href).toBe('/adsmap#tests');
  });
  it('la progression d’un lot ne s’affiche que datée aux deux bouts', () => {
    expect(progressionLot(lot({ lanceLe: '2026-10-16T08:00:00Z', finPrevue: '2026-10-30T08:00:00Z' }), NOW)).toEqual({ part: 43, texte: 'J6 / 14', note: 'Bilan le 30 oct. · rien à faire d’ici là' });
    expect(progressionLot(lot({ lanceLe: '2026-10-16T08:00:00Z' }), NOW)).toBeNull();
  });
});

describe('Spatial · Accueil · configuration sur le parcours réel', () => {
  const ouvert = () => true;
  it('compte les étapes requises, désigne la prochaine, dit pourquoi une étape attend', () => {
    const c = carteConfiguration(journey(new Set(['brand', 'identity']), { canAdmin: true }), { marque: 'Brasse', ouvert })!;
    expect(c).toMatchObject({ fait: 2, total: 8, part: 25, titre: 'Configure TikTrends pour Brasse' });
    expect(c.prochaines).toHaveLength(3);
    expect(c.prochaines[0]).toMatchObject({ cle: 'generate', action: { primaire: true, href: '/studio/projets/nouveau?type=ads' } });
    const meta = c.etapes.find((e) => e.cle === 'meta')!;
    expect(meta.action).toBeNull();
    expect(meta.detail).toBe('Après « Ouvrir un lot de test »');
    expect(c.etapes.filter((e) => e.fait).map((e) => e.cle)).toEqual(['brand', 'identity']);
  });
  it('un membre ne reçoit pas de geste vers un écran d’admin · un écran fermé n’a pas de bouton', () => {
    const c = carteConfiguration(journey(new Set(), { canAdmin: false }), { marque: null, ouvert })!;
    expect(c.etapes[0]).toMatchObject({ cle: 'brand', action: null, detail: 'Réservé à un administrateur de l’espace' });
    const ferme = carteConfiguration(journey(new Set(['brand', 'identity']), { canAdmin: true }), { marque: null, ouvert: () => false })!;
    expect(ferme.etapes.every((e) => e.action === null)).toBe(true);
  });
  it('le parcours terminé retire la carte · la fiche remplace la liste des marques pour « Renseigner »', () => {
    const tout = new Set(['brand', 'identity', 'generate', 'map', 'batch', 'meta', 'verdict', 'memory']);
    expect(carteConfiguration(journey(tout), { marque: 'B', ouvert })).toBeNull();
    const c = carteConfiguration(journey(new Set(['brand'])), { marque: 'B', ouvert, ficheHref: '/brands/b?tab=overview#profil' })!;
    expect(c.prochaines[0]!.action!.href).toBe('/brands/b?tab=overview#profil');
  });
});

describe('Spatial · Accueil · période du reporting', () => {
  it('défaut 14 jours jusqu’à hier, comparé aux 14 précédents', () => {
    const p = periodeReporting({ aujourdhui: '2026-10-22' });
    expect(p).toMatchObject({ cle: '14', jours: 14, debut: '2026-10-08', fin: '2026-10-21', precDebut: '2026-09-24', precFin: '2026-10-07' });
    expect(p.libelle).toBe('8 oct. → 21 oct. · 14 jours · comparé aux 14 jours précédents');
    expect(periodeReporting({ periode: 'n’importe', aujourdhui: '2026-10-22' }).cle).toBe('14');
  });
  it('7, 30, 90, ce mois-ci (le 1er du mois retombe sur le mois écoulé)', () => {
    expect(periodeReporting({ periode: '90', aujourdhui: '2026-10-22' })).toMatchObject({ jours: 90, fin: '2026-10-21' });
    expect(periodeReporting({ periode: 'mois', aujourdhui: '2026-10-22' })).toMatchObject({ debut: '2026-10-01', jours: 21 });
    expect(periodeReporting({ periode: 'mois', aujourdhui: '2026-11-01' })).toMatchObject({ debut: '2026-10-01', fin: '2026-10-31', jours: 31 });
  });
  it('personnalisée · bornée à hier et à 90 jours, inversée remise dans l’ordre, trop courte refusée', () => {
    expect(periodeReporting({ periode: 'perso', du: '2026-10-10', au: '2026-10-01', aujourdhui: '2026-10-22' })).toMatchObject({ cle: 'perso', debut: '2026-10-01', fin: '2026-10-10', jours: 10, libellePerso: '1 oct. → 10 oct.' });
    expect(periodeReporting({ periode: 'perso', du: '2026-01-01', au: '2026-12-31', aujourdhui: '2026-10-22' })).toMatchObject({ fin: '2026-10-21', jours: 90 });
    expect(periodeReporting({ periode: 'perso', du: '2026-10-05', au: '2026-10-05', aujourdhui: '2026-10-22' }).cle).toBe('14');
    expect(periodeReporting({ periode: 'perso', du: '2026-02-30', au: '2026-10-05', aujourdhui: '2026-10-22' }).cle).toBe('14');
  });
  it('les choix rapides suivent le calendrier réel', () => {
    expect(choixRapidesPeriode('2026-10-22')).toEqual([
      { libelle: 'Semaine dernière', du: '2026-10-12', au: '2026-10-18' },
      { libelle: 'Mois dernier', du: '2026-09-01', au: '2026-09-30' },
      { libelle: '60 derniers jours', du: '2026-08-23', au: '2026-10-21' },
      { libelle: '90 derniers jours', du: '2026-07-24', au: '2026-10-21' },
    ]);
  });
});

describe('Spatial · Accueil · synthèse du reporting', () => {
  const P = periodeReporting({ periode: '7', aujourdhui: '2026-10-22' });
  const j = (date: string, o: Partial<JourneeMesuree> = {}): JourneeMesuree => ({ date, depense: 100, impressions: 10_000, clics: 100, achats: 10, revenu: 200, vues3s: 2_000, ...o });
  it('aucune journée mesurée sur les deux périodes · null (pas de zéros affichés)', () => {
    expect(syntheseReporting([], P)).toBeNull();
    expect(syntheseReporting([j('2025-01-01')], P)).toBeNull();
  });
  it('calcule les six KPI et leur variation sur des journées réelles', () => {
    const cur = ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'].map((d) => j(d, { depense: 120, revenu: 180 }));
    const prev = ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'].map((d) => j(d));
    const s = syntheseReporting([...cur, ...prev], P)!;
    const parLib = Object.fromEntries(s.kpis.map((k) => [k.libelle, k]));
    expect(parLib['Dépense']).toMatchObject({ valeur: `${(840).toLocaleString('fr-FR')} €`, variation: '▲ +20,0 %', ton: 'neutre' });
    expect(parLib['ROAS']).toMatchObject({ valeur: '1,50', variation: '▼ −25,0 %', ton: 'mauvais' });
    expect(parLib['Coût par achat']).toMatchObject({ valeur: '12,00 €', variation: '▲ +20,0 %', ton: 'mauvais' });
    expect(parLib['Achats']).toMatchObject({ valeur: '70', variation: '= 0,0 %', ton: 'neutre' });
    expect(parLib['CTR']!.valeur).toBe('1,00 %');
    expect(parLib['Taux d’accroche']).toMatchObject({ valeur: '20,0 %', variation: '= 0,0 pts' });
    expect(s.graphique.barres).toHaveLength(7);
    expect(s.graphique.bas.map((b) => b.texte)).toEqual(['15 oct.', '16 oct.', '17 oct.', '18 oct.', '19 oct.', '20 oct.', '21 oct.']);
    expect(s.graphique.dernier).not.toBeNull();
  });
  it('sans période précédente ni dénominateur, rien n’est inventé', () => {
    const s = syntheseReporting([j('2026-10-20', { achats: 0, vues3s: 0 })], P)!;
    const parLib = Object.fromEntries(s.kpis.map((k) => [k.libelle, k]));
    expect(parLib['Dépense']!.variation).toBe('sans période précédente');
    expect(parLib['Coût par achat']!.valeur).toBe(VALEUR_ABSENTE);
    expect(parLib['Taux d’accroche']!.valeur).toBe(VALEUR_ABSENTE);
    expect(s.graphique.barres.filter((b) => b.hauteur !== '0.0')).toHaveLength(1);
  });
});

describe('Spatial · Accueil · boucle d’itération', () => {
  it('cinq étapes sur les comptes et lots réels · vides honnêtes sans donnée', () => {
    const vide = etapesBoucleAccueil({ comptes: { tests: 0, avecHypothese: 0, aArbitrer: 0, arbitres: 0, apprentissages: 0 }, lots: [], maintenant: NOW, lotsOuverts: false });
    expect(vide.map((e) => [e.cle, e.n, e.sous, e.action])).toEqual([
      ['hypotheses', 0, 'Aucun test pour l’instant', null],
      ['preparation', 0, 'Aucun lot en préparation', null],
      ['diffusion', 0, 'Aucun lot en diffusion', null],
      ['atraiter', 0, 'Rien en attente', null],
      ['apprentissages', 0, 'Pas encore de conclusion', null],
    ]);
    expect(vide.some((e) => e.alerte)).toBe(false);
  });
  it('lots en préparation, en diffusion, à conclure, verdicts à arbitrer', () => {
    const e = etapesBoucleAccueil({
      comptes: { tests: 5, avecHypothese: 3, aArbitrer: 1, arbitres: 2, apprentissages: 2 }, maintenant: NOW, lotsOuverts: true,
      lots: [
        lot({ id: 'p', numero: 3, statut: 'planned', but: 'UGC ou packshot', vignette: 'https://x/a.jpg' }),
        lot({ id: 'd', numero: 2, lanceLe: '2026-10-16T08:00:00Z', finPrevue: '2026-10-30T08:00:00Z' }),
        lot({ id: 'c', numero: 1, lanceLe: '2026-10-01T08:00:00Z', finPrevue: '2026-10-15T08:00:00Z', vignette: 'https://x/b.jpg' }),
      ],
    });
    expect(e[0]).toMatchObject({ n: 3, sous: '2 tests sans hypothèse écrite', action: 'Préparer un lot' });
    expect(e[1]).toMatchObject({ n: 1, sous: 'Lot #3 · UGC ou packshot', alerte: true, href: '/adsmap/lots?lot=p', vignettes: [{ url: 'https://x/a.jpg', gagnante: false, vertical: false }] });
    expect(e[2]).toMatchObject({ n: 1, sous: 'Lot #2', progression: { texte: 'J6 / 14' } });
    expect(e[3]).toMatchObject({ n: 2, sous: 'Lot #1 à conclure · 1 verdict à arbitrer', alerte: true, action: 'Conclure le lot #1', vignettes: [{ gagnante: true }] });
    expect(e[4]).toMatchObject({ n: 2, sous: '2 validés', href: '/adsmap/suites' });
  });
});

describe('Spatial · Accueil · quoi itérer', () => {
  const carte: CarteIterationAccueil = {
    adId: 'a1', titre: 'Concept · v2', vignette: null, verdict: 'Gagnante', lot: 'Lot #3 conclu', apprentissageValide: true,
    mesure: { valeur: '7,85 €', libelle: 'coût par achat', periode: 'sur 14 jours de diffusion', source: 'Meta · synchro Adsmap' },
    garde: 'Garde · visuel et produit', change: 'Change · Accroche', raison: 'Parce que.', iterer: '/studio/projets/nouveau?type=ads&iter=a1',
  };
  it('les indicateurs viennent de l’agrégat du verdict, sans seuil inventé', () => {
    expect(indicateursGagnante({ roas: 2.1, spend: 3120, cpa: 6.8, purchases: 10, ctr: 0.012 })).toEqual([
      { libelle: 'ROAS', valeur: '2,10', classe: '' },
      { libelle: 'Dépense', valeur: `${(3120).toLocaleString('fr-FR')} €`, classe: '' },
      { libelle: 'Coût / achat', valeur: '6,80 €', classe: '' },
    ]);
    expect(indicateursGagnante(null)).toEqual([]);
    expect(indicateursGagnante({ roas: 'x' })).toEqual([]);
  });
  it('une carte par gagnante prouvée · preuve, garde, geste réel · jamais « Recommandé »', () => {
    const [c] = cartesQuoiIterer([carte], () => ({ roas: 2 }));
    expect(c).toMatchObject({
      rang: 1, nom: 'Concept · v2', recommande: false, titre: 'Garder ce qui a gagné · changer accroche',
      preuve: { niveau: 3, libelle: 'Mesuré' }, note: 'sur 14 jours de diffusion · Meta · synchro Adsmap',
      action: { href: '/studio/projets/nouveau?type=ads&iter=a1' },
    });
    expect(c!.signaux.map((s) => s.texte)).toEqual(['7,85 € · coût par achat', 'Lot #3 conclu', 'Apprentissage validé']);
    expect(cartesQuoiIterer([{ ...carte, iterer: null, mesure: null, apprentissageValide: false }], () => null)[0]).toMatchObject({ action: null, preuve: { niveau: 1 } });
  });
});

describe('Spatial · Accueil · nouveautés et reprise', () => {
  it('les notifications réelles, les plus récentes d’abord, quatre au plus · un lien externe n’est pas suivi', () => {
    const n = (id: string, min: number, o: Partial<{ type: string; href: string | null; corps: string | null }> = {}) => ({ id, type: 'system', titre: `T${id}`, corps: null, href: '/x', creeLe: new Date(NOW.getTime() - min * 60_000), ...o });
    const f = fileQuoiDeNeuf([n('a', 300), n('b', 12, { type: 'tracker', corps: 'Deux pubs' }), n('c', 60 * 30), n('d', 2000, { href: 'https://ailleurs.fr' }), n('e', 60 * 24 * 40)], NOW);
    expect(f.map((x) => x.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(f[0]).toMatchObject({ icone: 'eye', couleur: 'chg', texte: 'Tb · Deux pubs', quand: 'il y a 12 min', action: { libelle: 'Analyser', href: '/x' } });
    expect(f[2]!.action).not.toBeNull();
    expect(f[3]).toMatchObject({ action: null, quand: 'hier' });
  });
  it('« il y a » · min, h, hier, jours · une date future ou illisible ne se date pas', () => {
    expect(depuisRelatif(new Date(NOW.getTime() - 20_000), NOW)).toBe('à l’instant');
    expect(depuisRelatif(new Date(NOW.getTime() - 2 * 3_600_000), NOW)).toBe('il y a 2 h');
    expect(depuisRelatif(new Date(NOW.getTime() - 4 * 86_400_000), NOW)).toBe('il y a 4 j');
    expect(depuisRelatif(new Date(NOW.getTime() + 3_600_000), NOW)).toBeNull();
    expect(depuisRelatif('pas une date', NOW)).toBeNull();
    expect(depuisRelatif(null, NOW)).toBeNull();
  });
  it('la reprise garde quatre projets, leur étape et leur fraîcheur', () => {
    const p = (i: number) => ({ id: `p${i}`, titre: `P${i}`, apercu: null, libelleEtape: 'Brief prêt', libelleType: 'Publicité', majLe: new Date(NOW.getTime() - 3_600_000).toISOString() });
    const l = lignesReprendre([1, 2, 3, 4, 5].map(p), NOW);
    expect(l).toHaveLength(4);
    expect(l[0]).toEqual({ id: 'p1', href: '/studio/projets/p1', titre: 'P1', vignette: null, detail: 'Brief prêt · Publicité · il y a 1 h' });
  });
});
