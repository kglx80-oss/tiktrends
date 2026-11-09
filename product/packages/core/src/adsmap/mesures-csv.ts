/**
 * ADSMAP · import des MESURES d'un export Ads Manager (CSV), rattachées aux ads
 * des lots.
 *
 * L'import historique (`import-sheet.ts`) reprend le TABLEAU de l'équipe · des
 * concepts, des statuts, des verdicts saisis à la main, aucun chiffre. Sans
 * chiffre, le moteur ne rend aucun verdict et un lot ne se conclut jamais
 * (`conclusionLot` se tait). Ce module lit l'export que Meta Ads Manager
 * télécharge (« Exporter le tableau » · CSV), le rattache aux ads de la marque,
 * et dit, ligne par ligne, ce qui sera écrit et pourquoi le reste ne l'est pas.
 *
 * Pur · ni base, ni réseau, ni horloge. L'appelant fournit le texte, les ads
 * candidates (DÉJÀ bornées à la marque active) et les journées existantes.
 *
 * ── D'où viennent les intitulés reconnus ─────────────────────────────────────
 *
 * AUCUN export réel n'a pu être lu pour écrire ce module (la session n'a pas
 * accès à un compte Ads Manager, et les pages d'aide Meta ne publient pas
 * l'en-tête exact). Le jeu d'intitulés est construit à partir de la
 * documentation publique des colonnes d'Ads Manager (noms des mesures dans
 * l'interface française et anglaise, « Personnaliser les colonnes ») et de
 * l'en-tête type déjà présent dans les tests du dépôt
 * (`adsmap-import-colonnes.test.ts`, `META_FR`). Il est volontairement
 * tolérant sur la forme (accents, apostrophe droite ou courbe, casse, devise
 * entre parenthèses « (EUR) ») et STRICT sur le fond (égalité de l'intitulé
 * normalisé, jamais « contient » · « Coût par résultat » ne se lit jamais comme
 * « Résultats »). Un intitulé non prévu est dit à l'écran, comme lu, avec ce
 * qui manque · à compléter ici dès qu'un vrai export est relu.
 *
 * ── Rattacher une ligne à une ad, jamais au hasard ───────────────────────────
 *
 * Mêmes principes que la synchro (`adsmap-sync.ts`, `matchByName`) :
 *  1. l'IDENTIFIANT Meta épinglé sur l'ad l'emporte toujours ;
 *  2. sinon le NOM régie (`generated_name`) identique, une fois normalisé ;
 *  3. sinon un rapprochement APPROCHÉ (nom contenu, mêmes jetons, lot et
 *     variante) n'est qu'une PROPOSITION · rien n'est écrit sans que quelqu'un
 *     la confirme à l'écran ;
 *  4. deux candidats au même rang ⇒ AMBIGUË, rien n'est écrit ;
 *  5. les candidates sont les ads de LA marque · une ad d'une autre marque ne
 *     peut pas être rattachée, même si son nom correspond, puisqu'elle n'est
 *     jamais proposée.
 *
 * ── Priorité entre la connexion Meta et un export CSV ────────────────────────
 *
 * Pour une même ad et un même jour, la journée remontée par la CONNEXION Meta
 * l'emporte (`PRIORITE_MESURES`) · elle lit Meta directement et suit les
 * conversions réattribuées après coup, un export est une photo figée au moment
 * du téléchargement. Une ligne CSV ne compte que pour les jours que la connexion
 * n'a pas. Entre deux lignes CSV qui se chevauchent, la plus FINE l'emporte (la
 * journée sur la période) · jamais deux fois le même jour. Réimporter le même
 * fichier réécrit les mêmes lignes (clé ad · début · fin) · rien ne double.
 */

import { detecterSeparateur, parseCsv, type SeparateurDetecte } from './import-sheet';

/* -------------------------------------------------------------------------- */
/*  Intitulés reconnus                                                        */
/* -------------------------------------------------------------------------- */

export type ColonneMesure =
  | 'adId' | 'nom' | 'jour' | 'debut' | 'fin'
  | 'depense' | 'impressions' | 'couverture' | 'clicsLien' | 'clics'
  | 'achats' | 'valeurAchats' | 'resultats' | 'indicateurResultat'
  | 'vues3s' | 'thruplays' | 'videoP50' | 'ajoutsPanier' | 'vuesDestination'
  | 'campagne' | 'campagneId' | 'ensemble' | 'ensembleId' | 'budgetEnsemble' | 'typeBudgetEnsemble';

/**
 * Les intitulés d'Ads Manager, en français et en anglais, dans l'ordre de
 * préférence · pour une même mesure, le premier intitulé trouvé l'emporte
 * (« Achats » avant « Achats sur le site web »).
 */
export const COLONNES_META: Record<ColonneMesure, { fr: readonly string[]; en: readonly string[] }> = {
  adId: { fr: ['Identifiant de la publicité', 'ID de la publicité'], en: ['Ad ID'] },
  nom: { fr: ['Nom de la publicité'], en: ['Ad name'] },
  jour: { fr: ['Jour'], en: ['Day'] },
  debut: { fr: ['Début des rapports', 'Date de début du rapport'], en: ['Reporting starts'] },
  fin: { fr: ['Fin des rapports', 'Date de fin du rapport'], en: ['Reporting ends'] },
  depense: { fr: ['Montant dépensé'], en: ['Amount spent'] },
  impressions: { fr: ['Impressions'], en: ['Impressions'] },
  couverture: { fr: ['Couverture'], en: ['Reach'] },
  clicsLien: { fr: ['Clics sur un lien', 'Clics sur le lien'], en: ['Link clicks'] },
  clics: { fr: ['Clics (tous)'], en: ['Clicks (all)'] },
  achats: { fr: ['Achats', 'Achats sur le site web'], en: ['Purchases', 'Website purchases'] },
  valeurAchats: {
    fr: ['Valeur de conversion des achats', 'Valeur de conversion des achats sur le site web'],
    en: ['Purchases conversion value', 'Website purchases conversion value'],
  },
  resultats: { fr: ['Résultats'], en: ['Results'] },
  indicateurResultat: { fr: ['Indicateur de résultats', 'Indicateur de résultat', 'Type de résultat'], en: ['Result indicator', 'Result type'] },
  vues3s: { fr: ['Lectures de vidéo de 3 secondes', 'Lectures de la vidéo pendant au moins 3 secondes'], en: ['3-second video plays'] },
  thruplays: { fr: ['ThruPlays', 'ThruPlay'], en: ['ThruPlays', 'ThruPlay'] },
  videoP50: { fr: ['Lectures de la vidéo à 50 %', 'Lectures de vidéo à 50 %'], en: ['Video plays at 50%'] },
  ajoutsPanier: { fr: ['Ajouts au panier'], en: ['Adds to cart'] },
  vuesDestination: { fr: ['Vues de page de destination', 'Vues de la page de destination'], en: ['Landing page views'] },
  campagne: { fr: ['Nom de la campagne'], en: ['Campaign name'] },
  campagneId: { fr: ['Identifiant de la campagne', 'ID de la campagne'], en: ['Campaign ID'] },
  ensemble: { fr: ['Nom de l’ensemble de publicités'], en: ['Ad set name'] },
  ensembleId: { fr: ['Identifiant de l’ensemble de publicités', 'ID de l’ensemble de publicités'], en: ['Ad set ID'] },
  budgetEnsemble: { fr: ['Budget de l’ensemble de publicités'], en: ['Ad set budget'] },
  typeBudgetEnsemble: { fr: ['Type de budget de l’ensemble de publicités'], en: ['Ad set budget type'] },
};

/** Un intitulé ramené à sa forme comparable · sans accent, apostrophe droite, minuscules, espaces réduits. */
export function normIntitule(h: string): string {
  return h
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[  ]/g, ' ')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** « Montant dépensé (EUR) » → « montant depense » · la devise entre parenthèses ne nomme pas la colonne. */
const sansDevise = (n: string) => n.replace(/\s*\([a-z]{3}\)$/, '');

export type LangueExport = 'fr' | 'en';

export interface LectureEnteteMesures {
  /** Index de chaque colonne reconnue (absente = clé absente). */
  colonnes: Partial<Record<ColonneMesure, number>>;
  /** La langue de l'en-tête · décide comment lire « 1,234 » et « 01/02/2026 ». `null` si rien ne la dit. */
  langue: LangueExport | null;
  /** Intitulés obligatoires absents, à écrire tels quels (dans la langue lue, français par défaut). */
  manquantes: string[];
}

/** Les mesures sans lesquelles une ligne ne dit rien. */
const OBLIGATOIRES: ReadonlyArray<ColonneMesure> = ['depense', 'impressions'];

export function lireEnteteMesures(header: readonly string[]): LectureEnteteMesures {
  const n = header.map((h) => normIntitule(h ?? ''));
  const colonnes: Partial<Record<ColonneMesure, number>> = {};
  let fr = 0, en = 0;
  for (const cle of Object.keys(COLONNES_META) as ColonneMesure[]) {
    const { fr: f, en: e } = COLONNES_META[cle];
    // Ordre de préférence · les intitulés français puis anglais, chacun dans son ordre.
    const essais: Array<[string, LangueExport]> = [...f.map((x) => [x, 'fr'] as [string, LangueExport]), ...e.map((x) => [x, 'en'] as [string, LangueExport])];
    for (const [intitule, langue] of essais) {
      const cible = normIntitule(intitule);
      const i = n.findIndex((c) => c === cible || sansDevise(c) === cible);
      if (i < 0) continue;
      colonnes[cle] = i;
      // Un intitulé identique dans les deux langues (« Impressions ») ne dit pas la langue.
      const neutre = f.map(normIntitule).includes(cible) && e.map(normIntitule).includes(cible);
      if (!neutre) { if (langue === 'fr') fr++; else en++; }
      break;
    }
  }
  const langue: LangueExport | null = fr > en ? 'fr' : en > fr ? 'en' : null;
  const dire = (c: ColonneMesure) => COLONNES_META[c][langue ?? 'fr'][0]!;
  const manquantes: string[] = [];
  if (colonnes.adId === undefined && colonnes.nom === undefined) manquantes.push(dire('nom'));
  if (colonnes.jour === undefined && (colonnes.debut === undefined || colonnes.fin === undefined)) {
    if (colonnes.debut === undefined) manquantes.push(dire('debut'));
    if (colonnes.fin === undefined) manquantes.push(dire('fin'));
  }
  for (const c of OBLIGATOIRES) if (colonnes[c] === undefined) manquantes.push(dire(c));
  return { colonnes, langue, manquantes };
}

/** La ligne d'en-tête · la première (sur 20) qui nomme l'annonce ET la dépense. */
export function ligneEnteteMesures(rows: readonly string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const c = lireEnteteMesures(rows[i]!).colonnes;
    if ((c.nom !== undefined || c.adId !== undefined) && c.depense !== undefined) return i;
  }
  return 0;
}

/* -------------------------------------------------------------------------- */
/*  Valeurs                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Un nombre d'export · « 36,12 », « 36.12 », « 1 234,5 », « 1,234.5 », « 12 € ».
 * Les deux séparateurs présents · le DERNIER est la virgule décimale. Un seul
 * « , » suivi de trois chiffres est un séparateur de milliers en anglais, une
 * décimale en français · c'est la langue de l'en-tête qui tranche.
 */
export function nombreExport(v: string | undefined, langue: LangueExport | null): number | null {
  let s = (v ?? '').replace(/[\s  ]/g, '').replace(/[€$£]|EUR|USD|GBP|CHF/gi, '');
  if (!s || /^[-–—]$/.test(s)) return null;
  const virgule = s.lastIndexOf(','), point = s.lastIndexOf('.');
  if (virgule >= 0 && point >= 0) {
    s = virgule > point ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (virgule >= 0) {
    const parts = s.split(',');
    const milliers = parts.length > 2 || (langue === 'en' && parts.length === 2 && parts[1]!.length === 3);
    s = milliers ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (point >= 0 && s.split('.').length > 2) {
    s = s.replace(/\./g, '');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Une date d'export · « 2026-10-01 » (ce qu'écrit Ads Manager), ou « 01/10/2026 » lu selon la langue de l'en-tête. */
export function dateExport(v: string | undefined, langue: LangueExport | null): string | null {
  const s = (v ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const valide = (y: number, m: number, d: number) => {
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null;
  };
  if (iso) return valide(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const barre = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!barre) return null;
  const a = Number(barre[1]), b = Number(barre[2]), y = Number(barre[3]);
  // Sans langue, « 03/04/2026 » ne se lit pas · seule une date sans ambiguïté passe.
  if (langue === 'en') return valide(y, a, b);
  if (langue === 'fr') return valide(y, b, a);
  if (a > 12) return valide(y, b, a);
  if (b > 12) return valide(y, a, b);
  return null;
}

/**
 * Un identifiant d'annonce Meta · des chiffres seulement. Un tableur qui l'a
 * réécrit en notation scientifique (« 1,20212E+17 ») l'a perdu · on ne le
 * devine pas.
 */
export function identifiantMeta(v: string | undefined): { id: string | null; abime: boolean } {
  const s = (v ?? '').trim().replace(/^id:/i, '');
  if (!s) return { id: null, abime: false };
  if (/^\d{5,25}$/.test(s)) return { id: s, abime: false };
  return { id: null, abime: true };
}

/* -------------------------------------------------------------------------- */
/*  Lignes                                                                    */
/* -------------------------------------------------------------------------- */

/** Les mesures d'une ligne · les champs vidéo et panier restent absents quand le fichier ne les porte pas. */
export interface MesuresLigne {
  spend: number;
  impressions: number;
  reach?: number;
  linkClicks: number;
  clicks?: number;
  purchases: number;
  purchaseValue?: number;
  video3s?: number;
  thruplays?: number;
  videoP50?: number;
  addToCart?: number;
  landingViews?: number;
}

/** Ce que la ligne dit du protocole · lu pour le contrôle du lot, comme la synchro le lit chez Meta. */
export interface ProtocoleLigne {
  campagne: string | null;
  campagneId: string | null;
  ensemble: string | null;
  ensembleId: string | null;
  /** Budget QUOTIDIEN de l'ensemble · `null` quand il est à vie, absent ou piloté par la campagne. */
  budgetJour: number | null;
  /** Budget piloté au niveau de la campagne (CBO) · « Utilisation du budget de la campagne ». */
  cbo: boolean;
}

export interface LigneMesure {
  /** Numéro de ligne dans le fichier (1 = première ligne) · dit à l'écran. */
  ligne: number;
  /** La clé de l'annonce dans le fichier · son identifiant s'il y est, sinon son nom normalisé. */
  annonce: string;
  adIdMeta: string | null;
  nom: string | null;
  debut: string;
  fin: string;
  mesures: MesuresLigne;
  protocole: ProtocoleLigne;
}

export type MotifLigneEcartee = 'sans_annonce' | 'date' | 'mesures' | 'periode_inversee';
export const LIBELLE_LIGNE_ECARTEE: Record<MotifLigneEcartee, string> = {
  sans_annonce: 'ni nom ni identifiant d’annonce (ligne de total ou vide)',
  date: 'date illisible',
  mesures: 'dépense ou impressions illisibles',
  periode_inversee: 'la fin de la période précède son début',
};

export interface LectureMesures {
  /** Refus de l'en-tête, en une phrase · rien n'est lu au-delà. */
  refus: string | null;
  separateur: SeparateurDetecte;
  langue: LangueExport | null;
  /** Intitulés non vides de l'en-tête, tels que lus. */
  intitules: string[];
  /** Les mesures reconnues, sous leur intitulé lu. */
  reconnues: string[];
  /** Les colonnes obligatoires absentes (refus). */
  manquantes: string[];
  lignes: LigneMesure[];
  ecartees: Array<{ ligne: number; motif: MotifLigneEcartee }>;
  /** Lignes d'une même annonce et d'une même période, additionnées (export ventilé par placement, âge…). */
  regroupees: number;
  /** Lignes recopiées à l'identique, comptées une fois. */
  doublons: number;
  /** Identifiants d'annonce réécrits par le tableur (notation scientifique) · la ligne se rattache alors par son nom. */
  identifiantsAbimes: number;
  /** Aucune colonne d'achats · le moteur ne pourra rien conclure sur le CPA. */
  sansAchats: boolean;
}

/** La forme comparable d'un nom d'annonce · sans accent ni ponctuation de nommage. */
export function normNom(s: string): string {
  return jetons(s).join(' ');
}

/** Jetons significatifs d'un nom · mêmes jetons que le rattachement de la synchro (`matchByName`), accents retirés d'abord. */
export function jetons(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

const PURCHASE = /purchase|achat/i;

function lireProtocole(cell: (c: ColonneMesure) => string | undefined, langue: LangueExport | null): ProtocoleLigne {
  const texte = (c: ColonneMesure) => cell(c)?.trim() || null;
  const budgetBrut = cell('budgetEnsemble') ?? '';
  const type = normIntitule(cell('typeBudgetEnsemble') ?? '');
  const montant = nombreExport(budgetBrut, langue);
  // « Using campaign budget » · « Utilisation du budget de la campagne » · le budget vit à la campagne.
  const cbo = /campaign|campagne/i.test(budgetBrut) && montant === null;
  const aVie = /lifetime|a vie|total/.test(type);
  return {
    campagne: texte('campagne'), campagneId: identifiantMeta(cell('campagneId')).id,
    ensemble: texte('ensemble'), ensembleId: identifiantMeta(cell('ensembleId')).id,
    budgetJour: !cbo && !aVie && montant !== null && montant > 0 ? montant : null,
    cbo,
  };
}

/**
 * Lit un export Ads Manager · en-tête reconnu, lignes lues, lignes écartées avec
 * leur raison. Même lecture du fichier que l'import du tableau (`parseCsv` ·
 * séparateur détecté, BOM retiré, neutralisation des formules retirée).
 */
export function lireMesuresMeta(csvText: string): LectureMesures {
  const separateur = detecterSeparateur(csvText);
  const rows = parseCsv(csvText, separateur.separateur);
  const iEntete = ligneEnteteMesures(rows);
  const header = rows[iEntete] ?? [];
  const e = lireEnteteMesures(header);
  const intitules = header.filter((h) => h.trim());
  const reconnues = (Object.values(e.colonnes) as number[]).sort((a, b) => a - b).map((i) => header[i]!.trim());
  const base: LectureMesures = {
    refus: null, separateur, langue: e.langue, intitules, reconnues, manquantes: e.manquantes,
    lignes: [], ecartees: [], regroupees: 0, doublons: 0, identifiantsAbimes: 0, sansAchats: false,
  };
  if (e.manquantes.length) {
    return { ...base, refus: `Export Meta non reconnu · colonne${e.manquantes.length > 1 ? 's' : ''} absente${e.manquantes.length > 1 ? 's' : ''} : ${e.manquantes.map((m) => `« ${m} »`).join(', ')}. Exporte le tableau des publicités depuis Ads Manager (niveau « Publicités »), avec le nom de la publicité, la période, le montant dépensé et les impressions.` };
  }
  const c = e.colonnes;
  const sansAchats = c.achats === undefined && !(c.resultats !== undefined && c.indicateurResultat !== undefined);

  const parCle = new Map<string, { l: LigneMesure; bruts: Set<string> }>();
  const ordre: string[] = [];
  const out = { ...base, sansAchats };
  for (let i = iEntete + 1; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.every((x) => !x.trim())) continue;
    const cell = (k: ColonneMesure) => (c[k] === undefined ? undefined : r[c[k]!]);
    const num = (k: ColonneMesure) => (c[k] === undefined ? undefined : nombreExport(r[c[k]!], e.langue) ?? undefined);
    const numero = i + 1;

    const id = identifiantMeta(cell('adId'));
    if (id.abime) out.identifiantsAbimes++;
    const nom = cell('nom')?.trim() || null;
    if (!id.id && !nom) { out.ecartees.push({ ligne: numero, motif: 'sans_annonce' }); continue; }

    const debut = dateExport(cell('jour') ?? cell('debut'), e.langue);
    const fin = c.jour !== undefined ? debut : dateExport(cell('fin'), e.langue);
    if (!debut || !fin) { out.ecartees.push({ ligne: numero, motif: 'date' }); continue; }
    if (fin < debut) { out.ecartees.push({ ligne: numero, motif: 'periode_inversee' }); continue; }

    const spend = num('depense'), impressions = num('impressions');
    if (spend === undefined || impressions === undefined) { out.ecartees.push({ ligne: numero, motif: 'mesures' }); continue; }

    let purchases = num('achats');
    if (purchases === undefined && c.resultats !== undefined && PURCHASE.test(cell('indicateurResultat') ?? '')) purchases = num('resultats');
    const mesures: MesuresLigne = {
      spend, impressions: Math.round(impressions), linkClicks: Math.round(num('clicsLien') ?? 0), purchases: Math.round(purchases ?? 0),
    };
    const opt = (k: ColonneMesure, champ: keyof MesuresLigne, entier = true) => {
      const v = num(k);
      if (v !== undefined) (mesures as unknown as Record<string, number>)[champ] = entier ? Math.round(v) : v;
    };
    opt('couverture', 'reach'); opt('clics', 'clicks'); opt('valeurAchats', 'purchaseValue', false);
    opt('vues3s', 'video3s'); opt('thruplays', 'thruplays'); opt('videoP50', 'videoP50');
    opt('ajoutsPanier', 'addToCart'); opt('vuesDestination', 'landingViews');

    const annonce = id.id ? `id:${id.id}` : `nom:${normNom(nom!)}`;
    const l: LigneMesure = { ligne: numero, annonce, adIdMeta: id.id, nom, debut, fin, mesures, protocole: lireProtocole(cell, e.langue) };
    const cle = `${annonce}|${debut}|${fin}`;
    const brut = r.join('\u0001');
    const deja = parCle.get(cle);
    if (!deja) { parCle.set(cle, { l, bruts: new Set([brut]) }); ordre.push(cle); continue; }
    if (deja.bruts.has(brut)) { out.doublons++; continue; }
    // Même annonce, même période, autre ligne · un export ventilé (placement, âge…) · les mesures s'additionnent.
    deja.bruts.add(brut);
    out.regroupees++;
    deja.l.mesures = additionner(deja.l.mesures, mesures);
  }
  out.lignes = ordre.map((k) => parCle.get(k)!.l);
  return out;
}

/** Deux mesures d'une même annonce sur une même période · tout s'additionne, sauf la couverture (des personnes, pas des événements) · la plus haute. */
export function additionner(a: MesuresLigne, b: MesuresLigne): MesuresLigne {
  const out: MesuresLigne = { ...a };
  for (const k of Object.keys(b) as Array<keyof MesuresLigne>) {
    const va = a[k], vb = b[k];
    if (vb === undefined) continue;
    (out as unknown as Record<string, number>)[k] = k === 'reach' ? Math.max(va ?? 0, vb) : (va ?? 0) + vb;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Rattachement                                                              */
/* -------------------------------------------------------------------------- */

/** Une ad de la marque qui peut recevoir des mesures · bornée à la marque par l'appelant. */
export interface CandidatMesure {
  id: string;
  /** L'identifiant Meta épinglé (`external_ids_json.ad_id`). */
  idMeta: string | null;
  /** Le nom régie attendu (`generated_name`). */
  nomRegie: string | null;
  lot: number | null;
  variante: string;
}

export interface AnnonceFichier { cle: string; adIdMeta: string | null; nom: string | null; lignes: number[] }

export function annoncesDuFichier(lignes: readonly LigneMesure[]): AnnonceFichier[] {
  const m = new Map<string, AnnonceFichier>();
  for (const l of lignes) {
    const a = m.get(l.annonce) ?? { cle: l.annonce, adIdMeta: l.adIdMeta, nom: l.nom, lignes: [] };
    if (!a.nom && l.nom) a.nom = l.nom;
    a.lignes.push(l.ligne);
    m.set(l.annonce, a);
  }
  return [...m.values()];
}

export type ParRattachement = 'identifiant' | 'nom';
export type ParApproche = 'nom_contenu' | 'jetons' | 'lot_variante';

export type Rattachement =
  | { etat: 'rattachee'; adId: string; par: ParRattachement }
  | { etat: 'a_confirmer'; adId: string; par: ParApproche; raison: string }
  | { etat: 'ambigue'; candidats: string[]; raison: string }
  | { etat: 'non_rattachee'; raison: string };

/**
 * Jetons sous lesquels un nom régie ne se rapproche JAMAIS de façon approchée ·
 * mesuré (`packages/core/test/adsmap-mesures-csv.test.ts` refait la mesure et
 * tombe si le seuil bouge).
 *
 * Banc · les 12 concepts réels du tableau Truefords (fixture `sheet-truefords`),
 * 12 lots de 4 variantes (48 ads candidates), nommés par `buildUniqueNames`
 * sous quatre motifs. Chaque nom est altéré comme Ads Manager et les équipes
 * l'altèrent (tel quel, « - Copie », suffixe de date, préfixe « TEST_ »,
 * préfixe collé, mots permutés, dernier mot retiré · 7 altérations). Positifs ·
 * les noms des 48 candidates (336 lignes). Négatifs · des annonces ABSENTES de
 * la carte · les mêmes lots nommés pour une autre marque, et les lots 13 à 24
 * (96 annonces, 672 lignes). Rapprochements APPROCHÉS (propositions) :
 *
 *   motif (jetons du nom)                         seuil   positifs justes / faux   négatifs proposés (tous faux)
 *   {brand}_B{batch}_{concept}_{variant}_{variable} (9)   1 à 4         192 / 0                  0
 *   {brand}_B{batch}_{variant} (3)                    1 à 3         192 / 0                  0
 *   {brand}_B{batch}_{variant} (3)                    4               0 / 0                  0
 *   B{batch}_{variant} (2)                            1 ou 2        192 / 0                192
 *   B{batch}_{variant} (2)                            3               0 / 0                  0
 *   {variant} (1)                                     tout            0 / 0                  0   (toujours ambigu)
 *
 * Un nom de deux mots ne porte pas la marque · ses propositions sont aussi
 * souvent fausses que justes (192 / 192). Le seuil se pose à 3 · la plus
 * petite valeur sans AUCUNE proposition fausse mesurée, et la plus grande qui
 * garde les 192 propositions justes d'un nom de trois mots (à 4, elles
 * disparaissent toutes). Le rapprochement reste une PROPOSITION à confirmer ·
 * le seuil n'autorise aucune écriture, il évite de proposer du bruit.
 *
 * Mesuré aussi · sous le motif à deux mots, 48 annonces de l'autre marque
 * portent EXACTEMENT le nom d'une candidate · un motif sans la marque fait se
 * confondre deux marques d'un même compte, seul l'identifiant épinglé les
 * sépare. L'écran le dit quand l'export n'a pas la colonne d'identifiant.
 */
export const MIN_JETONS_APPROCHE = 3;

/**
 * Rattache chaque annonce du fichier à une ad de la marque · voir l'en-tête du
 * module. Ne tranche jamais une ambiguïté.
 */
export function rattacherAnnonces(annonces: readonly AnnonceFichier[], candidats: readonly CandidatMesure[], opts: { minJetons?: number } = {}): Map<string, Rattachement> {
  const minJetons = opts.minJetons ?? MIN_JETONS_APPROCHE;
  const parIdMeta = new Map<string, CandidatMesure[]>();
  for (const c of candidats) if (c.idMeta) parIdMeta.set(c.idMeta, [...(parIdMeta.get(c.idMeta) ?? []), c]);
  const nommees = candidats.filter((c) => c.nomRegie && normNom(c.nomRegie));
  const decrire = (c: CandidatMesure) => `${c.lot !== null ? `Lot #${c.lot} · ` : ''}${c.variante}`;

  const brut = new Map<string, Rattachement>();
  for (const a of annonces) {
    // 1 · L'identifiant épinglé.
    if (a.adIdMeta) {
      const p = parIdMeta.get(a.adIdMeta) ?? [];
      if (p.length === 1) { brut.set(a.cle, { etat: 'rattachee', adId: p[0]!.id, par: 'identifiant' }); continue; }
      if (p.length > 1) { brut.set(a.cle, { etat: 'ambigue', candidats: p.map((x) => x.id), raison: `l’identifiant ${a.adIdMeta} est épinglé sur ${p.length} ads (${p.map(decrire).join(', ')}) · à corriger avant d’importer` }); continue; }
    }
    if (!a.nom || !normNom(a.nom)) {
      brut.set(a.cle, { etat: 'non_rattachee', raison: 'aucune ad de la marque ne porte cet identifiant, et la ligne n’a pas de nom' });
      continue;
    }
    // 2 · Le nom régie identique.
    const cible = normNom(a.nom);
    const exacts = nommees.filter((c) => normNom(c.nomRegie!) === cible);
    if (exacts.length === 1) {
      const c = exacts[0]!;
      if (a.adIdMeta && c.idMeta && c.idMeta !== a.adIdMeta) {
        brut.set(a.cle, { etat: 'non_rattachee', raison: `l’ad ${decrire(c)} porte ce nom mais elle est épinglée à une autre annonce Meta (${c.idMeta})` });
      } else brut.set(a.cle, { etat: 'rattachee', adId: c.id, par: 'nom' });
      continue;
    }
    if (exacts.length > 1) {
      brut.set(a.cle, { etat: 'ambigue', candidats: exacts.map((x) => x.id), raison: `${exacts.length} ads de la marque portent ce nom (${exacts.map(decrire).join(', ')})` });
      continue;
    }
    // 3 · Rapprochements approchés · des PROPOSITIONS, du plus sûr au plus large.
    const libres = nommees.filter((c) => !(a.adIdMeta && c.idMeta && c.idMeta !== a.adIdMeta) && jetons(c.nomRegie!).length >= minJetons);
    const mots = new Set(jetons(a.nom));
    const paliers: Array<[ParApproche, CandidatMesure[], string]> = [
      // Contenu MOT À MOT · « testb1 v1 » ne contient pas « b1 v1 ».
      ['nom_contenu', libres.filter((c) => ` ${cible} `.includes(` ${normNom(c.nomRegie!)} `)), 'le nom de l’annonce contient le nom régie'],
      ['jetons', libres.filter((c) => jetons(c.nomRegie!).every((t) => mots.has(t))), 'le nom de l’annonce porte tous les mots du nom régie'],
      // Lot et variante · seulement pour une ad SANS nom régie, comme la synchro (`matchByBatchVariant`) ·
      // une ad nommée se reconnaît à son nom, « B3 » et « v2 » se retrouvent dans les annonces de tout un compte.
      ['lot_variante', candidats.filter((c) => !c.nomRegie && c.lot !== null && !(a.adIdMeta && c.idMeta && c.idMeta !== a.adIdMeta) && mots.has(`b${c.lot}`) && normNom(c.variante) !== '' && mots.has(normNom(c.variante))), 'le nom de l’annonce porte le lot et la variante'],
    ];
    let fait = false;
    for (const [par, hits, phrase] of paliers) {
      if (hits.length === 1) {
        const c = hits[0]!;
        brut.set(a.cle, { etat: 'a_confirmer', adId: c.id, par, raison: `${phrase} de ${decrire(c)}${c.nomRegie ? ` (« ${c.nomRegie} »)` : ''} · à confirmer` });
        fait = true; break;
      }
      if (hits.length > 1) {
        brut.set(a.cle, { etat: 'ambigue', candidats: hits.map((x) => x.id), raison: `${hits.length} ads s’en rapprochent autant (${hits.slice(0, 4).map(decrire).join(', ')}${hits.length > 4 ? '…' : ''})` });
        fait = true; break;
      }
    }
    if (!fait) brut.set(a.cle, { etat: 'non_rattachee', raison: 'aucune ad de la marque ne porte ce nom ni cet identifiant' });
  }

  // 4 · Deux annonces du fichier sur la même ad · un rattachement sûr garde l'ad, les autres s'arrêtent.
  const parAd = new Map<string, string[]>();
  for (const [cle, r] of brut) if (r.etat === 'rattachee' || r.etat === 'a_confirmer') parAd.set(r.adId, [...(parAd.get(r.adId) ?? []), cle]);
  const nomDe = new Map(annonces.map((a) => [a.cle, a.nom ?? a.adIdMeta ?? a.cle]));
  for (const [adId, cles] of parAd) {
    if (cles.length < 2) continue;
    const surs = cles.filter((k) => brut.get(k)!.etat === 'rattachee');
    if (surs.length === 1) {
      for (const k of cles) if (k !== surs[0]) brut.set(k, { etat: 'ambigue', candidats: [adId], raison: `l’ad visée reçoit déjà l’annonce « ${nomDe.get(surs[0]!)} » du fichier` });
    } else {
      for (const k of cles) brut.set(k, { etat: 'ambigue', candidats: [adId], raison: `${cles.length} annonces du fichier visent la même ad · ajoute la colonne « Identifiant de la publicité » à l’export` });
    }
  }
  return brut;
}

/* -------------------------------------------------------------------------- */
/*  Priorité · connexion Meta, puis CSV · jamais deux fois le même jour       */
/* -------------------------------------------------------------------------- */

/** La source qui l'emporte pour une même ad et un même jour · voir l'en-tête du module. */
export const PRIORITE_MESURES = 'meta' as const;

export const PHRASE_PRIORITE_MESURES =
  'Pour une même ad et un même jour, la connexion Meta l’emporte sur le fichier · elle suit les achats réattribués après coup, un export est une photo figée. Le fichier compte pour les jours que la connexion n’a pas.';

export interface EntreeMesure { debut: string; fin: string; mesures: MesuresLigne }

export type MotifMesureEcartee = 'meta' | 'chevauchement';

const longueur = (e: { debut: string; fin: string }) => (Date.parse(`${e.fin}T00:00:00Z`) - Date.parse(`${e.debut}T00:00:00Z`)) / 86_400_000 + 1;
const chevauche = (a: { debut: string; fin: string }, b: { debut: string; fin: string }) => a.debut <= b.fin && b.debut <= a.fin;

/**
 * Les entrées CSV d'une ad qui COMPTENT, à côté de ses journées Meta.
 *
 *  · une entrée qui couvre un jour déjà mesuré par la connexion est écartée
 *    (`meta`) · une période ne se découpe pas, elle s'écarte entière ;
 *  · entre entrées CSV qui se chevauchent, la plus courte l'emporte (la journée
 *    sur la semaine), puis la plus ancienne · les autres sont écartées
 *    (`chevauchement`).
 *
 * Aucun jour n'est jamais compté deux fois.
 */
export function retenirMesures<E extends { debut: string; fin: string }>(joursMeta: ReadonlySet<string>, entrees: readonly E[]): { retenues: E[]; ecartees: Array<{ entree: E; motif: MotifMesureEcartee }> } {
  const ecartees: Array<{ entree: E; motif: MotifMesureEcartee }> = [];
  const restantes: E[] = [];
  const meta = [...joursMeta];
  for (const e of entrees) {
    if (meta.some((j) => j >= e.debut && j <= e.fin)) ecartees.push({ entree: e, motif: 'meta' });
    else restantes.push(e);
  }
  const triees = [...restantes].sort((a, b) => longueur(a) - longueur(b) || (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0));
  const retenues: E[] = [];
  for (const e of triees) {
    if (retenues.some((r) => chevauche(r, e))) ecartees.push({ entree: e, motif: 'chevauchement' });
    else retenues.push(e);
  }
  retenues.sort((a, b) => (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0));
  return { retenues, ecartees };
}

/** Deux mesures identiques · ce qui fait d'un réimport un non-événement. */
export function memesMesures(a: MesuresLigne, b: MesuresLigne): boolean {
  const cles = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof MesuresLigne>;
  for (const k of cles) {
    const x = a[k] ?? null, y = b[k] ?? null;
    if (x === null || y === null) { if (x !== y) return false; continue; }
    if (Math.abs(x - y) > 1e-9) return false;
  }
  return true;
}

/** La clé d'écriture d'une entrée · réimporter le même fichier réécrit la même ligne (idempotence). */
export const cleEntreeMesure = (adId: string, e: { debut: string; fin: string }) => `${adId}|${e.debut}|${e.fin}`;

/* -------------------------------------------------------------------------- */
/*  Plan d'import · ce qui sera écrit, et pourquoi le reste ne l'est pas      */
/* -------------------------------------------------------------------------- */

export interface BilanEcriture {
  /** Entrées absentes en base · seront ajoutées. */
  nouvelles: number;
  /** Entrées déjà en base À L'IDENTIQUE · rien ne change (réimport). */
  identiques: number;
  /** Entrées déjà en base, mesures différentes · remplacées par celles du fichier (export plus récent). */
  misesAJour: number;
  /** Entrées qui touchent un jour déjà mesuré par la connexion · gardées, mais la connexion l'emporte. */
  meta: number;
}

export interface AnnoncePlan {
  cle: string;
  nom: string | null;
  adIdMeta: string | null;
  lignes: number[];
  debut: string;
  fin: string;
  rattachement: Rattachement;
  /** Une proposition approchée confirmée à l'écran. */
  confirmee: boolean;
  /** Ses mesures seront écrites. */
  ecrite: boolean;
  bilan: BilanEcriture | null;
}

export interface EntreeAEcrire extends EntreeMesure { adId: string; source: LigneMesure }

export interface TotauxPlan {
  annonces: number;
  rattachees: number;
  aConfirmer: number;
  confirmees: number;
  ambigues: number;
  nonRattachees: number;
  /** Ads distinctes qui recevront des mesures. */
  ads: number;
  nouvelles: number;
  identiques: number;
  misesAJour: number;
  meta: number;
}

export interface PlanMesures {
  annonces: AnnoncePlan[];
  aEcrire: EntreeAEcrire[];
  /** Identifiants Meta à épingler sur les ads qui n'en ont pas · la synchro ne devinera plus. */
  epingles: Array<{ adId: string; idMeta: string }>;
  totaux: TotauxPlan;
  /** Au moins une entrée couvre plusieurs jours · l'écran conseille l'export « par jour ». */
  periodes: boolean;
}

/** Le bilan d'écriture des entrées d'une ad, contre ce qui est déjà en base et ce que la connexion a mesuré. */
export function bilanEcriture(adId: string, entrees: readonly EntreeMesure[], existantes: ReadonlyMap<string, MesuresLigne>, joursMeta: ReadonlySet<string>): BilanEcriture {
  const b: BilanEcriture = { nouvelles: 0, identiques: 0, misesAJour: 0, meta: 0 };
  const meta = [...joursMeta];
  for (const e of entrees) {
    const deja = existantes.get(cleEntreeMesure(adId, e));
    if (!deja) b.nouvelles++;
    else if (memesMesures(deja, e.mesures)) b.identiques++;
    else b.misesAJour++;
    if (meta.some((j) => j >= e.debut && j <= e.fin)) b.meta++;
  }
  return b;
}

/**
 * Le plan d'un import de mesures · pur, rejoué tel quel à l'écriture (le
 * serveur ne fait jamais confiance à l'aperçu affiché).
 *
 * `existantes` · les entrées CSV déjà en base pour ces ads (clé `cleEntreeMesure`) ;
 * `joursMeta` · par ad, les jours déjà mesurés par la connexion ;
 * `confirmees` · les annonces dont la proposition approchée a été confirmée à l'écran.
 */
export function planImportMesures(
  lecture: LectureMesures,
  candidats: readonly CandidatMesure[],
  ctx: { existantes: ReadonlyMap<string, MesuresLigne>; joursMeta: ReadonlyMap<string, ReadonlySet<string>>; confirmees: ReadonlySet<string> },
): PlanMesures {
  const annonces = annoncesDuFichier(lecture.lignes);
  const r = rattacherAnnonces(annonces, candidats);
  const parCle = new Map<string, LigneMesure[]>();
  for (const l of lecture.lignes) parCle.set(l.annonce, [...(parCle.get(l.annonce) ?? []), l]);
  const candidat = new Map(candidats.map((c) => [c.id, c]));

  const out: AnnoncePlan[] = [];
  const aEcrire: EntreeAEcrire[] = [];
  const epingles: PlanMesures['epingles'] = [];
  const t: TotauxPlan = { annonces: annonces.length, rattachees: 0, aConfirmer: 0, confirmees: 0, ambigues: 0, nonRattachees: 0, ads: 0, nouvelles: 0, identiques: 0, misesAJour: 0, meta: 0 };
  const adsEcrites = new Set<string>();
  for (const a of annonces) {
    const ra = r.get(a.cle)!;
    const ls = parCle.get(a.cle) ?? [];
    const debut = ls.map((l) => l.debut).sort()[0]!;
    const fin = ls.map((l) => l.fin).sort().pop()!;
    const confirmee = ra.etat === 'a_confirmer' && ctx.confirmees.has(a.cle);
    const ecrite = ra.etat === 'rattachee' || confirmee;
    if (ra.etat === 'rattachee') t.rattachees++;
    else if (ra.etat === 'a_confirmer') { t.aConfirmer++; if (confirmee) t.confirmees++; }
    else if (ra.etat === 'ambigue') t.ambigues++;
    else t.nonRattachees++;
    let bilan: BilanEcriture | null = null;
    if (ecrite && (ra.etat === 'rattachee' || ra.etat === 'a_confirmer')) {
      const adId = ra.adId;
      const entrees = ls.map((l) => ({ debut: l.debut, fin: l.fin, mesures: l.mesures, adId, source: l }));
      bilan = bilanEcriture(adId, entrees, ctx.existantes, ctx.joursMeta.get(adId) ?? new Set());
      aEcrire.push(...entrees);
      adsEcrites.add(adId);
      t.nouvelles += bilan.nouvelles; t.identiques += bilan.identiques; t.misesAJour += bilan.misesAJour; t.meta += bilan.meta;
      const c = candidat.get(adId);
      if (a.adIdMeta && c && !c.idMeta && !epingles.some((e) => e.adId === adId)) epingles.push({ adId, idMeta: a.adIdMeta });
    }
    out.push({ cle: a.cle, nom: a.nom, adIdMeta: a.adIdMeta, lignes: a.lignes, debut, fin, rattachement: ra, confirmee, ecrite, bilan });
  }
  t.ads = adsEcrites.size;
  return { annonces: out, aEcrire, epingles, totaux: t, periodes: lecture.lignes.some((l) => l.debut !== l.fin) };
}

/** Le libellé court d'un rattachement, pour la colonne « État » de l'aperçu. */
export const LIBELLE_RATTACHEMENT: Record<Rattachement['etat'], string> = {
  rattachee: 'Rattachée', a_confirmer: 'À confirmer', ambigue: 'Ambiguë · non écrite', non_rattachee: 'Non rattachée',
};

/** Comment une ligne a été rattachée, en mots. */
export const LIBELLE_PAR: Record<ParRattachement | ParApproche, string> = {
  identifiant: 'par l’identifiant Meta épinglé', nom: 'par le nom régie',
  nom_contenu: 'nom régie contenu dans le nom', jetons: 'mêmes mots que le nom régie', lot_variante: 'lot et variante dans le nom',
};
