import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLES_STYLES, STYLES_CREA, IDS_FORMATS_CREATIFS, FAMILLES_STYLES, NIVEAUX_CONSCIENCE, styleDuFormat, estCleStyle, styleCrea, styleCorrespond, consigneStyle,
  statsParStyle, EFFECTIF_MIN_STYLE, cartesStyles, trierStyles, pastilleStyle, chiffresStyle, tuilesStyle, perimetreFormats, ligneDiffusion, pastilleAnnonceur,
  detecterTendances, observationsSauvegardes, observationsMarche, explicationTendance, ecartTendance, carteTendance, kpisTendances, silenceTendances,
  etatRadarTendances, sourcesTendances, pointsCourbeTendances, pointsSparklineTendance, pastilleTendanceStyle, EFFECTIF_MIN_FENETRE_TENDANCE, MIN_N_WINDOW,
  ecranSpatial, lireFormatCreatif, VERSION_FORMATS_CREATIFS,
  type ObservationTendance, type FormatCreatifId,
} from '../src';

const RACINE = join(__dirname, '..', '..', '..', '..');
const JOUR = 86_400_000;
const NOW = Date.UTC(2026, 9, 27);

/* ───────────────────────── catalogue ───────────────────────── */

describe('Formats Spatial · le catalogue des 28 styles', () => {
  it('les 28 clés = celles de la MATRICE = les fragments f-<clé> de la maquette', () => {
    const matrice = readFileSync(join(RACINE, 'docs', 'spatial', 'MATRICE.md'), 'utf8');
    const ligne = /^Formats : (.+)\.$/m.exec(matrice)![1]!;
    const deMatrice = [...ligne.matchAll(/`([a-z]+)`/g)].map((m) => m[1]);
    const fragments = readdirSync(join(RACINE, 'docs', 'spatial', 'reference')).filter((n) => n.startsWith('f-')).map((n) => n.slice(2, -5));
    expect(CLES_STYLES.length).toBe(28);
    expect([...CLES_STYLES].sort()).toEqual([...deMatrice].sort());
    expect([...CLES_STYLES].sort()).toEqual(fragments.sort());
    expect(STYLES_CREA.map((s) => s.cle)).toEqual([...CLES_STYLES]);
  });

  it('les 28 clés sont SERVIES par l’arbre Spatial · une seule adresse dynamique, section veille', () => {
    for (const k of CLES_STYLES) expect(ecranSpatial(`/veille/formats/${k}`), k).toMatchObject({ interne: `/sp/veille/formats/${k}`, section: 'veille' });
    expect(ecranSpatial('/veille/formats')).toMatchObject({ interne: '/sp/veille/formats', section: 'veille' });
    expect(ecranSpatial('/veille/tendances')).toMatchObject({ interne: '/sp/veille/tendances', section: 'veille' });
    expect(estCleStyle('avap')).toBe(true);
    for (const x of ['', 'AVAP', 'f-avap', 'avant_apres', '../x', null, 3]) expect(estCleStyle(x)).toBe(false);
  });

  it('le pont vers la liste normative est INJECTIF et ne vise que des formats de la liste', () => {
    const vises = STYLES_CREA.map((s) => s.formatNormatif).filter((x): x is FormatCreatifId => x !== null);
    expect(new Set(vises).size).toBe(vises.length);
    for (const id of vises) expect(IDS_FORMATS_CREATIFS).toContain(id);
    for (const s of STYLES_CREA) if (s.formatNormatif) expect(styleDuFormat(s.formatNormatif)).toBe(s.cle);
    expect(styleDuFormat('asmr')).toBeNull();
    expect(styleDuFormat(null)).toBeNull();
  });

  it('chaque style est complet · famille connue, conscience 0 à 4, 3 zones, des règles', () => {
    for (const s of STYLES_CREA) {
      expect(FAMILLES_STYLES, s.cle).toContain(s.famille);
      expect(s.conscience.length, s.cle).toBeGreaterThan(0);
      for (const i of s.conscience) expect(i >= 0 && i < NIVEAUX_CONSCIENCE.length, s.cle).toBe(true);
      expect(s.zones.length, s.cle).toBe(3);
      expect(s.regles.length, s.cle).toBeGreaterThan(0);
    }
  });

  it('aucun texte du catalogue ne reprend la marque de démo ni un tiret cadratin', () => {
    const tout = JSON.stringify(STYLES_CREA);
    for (const interdit of ['Neva', 'neva', 'Léo', 'Julie', 'Ploufy', 'lot #1', '—', 'Trendtrack']) expect(tout.includes(interdit), interdit).toBe(false);
  });

  it('la recherche lit le nom, les noms anglais, la définition et la famille', () => {
    expect(styleCorrespond(styleCrea('logo'), 'big logo')).toBe(true);
    expect(styleCorrespond(styleCrea('avap'), 'BEFORE')).toBe(true);
    expect(styleCorrespond(styleCrea('avap'), '   ')).toBe(true);
    expect(styleCorrespond(styleCrea('avap'), 'mème')).toBe(false);
    expect(consigneStyle('avap')).toBe('Format « Avant / Après » · Le problème vécu, puis le résultat avec le produit, côte à côte.');
  });
});

/* ───────────────────────── chiffres réels ───────────────────────── */

const classee = (id: FormatCreatifId | null, jours: number | null = 10) => ({
  daysRunning: jours,
  format: lireFormatCreatif(id ? { formatCreatif: { id, version: VERSION_FORMATS_CREATIFS, date: '2026-10-01T00:00:00Z', auteur: null } } : {}),
});

describe('Formats Spatial · les chiffres d’un style viennent des sauvegardes classées', () => {
  it('compte par format normatif · les non classées et les formats sans style ne comptent nulle part', () => {
    const st = statsParStyle([classee('avant_apres'), classee('avant_apres'), classee(null), classee('asmr')]);
    expect(st.avap).toEqual({ mesure: true, n: 2, joursMoyens: null, partLongue: null });
    expect(st.probsol.mesure).toBe(false);
    expect(st.probsol.n).toBe(0);
    expect(Object.values(st).reduce((a, s) => a + s.n, 0)).toBe(2);
  });

  it('sous l’effectif minimal (celui du dépôt), ni moyenne ni part · au-dessus, mesurées', () => {
    expect(EFFECTIF_MIN_STYLE).toBe(MIN_N_WINDOW);
    const sous = statsParStyle(Array.from({ length: EFFECTIF_MIN_STYLE - 1 }, () => classee('meme', 40)));
    expect(sous.meme.partLongue).toBeNull();
    const assez = statsParStyle([...Array.from({ length: 3 }, () => classee('meme', 40)), ...Array.from({ length: 2 }, () => classee('meme', 10))]);
    expect(assez.meme).toEqual({ mesure: true, n: 5, joursMoyens: 28, partLongue: 60 });
    expect(chiffresStyle(assez.meme)).toEqual({ pubs: { b: '5', texte: ' pubs classées' }, longue: { b: '60 %', texte: ' tournent +30 j' } });
    expect(chiffresStyle(sous.meme).longue.b).toBe('n/c');
    expect(chiffresStyle(statsParStyle([]).notes).pubs.b).toBe('Aucun');
    expect(tuilesStyle(assez.meme, 2)).toEqual([['Pubs classées', '5'], ['Diffusion moyenne', '28 j'], ['Tournent +30 j', '60 %'], ['Tes tests', '2']]);
  });

  it('tri et pastilles · le rang ne s’affiche que trié par nombre, sans filtre, pour un style qui a des annonces', () => {
    const st = statsParStyle([classee('meme'), classee('meme'), classee('promo')]);
    const cartes = cartesStyles(st, []);
    const pop = trierStyles(cartes, 'pop');
    expect(pop.slice(0, 2).map((c) => c.style.cle)).toEqual(['meme', 'promo']);
    expect(pop[2]!.style.cle).toBe('avap'); // à égalité, l'ordre du catalogue
    const ctx = { tri: 'pop' as const, famille: 'tous' as const, q: '' };
    expect(pastilleStyle(pop[0]!, 0, ctx)).toEqual({ classe: '', texte: 'N° 1 · tes sauvegardes' });
    expect(pastilleStyle(pop[2]!, 2, ctx)).toBeNull(); // aucun chiffre, aucun rang
    expect(pastilleStyle(pop[0]!, 0, { ...ctx, q: 'x' })).toBeNull();
    expect(trierStyles(cartes, 'az')[0]!.style.nom).toBe('Advertorial');
  });

  it('la ligne de périmètre dit d’où viennent les chiffres et ce qui reste à classer', () => {
    expect(perimetreFormats({ classees: 0, nonClassees: 0 }, null)).toBe('Aucune sauvegarde classée · les chiffres se remplissent quand tu classes tes sauvegardes');
    expect(perimetreFormats({ classees: 1, nonClassees: 3 }, 'Acme')).toBe('Compté sur ta sauvegarde classée · marque Acme · 3 à classer dans Sauvegardes');
    expect(perimetreFormats({ classees: 12, nonClassees: 0 }, null)).toBe('Compté sur tes 12 sauvegardes classées');
  });

  it('ligne de diffusion et pastille d’annonceur', () => {
    expect(ligneDiffusion('active', 63)).toBe('Active · 63 j');
    expect(ligneDiffusion('inactive', 4)).toBe('Arrêtée · 4 j');
    expect(ligneDiffusion(undefined, null)).toBe('Diffusée · durée inconnue');
    const a = pastilleAnnonceur('  acme shop ');
    expect(a.initiale).toBe('A');
    expect(a.nom).toBe('acme shop');
    expect(pastilleAnnonceur('acme shop').couleur).toBe(a.couleur);
    expect(pastilleAnnonceur(null).nom).toBe('Annonceur inconnu');
  });
});

/* ───────────────────────── tendances ───────────────────────── */

/** `k` observations du groupe `g` et `n - k` d'un autre groupe, `jours` jours avant NOW. */
function lot(type: ObservationTendance['type'], g: string, k: number, n: number, joursAvant: number, autre = 'statement'): ObservationTendance[] {
  return Array.from({ length: n }, (_, i) => ({ type, groupe: i < k ? g : autre, date: NOW - joursAvant * JOUR - i * 1000, annonceur: `M${i % 4}`, concurrent: i % 4 === 0, jours: 20 + i }));
}

describe('Tendances · une part qui bouge, comparée au mois d’avant, jamais à zéro', () => {
  it('le silence est la réponse quand une fenêtre est sous l’effectif minimal (celui du dépôt)', () => {
    expect(EFFECTIF_MIN_FENETRE_TENDANCE).toBe(MIN_N_WINDOW);
    const r = detecterTendances([...lot('accroche', 'question', 4, 4, 5), ...lot('accroche', 'question', 0, 4, 40)], NOW);
    expect(r.tendances).toEqual([]);
    expect(r.fenetres.accroche).toEqual({ recent: 4, avant: 4, ancien: 0, parle: false });
    expect(silenceTendances(r)).toContain('il en faut 5 par mois');
  });

  it('en croissance · borne basse récente au-dessus de la borne haute d’avant', () => {
    const r = detecterTendances([...lot('accroche', 'question', 7, 10, 5), ...lot('accroche', 'question', 1, 10, 40)], NOW);
    const t = r.tendances.find((x) => x.groupe === 'question')!;
    expect(t.etape).toBe('croissance');
    expect(t.recent).toEqual({ k: 7, n: 10, part: 0.7 });
    expect(t.ecartPoints).toBe(60);
    expect(t.marques).toBe(4);
    expect(t.concurrents).toBe(1);
    expect(explicationTendance(t)).toBe('7 créas sur 10 ces 30 derniers jours (70 %), contre 1 sur 10 le mois d’avant (10 %). 4 marques, dont 1 que tu suis.');
    // L'autre groupe recule d'autant · il est en déclin, mesuré lui aussi.
    expect(r.tendances.find((x) => x.groupe === 'statement')!.etape).toBe('declin');
  });

  it('émergente · en hausse et absente des deux mois d’avant', () => {
    const r = detecterTendances([...lot('accroche', 'question', 7, 10, 5), ...lot('accroche', 'question', 0, 10, 40)], NOW);
    expect(r.tendances.find((x) => x.groupe === 'question')!.etape).toBe('emergente');
  });

  it('au pic · le mois d’avant dépassait nettement le précédent, ce mois ne se départage pas', () => {
    const r = detecterTendances([...lot('accroche', 'question', 7, 10, 5), ...lot('accroche', 'question', 7, 10, 40), ...lot('accroche', 'question', 1, 10, 70)], NOW);
    expect(r.tendances.find((x) => x.groupe === 'question')!.etape).toBe('pic');
  });

  it('deux mois qui se touchent ne font pas une tendance · silence, expliqué', () => {
    const r = detecterTendances([...lot('accroche', 'question', 4, 10, 5), ...lot('accroche', 'question', 3, 10, 40)], NOW);
    expect(r.tendances).toEqual([]);
    expect(silenceTendances(r)).toContain('C’est une conclusion, pas une panne.');
    expect(silenceTendances(detecterTendances([], NOW))).toContain('Aucune annonce à lire');
  });

  it('les types ne se mélangent pas · chacun a son total', () => {
    const r = detecterTendances([...lot('accroche', 'question', 7, 10, 5), ...lot('accroche', 'question', 1, 10, 40), ...lot('visuel', 'lifestyle', 1, 3, 5, 'product_hero')], NOW);
    expect(r.fenetres.visuel.parle).toBe(false);
    expect(r.tendances.every((t) => t.type === 'accroche')).toBe(true);
  });

  it('hors des 90 jours, ou dans le futur, une observation est ignorée', () => {
    const r = detecterTendances([...lot('accroche', 'question', 7, 10, 95), ...lot('accroche', 'question', 7, 10, -3)], NOW);
    expect(r.observations).toBe(0);
  });

  it('les 10 semaines de la mini-courbe comptent les entrées du groupe, la plus ancienne d’abord', () => {
    const r = detecterTendances([...lot('accroche', 'question', 7, 10, 1), ...lot('accroche', 'question', 1, 10, 40)], NOW);
    const t = r.tendances.find((x) => x.groupe === 'question')!;
    expect(t.semaines).toHaveLength(10);
    expect(t.semaines[9]).toBe(7);
    expect(t.semaines.reduce((a, b) => a + b, 0)).toBe(8);
  });
});

describe('Tendances · observations et affichage', () => {
  it('seules les sauvegardes CLASSÉES deviennent des observations, la marque suivie est reconnue', () => {
    const o = observationsSauvegardes([
      { sauvegardeLe: '2026-10-20T00:00:00Z', style: 'avap', classee: true, annonceur: 'Acme', plateforme: 'meta', jours: 12, vignette: 'https://v/1.jpg' },
      { sauvegardeLe: '2026-10-20T00:00:00Z', style: null, classee: true, annonceur: null, plateforme: 'meta', jours: null, vignette: null },
      { sauvegardeLe: '2026-10-20T00:00:00Z', style: null, classee: false, annonceur: 'Acme', plateforme: 'meta', jours: 3, vignette: null },
      { sauvegardeLe: 'pas une date', style: 'avap', classee: true, annonceur: 'Acme', plateforme: 'meta', jours: 3, vignette: null },
    ], new Set(['meta:Acme']));
    expect(o).toHaveLength(2);
    expect(o[0]).toMatchObject({ type: 'format', groupe: 'avap', concurrent: true, vignette: 'https://v/1.jpg' });
    expect(o[1]!.groupe).toBeNull();
  });

  it('une créa concurrente n’alimente un type que si sa valeur est lue et connue', () => {
    const o = observationsMarche([
      { creeLe: '2026-10-20T00:00:00Z', hookType: 'question', composition: 'lifestyle', annonceur: 'A', provenance: 'followed', jours: 30 },
      { creeLe: '2026-10-20T00:00:00Z', hookType: null, composition: 'inconnue', annonceur: 'B', provenance: 'radar', jours: 3 },
    ]);
    expect(o.map((x) => `${x.type}:${x.groupe}:${x.concurrent}`)).toEqual(['accroche:question:true', 'visuel:lifestyle:true']);
  });

  it('la carte · part, écart signé, gestes réels (déclin · pas de geste, un avertissement)', () => {
    const r = detecterTendances([...lot('format', 'avap', 7, 10, 5, 'meme'), ...lot('format', 'avap', 1, 10, 40, 'meme')], NOW);
    const up = carteTendance(r.tendances.find((t) => t.groupe === 'avap')!, { lienProjet: (c) => `/p?angle=${c}`, radarOuvert: false });
    expect(up).toMatchObject({ type: 'Format', nom: 'Avant / Après', part: 70, ecart: '+60 pts', hausse: true });
    expect(up.cta.primaire).toEqual({ libelle: 'Créer avec ce format', href: `/p?angle=${consigneStyle('avap')}` });
    expect(up.cta.voir).toEqual({ libelle: 'Voir le format', href: '/veille/formats/avap' });
    const bas = carteTendance(r.tendances.find((t) => t.groupe === 'meme')!, { lienProjet: (c) => c, radarOuvert: false });
    expect(bas.cta.primaire).toBeNull();
    expect(bas.cta.alerte).toBe('En recul · à éviter pour l’instant');
    expect(bas.ecart).toBe('−60 pts');
    expect(pastilleTendanceStyle(r.tendances.find((t) => t.groupe === 'meme'))).toEqual({ classe: 'w', texte: '−60 pts ce mois' });
    expect(pastilleTendanceStyle(null)).toBeNull();
    expect(kpisTendances(r)).toEqual([['20', 'annonces lues sur 90 jours'], ['2', 'tendances mesurées'], ['0', 'émergentes ce mois'], ['2', 'chez des marques que tu suis']]);
  });

  it('une accroche ne renvoie au radar que si la personne y a accès', () => {
    const r = detecterTendances([...lot('accroche', 'question', 7, 10, 5), ...lot('accroche', 'question', 1, 10, 40)], NOW);
    const t = r.tendances.find((x) => x.groupe === 'question')!;
    expect(carteTendance(t, { lienProjet: (c) => c, radarOuvert: true }).cta.voir).toEqual({ libelle: 'Voir le radar concurrents', href: '/adsmap/radar' });
    expect(carteTendance(t, { lienProjet: (c) => c, radarOuvert: false }).cta.voir).toBeNull();
    expect(carteTendance(t, { lienProjet: (c) => c, radarOuvert: false }).nom).toBe('Question');
  });

  it('état du radar, sources, écart, géométrie', () => {
    expect(etatRadarTendances(null)).toContain('Aucune marque active');
    expect(etatRadarTendances({ armed: true, lastRunAt: '2026-10-26T03:00:00Z' })).toBe('Armé · dernier passage le 26 octobre');
    expect(etatRadarTendances({ armed: false, lastRunAt: null })).toBe('Éteint · aucun passage encore · les tendances se calculent sur ce qui est déjà en base');
    expect(sourcesTendances({ meta: 3 }).map((s) => [s.lettre, s.actif, s.detail])).toEqual([['M', true, '3 annonces lues · 90 j'], ['T', false, 'Aucune annonce lue'], ['G', false, 'Aucune annonce lue']]);
    expect(ecartTendance(0)).toBe('0 pt');
    const pts = pointsCourbeTendances(['croissance', 'emergente', 'croissance', 'declin']);
    expect(pts.map((p) => p.x)).toEqual([367, 150, 433, 845]);
    expect(pointsSparklineTendance([0, 0])).toBe('2.0,30.0 118.0,30.0');
    expect(pointsSparklineTendance([0, 2])).toBe('2.0,30.0 118.0,4.0');
  });
});
