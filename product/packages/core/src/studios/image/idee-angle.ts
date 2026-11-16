/**
 * Studios · l'IDÉE VISUELLE d'un angle · ce que la compilation de la consigne
 * image (`image.compile`) reçoit en plus du brief, et la règle qui refuse un
 * lot d'angles dont deux consignes montrent la même scène.
 *
 * Pur · ni base, ni réseau, ni modèle.
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * Le résumé du brief envoyé à `image.compile` (`resumeBrief`) ne portait ni
 * l'angle, ni le concept, ni le persona du brief V5. Le modèle compilait donc
 * la même scène générique pour la peur, la preuve et l'ennemi commun. La
 * référence regardée (planche de 16 créas d'un même produit) montre l'inverse ·
 * une métaphore visuelle forte par angle (bonde pleine de cheveux pour la peur,
 * rayon de supermarché pour l'ennemi commun, mètre ruban pour la preuve).
 *
 * ── Ce que ce module décide ──────────────────────────────────────────────────
 *
 *  · `resumerPersona` · le persona RELU (résolu par le serveur dans la portée
 *    de la marque), réduit à quatre traits bornés · qui, frustration, désir,
 *    contexte. Jamais ses sources (avis, entretiens), jamais un courriel, un
 *    numéro, une adresse web ou un pseudonyme · ce sont des archétypes, pas des
 *    personnes ;
 *  · `choisirDirection` · la direction artistique la plus juste parmi celles
 *    qui EXISTENT (`AD_DIRECTIONS`, recettes `styleRecipes` du pack), lue dans
 *    l'intention de style du brief · aucune n'est inventée, une égalité ou une
 *    absence rend `null` (le silence est une conclusion valable) ;
 *  · `lignesIdee` · les lignes ajoutées au résumé du brief ; VIDE quand le
 *    brief n'a ni angle, ni concept, ni persona, ni direction reconnue · le
 *    contexte reste alors celui d'avant, au caractère près ;
 *  · `controlerVarieteLot` · un lot de N angles n'a le droit de partir que si
 *    ses N consignes montrent N scènes différentes.
 */

import { AD_DIRECTIONS } from '../../ad-directions';

/* ─────────────────────────────── Persona ─────────────────────────────────── */

/** La ligne `personas` telle que le serveur la lit · ses `sources` n'y entrent jamais. */
export interface PersonaLu {
  name: string;
  segment?: string | null;
  description?: string | null;
  pains?: readonly string[] | null;
  desires?: readonly string[] | null;
}

export interface PersonaResume { qui: string; frustration: string; desir: string; contexte: string }

/** Bornes du résumé, en caractères · un persona éclaire la scène, il ne la remplit pas. */
export const BORNES_PERSONA = { qui: 80, frustration: 160, desir: 160, contexte: 240 } as const;

const COURRIEL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const ADRESSE_WEB = /\b(?:https?:\/\/|www\.)\S+/gi;
const TELEPHONE = /\+?\d[\d .-]{7,}\d/g;
const PSEUDO = /(^|\s)@[\w.]{2,}/g;

/**
 * Un trait de persona, sûr pour le contexte · une seule ligne (un retour à la
 * ligne ne peut pas imiter un autre champ du brief), sans coordonnée, borné.
 */
export function traitSur(x: unknown, max: number): string {
  if (typeof x !== 'string') return '';
  const t = x
    .replace(COURRIEL, ' ').replace(ADRESSE_WEB, ' ').replace(TELEPHONE, ' ').replace(PSEUDO, '$1')
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if ([...t].length <= max) return t;
  return `${[...t].slice(0, max - 1).join('').trimEnd()}…`;
}

const premier = (l: readonly string[] | null | undefined, max: number) => traitSur((l ?? []).find((x) => typeof x === 'string' && x.trim()) ?? '', max);

/** Le persona réduit à ses quatre traits · `null` s'il n'en reste aucun. */
export function resumerPersona(p: PersonaLu | null | undefined): PersonaResume | null {
  if (!p) return null;
  const r: PersonaResume = {
    qui: traitSur(p.name, BORNES_PERSONA.qui),
    frustration: premier(p.pains, BORNES_PERSONA.frustration),
    desir: premier(p.desires, BORNES_PERSONA.desir),
    contexte: traitSur([p.segment, p.description].filter((x) => typeof x === 'string' && x.trim()).join(' · '), BORNES_PERSONA.contexte),
  };
  return r.qui || r.frustration || r.desir || r.contexte ? r : null;
}

export function lignePersona(r: PersonaResume): string {
  return `Persona : ${[
    r.qui && `qui · ${r.qui}`, r.frustration && `frustration · ${r.frustration}`,
    r.desir && `désir · ${r.desir}`, r.contexte && `contexte · ${r.contexte}`,
  ].filter(Boolean).join(' ; ')}`;
}

/* ───────────────────────── Direction artistique ──────────────────────────── */

/** Une recette `styleRecipes` du pack, lue par le serveur (ses champs descriptifs). */
export interface RecetteStyleLue { id: string; title: string; material: string; lighting: string }

/**
 * La direction retenue · sa clé, son libellé, et les SEULS attributs qui
 * passent dans l'intention de style · lumière et finition (ou matière). Jamais
 * sa scène (la scène vient de l'angle, sinon toutes les créas d'un lot auraient
 * la même), ni sa typographie ou sa disposition (le texte est posé par des
 * calques, jamais dans les pixels).
 */
export type DirectionChoisie =
  | { origine: 'direction'; cle: string; libelle: string; lumiere: string; finition: string }
  | { origine: 'recette'; cle: string; libelle: string; matiere: string; lumiere: string };

/** Mots qui ne distinguent rien · ils ne comptent ni pour, ni contre. */
const VIDES = new Set(['a', 'au', 'aux', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'un', 'une']);

export function mots(t: string): string[] {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter((m) => m && !VIDES.has(m));
}

interface Candidat { mots: string[][]; d: DirectionChoisie }

function candidats(recettes: readonly RecetteStyleLue[]): Candidat[] {
  return [
    ...AD_DIRECTIONS.map((d) => ({
      // Le libellé (tous ses mots) OU la clé, consignée dans les recettes produites.
      mots: [mots(d.label), [d.key]],
      d: { origine: 'direction' as const, cle: d.key, libelle: d.label, lumiere: d.lumiere, finition: d.finition },
    })),
    ...recettes.map((r) => ({
      mots: [mots(r.title)],
      d: { origine: 'recette' as const, cle: r.id, libelle: r.title, matiere: r.material, lumiere: r.lighting },
    })),
  ];
}

/**
 * La direction que l'intention de style NOMME · une direction est nommée quand
 * TOUS les mots de son libellé (ou sa clé) y figurent. Plusieurs nommées : la
 * plus précise (le plus de mots) l'emporte ; à égalité, aucune (on ne devine
 * pas). Aucune nommée : `null`, rien n'est inventé.
 */
export function choisirDirection(styleIntent: string, recettes: readonly RecetteStyleLue[] = []): DirectionChoisie | null {
  const presents = new Set(mots(styleIntent));
  if (!presents.size) return null;
  let meilleur: { n: number; d: DirectionChoisie | null } = { n: 0, d: null };
  for (const c of candidats(recettes)) {
    const n = Math.max(0, ...c.mots.filter((m) => m.length && m.every((x) => presents.has(x))).map((m) => m.length));
    if (n === 0) continue;
    if (n > meilleur.n) meilleur = { n, d: c.d };
    else if (n === meilleur.n && meilleur.d?.cle !== c.d.cle) meilleur = { n, d: null };
  }
  return meilleur.d;
}

export function ligneDirection(d: DirectionChoisie): string {
  const attributs = d.origine === 'direction'
    ? `lumière · ${d.lumiere} ; finition · ${d.finition}`
    : `matière · ${d.matiere} ; lumière · ${d.lumiere}`;
  return `Direction artistique : ${d.libelle} (${d.cle}) · ${attributs}`;
}

/* ─────────────────────────── Lignes du résumé ────────────────────────────── */

/** Ce que le serveur a relu pour une compilation · persona résolu dans la portée, direction reconnue. */
export interface IdeeBrief { persona: PersonaResume | null; direction: DirectionChoisie | null }

/** Ce que le brief V5 porte de l'idée · le texte libre d'abord, sinon le libellé de la référence. */
export interface ChampsIdeeBrief {
  angle?: string;
  angleRef?: { label?: string };
  concept?: string;
  conceptRef?: { label?: string };
}

const texteOuLibelle = (t: unknown, r: { label?: unknown } | undefined) =>
  traitSur(typeof t === 'string' && t.trim() ? t : typeof r?.label === 'string' ? r.label : '', 2000);

/**
 * Les lignes ajoutées au résumé du brief, rangées par position · `apresAudience`
 * (angle, concept, persona) et `apresStyle` (direction artistique). Chacune est
 * absente quand sa valeur l'est.
 */
export function lignesIdee(b: ChampsIdeeBrief, idee: IdeeBrief): { apresAudience: string[]; apresStyle: string[] } {
  const angle = texteOuLibelle(b.angle, b.angleRef);
  const concept = texteOuLibelle(b.concept, b.conceptRef);
  return {
    apresAudience: [
      angle && `Angle : ${angle}`,
      concept && `Concept : ${concept}`,
      idee.persona ? lignePersona(idee.persona) : '',
    ].filter(Boolean),
    apresStyle: idee.direction ? [ligneDirection(idee.direction)] : [],
  };
}

/* ───────────────────────── Variété d'un lot d'angles ─────────────────────── */

/** Une consigne compilée d'un lot · son projet, son angle, son instruction. */
export interface ConsigneDuLot { id: string; angle: string; generationInstruction: string }

/** Le préfixe que le gabarit `image.compile` (1.1.0) impose en tête de l'instruction. */
export const PREFIXE_SCENE = 'Scène :';

/**
 * La scène d'une consigne · la phrase « Scène : … » que le gabarit impose en
 * tête ; à défaut (consigne d'avant 1.1.0), la première phrase.
 */
export function sceneDeConsigne(instruction: string): string {
  const t = instruction.replace(/\s+/g, ' ').trim();
  const m = /(?:^|[.!?]\s)Sc[eè]ne\s*:\s*([^.!?]*)/i.exec(t);
  const brut = m ? m[1]! : (/^[^.!?]*/.exec(t)?.[0] ?? '');
  return brut.trim();
}

/**
 * La clé de comparaison d'une scène · mots sans accents ni casse, mots vides
 * retirés, dédoublonnés et triés · « Salle de bain, flacon sur le lavabo » et
 * « flacon sur lavabo · salle de bain » sont la même scène.
 */
export function cleScene(scene: string): string {
  return [...new Set(mots(scene).filter((m) => !['sur', 'dans', 'avec', 'sous', 'pour', 'par'].includes(m)))].sort().join(' ');
}

export interface DoublonScene { ids: [string, string]; angles: [string, string]; scene: string }

export type VerdictVarieteLot =
  | { ok: true; scenes: string[] }
  | { ok: false; doublons: DoublonScene[]; aRegenerer: string[]; raison: string };

/**
 * Le lot ne part que si chaque consigne montre une scène À ELLE · deux
 * consignes de même scène (ou un même angle deux fois, ou une consigne sans
 * scène lisible) le refusent AVANT tout appel payant, avec la raison et la
 * consigne à régénérer (la seconde de chaque paire · un appel texte, sous la
 * barrière de dépense existante). Rien n'est généré par cette règle.
 */
export function controlerVarieteLot(lot: readonly ConsigneDuLot[]): VerdictVarieteLot {
  const doublons: DoublonScene[] = [];
  const raisons: string[] = [];
  const parScene = new Map<string, ConsigneDuLot>();
  const parAngle = new Map<string, ConsigneDuLot>();
  const aRegenerer = new Set<string>();
  for (const c of lot) {
    const scene = sceneDeConsigne(c.generationInstruction);
    const cle = cleScene(scene);
    if (!cle) {
      aRegenerer.add(c.id);
      raisons.push(`la consigne de « ${c.angle} » ne nomme aucune scène`);
      continue;
    }
    const memeAngle = parAngle.get(cleScene(c.angle));
    if (memeAngle && cleScene(c.angle)) raisons.push(`« ${c.angle} » figure deux fois dans le lot`);
    else if (cleScene(c.angle)) parAngle.set(cleScene(c.angle), c);
    const deja = parScene.get(cle);
    if (deja) {
      doublons.push({ ids: [deja.id, c.id], angles: [deja.angle, c.angle], scene });
      aRegenerer.add(c.id);
      raisons.push(`les consignes de « ${deja.angle} » et de « ${c.angle} » montrent la même scène (« ${scene} »)`);
    } else parScene.set(cle, c);
  }
  if (!raisons.length) return { ok: true, scenes: lot.map((c) => sceneDeConsigne(c.generationInstruction)) };
  const ids = [...aRegenerer];
  const qui = lot.filter((c) => aRegenerer.has(c.id)).map((c) => `« ${c.angle} »`).join(', ');
  return {
    ok: false, doublons, aRegenerer: ids,
    raison: `Lot refusé avant tout appel payant · ${raisons.join(' ; ')}.${qui ? ` Régénère la consigne de ${qui} (un appel texte, sous la barrière de dépense) avant de lancer le lot.` : ''} Rien n’a été généré.`,
  };
}
