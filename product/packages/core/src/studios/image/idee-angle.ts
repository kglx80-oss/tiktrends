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
 *    numéro, une adresse web ou un pseudonyme (le segment qui en contenait part
 *    en entier) · ce sont des archétypes, pas des personnes. Un persona
 *    « proposé » est lu (il a été choisi au brief, qui ne bloque pas sur la
 *    validation) ; rejeté ou archivé, non ;
 *  · `choisirDirection` · la direction artistique NOMMÉE par l'intention de
 *    style, parmi celles qui EXISTENT (`AD_DIRECTIONS`, recettes
 *    `styleRecipes` du pack) · libellé complet d'au moins deux mots, ou
 *    « direction <libellé ou clé> » ; un mot courant seul (« main »,
 *    « preuve »), une négation (« pas de », « sans »), une égalité ou une
 *    absence rendent `null` (en cas de doute, le silence) ;
 *  · `lignesIdee` · les lignes ajoutées au résumé du brief ; VIDE quand le
 *    brief n'a ni angle, ni concept, ni persona, ni direction reconnue · le
 *    contexte reste alors celui d'avant, au caractère près ;
 *  · `controlerVarieteLot` · un lot de N angles n'a le droit de partir que si
 *    ses N consignes montrent N scènes différentes. RÈGLE PRÊTE, PAS ENCORE
 *    RACCORDÉE à un chemin payant · les lots d'aujourd'hui sont mono-projet
 *    (même consigne, ou formats dérivés), aucun lancement multi-angles
 *    n'existe. Doublons EXACTS seulement (clé de scène normalisée) · un seuil
 *    de similarité reste à MESURER avant d'en poser un.
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

const COURRIEL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const ADRESSE_WEB = /\b(?:https?:\/\/|www\.)\S+/i;
/** Neuf chiffres au moins (un numéro français en a dix) · une date « 12.03.1985 » en a huit. */
const TELEPHONE = /\+?\d(?:[ .-]?\d){8,}/;
const PSEUDO = /(?:^|\s)@[\w.]{2,}/;
const COORDONNEES = [COURRIEL, ADRESSE_WEB, TELEPHONE, PSEUDO];
/** Les séparateurs de segment · « · », virgule, point-virgule, fin de phrase (un point entre deux chiffres n'en est pas une). */
const SEPARATEUR = /(\s*[·,;]\s*|(?<=[.!?])\s+)/;

/**
 * Un trait de persona, sûr pour le contexte · une seule ligne (un retour à la
 * ligne ne peut pas imiter un autre champ du brief), borné. Un segment (entre
 * « · », virgules, points-virgules ou phrases) qui contenait une coordonnée
 * part EN ENTIER · ni « joignable à », ni « tel , » ne reste derrière.
 */
export function traitSur(x: unknown, max: number): string {
  if (typeof x !== 'string') return '';
  const morceaux = x.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().split(SEPARATEUR);
  let t = '';
  for (let i = 0; i < morceaux.length; i += 2) {
    const seg = morceaux[i]!.trim();
    if (!seg || COORDONNEES.some((r) => r.test(seg))) continue;
    if (!t) { t = seg; continue; }
    const avant = morceaux[i - 1]!.trim();
    // Une fin de phrase portée par un segment retiré se remet en place.
    t += avant === '·' ? ` · ${seg}` : avant ? `${avant} ${seg}` : `${/[.!?]$/.test(t) ? '' : '.'} ${seg}`;
  }
  t = t.replace(/\s*[·,;]\s*$/, '').trim();
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
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter((m) => m && !VIDES.has(m));
}

/** Ce qui annonce un refus dans la même proposition · « pas de », « sans », « surtout pas »… */
const NEGATIONS = new Set(['pas', 'sans', 'jamais', 'aucun', 'aucune', 'ni', 'non', 'hors', 'eviter', 'evite', 'evitez']);
/** Une proposition finit sur une ponctuation ou sur « mais ». */
const PROPOSITION = /[,;:.!?·\n]|\bmais\b/i;

/**
 * Les formes qui NOMMENT une direction :
 *  · son libellé complet, s'il compte au moins deux mots distinctifs (« Nuit
 *    cinématique », « Vue du dessus ») ;
 *  · « direction <libellé> » ou « direction <clé> » (avec ou sans
 *    « artistique ») · seule forme admise pour les libellés d'un mot
 *    (« Témoignage », « En main ») et pour les clés, dont plusieurs sont des
 *    mots courants (`main`, `preuve`, `affiche`, `studio`, `promo`…).
 */
interface Candidat { formes: string[][]; d: DirectionChoisie }

function explicites(...noms: string[][]): string[][] {
  return noms.filter((n) => n.length).flatMap((n) => [['direction', ...n], ['direction', 'artistique', ...n]]);
}

function candidats(recettes: readonly RecetteStyleLue[]): Candidat[] {
  return [
    ...AD_DIRECTIONS.map((d) => {
      const l = mots(d.label);
      return {
        formes: [...(l.length >= 2 ? [l] : []), ...explicites(l, [d.key])],
        d: { origine: 'direction' as const, cle: d.key, libelle: d.label, lumiere: d.lumiere, finition: d.finition },
      };
    }),
    ...recettes.map((r) => {
      const l = mots(r.title);
      return {
        formes: [...(l.length >= 2 ? [l] : []), ...explicites(l, mots(r.id))],
        d: { origine: 'recette' as const, cle: r.id, libelle: r.title, matiere: r.material, lumiere: r.lighting },
      };
    }),
  ];
}

/** La forme apparaît-elle d'un seul tenant, sans négation avant elle dans la proposition ? */
function nommee(proposition: readonly string[], forme: readonly string[]): boolean {
  for (let i = 0; i + forme.length <= proposition.length; i++) {
    if (forme.every((m, j) => proposition[i + j] === m)) return !proposition.slice(0, i).some((m) => NEGATIONS.has(m));
  }
  return false;
}

/**
 * La direction que l'intention de style NOMME (voir les formes ci-dessus).
 * Une direction refusée dans sa proposition (« pas de », « sans »…) ne compte
 * pas. Plusieurs nommées : la forme la plus longue l'emporte ; à égalité,
 * aucune. En cas de doute : `null` · rien n'est deviné, rien n'est inventé.
 */
export function choisirDirection(styleIntent: string, recettes: readonly RecetteStyleLue[] = []): DirectionChoisie | null {
  const propositions = styleIntent.split(PROPOSITION).map(mots).filter((p) => p.length);
  if (!propositions.length) return null;
  let meilleur: { n: number; d: DirectionChoisie | null } = { n: 0, d: null };
  for (const c of candidats(recettes)) {
    const n = Math.max(0, ...c.formes.filter((f) => propositions.some((p) => nommee(p, f))).map((f) => f.length));
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
 * La scène d'une consigne · la phrase « Scène : … » que le gabarit 1.1.0
 * impose en tête. Une consigne compilée sous 1.0.0 n'en a pas · `''` (elle
 * n'est pas comparée, voir `controlerVarieteLot`). La scène finit au premier
 * point, point d'exclamation ou d'interrogation · un point entre deux chiffres
 * (« 10.5 cl ») n'en est pas un.
 */
export function sceneDeConsigne(instruction: string): string {
  const t = instruction.replace(/\s+/g, ' ').trim();
  const m = /(?:^|[.!?]\s)Sc[eè]ne\s*:\s*((?:[^.!?]|(?<=\d)\.(?=\d))*)/i.exec(t);
  return m ? m[1]!.trim() : '';
}

/**
 * La clé de comparaison d'une scène · mots sans accents ni casse, mots vides
 * retirés, dédoublonnés et triés · « Salle de bain, flacon sur le lavabo » et
 * « flacon sur lavabo · salle de bain » sont la même scène. Doublons EXACTS de
 * cette clé seulement · un seuil de similarité reste à mesurer.
 */
export function cleScene(scene: string): string {
  return [...new Set(mots(scene).filter((m) => !['sur', 'dans', 'avec', 'sous', 'pour', 'par'].includes(m)))].sort().join(' ');
}

export interface DoublonScene { ids: [string, string]; angles: [string, string]; scene: string }

export type VerdictVarieteLot =
  | { ok: true; scenes: string[]; avertissements: string[] }
  | { ok: false; doublons: DoublonScene[]; aRegenerer: string[]; raison: string; avertissements: string[] };

/**
 * Le lot ne passe que si chaque consigne comparable montre une scène À ELLE ·
 * deux consignes de même scène le refusent, avec la raison et la consigne à
 * régénérer (la seconde de chaque paire · un appel texte, sous la barrière de
 * dépense existante). Rien n'est généré par cette règle.
 *
 * Ne refuse PAS · le même angle deux fois (une itération garde son angle et
 * change de scène · avertissement) ; une consigne sans « Scène : » (gabarit
 * 1.0.0 · ignorée du contrôle, et c'est dit).
 */
export function controlerVarieteLot(lot: readonly ConsigneDuLot[]): VerdictVarieteLot {
  const doublons: DoublonScene[] = [];
  const raisons: string[] = [];
  const avertissements: string[] = [];
  const parScene = new Map<string, ConsigneDuLot>();
  const parAngle = new Map<string, ConsigneDuLot>();
  const aRegenerer = new Set<string>();
  const nom = (c: ConsigneDuLot) => (c.angle.trim() ? `« ${c.angle.trim()} »` : `la consigne n° ${lot.indexOf(c) + 1}`);
  const scenes = lot.map((c) => sceneDeConsigne(c.generationInstruction));
  lot.forEach((c, i) => {
    const scene = scenes[i]!;
    const cle = cleScene(scene);
    if (!cle) {
      avertissements.push(`la consigne de ${nom(c)} a été compilée sans « ${PREFIXE_SCENE} » (gabarit 1.0.0) · ignorée du contrôle, recompile-la pour qu’elle compte`);
      return;
    }
    const cleAngle = cleScene(c.angle);
    const deja = parScene.get(cle);
    if (cleAngle) {
      // Même angle, autre scène · une itération, dite. Même angle, même scène · le refus ci-dessous suffit.
      if (parAngle.has(cleAngle)) { if (!deja) avertissements.push(`${nom(c)} figure deux fois dans le lot, avec deux scènes différentes`); }
      else parAngle.set(cleAngle, c);
    }
    if (deja) {
      doublons.push({ ids: [deja.id, c.id], angles: [deja.angle, c.angle], scene });
      aRegenerer.add(c.id);
      raisons.push(`les consignes de ${nom(deja)} et de ${nom(c)} montrent la même scène (« ${scene} »)`);
    } else parScene.set(cle, c);
  });
  if (!raisons.length) return { ok: true, scenes, avertissements };
  const qui = lot.filter((c) => aRegenerer.has(c.id)).map(nom).join(', ');
  return {
    ok: false, doublons, aRegenerer: [...aRegenerer], avertissements,
    raison: `Lot refusé · ${raisons.join(' ; ')}. Régénère la consigne de ${qui} (un appel texte, sous la barrière de dépense) avant de lancer le lot.${avertissements.length ? ` À noter · ${avertissements.join(' ; ')}.` : ''} Rien n’a été généré.`,
  };
}
