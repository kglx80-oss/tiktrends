/**
 * Studios · L4 · proposition saisie à la main (chemin manuel, sans modèle).
 *
 * Pur. Quand Jarvis n'est pas disponible (aucune release publiée, plafond
 * atteint) l'écran propose quand même de modifier : il liste les champs
 * TEXTE éditables de la cible, et la saisie devient UN changement `replace` sur
 * un chemin de la cible. Le serveur repasse ensuite par les mêmes contrôles
 * qu'une proposition Jarvis (`construireProposition`).
 */

import type { ChangementPatch } from '../patch';
import type { ContenuVersion } from '../document';
import { libelleChemin, racineCible, type CibleProposition } from './cible';

export type FormeChamp = 'texte' | 'lignes';

export interface ChampEditable {
  chemin: string;
  libelle: string;
  forme: FormeChamp;
  /** Valeur courante · lignes jointes par « \n » pour une liste de textes. */
  valeur: string;
}

const CHAMPS_PLAN = ['purpose', 'subject', 'action', 'framing', 'camera', 'lighting', 'environment', 'narration'] as const;
const LISTES_BRIEF = ['texts', 'exclusions', 'invariants', 'formats', 'variables'];
const echapper = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function champsObjet(c: CibleProposition, racine: string, o: Record<string, unknown>, listes: readonly string[] = []): ChampEditable[] {
  const out: ChampEditable[] = [];
  for (const k of Object.keys(o).sort()) {
    const v = o[k];
    const chemin = `${racine}/${echapper(k)}`;
    if (typeof v === 'string') out.push({ chemin, libelle: libelleChemin(c, chemin), forme: 'texte', valeur: v });
    else if (Array.isArray(v) && v.every((x) => typeof x === 'string') && (listes.length === 0 || listes.includes(k))) out.push({ chemin, libelle: libelleChemin(c, chemin), forme: 'lignes', valeur: v.join('\n') });
  }
  return out;
}

/** Champs texte éditables à la main pour une cible · vide si la cible n'en a pas. */
export function champsEditables(c: CibleProposition, contenu: ContenuVersion): ChampEditable[] {
  const racine = racineCible(c);
  switch (c.type) {
    case 'shot': {
      const p = contenu.shots.byId[c.id];
      if (!p) return [];
      const out: ChampEditable[] = CHAMPS_PLAN.map((k) => ({ chemin: `${racine}/${k}`, libelle: libelleChemin(c, `${racine}/${k}`), forme: 'texte' as const, valeur: p[k] }));
      out.push({ chemin: `${racine}/onScreenText`, libelle: libelleChemin(c, `${racine}/onScreenText`), forme: 'lignes', valeur: p.onScreenText.join('\n') });
      return out;
    }
    case 'layer': {
      const l = contenu.document?.layers[c.id];
      return l && l.kind === 'text' ? [{ chemin: `${racine}/text`, libelle: libelleChemin(c, `${racine}/text`), forme: 'texte', valeur: l.text }] : [];
    }
    case 'character': {
      const r = contenu.characterRefs[c.id];
      return estObjet(r) ? champsObjet(c, racine, r) : [];
    }
    case 'brief': return estObjet(contenu.brief) ? champsObjet(c, racine, contenu.brief, LISTES_BRIEF) : [];
    case 'style': return estObjet(contenu.styleRef) ? champsObjet(c, racine, contenu.styleRef) : [];
    default: return [];
  }
}

/** Saisie → changement `replace` · les lignes vides d'une liste sont retirées. */
export function changementDepuisSaisie(champ: Pick<ChampEditable, 'chemin' | 'forme' | 'libelle'>, saisie: string, raison: string): ChangementPatch {
  const newValue = champ.forme === 'lignes'
    ? saisie.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    : saisie;
  return { op: 'replace', path: champ.chemin, newValue, reason: raison.trim() || `Modification manuelle · ${champ.libelle}` };
}
