/**
 * Studios · L6-B · contradictions entre une fiche d'identité et le texte des
 * plans qui la citent (cahier 01 §4.6 : « Si le texte d'un plan reste jaune,
 * le serveur bloque avant exécution » ; recette VIDEO-02).
 *
 * Pur et DÉTERMINISTE · aucun modèle. Le prompt `quality.consistency` du pack
 * le dit lui-même : un contrôle IA « complète les règles déterministes ; il
 * ne les remplace pas et n'autorise pas l'exécution ». La règle bloquante est
 * donc celle-ci.
 *
 * ── Ce qui est lu ─────────────────────────────────────────────────────────────
 *
 * Pour chaque plan qui CITE l'identité (`referenceIds`), les champs texte qui
 * décrivent ce qu'on voit ou entend : fonction, sujet, action, cadrage,
 * caméra, décor, narration. Pas la lumière (« une lumière jaune sur la veste »
 * ne recolore pas la veste) ni le texte écran (calque de composition, pas le
 * personnage).
 *
 * Une COULEUR est rattachée à un élément de la fiche (« veste », ou le nom
 * générique de sa catégorie : « tenue », « cheveux ») si elle le suit dans la
 * même proposition, à `FENETRE_COULEUR` mots au plus, sans qu'un mot de
 * liaison (et, avec, devant, sous, à…) ouvre un autre groupe entre les deux.
 * La première couleur rencontrée tranche : la couleur attendue ⇒ cohérent ;
 * une autre ⇒ contradiction. Une ABSENCE (« sans ses lunettes ») contredit un
 * accessoire ou une pièce de tenue.
 *
 * Deux identités dans le même plan : une couleur qui est celle du même élément
 * d'une AUTRE identité citée n'est pas une contradiction (« Tom en veste rouge,
 * Léa en veste verte » ne bloque ni l'un ni l'autre). Le silence vaut mieux
 * qu'un faux blocage.
 *
 * ── Fenêtre, mesurée ──────────────────────────────────────────────────────────
 *
 * Corpus `l6b-identites.test.ts` (« FENETRE · corpus mesuré »), 10 phrases
 * contradictoires et 10 phrases cohérentes écrites à la main :
 *
 * | fenêtre | contradictions vues (sur 10) | faux blocages (sur 10) |
 * |---------|------------------------------|------------------------|
 * | 1       | 5                            | 0                      |
 * | 2       | 7                            | 0                      |
 * | 3       | 10                           | 0                      |
 * | 4       | 10                           | 1                      |
 * | 5       | 10                           | 2                      |
 *
 * 3 est le plus petit rang qui voit tout le corpus sans faux blocage ; la
 * table est recalculée par le test, qui échoue si elle ne tient plus.
 *
 * ── Résolutions ───────────────────────────────────────────────────────────────
 *
 * Chaque contradiction propose deux résolutions explicites, jamais appliquées
 * seules : corriger le PLAN (le mot fautif remplacé par la couleur de la fiche,
 * accordée) ou changer la FICHE (nouvelle version ; les autres plans qui la
 * citent sont nommés, et ceux que ce changement contredirait à leur tour sont
 * comptés). Le serveur recalcule tout sur la version courante avant d'écrire.
 */

import type { ContenuVersion, PlanStudio } from '../document';
import type { ChangementPatch } from '../patch';
import { accorder, decouper, lireCouleur, radical, type Jeton } from './lexique';
import {
  lireIdentites, teteElement, libelleAttribut, cheminFiche, LIBELLES_CATEGORIE,
  type AttributIdentite, type IdentiteLue, type IdentiteStudio,
} from './identite';

export const FENETRE_COULEUR = 3;

/** Champs du plan relus · l'ordre est celui de l'affichage. */
export const CHAMPS_CONTROLES = ['purpose', 'subject', 'action', 'framing', 'camera', 'environment', 'narration'] as const;
export type ChampControle = (typeof CHAMPS_CONTROLES)[number];
export const LIBELLES_CHAMP: Readonly<Record<ChampControle, string>> = {
  purpose: 'fonction', subject: 'sujet', action: 'action', framing: 'cadrage', camera: 'caméra', environment: 'décor', narration: 'narration',
};

/** Mots qui ouvrent un autre groupe · la couleur qui suit ne qualifie plus l'élément. */
const LIAISONS = new Set([
  'et', 'ou', 'mais', 'puis', 'avec', 'sans', 'devant', 'derriere', 'sous', 'sur', 'dans', 'pres', 'contre', 'a', 'au', 'aux',
  'vers', 'chez', 'entre', 'par', 'pour', 'pendant', 'tandis', 'qui', 'que', 'dont', 'face',
]);
const RETRAITS = new Set(['sans']);
const DETERMINANTS = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'sa', 'son', 'ses', 'leur', 'leurs']);
/** Noms génériques d'une catégorie · « en tenue jaune » vise toute la tenue. */
const GENERIQUES: Readonly<Record<string, readonly string[]>> = {
  tenue: ['tenue', 'vetement', 'habit'],
  cheveux: ['cheveu', 'chevelure', 'coiffure'],
  accessoire: [],
  trait: [],
};

export type NatureContradiction = 'couleur' | 'absence';

export interface ResolutionPlan {
  type: 'plan';
  libelle: string;
  chemin: string;
  avant: string;
  apres: string;
}
export interface ResolutionIdentite {
  type: 'identite';
  libelle: string;
  chemin: string;
  /** Plans qui citent l'identité · leurs images et clips seront à refaire. */
  plansTouches: string[];
  /** Contradictions qui RESTERAIENT ou NAÎTRAIENT dans le projet après ce choix. */
  contradictionsApres: number;
}

export interface Contradiction {
  /** Stable pour une version donnée · `<plan>|<identité>|<attribut>|<champ>|<début>`. */
  id: string;
  nature: NatureContradiction;
  shotId: string;
  identityId: string;
  nomIdentite: string;
  attributId: string;
  categorie: AttributIdentite['categorie'];
  champ: ChampControle;
  /** Le passage fautif tel qu'écrit dans le plan (« veste jaune », « sans ses lunettes »). */
  extrait: string;
  /** Ce que dit la fiche (« veste verte »). */
  attendu: string;
  message: string;
  resolutions: Array<ResolutionPlan | ResolutionIdentite>;
}

interface Constat {
  shotId: string;
  nature: NatureContradiction;
  identite: IdentiteLue;
  attribut: AttributIdentite;
  champ: ChampControle;
  jetonFautif: Jeton;
  debutExtrait: number;
  finExtrait: number;
}

const elementCorrespond = (j: Jeton, a: AttributIdentite): boolean => {
  const r = radical(j.brut);
  return r === radical(teteElement(a.element)) || (GENERIQUES[a.categorie] ?? []).includes(r);
};

/** Couleur attendue de cet élément chez une AUTRE identité citée par le plan · ambiguïté ⇒ silence. */
function couleurDUneAutre(autres: readonly IdentiteLue[], j: Jeton, canon: string): boolean {
  return autres.some((i) => i.attributs.some((a) => a.couleur && elementCorrespond(j, a) && lireCouleur(a.couleur)?.canon === canon));
}

function constatsDuTexte(shotId: string, texte: string, champ: ChampControle, identite: IdentiteLue, autres: readonly IdentiteLue[], fenetre: number): Constat[] {
  const jetons = decouper(texte);
  const out: Constat[] = [];
  for (const attribut of identite.attributs) {
    const attendue = attribut.couleur ? lireCouleur(attribut.couleur) : null;
    jetons.forEach((j, i) => {
      if (!elementCorrespond(j, attribut)) return;
      // Absence · « sans (ses) lunettes ».
      if (attribut.categorie === 'accessoire' || attribut.categorie === 'tenue') {
        let k = i - 1;
        while (k >= 0 && DETERMINANTS.has(jetons[k]!.norme) && jetons[k]!.clause === j.clause && i - k <= 2) k -= 1;
        const avant = jetons[k];
        if (avant && avant.clause === j.clause && RETRAITS.has(avant.norme) && i - k <= 3) {
          out.push({ shotId, nature: 'absence', identite, attribut, champ, jetonFautif: avant, debutExtrait: avant.debut, finExtrait: j.fin });
          return;
        }
      }
      if (!attendue) return;
      for (let d = 1; d <= fenetre; d++) {
        const t = jetons[i + d];
        if (!t || t.clause !== j.clause || LIAISONS.has(t.norme)) break;
        const c = lireCouleur(t.brut);
        if (!c) continue;
        if (c.canon !== attendue.canon && !couleurDUneAutre(autres, j, c.canon)) {
          out.push({ shotId, nature: 'couleur', identite, attribut, champ, jetonFautif: t, debutExtrait: j.debut, finExtrait: t.fin });
        }
        break;
      }
    });
  }
  return out;
}

/** Tous les constats bruts d'un contenu (sans résolutions) · `fenetre` n'est réglable que pour la mesure. */
export type ConstatContradiction = Constat;

export function constatsContradictions(c: ContenuVersion, fenetre = FENETRE_COULEUR): Constat[] {
  const identites = lireIdentites(c);
  const out: Constat[] = [];
  for (const sid of c.shots.order) {
    const p = c.shots.byId[sid];
    if (!p) continue;
    const citees = identites.filter((i) => p.referenceIds.includes(i.identityId));
    for (const identite of citees) {
      const autres = citees.filter((x) => x !== identite);
      for (const champ of CHAMPS_CONTROLES) {
        const texte = p[champ];
        if (typeof texte !== 'string' || !texte) continue;
        out.push(...constatsDuTexte(sid, texte, champ, identite, autres, fenetre));
      }
    }
  }
  // Un même passage n'est signalé qu'une fois par identité (deux attributs de tenue sur « tenue jaune »).
  const vus = new Set<string>();
  return out.filter((k) => {
    const cle = `${k.shotId}|${k.identite.identityId}|${k.champ}|${k.debutExtrait}`;
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
}

const idDe = (k: Constat) => `${k.shotId}|${k.identite.identityId}|${k.attribut.id}|${k.champ}|${k.debutExtrait}`;

/** Le texte du plan corrigé · le mot fautif remplacé (couleur accordée) ou « sans » → « avec ». */
function texteCorrige(texte: string, k: Constat): string {
  const t = k.jetonFautif;
  if (k.nature === 'absence') return `${texte.slice(0, t.debut)}${t.brut[0] === 'S' ? 'Avec' : 'avec'}${texte.slice(t.fin)}`;
  const trouvee = lireCouleur(t.brut)!;
  const fiche = lireCouleur(k.attribut.couleur!)!;
  const forme = accorder(fiche.canon, fiche.genre ?? trouvee.genre, trouvee.nombre ?? fiche.nombre);
  const casse = t.brut[0] === t.brut[0]!.toUpperCase() ? forme[0]!.toUpperCase() + forme.slice(1) : forme;
  return `${texte.slice(0, t.debut)}${casse}${texte.slice(t.fin)}`;
}

/** La fiche après le choix « changer l'identité » · `null` pour une fiche ancienne (non structurée). */
function ficheApres(k: Constat): IdentiteStudio | null {
  const f = k.identite.fiche;
  if (!f) return null;
  const attributs = k.nature === 'absence'
    ? f.attributs.filter((a) => a.id !== k.attribut.id)
    : f.attributs.map((a) => {
      if (a.id !== k.attribut.id) return a;
      const trouvee = lireCouleur(k.jetonFautif.brut)!;
      const fiche = lireCouleur(a.couleur!)!;
      return { ...a, couleur: accorder(trouvee.canon, fiche.genre ?? trouvee.genre, fiche.nombre ?? 's') };
    });
  return { ...f, attributs, version: f.version + 1 };
}

function avecPlan(c: ContenuVersion, sid: string, champ: ChampControle, texte: string): ContenuVersion {
  const p = c.shots.byId[sid]!;
  return { ...c, shots: { ...c.shots, byId: { ...c.shots.byId, [sid]: { ...p, [champ]: texte } as PlanStudio } } };
}
function avecFiche(c: ContenuVersion, f: IdentiteStudio): ContenuVersion {
  return { ...c, characterRefs: { ...c.characterRefs, [f.identityId]: f as unknown as Record<string, unknown> } };
}

const echapper = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
const cheminChamp = (sid: string, champ: ChampControle) => `/shots/byId/${echapper(sid)}/${champ}`;

/** Contradictions d'un contenu, chacune avec ses deux résolutions explicites. */
export function detecterContradictions(c: ContenuVersion): Contradiction[] {
  const constats = constatsContradictions(c);
  return constats.map((k): Contradiction => {
    const sid = k.shotId;
    const p = c.shots.byId[sid]!;
    const texte = p[k.champ];
    const extrait = texte.slice(k.debutExtrait, k.finExtrait);
    const attendu = libelleAttribut(k.attribut);
    const corrige = texteCorrige(texte, k);
    const resolutions: Contradiction['resolutions'] = [{
      type: 'plan',
      libelle: `Corriger le plan · « ${extrait} » devient « ${corrige.slice(k.debutExtrait, k.finExtrait + (corrige.length - texte.length))} »`,
      chemin: cheminChamp(sid, k.champ), avant: texte, apres: corrige,
    }];
    const f = ficheApres(k);
    if (f) {
      const apres = avecFiche(c, f);
      resolutions.push({
        type: 'identite',
        libelle: k.nature === 'absence'
          ? `Changer la fiche · ${k.identite.nom} n’a plus « ${attendu} » (version ${f.version})`
          : `Changer la fiche · ${LIBELLES_CATEGORIE[k.attribut.categorie].toLowerCase()} de ${k.identite.nom} : « ${libelleAttribut(f.attributs.find((a) => a.id === k.attribut.id)!)} » (version ${f.version})`,
        chemin: cheminFiche(k.identite.identityId),
        plansTouches: k.identite.plans,
        contradictionsApres: constatsContradictions(apres).length,
      });
    }
    return {
      id: idDe(k), nature: k.nature, shotId: sid, identityId: k.identite.identityId, nomIdentite: k.identite.nom,
      attributId: k.attribut.id, categorie: k.attribut.categorie, champ: k.champ, extrait, attendu,
      message: k.nature === 'absence'
        ? `Plan ${sid} (${LIBELLES_CHAMP[k.champ]}) : « ${extrait} » contredit la fiche de ${k.identite.nom}, qui porte « ${attendu} ».`
        : `Plan ${sid} (${LIBELLES_CHAMP[k.champ]}) : « ${extrait} » contredit la fiche de ${k.identite.nom} (${LIBELLES_CATEGORIE[k.attribut.categorie].toLowerCase()} : ${attendu}).`,
      resolutions,
    };
  });
}

export type ChoixResolution = 'plan' | 'identite';

/**
 * Les changements d'UNE résolution, recalculés sur le contenu donné (la
 * version courante, côté serveur) · jamais pris du client. Une contradiction
 * qui n'existe plus dans ce contenu ⇒ refus (la page était périmée).
 */
export function changementsResolution(c: ContenuVersion, contradictionId: string, choix: ChoixResolution):
  { ok: true; changes: ChangementPatch[]; allowedPaths: string[]; raison: string } | { ok: false; raison: string } {
  const k = detecterContradictions(c).find((x) => x.id === contradictionId);
  if (!k) return { ok: false, raison: 'cette contradiction n’existe plus dans la version courante · recharge la page' };
  const r = k.resolutions.find((x) => x.type === choix);
  if (!r) return { ok: false, raison: 'la fiche de ce personnage est d’une ancienne forme · corrige le plan, ou recrée la fiche' };
  if (r.type === 'plan') {
    return { ok: true, changes: [{ op: 'replace', path: r.chemin, newValue: r.apres, reason: k.message }], allowedPaths: [r.chemin], raison: `Contradiction résolue sur le plan ${k.shotId} · « ${k.extrait} » corrigé selon la fiche de ${k.nomIdentite}` };
  }
  const constat = constatsContradictions(c).find((x) => idDe(x) === contradictionId)!;
  const f = ficheApres(constat)!;
  return { ok: true, changes: [{ op: 'replace', path: r.chemin, newValue: f, reason: k.message }], allowedPaths: [r.chemin], raison: `Contradiction résolue sur la fiche de ${k.nomIdentite} · version ${f.version}` };
}

/** Les plans dont une opération du devis dépend · `keyframe:s`, `clip:s`, `voix:s`, et pour `identite:c` tous les plans qui citent c. */
export function plansDesOperations(c: ContenuVersion, operations: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const op of operations) {
    const [prefixe, id] = [op.slice(0, op.indexOf(':')), op.slice(op.indexOf(':') + 1)];
    if (!id || op.indexOf(':') < 0) continue;
    if (prefixe === 'keyframe' || prefixe === 'clip' || prefixe === 'voix') { if (c.shots.byId[id]) out.add(id); }
    if (prefixe === 'identite') for (const sid of c.shots.order) if (c.shots.byId[sid]?.referenceIds.includes(id)) out.add(sid);
  }
  return out;
}

/**
 * Contrôle AVANT devis · les contradictions qui touchent une opération à
 * produire. Vide ⇒ le devis peut être créé. Une opération de calcul seule
 * (montage, export) n'est jamais bloquée : elle ne génère rien.
 */
export function contradictionsDuDevis(c: ContenuVersion, operations: readonly string[]): Contradiction[] {
  const plans = plansDesOperations(c, operations);
  if (plans.size === 0) return [];
  return detecterContradictions(c).filter((k) => plans.has(k.shotId));
}

/** Message d'un refus de devis · dit quoi faire, nomme le plan et la fiche. */
export function messageRefusDevis(k: readonly Contradiction[]): string {
  const premiere = k[0]!;
  const suite = k.length > 1 ? ` (et ${k.length - 1} autre${k.length > 2 ? 's' : ''})` : '';
  return `Contradiction d’identité · ${premiere.message}${suite} Corrige le plan ou change la fiche dans « Identités », puis redemande le devis. Rien n’a été devisé ni débité.`;
}
