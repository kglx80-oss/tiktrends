/**
 * Fixtures médias de la recette du 8 octobre (décodabilité), partagées par
 * les tests du noyau, du worker et du site. Chaque fixture dit ce qu'elle EST :
 *
 *  · `mp4Recette88` · le faux MP4 de la contre-recette, octet pour octet :
 *    ftyp + moov (16 zéros) + mdat (32 zéros), 88 octets, AUCUNE piste ;
 *  · `mp4StructurePlausible` · un MP4 FABRIQUÉ dont les boîtes sont cohérentes
 *    (piste `vide`, `stsd` avc1, échantillons, décalage dans `mdat`) mais dont
 *    les données sont des zéros : il passe le premier filtre et N'EST PAS une
 *    vidéo décodable. Aucune vraie vidéo n'est versionnée dans ce dépôt : les
 *    cas positifs vidéo vivent au worker (ffmpeg, `l7b-decodeur-video`), pas ici ;
 *  · `pngIdatCorrompu` · un PNG réel dont le flux zlib est abîmé APRÈS
 *    compression, CRC recalculés : structure parfaite, pixels illisibles ;
 *  · `jpegScanCoupe` · un JPEG réel dont le flux entropique est coupé au tiers,
 *    marqueur de fin conservé : structure plausible, pixels illisibles.
 */

const te = new TextEncoder();

export function concat(...p: Uint8Array[]): Uint8Array {
  const o = new Uint8Array(p.reduce((s, x) => s + x.length, 0));
  let i = 0;
  for (const x of p) { o.set(x, i); i += x.length; }
  return o;
}

export function boite(type: string, ...corps: Uint8Array[]): Uint8Array {
  const c = concat(...corps);
  const o = new Uint8Array(8 + c.length);
  new DataView(o.buffer).setUint32(0, o.length);
  o.set(te.encode(type), 4);
  o.set(c, 8);
  return o;
}

const u32 = (...n: number[]) => { const o = new Uint8Array(4 * n.length); n.forEach((x, i) => new DataView(o.buffer).setUint32(4 * i, x)); return o; };
const u16 = (...n: number[]) => { const o = new Uint8Array(2 * n.length); n.forEach((x, i) => new DataView(o.buffer).setUint16(2 * i, x)); return o; };
const zeros = (n: number) => new Uint8Array(n);
/** Boîte « pleine » ISO-BMFF : version + drapeaux à zéro. */
const pleine = (type: string, ...corps: Uint8Array[]) => boite(type, u32(0), ...corps);

/** Le faux MP4 de la contre-recette du 8 octobre (88 octets). */
export function mp4Recette88(): Uint8Array {
  return concat(boite('ftyp', te.encode('isom\0\0\x02\0isomiso2')), boite('moov', zeros(16)), boite('mdat', zeros(32)));
}

export interface OptionsMp4 {
  handler?: string;
  entreesStsd?: number;
  echantillons?: number[];
  largeur?: number;
  hauteur?: number;
  /** Décalage ajouté au décalage juste du premier morceau (0 = dans `mdat`). */
  decalageFaux?: number;
  sansPiste?: boolean;
  donnees?: number;
}

/** MP4 à boîtes cohérentes, données à zéro · structure plausible, JAMAIS une vidéo décodable. */
export function mp4StructurePlausible(o: OptionsMp4 = {}): Uint8Array {
  const echantillons = o.echantillons ?? [40, 24];
  const ftyp = boite('ftyp', te.encode('isom'), u32(0x200), te.encode('isomiso2avc1mp41'));
  // VisualSampleEntry : 6 réservés + data_reference_index, 16 octets
  // prédéfinis, largeur, hauteur, résolutions, réservé, frame_count, nom (32),
  // profondeur, prédéfini = 78 octets.
  const avc1 = boite('avc1', zeros(6), u16(1), zeros(16), u16(o.largeur ?? 64, o.hauteur ?? 48), u32(0x00480000, 0x00480000, 0), u16(1), zeros(32), u16(0x18, 0xffff));
  const moov = (decalage: number) => {
    const stbl = boite('stbl',
      pleine('stsd', u32(o.entreesStsd ?? 1), avc1),
      pleine('stts', u32(1, echantillons.length, 512)),
      pleine('stsc', u32(1, 1, echantillons.length, 1)),
      pleine('stsz', u32(0, echantillons.length, ...echantillons)),
      pleine('stco', u32(1, decalage)),
    );
    const trak = boite('trak', boite('mdia', pleine('hdlr', u32(0), te.encode(o.handler ?? 'vide'), zeros(12), te.encode('VideoHandler\0')), boite('minf', pleine('vmhd', u32(0, 0)), stbl)));
    return boite('moov', pleine('mvhd', zeros(96)), ...(o.sansPiste ? [] : [trak]));
  };
  const donnees = zeros(o.donnees ?? echantillons.reduce((s, x) => s + x, 0));
  const decalageJuste = ftyp.length + moov(0).length + 8;
  return concat(ftyp, moov(decalageJuste + (o.decalageFaux ?? 0)), boite('mdat', donnees));
}

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = TABLE[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** PNG réel dont les données IDAT sont abîmées, CRC RECALCULÉS (structure intacte). */
export function pngIdatCorrompu(png: Uint8Array): Uint8Array {
  const o = png.slice();
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  let i = 8;
  while (i + 12 <= o.length) {
    const long = v.getUint32(i);
    const type = String.fromCharCode(...o.subarray(i + 4, i + 8));
    if (type === 'IDAT') {
      for (let k = i + 8 + 2; k < i + 8 + long - 4; k++) o[k]! ^= 0x5a;
      v.setUint32(i + 8 + long, crc32(o.subarray(i + 4, i + 8 + long)));
    }
    i += 12 + long;
  }
  return o;
}

/** JPEG réel dont le flux du scan est coupé au tiers, EOI (FFD9) conservé. */
export function jpegScanCoupe(jpeg: Uint8Array): Uint8Array {
  let sos = -1;
  for (let k = 2; k + 1 < jpeg.length; k++) if (jpeg[k] === 0xff && jpeg[k + 1] === 0xda) { sos = k; break; }
  if (sos < 0) throw new Error('JPEG sans SOS');
  const debut = sos + 2 + ((jpeg[sos + 2]! << 8) | jpeg[sos + 3]!);
  const coupe = debut + Math.floor((jpeg.length - 2 - debut) / 3);
  return concat(jpeg.subarray(0, coupe), new Uint8Array([0xff, 0xd9]));
}
