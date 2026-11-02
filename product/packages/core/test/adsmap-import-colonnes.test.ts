import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { toCsv, COL_HYPOTHESIS } from '../src/adsmap/sheet';
import {
  buildImportPlan, COLONNES_OBLIGATOIRES, detecterSeparateur, enteteDuFichier, findHeaderRow, guideColonnes, INTITULES_MONTRES,
  lectureSeparateur, lireColonnes, LONGUEUR_INTITULE, mentionColonnesAbsentes, modeleImport, parseCsv, refusColonnes,
  SEUIL_COLONNES_RECONNUES, SHEET_HEADERS, type ImportPlan,
} from '../src/adsmap/import-sheet';
import { idsLiensApp, lireLienApp, resoudreLienApp, resoudreLiensApp } from '../src/adsmap/liens-app-import';
import { exporterTextes } from '../src/studios/textes/textes';
import type { AdressesAdAdsmap } from '../src/studios/sources/departs-assistant';

/**
 * L'import Résultats dit ce qu'il a lu et refuse ce qu'il ne comprend pas.
 *
 *  1. un fichier mal découpé (toutes les colonnes dans UNE cellule) ou étranger
 *     au tableau était accepté · l'aperçu montrait une variante dont le
 *     « concept » valait la ligne entière. Il est refusé avant l'aperçu, avec
 *     une phrase (« Colonnes non reconnues · … ») ; le seuil est REMESURÉ ici
 *     sur les fichiers réels du tableau du module ;
 *  2. la lecture se dit · « Fichier lu au point-virgule », à chaque import ;
 *  3. un export réimporté ramenait les liens de l'APPLICATION (route gardée de
 *     l'ancienne ad) · résolus vers l'adresse en base de l'ad d'origine, ou
 *     écartés, jamais recopiés · et jamais d'une autre origine que l'app.
 */

const TRUEFORDS = readFileSync(join(__dirname, 'fixtures/sheet-truefords.csv'), 'utf8');
const AUJOURD_HUI = new Date('2026-08-27');

function lireBrut(texte: string, sep: string): string[][] {
  const t = texte.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let k = 0; k < t.length; k++) {
    const c = t[k]!;
    if (q) { if (c === '"') { if (t[k + 1] === '"') { cur += '"'; k++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const reenregistrer = (rows: string[][], sep: string) =>
  rows.map((r) => r.map((v) => (v.includes(sep) || /["\r\n]/.test(v) ? `"${v.split('"').join('""')}"` : v)).join(sep)).join('\r\n') + '\r\n';

const LIGNE = {
  Status: 'Terminé', 'BATCH #': 4, 'Ad Concept': 'Avant; après', '📎 Désire': '+Confiance', '📎 Angle(s)': 'Preuve',
  [COL_HYPOTHESIS]: 'Prix, puis preuve', 'Date de lancement': '01/08/2026', Plateforme: 'Meta',
};
const EXPORT_29 = toCsv([LIGNE], { withComputed: true });
const EXPORT_19 = toCsv([LIGNE], {});
/** Chaque ligne entourée de guillemets en entier · un collage raté dans un tableur. */
const entreGuillemets = (t: string) => t.replace(/^﻿/, '').split('\r\n').filter(Boolean).map((l) => `"${l.split('"').join('""')}"`).join('\r\n') + '\r\n';
const TEXTES = exporterTextes([{ id: 'a', type: 'hook', langue: 'fr', texte: 'Bonjour', sources: [] }],
  { titre: 'T', marque: 'M', versionN: 1, versionId: '44444444-4444-4444-8444-444444444444', exporteLe: '2026-10-08T09:00:00.000Z', brief: { facts: [] } } as unknown as Parameters<typeof exporterTextes>[1], 'csv').contenu;
const META_FR = 'Début des rapports,Fin des rapports,Nom de la campagne,Nom de l’ensemble de publicités,Nom de la publicité,Diffusion de la publicité,Résultats,Indicateur de résultat,Couverture,Impressions,Coût par résultat,Montant dépensé (EUR)\n2026-10-01,2026-10-07,C,E,P,active,12,achats,1000,2000,3,36\n';
const TIKTOK_EN = 'Ad name,Ad group name,Campaign name,Status,Ad format,Cost,Impressions,Clicks,Conversions,CPA\nA,G,C,Active,Single video,10,1000,20,2,5\n';
const MINIMAL = 'Status,BATCH #,Ad Concept,Date de lancement\nTerminé,1,Concept A,31/02/2026\n';

/** Le tableau mesuré de `SEUIL_COLONNES_RECONNUES`, ligne à ligne · [fichier, texte, cellules, reconnues, concept, bon]. */
const MESURE: Array<[string, string, number, number, boolean, boolean]> = [
  ['export Résultats, 29 colonnes', EXPORT_29, 29, 19, true, true],
  ['export Résultats, 19 colonnes', EXPORT_19, 19, 19, true, true],
  ['modèle TrueFords', TRUEFORDS, 19, 19, true, true],
  ['modèle TrueFords réenregistré ;', reenregistrer(lireBrut(TRUEFORDS, ','), ';'), 19, 19, true, true],
  ['modèle TrueFords réenregistré tabulation', reenregistrer(lireBrut(TRUEFORDS, ','), '\t'), 19, 19, true, true],
  ['en-tête minimal', MINIMAL, 4, 4, true, true],
  ['export Résultats réenregistré à la barre verticale', reenregistrer(lireBrut(EXPORT_29, ';'), '|'), 1, 1, false, false],
  ['modèle TrueFords réenregistré à la barre verticale', reenregistrer(lireBrut(TRUEFORDS, ','), '|'), 1, 0, false, false],
  ['export Résultats, lignes entre guillemets', entreGuillemets(EXPORT_29), 1, 1, false, false],
  ['export Textes du studio', TEXTES, 4, 0, false, false],
  ['export Meta Ads (en-tête type)', META_FR, 12, 1, false, false],
  ['export TikTok Ads (en-tête type)', TIKTOK_EN, 10, 2, false, false],
];

const entete = (t: string) => { const rows = parseCsv(t); return rows[findHeaderRow(rows)] ?? []; };

describe('colonnes reconnues · le tableau mesuré du module, refait', () => {
  it.each(MESURE)('%s', (nom, texte, cellules, reconnues, concept, bon) => {
    expect(lireColonnes(entete(texte)), `la mesure de « ${nom} » ne correspond plus au tableau de SEUIL_COLONNES_RECONNUES`).toEqual({ cellules, reconnues, concept });
    const plan = buildImportPlan(texte, { today: AUJOURD_HUI });
    if (bon) {
      expect(plan.refus, `« ${nom} » est un bon fichier, il a été refusé`).toBeNull();
      expect(plan.report.colonnesReconnues).toBe(reconnues);
    } else {
      expect(plan.refus ?? '', `« ${nom} » est mal découpé ou étranger au tableau, il a été accepté`).toMatch(/^Colonnes non reconnues · /);
      expect(plan.ads, 'un fichier refusé propose encore des variantes').toEqual([]);
      expect(plan.report.rowsRead).toBe(0);
    }
  });

  it('le seuil sépare les bons des mauvais avec de la marge des deux côtés', () => {
    const bons = MESURE.filter((m) => m[5]).map((m) => m[3]);
    const mauvais = MESURE.filter((m) => !m[5]).map((m) => m[3]);
    expect(Math.max(...mauvais) * 2, 'le seuil n’est plus au double du pire mauvais fichier').toBeLessThanOrEqual(SEUIL_COLONNES_RECONNUES);
    expect(Math.min(...bons), 'un bon fichier mesuré tombe sous le seuil').toBeGreaterThanOrEqual(SEUIL_COLONNES_RECONNUES);
  });

  it('à la limite · 3 colonnes reconnues dont « Ad Concept » refusé, 4 lues', () => {
    expect(buildImportPlan('Status,Ad Concept,Plateforme\nTerminé,A,Meta\n').refus ?? '', '3 colonnes reconnues ont suffi').toMatch(/^Colonnes non reconnues · 3 colonne\(s\) du tableau retrouvée\(s\) sur 19/);
    expect(buildImportPlan('Status,Ad Concept,Plateforme,BATCH #\nTerminé,A,Meta,1\n').refus, '4 colonnes reconnues ont été refusées').toBeNull();
  });

  it('sans « Ad Concept » en colonne à part · refusé, même avec beaucoup de colonnes reconnues', () => {
    const r = buildImportPlan('Status,BATCH #,Autheur,Ad Format,Ad Type,Plateforme\nTerminé,1,W,Video,Iteration,Meta\n').refus;
    expect(r, 'un en-tête sans « Ad Concept » a été accepté').toContain('« Ad Concept » n\'y est pas');
  });

  it('une cellule qui CONTIENT « Ad Concept » sans l’être n’est pas la colonne (ligne à moitié rabattue)', () => {
    const t = 'Status,BATCH #,Autheur,Plateforme,Nom;Ad Concept\nTerminé,1,W,Meta,v1;Avant après\n';
    expect(lireColonnes(entete(t)), 'une cellule qui contient l’intitulé a été prise pour la colonne').toEqual({ cellules: 5, reconnues: 4, concept: false });
    expect(buildImportPlan(t).refus ?? '', 'le concept « v1;Avant après » a été accepté').toContain('« Ad Concept » n\'y est pas');
  });

  it('tout dans une cellule · la phrase le dit, avec le début de l’en-tête', () => {
    const r = refusColonnes(entete(entreGuillemets(EXPORT_29)));
    expect(r).toMatch(/^Colonnes non reconnues · tout l'en-tête tient dans une seule cellule \(« Status;BATCH #;Autheur;Ad Concept;📎 D[^»]*… »\) : /);
    expect(r).toContain('Réenregistre-le en CSV');
    expect(r, 'tiret cadratin à l’écran').not.toContain('—');
  });

  it('le cas ambigu d’hier (« Status;Ad Concept,Date… » lu à la virgule) · refusé, plus de concept « Prête;A »', () => {
    const plan = buildImportPlan('Status;Ad Concept,Date de lancement\nPrête;A,01/08/2026\n', { today: AUJOURD_HUI });
    expect(plan.refus, 'la ligne rabattue dans une cellule est encore acceptée').toMatch(/^Colonnes non reconnues · /);
    expect(plan.concepts).toEqual([]);
  });
});

describe('lecture du séparateur · dite à chaque aperçu', () => {
  it.each([
    ['export (point-virgule)', EXPORT_29, 'Fichier lu au point-virgule'],
    ['TrueFords (virgule)', TRUEFORDS, 'Fichier lu à la virgule'],
    ['TrueFords (tabulation)', reenregistrer(lireBrut(TRUEFORDS, ','), '\t'), 'Fichier lu à la tabulation'],
  ])('%s', (_n, texte, phrase) => {
    expect(lectureSeparateur(detecterSeparateur(texte)), 'la phrase de lecture ne nomme pas le séparateur retenu').toBe(phrase);
  });

  it('un en-tête ambigu ou sans séparateur · la phrase le précise', () => {
    expect(lectureSeparateur({ separateur: ',', raison: 'majorite' })).toBe('Fichier lu à la virgule · choisi par défaut, l\'en-tête en mélange plusieurs');
    expect(lectureSeparateur({ separateur: ',', raison: 'defaut-egalite' })).toContain('choisi par défaut');
    expect(lectureSeparateur({ separateur: ',', raison: 'defaut-aucun' })).toBe('Fichier lu à la virgule · aucun séparateur trouvé dans l\'en-tête');
    expect(lectureSeparateur({ separateur: ';', raison: 'coherence' })).toBe('Fichier lu au point-virgule');
  });
});

describe('liens de l’application · reconnus à l’origine exacte, jamais ailleurs', () => {
  const APP = 'https://app.exemple.test';
  const ID = '0b7c6f1e-1d2a-4c3b-9e8f-112233445566';

  it.each([
    [`${APP}/api/adsmap/${ID}/apercu`, { type: 'route', adId: ID, media: 'lien' }],
    [`${APP}/api/adsmap/${ID}/apercu?media=brief`, { type: 'route', adId: ID, media: 'brief' }],
    [`${APP}/api/adsmap/${ID}/apercu?media=vignette`, { type: 'route', adId: ID, media: 'vignette' }],
    [`${APP}/api/adsmap/${ID.toUpperCase()}/apercu`, { type: 'route', adId: ID, media: 'lien' }],
    [`HTTPS://APP.EXEMPLE.TEST:443/api/adsmap/${ID}/apercu`, { type: 'route', adId: ID, media: 'lien' }],
    [`/api/adsmap/${ID}/apercu?media=brief`, { type: 'route', adId: ID, media: 'brief' }],
    // Une autre origine n'est jamais l'application · la valeur reste un lien saisi.
    [`https://evil.example/api/adsmap/${ID}/apercu`, { type: 'externe' }],
    [`http://app.exemple.test/api/adsmap/${ID}/apercu`, { type: 'externe' }],
    [`https://app.exemple.test:8443/api/adsmap/${ID}/apercu`, { type: 'externe' }],
    [`https://x.app.exemple.test/api/adsmap/${ID}/apercu`, { type: 'externe' }],
    [`https://app.exemple.test.evil.example/api/adsmap/${ID}/apercu`, { type: 'externe' }],
    [`//evil.example/api/adsmap/${ID}/apercu`, { type: 'externe' }],
    [`/\\evil.example/api/adsmap/${ID}/apercu`, { type: 'externe' }],
    ['https://drive.google.com/file/d/abc/view', { type: 'externe' }],
    ['Vidéos', { type: 'externe' }],
    [`${APP}/adsmap/tests/${ID}`, { type: 'externe' }],
    // L'application, mais pas la route · rien à désigner.
    [`${APP}/api/adsmap/pas-un-uuid/apercu`, { type: 'invalide' }],
    [`${APP}/api/adsmap/${ID}/apercu?media=tout`, { type: 'invalide' }],
    [`${APP}/api/adsmap/${ID}/apercu?media=brief&x=1`, { type: 'invalide' }],
    [`${APP}/api/adsmap/${ID}/apercu#brief`, { type: 'invalide' }],
    [`https://moi@app.exemple.test/api/adsmap/${ID}/apercu`, { type: 'invalide' }],
    [`${APP}/api/adsmap/${ID}/autre`, { type: 'invalide' }],
  ])('%s', (valeur, attendu) => {
    expect(lireLienApp(valeur, APP), `« ${valeur} » mal classé`).toEqual(attendu);
  });

  it('une application servie sous un chemin · le préfixe compte', () => {
    expect(lireLienApp(`https://h.test/app/api/adsmap/${ID}/apercu`, 'https://h.test/app')).toEqual({ type: 'route', adId: ID, media: 'lien' });
    expect(lireLienApp(`https://h.test/api/adsmap/${ID}/apercu`, 'https://h.test/app').type).toBe('externe');
  });

  const SOURCES = new Map<string, AdressesAdAdsmap>([[ID, { lien: 'https://stockage.test/assets/ws/ad.png', brief: null }]]);

  it('résolu vers l’adresse en base de la source · écarté hors de portée ou sans ce média', () => {
    expect(resoudreLienApp(`${APP}/api/adsmap/${ID}/apercu`, APP, SOURCES)).toEqual({ valeur: 'https://stockage.test/assets/ws/ad.png', issue: 'resolu' });
    expect(resoudreLienApp(`${APP}/api/adsmap/${ID}/apercu?media=brief`, APP, SOURCES), 'un brief absent a été inventé').toEqual({ valeur: null, issue: 'ecarte' });
    expect(resoudreLienApp(`${APP}/api/adsmap/${ID}/apercu`, APP, new Map()), 'une ad hors de la marque a été résolue').toEqual({ valeur: null, issue: 'ecarte' });
    expect(resoudreLienApp(`https://evil.example/api/adsmap/${ID}/apercu`, APP, SOURCES), 'une autre origine a été résolue').toEqual({ valeur: `https://evil.example/api/adsmap/${ID}/apercu`, issue: 'externe' });
    expect(resoudreLienApp(`${APP}/api/adsmap/${ID}/apercu?media=tout`, APP, SOURCES)).toEqual({ valeur: null, issue: 'ecarte' });
    // La source porte elle-même un lien de l'application · jamais recopié.
    const chaine = new Map([[ID, { lien: `/api/adsmap/${ID}/apercu` }]]);
    expect(resoudreLienApp(`${APP}/api/adsmap/${ID}/apercu`, APP, chaine), 'un lien vers une autre ad a été recopié').toEqual({ valeur: null, issue: 'ecarte' });
  });

  it('le plan · liens résolus et écartés, comptés et dits dans le rapport', () => {
    const csv = toCsv([
      { ...LIGNE, "Lien de l'Ad": `${APP}/api/adsmap/${ID}/apercu`, 'Lien du Brief créa': `${APP}/api/adsmap/${ID}/apercu?media=brief` },
      { ...LIGNE, 'Ad Concept': 'Autre', "Lien de l'Ad": 'https://drive.google.com/x', 'Lien du Brief créa': '' },
    ], { withComputed: true });
    const plan = buildImportPlan(csv, { today: AUJOURD_HUI });
    expect(idsLiensApp(plan, APP)).toEqual([ID]);
    const r = resoudreLiensApp(plan, APP, SOURCES);
    expect(r.ads.map((a) => [a.assetLabel, a.briefLabel])).toEqual([['https://stockage.test/assets/ws/ad.png', null], ['https://drive.google.com/x', null]]);
    expect([r.report.liensAppResolus, r.report.liensAppEcartes]).toEqual([1, 1]);
    expect(r.report.warnings[0]).toBe('1 lien(s) de l\'application (export repris) remplacé(s) par l\'adresse du média de l\'ad d\'origine, de la même marque.');
    expect(r.report.warnings[1]).toMatch(/^1 lien\(s\) de l'application écarté\(s\) · /);
    const sans: ImportPlan = buildImportPlan(EXPORT_29, { today: AUJOURD_HUI });
    expect(resoudreLiensApp(sans, APP, SOURCES), 'un plan sans lien de l’application a changé').toBe(sans);
  });
});

/**
 * Un refus qui dit QUOI corriger · les intitulés lus (coupés, au plus
 * `INTITULES_MONTRES`), les colonnes attendues absentes (obligatoires d'abord,
 * puis l'ordre du tableau) ; sur un aperçu accepté, les colonnes absentes, dont
 * rien ne sera importé. Les deux seuils sont REMESURÉS ici sur `MESURE`.
 */
describe('guide des colonnes · ce qu’il faut corriger', () => {
  const ATTENDUES = Object.values(SHEET_HEADERS);
  const longueur = (h: string) => [...h.replace(/\s+/g, ' ').trim()].length;
  /** Le tableau de `INTITULES_MONTRES` / `LONGUEUR_INTITULE` · [fichier, intitulés lus, plus long, puis le suivant]. */
  const MESURE_GUIDE: Array<[string, number, number, number | null]> = [
    ['export Résultats, 29 colonnes', 29, 117, 18],
    ['export Résultats, 19 colonnes', 19, 117, 18],
    ['modèle TrueFords', 19, 117, 18],
    ['modèle TrueFords réenregistré ;', 19, 117, 18],
    ['modèle TrueFords réenregistré tabulation', 19, 117, 18],
    ['en-tête minimal', 4, 17, 10],
    ['export Résultats réenregistré à la barre verticale', 1, 439, null],
    ['modèle TrueFords réenregistré à la barre verticale', 1, 74, null],
    ['export Résultats, lignes entre guillemets', 1, 439, null],
    ['export Textes du studio', 4, 7, 6],
    ['export Meta Ads (en-tête type)', 12, 31, 25],
    ['export TikTok Ads (en-tête type)', 10, 13, 13],
  ];

  it.each(MESURE_GUIDE)('%s · la mesure du module, refaite', (nom, lus, plusLong, suivant) => {
    const texte = MESURE.find((m) => m[0] === nom)![1];
    const h = enteteDuFichier(texte).filter((x) => x.trim()).map(longueur).sort((a, b) => b - a);
    expect([h.length, h[0], h[1] ?? null], `la mesure de « ${nom} » ne correspond plus au tableau de INTITULES_MONTRES`).toEqual([lus, plusLong, suivant]);
  });

  it('les seuils tiennent la mesure · tout refus réel montré en entier, aucun vrai intitulé coupé', () => {
    const refuses = MESURE.filter((m) => !m[5]);
    for (const [nom, texte] of refuses) {
      const g = guideColonnes(enteteDuFichier(texte));
      expect(g.lusMasques, `« ${nom} », refusé, n’est pas montré en entier`).toBe(0);
    }
    // Un intitulé réel · hors cellule qui porte une ligne entière (en-tête d'une seule cellule) et hors phrase d'hypothèse.
    const reels = MESURE.flatMap(([, texte]) => {
      const h = enteteDuFichier(texte).filter((x) => x.trim());
      return h.length > 1 ? h.filter((x) => !x.startsWith('Que testez-vous')) : [];
    });
    expect(Math.max(...reels.map(longueur)), 'un intitulé réel dépasse LONGUEUR_INTITULE · il serait coupé').toBeLessThanOrEqual(LONGUEUR_INTITULE);
    expect(Math.max(...refuses.map(([, t]) => enteteDuFichier(t).filter((x) => x.trim()).length)), 'INTITULES_MONTRES n’a plus de marge sur le plus large refus mesuré').toBeLessThan(INTITULES_MONTRES);
  });

  it('refus Meta · les 12 intitulés lus, dans l’ordre, puis « Ad Concept » obligatoire, puis le reste dans l’ordre du tableau', () => {
    const g = guideColonnes(enteteDuFichier(META_FR));
    expect(g.lus, 'les intitulés montrés ne sont pas ceux lus, dans l’ordre').toEqual(META_FR.split('\n')[0]!.split(','));
    expect(g.lusMasques).toBe(0);
    expect(g.obligatoiresAbsentes, 'la colonne obligatoire absente n’est pas dite').toEqual(['Ad Concept']);
    // « Résultats » est lue (strict) · elle n'est pas absente.
    expect(g.optionnellesAbsentes, 'les colonnes absentes ne suivent pas l’ordre du tableau').toEqual(ATTENDUES.filter((a) => a !== 'Ad Concept' && a !== 'Résultats'));
  });

  it('refus TikTok · « Status » et « Ad format » lues, elles ne sont pas dites absentes', () => {
    const g = guideColonnes(enteteDuFichier(TIKTOK_EN));
    expect(g.obligatoiresAbsentes).toEqual(['Ad Concept']);
    expect(g.optionnellesAbsentes).not.toContain('Status');
    expect(g.optionnellesAbsentes).not.toContain('Ad Format');
    expect(g.optionnellesAbsentes).toHaveLength(16);
  });

  it('tout dans une cellule · l’intitulé unique est coupé proprement, avec « … »', () => {
    const g = guideColonnes(enteteDuFichier(entreGuillemets(EXPORT_29)));
    expect(g.lus).toHaveLength(1);
    expect(g.lus[0], 'la ligne entière n’est pas coupée à LONGUEUR_INTITULE').toBe(`${[...'Status;BATCH #;Autheur;Ad Concept;📎 Désire;📎 Angle(s);Motif d\'Iteration'].slice(0, LONGUEUR_INTITULE).join('')}…`);
    expect(g.obligatoiresAbsentes).toEqual(['Ad Concept']);
  });

  it('un en-tête refusé plus large que INTITULES_MONTRES · coupé au nombre, le reste compté', () => {
    const large = Array.from({ length: 29 }, (_, i) => `Colonne ${i + 1}`);
    const g = guideColonnes(large);
    expect(g.lus, 'plus de INTITULES_MONTRES intitulés montrés').toEqual(large.slice(0, INTITULES_MONTRES));
    expect(g.lusMasques, 'les intitulés non montrés ne sont pas comptés').toBe(29 - INTITULES_MONTRES);
    expect(g.obligatoiresAbsentes).toEqual(COLONNES_OBLIGATOIRES.map((k) => SHEET_HEADERS[k]));
    expect(g.optionnellesAbsentes).toHaveLength(ATTENDUES.length - 1);
  });

  it('un intitulé saisi est rendu tel quel · formule, signe, arobase, balise, apostrophe', () => {
    const csv = '"=HYPERLINK(""https://x.test"",""clic"")",+cmd,-2+3,@SOMME(A1),<b>gras</b>,\'=1+1\n1,2,3,4,5,6\n';
    const g = guideColonnes(enteteDuFichier(csv));
    expect(refusColonnes(enteteDuFichier(csv))).not.toBeNull();
    // L'apostrophe de neutralisation d'un export est retirée par la lecture (`retirerNeutralisation`) · la valeur saisie revient.
    expect(g.lus, 'un intitulé a été réinterprété ou réécrit').toEqual(['=HYPERLINK("https://x.test","clic")', '+cmd', '-2+3', '@SOMME(A1)', '<b>gras</b>', '=1+1']);
  });

  it('accepté · les colonnes absentes, dans l’ordre du tableau, dites sans bloquer', () => {
    const plan = buildImportPlan(MINIMAL, { today: AUJOURD_HUI });
    expect(plan.refus).toBeNull();
    const g = guideColonnes(enteteDuFichier(MINIMAL));
    expect(g.obligatoiresAbsentes).toEqual([]);
    expect(g.optionnellesAbsentes, 'les colonnes absentes d’un en-tête minimal ne sont pas toutes dites, dans l’ordre').toEqual(ATTENDUES.filter((a) => !['Status', 'BATCH #', 'Ad Concept', 'Date de lancement'].includes(a)));
    const m = mentionColonnesAbsentes(g);
    expect(m, 'la mention des colonnes absentes manque').toBe(`15 colonnes du tableau absentes du fichier · rien n'en sera importé : ${g.optionnellesAbsentes.map((a) => `« ${a} »`).join(', ')}.`);
    expect(m).not.toContain('—');
  });

  it('accepté · une colonne trouvée par la lecture tolérante sera importée, elle n’est pas dite absente', () => {
    const t = 'Status,BATCH #,Ad Concept,Date de lancement,Ma Plateforme\nTerminé,1,A,01/08/2026,TikTok\n';
    expect(buildImportPlan(t, { today: AUJOURD_HUI }).ads[0]!.platform, 'la colonne tolérante n’est pas lue · le test ne prouve rien').toBe('tiktok');
    expect(guideColonnes(enteteDuFichier(t)).optionnellesAbsentes, '« Ma Plateforme » est importée, elle est dite absente').not.toContain('Plateforme');
  });

  it('accepté complet · aucune mention', () => {
    for (const t of [EXPORT_29, EXPORT_19, TRUEFORDS]) expect(mentionColonnesAbsentes(guideColonnes(enteteDuFichier(t)))).toBeNull();
  });

  it('le modèle d’import · l’en-tête exact de l’export, lu en entier, sans ligne', () => {
    const m = modeleImport();
    expect(parseCsv(m), 'le modèle n’est pas l’en-tête des 19 colonnes du Sheet').toEqual([[...parseCsv(EXPORT_19)[0]!]]);
    expect(lireColonnes(enteteDuFichier(m)), 'le modèle n’est pas lu en entier par l’import').toEqual({ cellules: 19, reconnues: 19, concept: true });
    expect(guideColonnes(enteteDuFichier(m)).optionnellesAbsentes).toEqual([]);
    const rempli = `${m}Terminé;1;W;Concept A;;;;;;;;;;;;;;01/08/2026;Meta\r\n`;
    expect(buildImportPlan(rempli, { today: AUJOURD_HUI }).report.rowsRead, 'le modèle rempli d’une ligne ne s’importe pas').toBe(1);
  });
});
