/**
 * Studios · sous-titres d'une vidéo posés « sur les mots vraiment dits » ·
 * mots horodatés de la transcription → cartons → fichier ASS (libass).
 *
 * Pur. Le texte vient de la TRANSCRIPTION des prises (ce qui a été prononcé,
 * à l'instant où ce l'a été), jamais de la narration écrite : une prise qui a
 * sauté un mot n'affiche pas ce mot. La brûlure dans la vidéo est une passe
 * ffmpeg séparée (`packages/integrations/src/sous-titres-video.ts`).
 *
 * ── Cartons ──────────────────────────────────────────────────────────────────
 *
 *  · 2 à 4 mots par carton (format court, lu d'un coup d'œil) ; un mot seul
 *    n'apparaît que s'il est isolé entre deux pauses ;
 *  · coupure à chaque PAUSE (`PAUSE_COUPURE_MS`) et à chaque ponctuation forte
 *    (. ! ? …), puis aux virgules quand chaque côté garde 2 mots ;
 *  · un groupe de n mots est réparti en ⌈n/4⌉ cartons de tailles voisines
 *    (5 mots ⇒ 3 + 2, jamais 4 + 1) ;
 *  · un carton apparaît au début de son premier mot, reste au moins
 *    `DUREE_CARTON_MIN_MS`, jamais au-delà du carton suivant ni de la vidéo.
 *
 * ── Mise en page ─────────────────────────────────────────────────────────────
 *
 *  · Liberation Sans Bold (le fichier `sans-700.ttf` du dépôt, `fontsdir` à la
 *    brûlure ; famille « Liberation Sans », graisse grasse), blanc, contour
 *    noir proportionnel à la taille pour rester lisible sur n'importe quelle
 *    image ;
 *  · centré, posé AU-DESSUS des 20 % bas de l'image (zone sûre 9:16 : la
 *    légende, les boutons et la barre de l'application occupent le bas) ;
 *  · au plus 2 lignes, coupées ici d'après les métriques MESURÉES de la police
 *    (`POLICES_EMBARQUEES['Sans Bold']`), retour à la ligne automatique de
 *    libass coupé (`WrapStyle: 2`) : ce qui est calculé est ce qui est dessiné.
 *    Un carton qui ne tient pas en 2 lignes est redécoupé.
 *
 * ── Typographie française ────────────────────────────────────────────────────
 *
 * Apostrophe typographique (’), espace fine insécable avant ; : ! ? et dans
 * les guillemets, accents gardés tels quels (fichier UTF-8). Un caractère que
 * la police ne dessine pas est retiré et SIGNALÉ (`caracteresRetires`), jamais
 * remplacé en silence par une case vide. Les accolades et barres obliques
 * inverses (commandes ASS) ne passent jamais.
 *
 * Seuils de mise en page : POLITIQUE de lisibilité, pas des mesures. La pause
 * de 250 ms est le seuil classique de pause silencieuse de la littérature sur
 * la parole (Goldman-Eisler) ; la taille et la marge sont des proportions de
 * l'image. La zone (au-dessus des 20 % bas) et la présence réelle du texte
 * sont, elles, VÉRIFIÉES sur l'image brûlée (test d'intégration).
 */

import { POLICES_EMBARQUEES, metriqueCaractere } from '../rendu/polices';

export const MOTS_PAR_CARTON_MIN = 2;
export const MOTS_PAR_CARTON_MAX = 4;
/** Écart entre deux mots qui fait une pause (seuil de pause silencieuse, voir l'en-tête). */
export const PAUSE_COUPURE_MS = 250;
export const DUREE_CARTON_MIN_MS = 500;
/** Part basse de l'image laissée libre (zone sûre 9:16). */
export const PART_BASSE_LIBRE = 0.2;
/** Écart au-dessus de la zone libre · en part de la hauteur. */
export const ECART_ZONE_LIBRE = 0.02;
/** Taille du texte (hauteur de ligne libass) en part de la hauteur de l'image. */
export const TAILLE_TEXTE = 0.045;
/** Contour en part de la taille du texte. */
export const CONTOUR_TEXTE = 0.1;
/** Marges gauche et droite en part de la largeur. */
export const MARGE_COTE = 0.08;
export const LIGNES_CARTON_MAX = 2;
export const FAMILLE_SOUS_TITRES = 'Liberation Sans';
export const FICHIER_POLICE_SOUS_TITRES = POLICES_EMBARQUEES['Sans Bold']!.fichier;
/** Borne · une publicité courte (90 s) parlée compte quelques centaines de mots. */
export const MOTS_SOUS_TITRES_MAX = 2_000;

export interface MotHorodate { texte: string; debutMs: number; finMs: number }

export interface CartonSousTitre {
  debutMs: number;
  finMs: number;
  /** Mots du carton, tels que dits. */
  mots: string[];
  /** Lignes affichées (typographie française appliquée). */
  lignes: string[];
}

/* ─────────────────────────── Mots du montage ────────────────────────────── */

/**
 * Les mots de chaque prise, recalés sur le MONTAGE · un plan commence à la
 * somme des durées qui le précèdent ; un mot dit après la fin du plan (le clip
 * est coupé à la durée du plan) n'apparaît pas, un mot à cheval est borné.
 */
export function motsDuMontage(
  segments: ReadonlyArray<{ shotId: string; dureeMs: number }>,
  prises: Readonly<Record<string, ReadonlyArray<MotHorodate> | undefined>>,
): MotHorodate[] {
  const out: MotHorodate[] = [];
  let t = 0;
  for (const s of segments) {
    for (const m of prises[s.shotId] ?? []) {
      if (!Number.isFinite(m.debutMs) || !Number.isFinite(m.finMs) || m.debutMs < 0 || m.debutMs >= s.dureeMs) continue;
      out.push({ texte: m.texte, debutMs: t + m.debutMs, finMs: t + Math.min(s.dureeMs, Math.max(m.debutMs, m.finMs)) });
    }
    t += s.dureeMs;
  }
  return out;
}

/* ─────────────────────────── Typographie ────────────────────────────────── */

const METRIQUES = POLICES_EMBARQUEES['Sans Bold']!;
const FINE = ' ';

/** Le texte d'une ligne, en typographie française · caractères non dessinables retirés et rendus. */
export function typographieFrancaise(texte: string): { texte: string; retires: string[] } {
  let t = texte.normalize('NFC')
    .replace(/[{}\\]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/'/g, '’')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/([^\s  ;:!?])[   ]*([;:!?]+)/g, `$1${FINE}$2`)
    .replace(/«[   ]*/g, `«${FINE}`)
    .replace(/[   ]*»/g, `${FINE}»`)
    .replace(/^ /, '');
  const retires: string[] = [];
  let sortie = '';
  for (const c of t) {
    const cp = c.codePointAt(0)!;
    if (metriqueCaractere(METRIQUES, cp)) sortie += c;
    else if (!retires.includes(c)) retires.push(c);
  }
  return { texte: sortie.replace(/ {2,}/g, ' ').trim(), retires };
}

/* ─────────────────────────── Mise en page ───────────────────────────────── */

export interface MiseEnPageSousTitres {
  largeur: number;
  hauteur: number;
  /** Hauteur de ligne libass (`Fontsize`), en pixels. */
  taille: number;
  contour: number;
  margeCote: number;
  /** Distance du bas de l'image au bas du texte. */
  margeBas: number;
  /** Largeur utile d'une ligne. */
  largeurUtile: number;
  /** Bande verticale où le texte peut se trouver · [haut, bas[ en pixels depuis le haut. */
  zone: { haut: number; bas: number };
}

export function miseEnPageSousTitres(largeur: number, hauteur: number): MiseEnPageSousTitres {
  const taille = Math.max(12, Math.round(hauteur * TAILLE_TEXTE));
  const contour = Math.max(1, Math.round(taille * CONTOUR_TEXTE));
  const margeCote = Math.round(largeur * MARGE_COTE);
  const margeBas = Math.ceil(hauteur * PART_BASSE_LIBRE) + Math.round(hauteur * ECART_ZONE_LIBRE);
  const bas = hauteur - margeBas + contour;
  const haut = Math.max(0, hauteur - margeBas - LIGNES_CARTON_MAX * taille - contour);
  return { largeur, hauteur, taille, contour, margeCote, margeBas, largeurUtile: largeur - 2 * margeCote - 2 * contour, zone: { haut, bas } };
}

/** Largeur d'un texte en pixels à la hauteur de ligne libass `taille` (métriques mesurées, sans crénage). */
export function largeurTextePx(texte: string, taille: number): number {
  // libass met (ascendant + descendant) à la taille demandée.
  const echelle = taille / (METRIQUES.ascendant + METRIQUES.descendant);
  let u = 0;
  for (const c of texte) {
    const g = metriqueCaractere(METRIQUES, c.codePointAt(0)!) ?? METRIQUES.notdef;
    u += g[0];
  }
  return u * echelle;
}

/** Les lignes d'un carton (au plus 2, coupe la plus équilibrée qui tient) · `null` s'il ne tient pas. */
function lignesDuCarton(mots: readonly string[], page: MiseEnPageSousTitres): string[] | null {
  const une = typographieFrancaise(mots.join(' ')).texte;
  if (largeurTextePx(une, page.taille) <= page.largeurUtile) return [une];
  let meilleure: string[] | null = null;
  let ecart = Infinity;
  for (let k = 1; k < mots.length; k++) {
    const a = typographieFrancaise(mots.slice(0, k).join(' ')).texte;
    const b = typographieFrancaise(mots.slice(k).join(' ')).texte;
    const la = largeurTextePx(a, page.taille);
    const lb = largeurTextePx(b, page.taille);
    if (la > page.largeurUtile || lb > page.largeurUtile) continue;
    if (Math.abs(la - lb) < ecart) { ecart = Math.abs(la - lb); meilleure = [a, b]; }
  }
  return meilleure;
}

/* ─────────────────────────── Découpage ──────────────────────────────────── */

const FORTE = /[.!?…]["»”)]*$/;
const FAIBLE = /[,;:]["»”)]*$/;

/** Répartit n mots en ⌈n/4⌉ groupes de tailles voisines. */
function repartir<T>(xs: readonly T[]): T[][] {
  if (xs.length === 0) return [];
  const k = Math.ceil(xs.length / MOTS_PAR_CARTON_MAX);
  const out: T[][] = [];
  let i = 0;
  for (let g = 0; g < k; g++) {
    const n = Math.floor(xs.length / k) + (g < xs.length % k ? 1 : 0);
    out.push(xs.slice(i, i + n));
    i += n;
  }
  return out;
}

/** Coupe aux virgules quand chaque morceau garde au moins 2 mots. */
function couperAuxVirgules(groupe: MotHorodate[]): MotHorodate[][] {
  const out: MotHorodate[][] = [];
  let courant: MotHorodate[] = [];
  groupe.forEach((m, i) => {
    courant.push(m);
    const reste = groupe.length - i - 1;
    if (FAIBLE.test(m.texte) && courant.length >= MOTS_PAR_CARTON_MIN && reste >= MOTS_PAR_CARTON_MIN) { out.push(courant); courant = []; }
  });
  if (courant.length) out.push(courant);
  return out;
}

export interface ResultatSousTitres {
  cartons: CartonSousTitre[];
  /** Caractères que la police ne dessine pas, retirés du texte affiché. */
  caracteresRetires: string[];
  page: MiseEnPageSousTitres;
}

/**
 * Les cartons d'une vidéo · mots horodatés DU MONTAGE (ms depuis le début),
 * dans l'ordre. Mots vides, hors vidéo ou mal horodatés ignorés.
 */
export function cartonsSousTitres(motsBruts: ReadonlyArray<MotHorodate>, e: { largeur: number; hauteur: number; dureeMs: number }): ResultatSousTitres {
  const page = miseEnPageSousTitres(e.largeur, e.hauteur);
  const retires = new Set<string>();
  const mots = motsBruts
    .filter((m) => typeof m.texte === 'string' && m.texte.trim() && Number.isFinite(m.debutMs) && Number.isFinite(m.finMs) && m.debutMs >= 0 && m.debutMs < e.dureeMs)
    .map((m) => ({ texte: m.texte.trim(), debutMs: Math.round(m.debutMs), finMs: Math.round(Math.min(e.dureeMs, Math.max(m.debutMs, m.finMs))) }))
    .sort((a, b) => a.debutMs - b.debutMs)
    .slice(0, MOTS_SOUS_TITRES_MAX);
  for (const m of mots) for (const c of typographieFrancaise(m.texte).retires) retires.add(c);
  // Les mots réduits à rien (caractères non dessinables seulement) ne sont pas affichés.
  const visibles = mots.filter((m) => typographieFrancaise(m.texte).texte.length > 0);

  // 1 · groupes coupés aux pauses et à la ponctuation forte.
  const groupes: MotHorodate[][] = [];
  let g: MotHorodate[] = [];
  visibles.forEach((m, i) => {
    const prec = visibles[i - 1];
    if (prec && g.length && (m.debutMs - prec.finMs >= PAUSE_COUPURE_MS || FORTE.test(prec.texte))) { groupes.push(g); g = []; }
    g.push(m);
  });
  if (g.length) groupes.push(g);

  // 2 · virgules, puis 2 à 4 mots par carton, puis ce qui tient en 2 lignes.
  const morceaux: MotHorodate[][] = [];
  const caser = (ms: MotHorodate[]) => {
    if (ms.length === 1 || lignesDuCarton(ms.map((m) => m.texte), page)) { morceaux.push(ms); return; }
    const k = Math.ceil(ms.length / 2);
    caser(ms.slice(0, k));
    caser(ms.slice(k));
  };
  for (const gr of groupes) for (const v of couperAuxVirgules(gr)) for (const c of repartir(v)) caser(c);

  // 3 · temps · début du premier mot, durée minimale, jamais au-delà du suivant ni de la vidéo.
  const cartons: CartonSousTitre[] = morceaux.map((ms, i) => {
    const debutMs = ms[0]!.debutMs;
    const suivant = morceaux[i + 1]?.[0]?.debutMs ?? e.dureeMs;
    const finMs = Math.min(suivant, e.dureeMs, Math.max(ms[ms.length - 1]!.finMs, debutMs + DUREE_CARTON_MIN_MS));
    const textes = ms.map((m) => m.texte);
    // Un mot seul trop large pour la ligne reste affiché (libass le dessine débordant), jamais perdu.
    return { debutMs, finMs: Math.max(finMs, debutMs + 10), mots: textes, lignes: lignesDuCarton(textes, page) ?? [typographieFrancaise(textes.join(' ')).texte] };
  });
  return { cartons, caracteresRetires: [...retires], page };
}

/* ─────────────────────────── Fichier ASS ────────────────────────────────── */

/** `h:mm:ss.cc` · centisecondes, début arrondi vers le bas, fin vers le haut (jamais une fin avant son début). */
export function tempsAss(ms: number, sens: 'debut' | 'fin'): string {
  const cs = sens === 'debut' ? Math.floor(ms / 10) : Math.ceil(ms / 10);
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

/** Le fichier ASS des cartons · UTF-8, une ligne `Dialogue` par carton. */
export function fichierAss(r: ResultatSousTitres): string {
  const p = r.page;
  const lignes = [
    '[Script Info]',
    '; Studios · sous-titres posés sur les mots dits (transcription mot à mot)',
    'ScriptType: v4.00+',
    `PlayResX: ${p.largeur}`,
    `PlayResY: ${p.hauteur}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: None',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: SousTitres,${FAMILLE_SOUS_TITRES},${p.taille},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${p.contour},0,2,${p.margeCote},${p.margeCote},${p.margeBas},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  r.cartons.forEach((c, i) => {
    const suivant = r.cartons[i + 1];
    const fin = suivant ? Math.min(c.finMs, suivant.debutMs) : c.finMs;
    let debut = tempsAss(c.debutMs, 'debut');
    let finTxt = tempsAss(fin, suivant && fin === suivant.debutMs ? 'debut' : 'fin');
    if (finTxt <= debut) { debut = tempsAss(c.debutMs, 'debut'); finTxt = tempsAss(c.debutMs + 10, 'fin'); }
    lignes.push(`Dialogue: 0,${debut},${finTxt},SousTitres,,0,0,0,,${c.lignes.join('\\N')}`);
  });
  return `${lignes.join('\n')}\n`;
}

/** Raccourci · mots horodatés du montage → fichier ASS et ses cartons. */
export function sousTitresAss(mots: ReadonlyArray<MotHorodate>, e: { largeur: number; hauteur: number; dureeMs: number }): ResultatSousTitres & { ass: string } {
  const r = cartonsSousTitres(mots, e);
  return { ...r, ass: fichierAss(r) };
}

/** Écart minimal entre deux cartons pour y contrôler une image SANS texte (deux images à 30 i/s, plus une marge). */
export const TROU_CONTROLE_MIN_MS = 200;

/**
 * Les instants où la vidéo brûlée est RELUE · le milieu du premier, du
 * carton du milieu et du dernier carton (texte attendu) ; le milieu des deux
 * plus longs moments sans carton, s'ils durent au moins `TROU_CONTROLE_MIN_MS`
 * (aucun texte attendu).
 */
export function instantsDeControle(cartons: ReadonlyArray<Pick<CartonSousTitre, 'debutMs' | 'finMs'>>, dureeMs: number): { avecTexteMs: number[]; sansTexteMs: number[] } {
  if (cartons.length === 0) return { avecTexteMs: [], sansTexteMs: [] };
  const choisis = [...new Set([0, Math.floor((cartons.length - 1) / 2), cartons.length - 1])].map((i) => cartons[i]!);
  const avecTexteMs = choisis.map((c) => Math.round((c.debutMs + c.finMs) / 2));
  const trous: Array<{ debut: number; fin: number }> = [];
  let t = 0;
  for (const c of cartons) {
    if (c.debutMs - t >= TROU_CONTROLE_MIN_MS) trous.push({ debut: t, fin: c.debutMs });
    t = Math.max(t, c.finMs);
  }
  if (dureeMs - t >= TROU_CONTROLE_MIN_MS) trous.push({ debut: t, fin: dureeMs });
  const sansTexteMs = trous.sort((a, b) => (b.fin - b.debut) - (a.fin - a.debut)).slice(0, 2).map((x) => Math.round((x.debut + x.fin) / 2)).sort((a, b) => a - b);
  return { avecTexteMs, sansTexteMs };
}
