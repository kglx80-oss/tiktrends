/**
 * Studios · L5-A · déclinaisons 1:1 → 4:5 → 9:16 par RECOMPOSITION (cahier 01
 * §4.4 point 9 ; recette IMG-10).
 *
 * Pur. Avant de proposer une génération, on recompose le document existant :
 *
 *  · le fond (image qui couvre le document) est recadré en « cover », jamais
 *    étiré ; s'il doit être agrandi au-delà de sa résolution source, une
 *    extension de décor est PROPOSÉE (rien n'est lancé, aucun devis) ;
 *  · chaque objet (produit, logo, forme) garde ses proportions exactes, à
 *    l'échelle uniforme `min(L/L0, H/H0)`, recentré dans la zone sûre ;
 *  · chaque texte est recalé dans la zone sûre, recoupé avec les métriques de
 *    sa police, jamais sous la taille lisible minimale, et jamais sur le produit ;
 *  · les SOURCES sont intactes : mêmes calques, mêmes médias, mêmes textes, mêmes
 *    masques ; le document d'origine n'est pas modifié (une nouvelle version le
 *    remplace, l'ancienne reste).
 *
 * Le résultat est revérifié par `verifierDeclinaison`, qui ne fait pas confiance
 * à la recomposition : il relit les invariants sur le document produit.
 *
 * ── Zones sûres : profils de canal VERSIONNÉS ────────────────────────────────
 *
 * Valeurs publiées pour les publicités Meta (Ads Guide, Reels et Stories,
 * consultées le 2026-10-08 via des relevés concordants · la page officielle
 * n'a pas pu être ouverte depuis la session : à reconfirmer par le
 * propriétaire avant un lancement). Un changement de valeur = une nouvelle
 * version du profil, jamais une réécriture silencieuse.
 *
 * ── Marge éditoriale et taille lisible : MESURÉES sur la maquette existante ──
 *
 * `apps/web/lib/ad-render.tsx` (RENDER_VERSION 9), sur une largeur de 1080 :
 *
 *   | mesure                          | valeurs relevées            | retenu        |
 *   | marges intérieures latérales    | 44, 46, 52, 56, 60, 62      | 44 (minimum)  |
 *   | plus petit texte courant        | 24 (auteur), 26, 28, 30, 33 | 24 (minimum)  |
 *   | (pastille chiffre, hors texte)  | 20                          | non retenu    |
 *
 * On retient les minimums observés, rapportés à la largeur du format.
 */

import type { CalqueImage, CalqueStudio, CalqueTexte, DocumentStudio, ViolationStudio } from '../document';
import { etirementPx, hauteurProportionnelle, intersection, contient, rectPixels, type Rect } from './geometrie';
import { policeDuDocument } from './polices';
import { mettreEnPage, hauteurNecessaire } from './texte';

export type FormatDeclinaison = '1:1' | '4:5' | '9:16';
export const FORMATS_DECLINAISON: readonly FormatDeclinaison[] = ['1:1', '4:5', '9:16'];

/** Fractions de la hauteur (haut, bas) et de la largeur (gauche, droite) réservées à l'interface du canal. */
export interface ZoneSure { haut: number; bas: number; gauche: number; droite: number }

export interface FormatCanal { largeur: number; hauteur: number; zoneSure: ZoneSure }

export interface ProfilCanal {
  id: string;
  version: string;
  libelle: string;
  source: string;
  formats: Readonly<Record<FormatDeclinaison, FormatCanal>>;
}

const AUCUNE: ZoneSure = { haut: 0, bas: 0, gauche: 0, droite: 0 };

export const PROFILS_CANAL: Readonly<Record<string, ProfilCanal>> = {
  'meta-reels': {
    id: 'meta-reels', version: '2026-08', libelle: 'Meta · Reels (publicité)',
    source: 'Meta Ads Guide, Reels : 14 % haut, 35 % bas, 6 % côtés (9:16)',
    formats: {
      '1:1': { largeur: 1080, hauteur: 1080, zoneSure: AUCUNE },
      '4:5': { largeur: 1080, hauteur: 1350, zoneSure: AUCUNE },
      '9:16': { largeur: 1080, hauteur: 1920, zoneSure: { haut: 0.14, bas: 0.35, gauche: 0.06, droite: 0.06 } },
    },
  },
  'meta-stories': {
    id: 'meta-stories', version: '2026-08', libelle: 'Meta · Stories (publicité)',
    source: 'Meta Ads Guide, Stories : 14 % haut, 20 % bas, 6 % côtés (9:16)',
    formats: {
      '1:1': { largeur: 1080, hauteur: 1080, zoneSure: AUCUNE },
      '4:5': { largeur: 1080, hauteur: 1350, zoneSure: AUCUNE },
      '9:16': { largeur: 1080, hauteur: 1920, zoneSure: { haut: 0.14, bas: 0.20, gauche: 0.06, droite: 0.06 } },
    },
  },
};

/** Marge éditoriale minimale · 44 / 1080 de la largeur (mesurée, voir l'en-tête). */
export const MARGE_EDITORIALE = 44 / 1080;
/** Taille de texte lisible minimale · 24 / 1080 de la largeur (mesurée, voir l'en-tête). */
export const TAILLE_LISIBLE_MIN = 24 / 1080;
/** Un calque image qui couvre au moins cette part du document est un FOND. */
export const PART_FOND = 0.95;

export function tailleLisibleMinPx(largeur: number): number {
  return Math.ceil(TAILLE_LISIBLE_MIN * largeur);
}

/** Zone sûre en pixels entiers : le plus strict du canal et de la marge éditoriale. */
export function zoneSurePx(f: FormatCanal): Rect {
  const m = MARGE_EDITORIALE * f.largeur;
  const g = Math.ceil(Math.max(f.zoneSure.gauche * f.largeur, m));
  const d = Math.ceil(Math.max(f.zoneSure.droite * f.largeur, m));
  const h = Math.ceil(Math.max(f.zoneSure.haut * f.hauteur, m));
  const b = Math.ceil(Math.max(f.zoneSure.bas * f.hauteur, m));
  return { x: g, y: h, width: f.largeur - g - d, height: f.hauteur - h - b };
}

/** Zone de référence d'un document source quelconque · la marge éditoriale seule. */
function zoneSource(doc: Pick<DocumentStudio, 'width' | 'height'>): Rect {
  return zoneSurePx({ largeur: doc.width, hauteur: doc.height, zoneSure: AUCUNE });
}

export function estFond(doc: Pick<DocumentStudio, 'width' | 'height'>, l: CalqueStudio): boolean {
  if (l.kind !== 'image' || l.rotationDeg % 360 !== 0) return false;
  const r = intersection(rectPixels(l), { x: 0, y: 0, width: doc.width, height: doc.height });
  return !!r && r.width * r.height >= PART_FOND * doc.width * doc.height;
}

export interface GenerationProposee {
  operation: 'extension_decor';
  calqueId: string;
  raison: string;
}

export interface RapportDeclinaison {
  profil: string;
  version: string;
  format: FormatDeclinaison;
  largeur: number;
  hauteur: number;
  zoneSure: Rect;
  echelle: number;
  ajustements: string[];
  /** Proposée, jamais lancée : une génération passe par un devis et une approbation (L3). */
  generationsProposees: GenerationProposee[];
}

export type ResultatDeclinaison =
  | { ok: true; document: DocumentStudio; rapport: RapportDeclinaison }
  | { ok: false; violations: ViolationStudio[]; generationsProposees: GenerationProposee[] };

const copie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

type Boite = { x: number; y: number; width: number; height: number };
const boiteDe = (l: Boite): Rect => ({ x: l.x, y: l.y, width: l.width, height: l.height });

function borner(v: number, min: number, max: number): number {
  return max < min ? min : Math.min(Math.max(v, min), max);
}

/**
 * Recompose `doc` au format demandé du profil. N'altère pas `doc`.
 * `produitIds` : calques image à ne jamais recouvrir de texte (par défaut, tout
 * calque image qui n'est pas un fond).
 */
export function declinerDocument(
  doc: DocumentStudio,
  profilId: string,
  format: FormatDeclinaison,
  o: { produitIds?: readonly string[] } = {},
): ResultatDeclinaison {
  const profil = Object.prototype.hasOwnProperty.call(PROFILS_CANAL, profilId) ? PROFILS_CANAL[profilId] : undefined;
  if (!profil) return { ok: false, violations: [{ chemin: 'profil', raison: `profil de canal inconnu · ${Object.keys(PROFILS_CANAL).join(', ')}` }], generationsProposees: [] };
  if (!FORMATS_DECLINAISON.includes(format)) return { ok: false, violations: [{ chemin: 'format', raison: 'format 1:1, 4:5 ou 9:16 attendu' }], generationsProposees: [] };
  const f = profil.formats[format];
  const W = f.largeur;
  const H = f.hauteur;
  const S = zoneSurePx(f);
  const S0 = zoneSource(doc);
  const s = Math.min(W / doc.width, H / doc.height);
  const kFond = Math.max(W / doc.width, H / doc.height);
  const minPx = tailleLisibleMinPx(W);
  const ajustements: string[] = [];
  const generationsProposees: GenerationProposee[] = [];
  const out: DocumentStudio = copie(doc);
  out.width = W;
  out.height = H;

  const fonds = new Set(Object.values(doc.layers).filter((l) => estFond(doc, l)).map((l) => l.id));
  const produits = new Set(o.produitIds ?? Object.values(doc.layers).filter((l) => l.kind === 'image' && !fonds.has(l.id)).map((l) => l.id));

  const versCentre = (l: Boite) => {
    const u = (l.x + l.width / 2 - S0.x) / S0.width;
    const v = (l.y + l.height / 2 - S0.y) / S0.height;
    return { cx: S.x + u * S.width, cy: S.y + v * S.height };
  };

  for (const l of Object.values(out.layers)) {
    const src = doc.layers[l.id]!;
    if (fonds.has(l.id) && l.kind === 'image') {
      const w = Math.round(src.width * kFond);
      const h = hauteurProportionnelle(w, l.sourceWidth, l.sourceHeight);
      const cx = ((src.x + src.width / 2) / doc.width) * W;
      const cy = ((src.y + src.height / 2) / doc.height) * H;
      // Couvrir sans étirer · un pixel manquant d'arrondi est rattrapé par l'échelle.
      const kCouvre = Math.max(1, W / w, H / h);
      l.width = Math.ceil(w * kCouvre);
      l.height = Math.max(Math.ceil(h * kCouvre), hauteurProportionnelle(l.width, l.sourceWidth, l.sourceHeight));
      l.x = Math.round(cx - l.width / 2);
      l.y = Math.round(cy - l.height / 2);
      l.x = borner(l.x, W - l.width, 0);
      l.y = borner(l.y, H - l.height, 0);
      if (l.width > l.sourceWidth * 1.0001 || l.height > l.sourceHeight * 1.0001) {
        generationsProposees.push({
          operation: 'extension_decor', calqueId: l.id,
          raison: `le fond est agrandi au-delà de sa résolution source (${l.width}×${l.height} pour ${l.sourceWidth}×${l.sourceHeight}) · une extension du décor peut être devisée`,
        });
      }
      ajustements.push(`${l.id} · fond recadré (cover) sans étirement`);
      continue;
    }
    const { cx, cy } = versCentre(src);
    if (l.kind === 'image' || l.kind === 'logo' || l.kind === 'shape') {
      l.width = Math.max(1, Math.round(src.width * s));
      l.height = l.kind === 'image'
        ? hauteurProportionnelle(l.width, l.sourceWidth, l.sourceHeight)
        : Math.max(1, Math.round((l.width * src.height) / src.width));
      // Un objet plus grand que la zone sûre est réduit, proportions gardées.
      const k = Math.min(1, S.width / l.width, S.height / l.height);
      if (k < 1) {
        l.width = Math.max(1, Math.floor(l.width * k));
        l.height = l.kind === 'image' ? hauteurProportionnelle(l.width, l.sourceWidth, l.sourceHeight) : Math.max(1, Math.round((l.width * src.height) / src.width));
        ajustements.push(`${l.id} · réduit pour tenir dans la zone sûre`);
      }
      l.x = borner(Math.round(cx - l.width / 2), S.x, S.x + S.width - l.width);
      l.y = borner(Math.round(cy - l.height / 2), S.y, S.y + S.height - l.height);
      continue;
    }
    // Texte
    const t = l as CalqueTexte;
    const st = src as CalqueTexte;
    const pol = policeDuDocument(doc.fonts, t.fontId);
    if (!pol.ok) return { ok: false, violations: [{ chemin: `/document/layers/${t.id}/fontId`, raison: pol.raison }], generationsProposees };
    t.width = Math.min(S.width, Math.max(1, Math.round(src.width * s)));
    t.fontSizePx = Math.max(minPx, Math.round(st.fontSizePx * s * 100) / 100);
    if (t.fontSizePx > st.fontSizePx * s + 1e-9) ajustements.push(`${t.id} · taille portée à ${t.fontSizePx} px (lisibilité)`);
    t.height = hauteurNecessaire(t, pol.metriques);
    while (t.height > S.height && t.fontSizePx > minPx) {
      t.fontSizePx = Math.max(minPx, t.fontSizePx - 1);
      t.height = hauteurNecessaire(t, pol.metriques);
    }
    t.x = borner(Math.round(cx - t.width / 2), S.x, S.x + S.width - t.width);
    t.y = borner(Math.round(cy - t.height / 2), S.y, S.y + S.height - t.height);
  }

  // Textes et logos hors du produit · écartés au-dessus ou au-dessous, sinon le produit est réduit.
  const textes = Object.values(out.layers).filter((l): l is CalqueTexte => l.kind === 'text' && l.visible);
  const objetsProduit = Object.values(out.layers).filter((l): l is CalqueImage => produits.has(l.id) && l.kind === 'image' && l.visible);
  const ecart = Math.ceil(MARGE_EDITORIALE * W / 2);
  for (let tentative = 0; tentative < 8; tentative++) {
    let conflit = false;
    const occupes: Rect[] = objetsProduit.map(boiteDe);
    for (const t of [...textes].sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1))) {
      const gene = occupes.find((r) => intersection(boiteDe(t), r));
      if (!gene) { occupes.push(boiteDe(t)); continue; }
      const dessus = gene.y - ecart - t.height;
      const dessous = gene.y + gene.height + ecart;
      const preferDessus = t.y + t.height / 2 < gene.y + gene.height / 2;
      const essais = preferDessus ? [dessus, dessous] : [dessous, dessus];
      const ok = essais.find((y) => y >= S.y && y + t.height <= S.y + S.height && !occupes.some((r) => intersection({ ...boiteDe(t), y }, r)));
      if (ok !== undefined) { t.y = ok; occupes.push(boiteDe(t)); ajustements.push(`${t.id} · écarté du produit`); continue; }
      conflit = true;
      break;
    }
    if (!conflit) break;
    // Réduire les produits de 10 %, proportions gardées, centre conservé.
    for (const p of objetsProduit) {
      const cx = p.x + p.width / 2;
      const cy = p.y + p.height / 2;
      p.width = Math.max(1, Math.floor(p.width * 0.9));
      p.height = hauteurProportionnelle(p.width, p.sourceWidth, p.sourceHeight);
      p.x = Math.round(cx - p.width / 2);
      p.y = Math.round(cy - p.height / 2);
    }
    ajustements.push('produit réduit de 10 % pour laisser la place au texte');
  }

  const violations = verifierDeclinaison(doc, out, profilId, format, { produitIds: [...produits] });
  if (violations.length) return { ok: false, violations, generationsProposees };
  return {
    ok: true, document: out,
    rapport: { profil: profil.id, version: profil.version, format, largeur: W, hauteur: H, zoneSure: S, echelle: s, ajustements, generationsProposees },
  };
}

/**
 * Invariants d'une déclinaison, relus sur le RÉSULTAT · liste vide = conforme.
 * Indépendant de la recomposition (elle peut changer, ces règles restent).
 */
export function verifierDeclinaison(
  source: DocumentStudio,
  res: DocumentStudio,
  profilId: string,
  format: FormatDeclinaison,
  o: { produitIds: readonly string[] },
): ViolationStudio[] {
  const v: ViolationStudio[] = [];
  const f = PROFILS_CANAL[profilId]!.formats[format];
  const S = zoneSurePx(f);
  const minPx = tailleLisibleMinPx(f.largeur);
  if (res.width !== f.largeur || res.height !== f.hauteur) v.push({ chemin: '/document', raison: `dimensions ${res.width}×${res.height} au lieu de ${f.largeur}×${f.hauteur}` });
  const idsS = Object.keys(source.layers).sort();
  const idsR = Object.keys(res.layers).sort();
  if (idsS.join('|') !== idsR.join('|')) v.push({ chemin: '/document/layers', raison: 'calques ajoutés ou retirés · la déclinaison recompose, elle ne crée ni ne supprime' });
  if (JSON.stringify(source.fonts) !== JSON.stringify(res.fonts)) v.push({ chemin: '/document/fonts', raison: 'polices modifiées' });
  const produits = new Set(o.produitIds);
  for (const id of idsR) {
    const a = source.layers[id];
    const b = res.layers[id]!;
    const ch = `/document/layers/${id}`;
    if (!a || a.kind !== b.kind) { v.push({ chemin: ch, raison: 'type de calque changé' }); continue; }
    if (a.visible !== b.visible || a.z !== b.z || a.opacity !== b.opacity || a.rotationDeg !== b.rotationDeg) v.push({ chemin: ch, raison: 'visibilité, ordre, opacité ou angle changés' });
    if (a.kind === 'image' && b.kind === 'image') {
      if (a.assetId !== b.assetId || a.sourceWidth !== b.sourceWidth || a.sourceHeight !== b.sourceHeight || JSON.stringify(a.mask) !== JSON.stringify(b.mask)) {
        v.push({ chemin: ch, raison: 'source ou masque d’un calque image modifiés' });
      }
      if (etirementPx(b) > 1) v.push({ chemin: ch, raison: `image étirée de ${etirementPx(b).toFixed(1)} px` });
      const cadre = { x: 0, y: 0, width: res.width, height: res.height };
      if (estFond(source, a) && !contient(boiteDe(b), cadre)) v.push({ chemin: ch, raison: 'le fond ne couvre plus le document' });
    }
    if (a.kind === 'logo' && b.kind === 'logo') {
      if (a.assetId !== b.assetId) v.push({ chemin: ch, raison: 'média du logo changé' });
      if (Math.abs(b.height - (b.width * a.height) / a.width) > 1) v.push({ chemin: ch, raison: 'logo étiré' });
      if (!contient(S, boiteDe(b))) v.push({ chemin: ch, raison: 'logo hors de la zone sûre' });
    }
    if (a.kind === 'shape' && b.kind === 'shape' && Math.abs(b.height - (b.width * a.height) / a.width) > 1) v.push({ chemin: ch, raison: 'forme déformée' });
    if (a.kind === 'text' && b.kind === 'text') {
      if (a.text !== b.text || a.fontId !== b.fontId || a.color !== b.color || a.align !== b.align || a.lineHeight !== b.lineHeight) v.push({ chemin: ch, raison: 'contenu ou style du texte modifiés' });
      if (b.fontSizePx < minPx - 1e-9) v.push({ chemin: `${ch}/fontSizePx`, raison: `texte sous la taille lisible (${b.fontSizePx} < ${minPx} px)` });
      if (b.visible && !contient(S, boiteDe(b))) v.push({ chemin: ch, raison: 'texte hors de la zone sûre' });
      const pol = policeDuDocument(res.fonts, b.fontId);
      if (pol.ok && mettreEnPage(b, pol.metriques).deborde) v.push({ chemin: ch, raison: 'le texte déborde de son cadre' });
      for (const p of produits) {
        const pr = res.layers[p];
        if (b.visible && pr?.visible && intersection(boiteDe(b), boiteDe(pr))) v.push({ chemin: ch, raison: `le texte recouvre le produit ${p}` });
      }
    }
  }
  return v;
}
