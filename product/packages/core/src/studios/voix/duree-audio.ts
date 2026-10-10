/**
 * Studios · L6-B · durée RÉELLE d'une prise de voix, lue dans les octets
 * (cahier 01 §4.5 : « Afficher la durée réelle, recalculer les temps » ;
 * recette VIDEO-06 « durée réelle mesurée »).
 *
 * Pur · analyse des en-têtes, aucun décodeur, aucune dépendance. Une durée
 * n'est jamais déclarée par un modèle ni par le client : elle se lit dans le
 * fichier, ou elle n'existe pas.
 *
 *  · WAV (RIFF/WAVE) · bloc `fmt ` (format, canaux, fréquence, octets par
 *    seconde, alignement, bits) puis bloc `data` : durée = trames entières du
 *    bloc `data` / fréquence. Un bloc `data` annoncé plus long que le fichier
 *    est mesuré sur ce qui est PRÉSENT, et signalé tronqué.
 *  · MP3 (MPEG 1, 2, 2.5 · couches I, II, III) · étiquette ID3v2 sautée ;
 *    si la première trame porte un en-tête Xing/Info (ou VBRI) avec le nombre
 *    de trames, durée = trames × échantillons par trame / fréquence ; sinon
 *    chaque trame est parcourue en suivant sa longueur (en-tête par en-tête)
 *    jusqu'à la fin ou à une étiquette de fin (ID3v1 `TAG`, `APETAGEX`).
 *    Débit libre, fréquence qui change en cours de fichier, ou moins de deux
 *    trames enchaînées : refus, pas d'estimation.
 *
 * Les durées sont rendues en millisecondes ENTIÈRES (arrondi au plus proche),
 * avec le nombre d'échantillons et la fréquence, pour qu'un appelant puisse
 * recalculer exactement en ticks de timeline.
 */

export type FormatAudio = 'wav' | 'mp3';

export interface DureeAudio {
  ok: true;
  format: FormatAudio;
  dureeMs: number;
  echantillons: number;
  frequence: number;
  canaux: number;
  /** Comment la durée a été obtenue · lisible à l'écran. */
  methode: 'wav_data' | 'mp3_xing' | 'mp3_vbri' | 'mp3_trames';
  /** WAV seulement · le bloc `data` annonçait plus que le fichier ne contient. */
  tronque: boolean;
  /** MP3 seulement · trames lues ou annoncées. */
  trames: number | null;
}
export interface RefusDuree { ok: false; motif: string }
export type ResultatDuree = DureeAudio | RefusDuree;

const refus = (motif: string): RefusDuree => ({ ok: false, motif });
const ascii = (o: Uint8Array, i: number, n: number) => (i + n <= o.length ? String.fromCharCode(...o.subarray(i, i + n)) : '');
const u16le = (o: Uint8Array, i: number) => o[i]! | (o[i + 1]! << 8);
const u32le = (o: Uint8Array, i: number) => (o[i]! | (o[i + 1]! << 8) | (o[i + 2]! << 16)) + o[i + 3]! * 0x1000000;
const u32be = (o: Uint8Array, i: number) => o[i]! * 0x1000000 + ((o[i + 1]! << 16) | (o[i + 2]! << 8) | o[i + 3]!);
const ms = (echantillons: number, frequence: number) => Math.round((echantillons * 1000) / frequence);

/** Le format, relu dans les octets (jamais l'extension ni le type annoncé). */
export function formatAudio(o: Uint8Array): FormatAudio | null {
  if (ascii(o, 0, 4) === 'RIFF' && ascii(o, 8, 4) === 'WAVE') return 'wav';
  if (ascii(o, 0, 3) === 'ID3') return 'mp3';
  if (o.length >= 4 && enteteMp3(o, 0)) return 'mp3';
  return null;
}

export function mesurerDureeAudio(o: Uint8Array): ResultatDuree {
  const f = formatAudio(o);
  if (f === 'wav') return dureeWav(o);
  if (f === 'mp3') return dureeMp3(o);
  return refus('format non reconnu · seuls WAV et MP3 sont mesurés');
}

/* ─────────────────────────────── WAV ──────────────────────────────────────── */

export function dureeWav(o: Uint8Array): ResultatDuree {
  if (o.length < 12 || ascii(o, 0, 4) !== 'RIFF' || ascii(o, 8, 4) !== 'WAVE') return refus('en-tête RIFF/WAVE absent');
  let i = 12;
  let fmt: { format: number; canaux: number; frequence: number; octetsSeconde: number; alignement: number; bits: number } | null = null;
  while (i + 8 <= o.length) {
    const id = ascii(o, i, 4);
    const taille = u32le(o, i + 4);
    const debut = i + 8;
    if (id === 'fmt ') {
      if (taille < 16 || debut + 16 > o.length) return refus('bloc fmt tronqué');
      fmt = { format: u16le(o, debut), canaux: u16le(o, debut + 2), frequence: u32le(o, debut + 4), octetsSeconde: u32le(o, debut + 8), alignement: u16le(o, debut + 12), bits: u16le(o, debut + 14) };
    } else if (id === 'data') {
      if (!fmt) return refus('bloc data avant le bloc fmt');
      if (![1, 3, 0xfffe].includes(fmt.format)) return refus(`codage WAV ${fmt.format} non mesuré (PCM ou flottant seulement)`);
      if (fmt.canaux < 1 || fmt.canaux > 16) return refus('nombre de canaux invalide');
      if (fmt.frequence < 1000 || fmt.frequence > 768_000) return refus('fréquence d’échantillonnage invalide');
      if (fmt.alignement !== fmt.canaux * Math.ceil(fmt.bits / 8)) return refus('alignement incohérent avec canaux et bits');
      if (fmt.octetsSeconde !== fmt.frequence * fmt.alignement) return refus('octets par seconde incohérents avec la fréquence');
      const presents = o.length - debut;
      const annonce = taille === 0xffffffff ? presents : taille;
      const tronque = annonce > presents;
      const octets = Math.min(annonce, presents);
      const echantillons = Math.floor(octets / fmt.alignement);
      if (echantillons === 0) return refus('aucun échantillon audio');
      return { ok: true, format: 'wav', dureeMs: ms(echantillons, fmt.frequence), echantillons, frequence: fmt.frequence, canaux: fmt.canaux, methode: 'wav_data', tronque, trames: null };
    }
    i = debut + taille + (taille % 2);
  }
  return refus(fmt ? 'bloc data absent' : 'bloc fmt absent');
}

/* ─────────────────────────────── MP3 ──────────────────────────────────────── */

const DEBITS: Readonly<Record<string, readonly number[]>> = {
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const FREQUENCES: Readonly<Record<'1' | '2' | '2.5', readonly number[]>> = { '1': [44100, 48000, 32000], '2': [22050, 24000, 16000], '2.5': [11025, 12000, 8000] };

export interface TrameMp3 { version: '1' | '2' | '2.5'; couche: 1 | 2 | 3; debitKbps: number; frequence: number; longueur: number; echantillons: number; mono: boolean }

/** En-tête de trame MPEG audio à l'offset `i` · `null` s'il n'est pas valide. */
export function enteteMp3(o: Uint8Array, i: number): TrameMp3 | null {
  if (i + 4 > o.length) return null;
  const b1 = o[i + 1]!; const b2 = o[i + 2]!; const b3 = o[i + 3]!;
  if (o[i] !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const v = (b1 >> 3) & 3; const c = (b1 >> 1) & 3;
  if (v === 1 || c === 0) return null;
  const version = v === 3 ? '1' : v === 2 ? '2' : '2.5';
  const couche = (4 - c) as 1 | 2 | 3;
  const iDebit = b2 >> 4; const iFreq = (b2 >> 2) & 3; const remplissage = (b2 >> 1) & 1;
  if (iDebit === 0 || iDebit === 15 || iFreq === 3) return null;
  const debitKbps = DEBITS[`${version === '1' ? '1' : '2'}-${couche}`]![iDebit]!;
  const frequence = FREQUENCES[version][iFreq]!;
  const mpeg1 = version === '1';
  const echantillons = couche === 1 ? 384 : couche === 2 ? 1152 : mpeg1 ? 1152 : 576;
  const longueur = couche === 1
    ? (Math.floor((12 * debitKbps * 1000) / frequence) + remplissage) * 4
    : Math.floor(((couche === 3 && !mpeg1 ? 72 : 144) * debitKbps * 1000) / frequence) + remplissage;
  return { version, couche, debitKbps, frequence, longueur, echantillons, mono: (b3 >> 6) === 3 };
}

function sauterId3(o: Uint8Array): number {
  if (ascii(o, 0, 3) !== 'ID3' || o.length < 10) return 0;
  const taille = ((o[6]! & 0x7f) << 21) | ((o[7]! & 0x7f) << 14) | ((o[8]! & 0x7f) << 7) | (o[9]! & 0x7f);
  return 10 + taille + ((o[5]! & 0x10) ? 10 : 0);
}

/** Nombre de trames annoncé par un en-tête Xing/Info ou VBRI dans la première trame. */
function tramesAnnoncees(o: Uint8Array, i: number, t: TrameMp3): { trames: number; methode: 'mp3_xing' | 'mp3_vbri' } | null {
  const infoLateral = t.version === '1' ? (t.mono ? 17 : 32) : (t.mono ? 9 : 17);
  const x = i + 4 + infoLateral;
  const tag = ascii(o, x, 4);
  if ((tag === 'Xing' || tag === 'Info') && x + 12 <= o.length) {
    const drapeaux = u32be(o, x + 4);
    if (drapeaux & 1) return { trames: u32be(o, x + 8), methode: 'mp3_xing' };
    return null;
  }
  const v = i + 4 + 32;
  if (ascii(o, v, 4) === 'VBRI' && v + 18 <= o.length) return { trames: u32be(o, v + 14), methode: 'mp3_vbri' };
  return null;
}

const FIN_ETIQUETTE = ['TAG', 'APETAGEX'];

export function dureeMp3(o: Uint8Array): ResultatDuree {
  let i = sauterId3(o);
  if (i >= o.length) return refus('étiquette ID3 sans audio');
  // Première trame · deux en-têtes valides enchaînés, sinon ce n'est pas une synchro.
  const limite = Math.min(o.length, i + 4096);
  let premiere: TrameMp3 | null = null;
  for (; i < limite; i++) {
    const t = enteteMp3(o, i);
    if (!t) continue;
    const suivante = enteteMp3(o, i + t.longueur);
    const fin = i + t.longueur === o.length;
    if (suivante || fin) { premiere = t; break; }
  }
  if (!premiere) return refus('aucune trame MPEG audio valide en tête de fichier');

  const annonce = tramesAnnoncees(o, i, premiere);
  if (annonce) {
    if (annonce.trames === 0) return refus('en-tête VBR annonçant zéro trame');
    const echantillons = annonce.trames * premiere.echantillons;
    return { ok: true, format: 'mp3', dureeMs: ms(echantillons, premiere.frequence), echantillons, frequence: premiere.frequence, canaux: premiere.mono ? 1 : 2, methode: annonce.methode, tronque: false, trames: annonce.trames };
  }

  let trames = 0;
  let echantillons = 0;
  while (i < o.length) {
    const t = enteteMp3(o, i);
    if (!t) {
      if (FIN_ETIQUETTE.some((e) => ascii(o, i, e.length) === e)) break;
      if (o.length - i < 4) break;
      return refus(`trame invalide à l’octet ${i} · fichier interrompu ou corrompu`);
    }
    if (t.frequence !== premiere.frequence) return refus('fréquence qui change en cours de fichier');
    if (i + t.longueur > o.length) break; // dernière trame incomplète : non comptée
    trames += 1;
    echantillons += t.echantillons;
    i += t.longueur;
  }
  if (trames < 2) return refus('moins de deux trames complètes');
  return { ok: true, format: 'mp3', dureeMs: ms(echantillons, premiere.frequence), echantillons, frequence: premiere.frequence, canaux: premiere.mono ? 1 : 2, methode: 'mp3_trames', tronque: false, trames };
}
