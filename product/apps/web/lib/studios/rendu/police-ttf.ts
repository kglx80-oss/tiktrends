/**
 * Studios · L5-A · lecture d'une police TrueType embarquée, pour le rendu.
 *
 * Le texte d'un document est mis en page par le NOYAU (`metresEnPage`, table
 * d'avances mesurée sur ces mêmes fichiers) ; ce module ne décide rien. Il lit
 * le contour de chaque glyphe (`glyf`, contours quadratiques) et le rend en
 * chemin SVG, que `sharp` (librsvg) pixellise. Aucune police système, aucun
 * crénage, aucun moteur de mise en page tiers : les lignes, les positions et les
 * largeurs sont celles du noyau, au pixel (garde `l5a-compositeur`).
 *
 * Pur sur des octets · le chargement des fichiers est dans `polices.ts`.
 */

export interface PoliceTtf {
  unitesParEm: number;
  ascendant: number;
  descendant: number;
  interligne: number;
  nombreGlyphes: number;
  /** Code point → indice de glyphe (0 = .notdef). */
  glyphe(codePoint: number): number;
  avance(glyphe: number): number;
  /** Boîte d'encre en unités de police · `null` pour un glyphe vide (espace). */
  boite(glyphe: number): { xMin: number; yMin: number; xMax: number; yMax: number } | null;
  /** Contours en unités de police, axe Y vers le HAUT (convention TrueType). */
  contours(glyphe: number): Point[][];
}

export interface Point { x: number; y: number; surCourbe: boolean }

interface Table { off: number; len: number }

function tables(b: Buffer): Record<string, Table> {
  const n = b.readUInt16BE(4);
  const t: Record<string, Table> = {};
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    t[b.toString('ascii', o, o + 4)] = { off: b.readUInt32BE(o + 8), len: b.readUInt32BE(o + 12) };
  }
  return t;
}

export function lirePoliceTtf(b: Buffer): PoliceTtf {
  const t = tables(b);
  for (const requise of ['head', 'hhea', 'hmtx', 'maxp', 'cmap', 'loca', 'glyf']) {
    if (!t[requise]) throw new Error(`police TrueType incomplète · table ${requise} absente`);
  }
  const head = t.head!.off;
  const unitesParEm = b.readUInt16BE(head + 18);
  const locaLong = b.readInt16BE(head + 50) === 1;
  const hhea = t.hhea!.off;
  const ascendant = b.readInt16BE(hhea + 4);
  const descendant = -b.readInt16BE(hhea + 6);
  const interligne = b.readInt16BE(hhea + 8);
  const nMetriques = b.readUInt16BE(hhea + 34);
  const nombreGlyphes = b.readUInt16BE(t.maxp!.off + 4);
  const hmtx = t.hmtx!.off;
  const loca = t.loca!.off;
  const glyf = t.glyf!.off;

  const avance = (g: number) => b.readUInt16BE(hmtx + Math.min(g, nMetriques - 1) * 4);
  const debut = (g: number) => (locaLong ? b.readUInt32BE(loca + g * 4) : b.readUInt16BE(loca + g * 2) * 2);

  // cmap · sous-table Windows Unicode (3,1) ou (3,10), format 4 ou 12.
  const cmap = t.cmap!.off;
  const nSous = b.readUInt16BE(cmap + 2);
  let sous = -1;
  for (let i = 0; i < nSous; i++) {
    const p = b.readUInt16BE(cmap + 4 + i * 8);
    const e = b.readUInt16BE(cmap + 6 + i * 8);
    const o = cmap + b.readUInt32BE(cmap + 8 + i * 8);
    if (p === 3 && (e === 1 || e === 10)) { sous = o; if (b.readUInt16BE(o) === 4) break; }
  }
  if (sous < 0) throw new Error('police TrueType sans table Unicode Windows');
  const format = b.readUInt16BE(sous);
  const cacheCmap = new Map<number, number>();
  const glyphe = (cp: number): number => {
    const connu = cacheCmap.get(cp);
    if (connu !== undefined) return connu;
    let g = 0;
    if (format === 4) {
      const seg2 = b.readUInt16BE(sous + 6);
      const fins = sous + 14;
      const debuts = fins + seg2 + 2;
      const deltas = debuts + seg2;
      const decalages = deltas + seg2;
      for (let i = 0; i < seg2; i += 2) {
        const fin = b.readUInt16BE(fins + i);
        if (cp > fin) continue;
        const d = b.readUInt16BE(debuts + i);
        if (cp < d) break;
        const delta = b.readUInt16BE(deltas + i);
        const ro = b.readUInt16BE(decalages + i);
        if (ro === 0) g = (cp + delta) & 0xffff;
        else {
          const v = b.readUInt16BE(decalages + i + ro + (cp - d) * 2);
          g = v === 0 ? 0 : (v + delta) & 0xffff;
        }
        break;
      }
    } else if (format === 12) {
      const n = b.readUInt32BE(sous + 12);
      for (let i = 0; i < n; i++) {
        const o = sous + 16 + i * 12;
        const s = b.readUInt32BE(o);
        const e = b.readUInt32BE(o + 4);
        if (cp >= s && cp <= e) { g = b.readUInt32BE(o + 8) + (cp - s); break; }
      }
    }
    cacheCmap.set(cp, g);
    return g;
  };

  const boite = (g: number) => {
    const o = debut(g);
    if (debut(g + 1) === o) return null;
    const p = glyf + o;
    return { xMin: b.readInt16BE(p + 2), yMin: b.readInt16BE(p + 4), xMax: b.readInt16BE(p + 6), yMax: b.readInt16BE(p + 8) };
  };

  const contours = (g: number, profondeur = 0): Point[][] => {
    if (profondeur > 8) throw new Error('glyphe composite trop profond');
    const o = debut(g);
    if (debut(g + 1) === o) return [];
    let p = glyf + o;
    const nContours = b.readInt16BE(p);
    p += 10;
    if (nContours >= 0) {
      const fins: number[] = [];
      for (let i = 0; i < nContours; i++) { fins.push(b.readUInt16BE(p)); p += 2; }
      const nPoints = nContours ? fins[nContours - 1]! + 1 : 0;
      p += 2 + b.readUInt16BE(p); // instructions ignorées (pas d'optimisation d'écran)
      const drapeaux: number[] = [];
      while (drapeaux.length < nPoints) {
        const f = b[p++]!;
        drapeaux.push(f);
        if (f & 8) { let r = b[p++]!; while (r-- > 0) drapeaux.push(f); }
      }
      const xs: number[] = [];
      let x = 0;
      for (const f of drapeaux) {
        if (f & 2) { const d = b[p++]!; x += f & 16 ? d : -d; }
        else if (!(f & 16)) { x += b.readInt16BE(p); p += 2; }
        xs.push(x);
      }
      const ys: number[] = [];
      let y = 0;
      for (const f of drapeaux) {
        if (f & 4) { const d = b[p++]!; y += f & 32 ? d : -d; }
        else if (!(f & 32)) { y += b.readInt16BE(p); p += 2; }
        ys.push(y);
      }
      const out: Point[][] = [];
      let k = 0;
      for (const fin of fins) {
        const c: Point[] = [];
        for (; k <= fin; k++) c.push({ x: xs[k]!, y: ys[k]!, surCourbe: (drapeaux[k]! & 1) === 1 });
        out.push(c);
      }
      return out;
    }
    // Composite · composants avec décalage (et échelle éventuelle).
    const out: Point[][] = [];
    for (let encore = true; encore;) {
      const f = b.readUInt16BE(p);
      const idx = b.readUInt16BE(p + 2);
      p += 4;
      let dx: number; let dy: number;
      if (f & 1) { dx = b.readInt16BE(p); dy = b.readInt16BE(p + 2); p += 4; }
      else { dx = b.readInt8(p); dy = b.readInt8(p + 1); p += 2; }
      if (!(f & 2)) throw new Error('composant positionné par points non pris en charge');
      let a = 1; let bb = 0; let c = 0; let d = 1;
      const f2dot14 = (q: number) => b.readInt16BE(q) / 16384;
      if (f & 8) { a = d = f2dot14(p); p += 2; }
      else if (f & 0x40) { a = f2dot14(p); d = f2dot14(p + 2); p += 4; }
      else if (f & 0x80) { a = f2dot14(p); bb = f2dot14(p + 2); c = f2dot14(p + 4); d = f2dot14(p + 6); p += 8; }
      for (const contour of contours(idx, profondeur + 1)) {
        out.push(contour.map((q) => ({ x: a * q.x + c * q.y + dx, y: bb * q.x + d * q.y + dy, surCourbe: q.surCourbe })));
      }
      encore = (f & 0x20) !== 0;
    }
    return out;
  };

  return { unitesParEm, ascendant, descendant, interligne, nombreGlyphes, glyphe, avance, boite, contours };
}

const n = (v: number) => (Math.round(v * 1000) / 1000).toString();

/**
 * Chemin SVG d'un glyphe posé à (`x`, `ligneDeBase`) en pixels, à `echelle`
 * pixels par unité de police. Axe Y du document vers le BAS.
 */
export function cheminGlyphe(contours: Point[][], x: number, ligneDeBase: number, echelle: number): string {
  const px = (q: { x: number }) => x + q.x * echelle;
  const py = (q: { y: number }) => ligneDeBase - q.y * echelle;
  let d = '';
  for (const c of contours) {
    if (c.length === 0) continue;
    // Point de départ sur la courbe · implicite entre deux hors-courbe si besoin.
    const premier = c.findIndex((q) => q.surCourbe);
    let depart: { x: number; y: number };
    let pts: Point[];
    if (premier >= 0) { depart = c[premier]!; pts = [...c.slice(premier + 1), ...c.slice(0, premier + 1)]; }
    else { const a = c[0]!; const z = c[c.length - 1]!; depart = { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 }; pts = [...c, { ...depart, surCourbe: true }]; }
    d += `M${n(px(depart))} ${n(py(depart))}`;
    let controle: Point | null = null;
    for (const q of pts) {
      if (q.surCourbe) {
        d += controle ? `Q${n(px(controle))} ${n(py(controle))} ${n(px(q))} ${n(py(q))}` : `L${n(px(q))} ${n(py(q))}`;
        controle = null;
      } else if (controle) {
        const m = { x: (controle.x + q.x) / 2, y: (controle.y + q.y) / 2 };
        d += `Q${n(px(controle))} ${n(py(controle))} ${n(px(m))} ${n(py(m))}`;
        controle = q;
      } else controle = q;
    }
    if (controle) d += `Q${n(px(controle))} ${n(py(controle))} ${n(px(depart))} ${n(py(depart))}`;
    d += 'Z';
  }
  return d;
}
