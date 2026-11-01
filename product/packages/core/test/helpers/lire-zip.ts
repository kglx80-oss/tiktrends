import * as zlib from 'node:zlib';

/**
 * Un LECTEUR ZIP indépendant de l'écrivain du noyau (`archive-zip.ts`) · pour
 * relire une archive produite et comparer ses octets. Il part du répertoire
 * central (comme l'Explorateur, l'Utilitaire d'archive ou `unzip`), vérifie
 * chaque en-tête local, le descripteur qui suit les octets, et recalcule le
 * CRC avec `node:zlib` (une autre implémentation que celle qu'on éprouve).
 * Toute incohérence lève une erreur qui dit laquelle.
 */

export interface EntreeLue { nom: string; octets: Buffer; crc: number; date: number; heure: number; unicode: string | null }

const crcRef = (b: Uint8Array): number => {
  const f = (zlib as { crc32?: (d: Uint8Array) => number }).crc32;
  if (!f) throw new Error('node:zlib.crc32 indisponible (Node 22.2 ou plus requis)');
  return f(b) >>> 0;
};

function champUnicode(extra: Buffer): string | null {
  for (let i = 0; i + 4 <= extra.length;) {
    const id = extra.readUInt16LE(i), n = extra.readUInt16LE(i + 2);
    if (id === 0x7075) return extra.subarray(i + 9, i + 4 + n).toString('utf8');
    i += 4 + n;
  }
  return null;
}

export function lireZip(archive: Uint8Array): EntreeLue[] {
  const b = Buffer.from(archive);
  const fin = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fin < 0 || fin + 22 > b.length) throw new Error('fin du répertoire central introuvable');
  const n = b.readUInt16LE(fin + 10);
  if (b.readUInt16LE(fin + 8) !== n) throw new Error('nombre d’entrées incohérent');
  const tailleCentral = b.readUInt32LE(fin + 12);
  const debutCentral = b.readUInt32LE(fin + 16);
  if (debutCentral + tailleCentral !== fin) throw new Error('répertoire central mal placé');
  const sortie: EntreeLue[] = [];
  let p = debutCentral;
  let finPrecedente = 0;
  for (let k = 0; k < n; k++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error(`entrée centrale ${k} · signature`);
    const drapeaux = b.readUInt16LE(p + 8), methode = b.readUInt16LE(p + 10);
    const heure = b.readUInt16LE(p + 12), date = b.readUInt16LE(p + 14);
    const crc = b.readUInt32LE(p + 16), comp = b.readUInt32LE(p + 20), taille = b.readUInt32LE(p + 24);
    const ln = b.readUInt16LE(p + 28), le = b.readUInt16LE(p + 30), lc = b.readUInt16LE(p + 32);
    const position = b.readUInt32LE(p + 42);
    const nomOctets = b.subarray(p + 46, p + 46 + ln);
    const nom = nomOctets.toString('utf8');
    const unicode = champUnicode(b.subarray(p + 46 + ln, p + 46 + ln + le));
    if (methode !== 0 || comp !== taille) throw new Error(`${nom} · pas « stockée »`);
    if (!(drapeaux & 0x0800)) throw new Error(`${nom} · nom non marqué UTF-8`);
    if (position < finPrecedente) throw new Error(`${nom} · chevauche l’entrée précédente`);
    // En-tête local
    if (b.readUInt32LE(position) !== 0x04034b50) throw new Error(`${nom} · en-tête local absent`);
    const lln = b.readUInt16LE(position + 26), lle = b.readUInt16LE(position + 28);
    if (!b.subarray(position + 30, position + 30 + lln).equals(nomOctets)) throw new Error(`${nom} · nom local différent`);
    const debut = position + 30 + lln + lle;
    const octets = Buffer.from(b.subarray(debut, debut + taille));
    let finEntree = debut + taille;
    if (drapeaux & 0x0008) {
      if (b.readUInt32LE(finEntree) !== 0x08074b50) throw new Error(`${nom} · descripteur absent`);
      if (b.readUInt32LE(finEntree + 4) !== crc || b.readUInt32LE(finEntree + 8) !== taille || b.readUInt32LE(finEntree + 12) !== taille) throw new Error(`${nom} · descripteur incohérent`);
      finEntree += 16;
    } else if (b.readUInt32LE(position + 14) !== crc) throw new Error(`${nom} · CRC local incohérent`);
    if (crcRef(octets) !== crc) throw new Error(`${nom} · CRC faux`);
    if (unicode !== null && unicode !== nom) throw new Error(`${nom} · champ Unicode différent`);
    finPrecedente = finEntree;
    sortie.push({ nom, octets, crc, date, heure, unicode });
    p += 46 + ln + le + lc;
  }
  if (finPrecedente > debutCentral) throw new Error('données après le début du répertoire central');
  return sortie;
}
