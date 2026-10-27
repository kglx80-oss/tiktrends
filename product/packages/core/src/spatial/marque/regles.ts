/**
 * Spatial · Marque · Règles · la lecture et l'écriture des règles de marque
 * dans `brands.creative_rules` (le texte que Jarvis reçoit, mot pour mot, à
 * chaque génération). Pur.
 *
 * Une règle = une ligne. Le type se lit dans un préfixe en clair (« Interdit : »,
 * « Obligatoire : », « Préférence : ») · c'est AUSSI ce que lit le modèle, donc
 * le préfixe est une consigne et pas une balise technique. Une ligne sans
 * préfixe (règles écrites avant, texte libre) se range dans les préférences.
 *
 * Écrire ne réordonne rien et ne réécrit rien : ajouter pose une ligne à la fin,
 * retirer supprime SA ligne et seulement elle. Le texte libre d'avant survit
 * intact (lignes vides comprises).
 */

export type TypeRegleMarque = 'ban' | 'must' | 'pref';

export const TYPES_REGLE_MARQUE: ReadonlyArray<{ type: TypeRegleMarque; libelle: string; pluriel: string; classe: '' | 'g' | 'r'; icone: string; consigne: string; exemple: string }> = [
  { type: 'ban', libelle: 'Interdit', pluriel: 'Interdits', classe: 'r', icone: 'x', consigne: 'Consigne à Jarvis · ne jamais l’écrire ni le montrer', exemple: 'ex. Montrer un enfant sans surveillance' },
  { type: 'must', libelle: 'Obligatoire', pluriel: 'Obligatoires', classe: 'g', icone: 'check', consigne: 'Consigne à Jarvis · l’intégrer à chaque texte d’annonce', exemple: 'ex. « Dès 3 ans »' },
  { type: 'pref', libelle: 'Préférence', pluriel: 'Préférences', classe: '', icone: 'bulb', consigne: 'Consigne à Jarvis · s’en servir quand c’est possible', exemple: 'ex. Couleurs pastel en été' },
];

const PREFIXE: Record<TypeRegleMarque, string> = { ban: 'Interdit', must: 'Obligatoire', pref: 'Préférence' };
const MOTIF = /^\s*(interdit|obligatoire|pr[ée]f[ée]rence)\s*[:·-]\s*(.+)$/i;

/** Longueur maximale du texte (celle de `saveJarvisRulesAction`). */
export const LONGUEUR_MAX_REGLES = 4000;

export interface RegleMarque {
  type: TypeRegleMarque;
  texte: string;
  /** L'index de SA ligne dans le texte d'origine · c'est elle qu'on retire. */
  ligne: number;
}

export function lireReglesMarque(texte: string | null | undefined): RegleMarque[] {
  const out: RegleMarque[] = [];
  (texte ?? '').split('\n').forEach((brut, ligne) => {
    const l = brut.trim();
    if (!l) return;
    const m = MOTIF.exec(l);
    if (m) {
      const p = m[1]!.toLowerCase();
      out.push({ type: p.startsWith('interdit') ? 'ban' : p.startsWith('oblig') ? 'must' : 'pref', texte: m[2]!.trim(), ligne });
    } else {
      out.push({ type: 'pref', texte: l.replace(/^[-•*]\s*/, ''), ligne });
    }
  });
  return out;
}

export function reglesParType(regles: readonly RegleMarque[]): Record<TypeRegleMarque, RegleMarque[]> {
  return { ban: regles.filter((r) => r.type === 'ban'), must: regles.filter((r) => r.type === 'must'), pref: regles.filter((r) => r.type === 'pref') };
}

/** Ajoute une règle à la fin · `null` si le texte est vide ou si le total dépasse la limite. */
export function ajouterRegleMarque(texte: string | null | undefined, type: TypeRegleMarque, regle: string): string | null {
  const r = regle.replace(/\s+/g, ' ').trim();
  if (!r) return null;
  const base = (texte ?? '').replace(/\s+$/, '');
  const suivant = `${base ? `${base}\n` : ''}${PREFIXE[type]} : ${r}`;
  return suivant.length > LONGUEUR_MAX_REGLES ? null : suivant;
}

/** Retire la ligne `ligne` (et rien d'autre). Une ligne inconnue ne change rien. */
export function retirerRegleMarque(texte: string | null | undefined, ligne: number): string {
  const lignes = (texte ?? '').split('\n');
  if (ligne < 0 || ligne >= lignes.length) return texte ?? '';
  lignes.splice(ligne, 1);
  return lignes.join('\n').replace(/^\n+|\s+$/g, '');
}
