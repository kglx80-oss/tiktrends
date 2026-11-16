/**
 * Studios · le mode « Pub entière » · le générateur d'images dessine les textes
 * de la carte MOT POUR MOT (et le logo), à côté du mode calques actuel.
 *
 * Pur · ni base, ni réseau, ni modèle.
 *
 * ── Deux typographies, et ce que chacune garantit ────────────────────────────
 *
 *  · `calques` (défaut, inchangé) · le générateur produit la scène, les textes
 *    sont posés ensuite par des calques, tels quels. La consigne dit « aucun
 *    texte dans l'image » ;
 *  · `entiere` · le générateur produit la publicité complète, typographie
 *    comprise. On reprend la consigne de l'ancienne chaîne (`promptPubEntiere`,
 *    `production-mode.ts`) et ses trois exigences (produit inchangé, mots
 *    donnés et non suggérés, français rappelé), alimentée par les textes du
 *    projet, le format servi et la scène COMPILÉE par `image.compile`.
 *
 * Le défaut reste `calques` jusqu'à ce que le propriétaire tranche sur un lot
 * de contrôle (`TYPOGRAPHIE_PAR_DEFAUT`).
 *
 * ── Le moteur dépend du mode ─────────────────────────────────────────────────
 *
 * Aucune règle nouvelle : `moteurRecommande('entiere')` (`economics.ts`) choisit
 * le moteur, le catalogue `IMAGE_MODELS` dit son adresse, son paramètre de
 * qualité (`params`, envoyé tel quel au corps fal) et son prix. Le devis
 * annonce ce prix-là, pour ce paramètre-là.
 *
 * ── Relu à la génération ─────────────────────────────────────────────────────
 *
 * Un générateur écrit le texte le plus souvent juste, pas toujours. Chaque pub
 * entière est donc relue (perception par `controlePubEntiere`, jugement ici) :
 * mots exacts (`verifieCopie`, plus le détail des mots manquants et en trop),
 * packaging, lisibilité, et COHÉRENCE de l'accroche avec les faits du produit ·
 * le cas relevé chez la concurrence, « Un goût fruits rouges » sur une étiquette
 * « Goût mangue », est refusé ici.
 */

import { promptPubEntiere, type CopiePub } from '../../production-mode';
import { IMAGE_MODELS, falModelFor, moteurRecommande, type ImageModelSpec } from '../../economics';
import { verifieCopie, chainesImposees, type ChaineImposee, type VerdictCopie } from '../../copie-conforme';
import { creditsV2Image } from '../../offre/bareme';
import { FIXED_COSTS } from '../../spend-guard';
import { formatCredits } from '../../offre/affichage';
import type { BriefCanonique } from '../brief';
import type { ConsigneImage } from '../produit/compilation';
import type { ReferenceProduitEpinglee } from '../produit/epinglage';
import { lireTextesBrief, type TexteStudio } from '../textes/textes';
import { idSourceProduit } from '../sources/produit';

/* ───────────────────────────── Le choix ──────────────────────────────────── */

export const TYPOGRAPHIES_IMAGE = ['calques', 'entiere'] as const;
export type TypographieImage = (typeof TYPOGRAPHIES_IMAGE)[number];
/** Défaut inchangé · le propriétaire tranche après un lot de contrôle. */
export const TYPOGRAPHIE_PAR_DEFAUT: TypographieImage = 'calques';
export const estTypographie = (x: unknown): x is TypographieImage => typeof x === 'string' && (TYPOGRAPHIES_IMAGE as readonly string[]).includes(x);

export const LIBELLES_TYPOGRAPHIE: Readonly<Record<TypographieImage, string>> = {
  calques: 'Textes en calques · posés tels quels par-dessus l’image',
  entiere: 'Pub entière · le générateur dessine les textes et le logo',
};

/** Ce que chaque typographie garantit, et ce qu'elle ne garantit pas · dit avant le choix. */
export const PORTEE_TYPOGRAPHIE: Readonly<Record<TypographieImage, { garantit: string; reserve: string }>> = {
  calques: {
    garantit: 'Tes textes sont posés tels quels, la mise en page reste la tienne.',
    reserve: 'Le rendu reste plus sobre · la typographie n’est pas intégrée à la scène.',
  },
  entiere: {
    garantit: 'Rendu de publicité complète · chaque image est relue (mots, packaging, lisibilité, cohérence avec le produit).',
    reserve: 'Le générateur écrit le texte · il se trompe parfois d’accent ou de mot, la relecture le signale « à reprendre ».',
  },
};

/* ───────────────────────────── La copie ──────────────────────────────────── */

/** La copie dessinée dans l'image · figée à la compilation, relue à la génération. */
export interface CopieDessinee {
  headline: string;
  subhead: string | null;
  benefits: string[];
  cta: string | null;
}

export const SCHEMA_PUB_ENTIERE = 'pub_entiere/1' as const;

/** Ce que la consigne et l'instantané du job portent en mode entière (absent en calques). */
export interface PubEntiere {
  schema: typeof SCHEMA_PUB_ENTIERE;
  copie: CopieDessinee;
  langue: 'fr';
  /** Clé du catalogue `IMAGE_MODELS` · `moteurRecommande('entiere')` à la compilation. */
  moteur: string;
}

/** Bornes · reprises du contrat des textes et de `promptPubEntiere` (au plus trois puces). */
const TEXTE_MAX = 12_000;
export const BENEFICES_MAX = 3;

export type CopieDuBrief =
  | { ok: true; copie: CopieDessinee; ecartes: Array<{ texte: string; raison: string }> }
  | { ok: false; raison: string };

/**
 * Les textes du projet (`brief.texts`), rangés dans la hiérarchie d'une pub :
 * la première accroche (Hook, sinon le premier texte libre) en titre, le
 * premier corps en sous-titre, le premier CTA en bouton, les autres en puces
 * (au plus trois). Les scripts (vidéo) ne se dessinent pas ; une langue autre
 * que le français non plus. Rien n'est écarté en silence : chaque texte laissé
 * hors de l'image est rendu avec sa raison.
 */
export function copieDuBrief(b: BriefCanonique | null): CopieDuBrief {
  const ecartes: Array<{ texte: string; raison: string }> = [];
  const dessinables: TexteStudio[] = [];
  for (const t of lireTextesBrief(b)) {
    if (t.type === 'script') { ecartes.push({ texte: t.texte, raison: 'script vidéo · jamais dessiné dans une image' }); continue; }
    if (t.type !== 'libre' && t.langue !== 'fr') { ecartes.push({ texte: t.texte, raison: `langue « ${t.langue} » · la pub entière est écrite en français` }); continue; }
    const texte = t.texte.replace(/\s+/g, ' ').trim();
    if (!texte) continue;
    dessinables.push({ ...t, texte });
  }
  const pris = new Set<number>();
  const premier = (ok: (t: (typeof dessinables)[number]) => boolean): string | null => {
    const i = dessinables.findIndex((t, j) => !pris.has(j) && ok(t));
    if (i < 0) return null;
    pris.add(i);
    return dessinables[i]!.texte;
  };
  const headline = premier((t) => t.type === 'hook') ?? premier((t) => t.type === 'libre');
  if (!headline) return { ok: false, raison: 'La pub entière dessine les textes de la carte · ajoute au moins une accroche (Hook) au projet.' };
  const subhead = premier((t) => t.type === 'ad_copy');
  const cta = premier((t) => t.type === 'cta');
  const benefits: string[] = [];
  dessinables.forEach((t, i) => {
    if (pris.has(i)) return;
    if (t.type !== 'cta' && benefits.length < BENEFICES_MAX) { benefits.push(t.texte); pris.add(i); return; }
    ecartes.push({ texte: t.texte, raison: t.type === 'cta' ? 'un seul bouton par pub' : `au plus ${BENEFICES_MAX} puces dans l’image` });
  });
  return { ok: true, copie: { headline, subhead, benefits, cta }, ecartes };
}

/** Les chaînes imposées · celles que la relecture compare, dans l'ordre où elles comptent. */
export function chainesDeLaCopie(c: CopieDessinee): ChaineImposee[] {
  return chainesImposees({ headline: c.headline, subhead: c.subhead, benefits: c.benefits, cta: c.cta });
}

/** La pub entière d'une compilation · le moteur est celui que le mode recommande. */
export function pubEntiereDuBrief(b: BriefCanonique | null): { ok: true; pub: PubEntiere; ecartes: Array<{ texte: string; raison: string }> } | { ok: false; raison: string } {
  const c = copieDuBrief(b);
  if (!c.ok) return c;
  return { ok: true, pub: { schema: SCHEMA_PUB_ENTIERE, copie: c.copie, langue: 'fr', moteur: moteurRecommande('entiere') }, ecartes: c.ecartes };
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texteOk = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= TEXTE_MAX;

/** Relecture défensive · violations nommées, rien de complété par défaut. */
export function violationsPubEntiere(x: unknown, chemin = '/pubEntiere'): string[] {
  if (!estObjet(x) || x.schema !== SCHEMA_PUB_ENTIERE) return [`${chemin} : schéma pub_entiere/1 attendu`];
  const v: string[] = [];
  const c = x.copie;
  if (!estObjet(c)) v.push(`${chemin}/copie : objet attendu`);
  else {
    if (!texteOk(c.headline)) v.push(`${chemin}/copie/headline : accroche de 1 à ${TEXTE_MAX} caractères`);
    if (c.subhead !== null && !texteOk(c.subhead)) v.push(`${chemin}/copie/subhead : texte ou null`);
    if (c.cta !== null && !texteOk(c.cta)) v.push(`${chemin}/copie/cta : texte ou null`);
    if (!Array.isArray(c.benefits) || c.benefits.length > BENEFICES_MAX || !c.benefits.every(texteOk)) v.push(`${chemin}/copie/benefits : au plus ${BENEFICES_MAX} textes`);
    if (Object.keys(c).sort().join(',') !== 'benefits,cta,headline,subhead') v.push(`${chemin}/copie : champs headline, subhead, benefits, cta seulement`);
  }
  if (x.langue !== 'fr') v.push(`${chemin}/langue : fr attendu`);
  if (typeof x.moteur !== 'string' || !specMoteur(x.moteur)) v.push(`${chemin}/moteur : moteur absent du catalogue`);
  if (Object.keys(x).sort().join(',') !== 'copie,langue,moteur,schema') v.push(`${chemin} : champs schema, copie, langue, moteur seulement`);
  return v;
}

export function lirePubEntiere(x: unknown): PubEntiere | null {
  return violationsPubEntiere(x).length ? null : (x as PubEntiere);
}

/* ───────────────────────────── Le moteur ─────────────────────────────────── */

/** Le moteur du catalogue · pur, sans la surcharge d'environnement (`imageModelByKey`). */
export function specMoteur(cle: string): ImageModelSpec | null {
  return IMAGE_MODELS.find((m) => m.key === cle) ?? null;
}

/** L'adresse fal et les paramètres de qualité RÉELLEMENT envoyés pour ce moteur. */
export function moteurEnvoye(cle: string, avecReference: boolean): { modele: string; params: Record<string, string | number> } | null {
  const s = specMoteur(cle);
  if (!s) return null;
  return { modele: falModelFor(s, avecReference), params: { ...(s.params ?? {}) } };
}

/* ──────────────────────── Références et consigne bornées ──────────────────── */

/**
 * Au plus TROIS références en pub entière · les vues du produit d'abord (la
 * photo épinglée en tête, dans l'ordre de la consigne), puis le logo s'il reste
 * une place. Le reste (style, composition…) est écarté et DIT dans les limites.
 *
 * ── Pourquoi ce plafond ──────────────────────────────────────────────────────
 *
 * GPT Image 2 en édition facture aussi les images d'ENTRÉE. Le prix catalogue
 * (0,049 $ en quality medium) et la réserve du worker (0,08 $ par image,
 * inchangée) n'ont jamais été confrontés à une facture fal avec huit
 * références : aucune facture n'est lisible depuis la session. On plafonne
 * donc à ce que la chaîne produit sait déjà envoyer (jusqu'à trois vues du
 * même produit, #1097) et on le MESURE au lot de contrôle (1 / 2 / 3
 * références). Tant que ce n'est pas mesuré, la ligne du devis dit
 * « estimation » et la réserve (0,08 $) reste au-dessus de l'estimation.
 * Le mode calques n'a aucun plafond nouveau.
 */
export const REFERENCES_PUB_ENTIERE_MAX = 3;

export function selectionReferencesPubEntiere<R extends { assetId: string; role: string }>(liees: readonly R[]): { gardees: R[]; ecartees: R[] } {
  const produit = liees.filter((r) => r.role === 'product').slice(0, REFERENCES_PUB_ENTIERE_MAX);
  const logo = produit.length < REFERENCES_PUB_ENTIERE_MAX ? liees.filter((r) => r.role === 'logo').slice(0, 1) : [];
  const gardees = [...produit, ...logo];
  return { gardees, ecartees: liees.filter((r) => !gardees.includes(r)) };
}

/**
 * Longueur maximale de la consigne TOTALE envoyée en pub entière · 32 000
 * caractères, la limite documentée du prompt des modèles GPT Image d'OpenAI
 * (le moteur que le mode recommande). Au-delà, refus avant l'appel : couper
 * ferait tomber la copie ou les interdits, jamais acceptable.
 */
export const PROMPT_PUB_ENTIERE_MAX = 32_000;

/* ───────────────────────────── Le prix ───────────────────────────────────── */

const micros = (usd: number): number => Math.round(usd * 1_000_000);

/** Ce que le worker réserve au plafond par image (`coutSoumissionImage` · `FIXED_COSTS.fal_image`), inchangé. */
export const RESERVE_WORKER_IMAGE_MICROS = micros(FIXED_COSTS.fal_image);

export type TarifPubEntiere =
  | { ok: true; credits: number; usdMicros: number; moteur: string; libelleMoteur: string; params: Record<string, string | number>; motif: string }
  | { ok: false; motif: string };

/**
 * Le prix d'une image en pub entière · celui du CATALOGUE pour le moteur et le
 * paramètre envoyés (`IMAGE_MODELS.realEur`, en dollars malgré son nom · audit
 * du 29/10 ; crédits `creditsV2Image`). La barrière du worker est inchangée :
 * elle réserve `FIXED_COSTS.fal_image` par image. Un moteur plus cher que cette
 * réserve est REFUSÉ au devis · sinon la réserve du plafond ne bornerait plus
 * la dépense réelle.
 */
export function tarifPubEntiere(moteur: string): TarifPubEntiere {
  const s = specMoteur(moteur);
  if (!s) return { ok: false, motif: `moteur « ${moteur} » absent du catalogue` };
  const usdMicros = micros(s.realEur);
  if (usdMicros > RESERVE_WORKER_IMAGE_MICROS) {
    return { ok: false, motif: `${s.label} coûte ${(usdMicros / 1e6).toFixed(3).replace('.', ',')} $ l’image, plus que la réserve de ${(RESERVE_WORKER_IMAGE_MICROS / 1e6).toFixed(2).replace('.', ',')} $ du plafond · non proposé en pub entière` };
  }
  const params = { ...(s.params ?? {}) };
  const reglage = Object.entries(params).map(([k, v]) => `${k} ${v}`).join(', ');
  return {
    ok: true, credits: creditsV2Image(s.key), usdMicros, moteur: s.key, libelleMoteur: s.label, params,
    motif: `prix catalogue de ${s.label}${reglage ? ` (${reglage})` : ''} · le coût réel dépend des images d’entrée, la réserve du plafond reste ${(RESERVE_WORKER_IMAGE_MICROS / 1e6).toFixed(2).replace('.', ',')} $ par image`,
  };
}

/**
 * La case du contrôle en pub entière · elle dit les DEUX contrôles qu'elle paie
 * (contrôle visuel des composants, relecture des mots, du packaging et de la
 * lisibilité) et le prix ajouté, AVANT le clic. Cochée par défaut en pub entière.
 */
export function libelleCaseRelecturePubEntiere(creditsParImage: number | null): string {
  return creditsParImage === null || creditsParImage <= 0
    ? 'Contrôle visuel et relecture de la pub entière (mots, packaging, lisibilité) · inclus, aucun crédit débité · coché par défaut, décocher pour s’en passer'
    : `Contrôle visuel et relecture de la pub entière (mots, packaging, lisibilité) · ${formatCredits(creditsParImage)} au plus par image, ajoutés au devis · coché par défaut, décocher pour s’en passer`;
}

/**
 * La case du contrôle est-elle cochée d'office ? En régime V2 le contrôle
 * visuel n'est plus coché d'office (29/10, coût réel non mesuré) · SAUF en pub
 * entière, où le générateur écrit la typographie et où la relecture est la
 * seule garantie des mots. Ailleurs, la règle d'avant.
 */
export function controleCocheParDefaut(e: { regime: string; pubEntiere: boolean }): boolean {
  return e.regime !== 'v2' || e.pubEntiere;
}

/** Une ligne de devis, telle que ce module la retarife · forme minimale de `LigneDevis`. */
interface LigneTarifable { operation: string; credits: number; usdMicros: number; natureCout?: 'borne' | 'estimation'; motifEstimation?: string | null }

/** Les lignes d'un devis où l'image du studio prend le prix de la pub entière · les autres inchangées. */
export function lignesAuTarifPubEntiere<L extends LigneTarifable>(lignes: readonly L[], operationImage: string, t: Extract<TarifPubEntiere, { ok: true }>): L[] {
  return lignes.map((l) => (l.operation === operationImage
    ? { ...l, credits: t.credits, usdMicros: t.usdMicros, natureCout: 'estimation' as const, motifEstimation: t.motif }
    : l));
}

/* ───────────────────────────── La consigne ───────────────────────────────── */

/**
 * Une consigne qui INTERDIT le texte · elle contredit la pub entière. Précis à
 * dessein : « pas de texte dans l'image », « aucun texte », « no text »,
 * « text-free »… L'interdit de transfert du serveur (« ni son texte », le texte
 * de l'annonceur concurrent) n'en est pas un et reste.
 */
const INTERDITS_TEXTE: readonly RegExp[] = [
  /(?:^|[\s(«"'’])(?:aucun|aucune|pas\s+de|sans)\s+(?:texte|typographie|lettrage|écriture|inscription|mot)s?(?=$|[\s.,;:!?)»"])/iu,
  /\bno\s+(?:text|typography|lettering|words?|captions?|writing)\b/i,
  /\bwithout\s+(?:any\s+)?(?:text|typography|lettering|words?|captions?)\b/i,
  /\btext[- ]free\b/i,
  /posés?\s+(?:ensuite\s+)?par\s+des\s+calques/i,
];
export function interditLeTexte(s: string): boolean {
  return INTERDITS_TEXTE.some((r) => r.test(s));
}

/** La consigne sans ce qui interdit le texte · ce qui est retiré est rendu (traces). */
export function sansInterditDeTexte(c: Pick<ConsigneImage, 'generationInstruction' | 'negativeConstraints'>): { instruction: string; negatives: string[]; retires: string[] } {
  const retires: string[] = [];
  const phrases = c.generationInstruction.split(/(?<=[.!?])\s+/);
  const gardees = phrases.filter((p) => { if (interditLeTexte(p)) { retires.push(p.trim()); return false; } return true; });
  const negatives = c.negativeConstraints.filter((n) => { if (interditLeTexte(n)) { retires.push(n.trim()); return false; } return true; });
  return { instruction: gardees.join(' ').trim(), negatives, retires };
}

/**
 * La consigne envoyée en pub entière · `promptPubEntiere` (exigences produit,
 * mots imposés, français) avec la scène compilée, le format servi, le logo,
 * puis les composants protégés et les interdits du serveur, comme en calques
 * (`promptFal`). Jamais de « pas de texte ».
 */
export function promptFalPubEntiere(e: { consigne: ConsigneImage; pub: PubEntiere; ratio: string; avecProduit: boolean; logo: boolean; vuesProduit?: number }): { prompt: string; retires: string[] } {
  const s = sansInterditDeTexte(e.consigne);
  const copie: CopiePub = {
    headline: e.pub.copie.headline,
    ...(e.pub.copie.subhead ? { subhead: e.pub.copie.subhead } : {}),
    ...(e.pub.copie.benefits.length ? { benefits: [...e.pub.copie.benefits] } : {}),
    ...(e.pub.copie.cta ? { cta: e.pub.copie.cta } : {}),
  };
  const parties = [promptPubEntiere({ copie, sceneBrief: s.instruction, avecProduit: e.avecProduit, format: e.ratio, sceneMax: TEXTE_MAX, logo: e.logo, ...(e.vuesProduit && e.vuesProduit > 1 ? { vuesProduit: e.vuesProduit } : {}) })];
  if (e.consigne.protectedComponents.length) parties.push(`Composants à préserver à l’identique : ${e.consigne.protectedComponents.join(' ; ')}.`);
  if (s.negatives.length) parties.push(`À éviter absolument : ${s.negatives.join(' ; ')}.`);
  return { prompt: parties.join('\n\n'), retires: s.retires };
}

/* ─────────────────────── Cohérence accroche ↔ produit ────────────────────── */

/**
 * ── Le défaut, relevé chez la concurrence ────────────────────────────────────
 *
 * Leur vitrine montre « Un goût fruits rouges » en titre, sur une boîte dont
 * l'étiquette dit « Goût mangue ». Le décor a suivi le brief, l'étiquette a
 * suivi la photo, et rien n'a comparé les deux. Ici on compare, en code.
 *
 * ── Ce qu'on compare, et pourquoi si peu ─────────────────────────────────────
 *
 * Deux natures d'attribut seulement, celles qu'une accroche affirme et qu'une
 * étiquette porte en clair. Le silence est la conclusion la plus fréquente, et
 * la bonne : une règle qui condamne une pub juste à tort est pire que pas de
 * règle (relecture indépendante de #1096 · faux positifs sondés ci-dessous).
 *
 *  · le GOÛT · goût, saveur, parfum, arôme, suivi IMMÉDIATEMENT d'une saveur du
 *    lexique (articles permis). Un premier mot hors lexique et la lecture se
 *    tait (« le goût du bonheur », « un goût unique », « goût intense de… ») ;
 *    « couleur » n'est pas un goût ; « passion » et « nature » derrière un
 *    article sont des métaphores (« le goût de la passion »), seul « fruit de
 *    la passion » ou « goût passion » est une saveur. Les mots invariables du
 *    lexique (« bois », « cassis », « ananas », « anis ») ne sont pas mis au
 *    singulier ;
 *  · la QUANTITÉ · seulement la CONTENANCE : « pot / boîte / flacon / bouteille
 *    / tube… (de) N unité ». Côté produit, une ligne d'étiquette qui n'est QUE
 *    la quantité (« 60 GOMMES ») compte aussi. Même unité seulement (ml, cl, L
 *    convertis en ml ; g, kg en g) ; une dose (« par jour », « par prise »), une
 *    offre (« offerts »), un « 0 g de », un dosage en mg ne sont pas des
 *    contenances. Une quantité de la pub qui n'est pas une contenance est dite
 *    « non vérifiée » par la relecture, jamais bloquante.
 *
 * Deux saveurs sont COMPATIBLES si l'une contient l'autre (« fruits rouges
 * intense » et « fruits rouges ») ou si l'une est la famille de l'autre
 * (« fruits rouges » et « fraise »). Deux contenances, si elles sont égales.
 *
 * Tableau des cas (`test/pub-entiere.test.ts`, tous gardés) :
 *
 *   texte de la pub                  fait du produit           verdict
 *   Un goût fruits rouges qui…        Goût mangue               contradiction
 *   Goût fruit de la passion          Goût mangue               contradiction
 *   Goût cassis                       Goût fraise               contradiction
 *   Le pot de 30 gommes               60 GOMMES (étiquette)     contradiction
 *   Flacon de 50 ml                   Flacon de 100 ml          contradiction
 *   Bouteille de 1 L                  Bouteille 50 cl           contradiction
 *   Le goût du bonheur / un goût unique   Goût mangue           silence
 *   Le goût de la passion             Goût mangue               silence
 *   Une peau douce et rose            Parfum vanille            silence
 *   Couleur orange                    Goût fraise               silence
 *   Goût fruits des bois              Goût myrtille             silence (famille)
 *   Goût fruits exotiques             Goût mangue               silence (famille)
 *   Goût cassis / Saveur ananas / Parfum anis   le même         silence
 *   0 g de sucre ajouté               Pot de 60 gommes          silence
 *   2 gommes par jour suffisent       Pot de 60 gommes          silence (non vérifiée)
 *   3 sachets offerts                 Boîte de 30 sachets       silence
 *   1 L par jour                      Bouteille 50 cl           silence
 *   60 gommes pour un mois            Boîte de 30 gommes        silence (non vérifiée)
 *   Un sachet de 5 g par jour         Boîte de 30 sachets       silence
 *   Boîte de 60 gélules               Boîte de 60 gommes        silence (autre unité)
 *   Flacon de 50 ml                   Flacon 5 cl               silence (égal)
 */

export type NatureAttribut = 'gout' | 'quantite';

export interface Assertion { nature: NatureAttribut; valeur: string; brut: string }

const plat = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘`]/g, '\'');
const singulier = (m: string) => (m.length > 3 && /[sx]$/.test(m) ? m.slice(0, -1) : m);

/** Saveurs reconnues (sans accent, au singulier sauf les invariables) · un mot hors lexique n'affirme rien. */
const LEXIQUE_SAVEURS = new Set([
  'fruit', 'rouge', 'agrume', 'exotique', 'bois', 'fraise', 'framboise', 'cerise', 'groseille', 'cassis', 'mure', 'myrtille', 'canneberge', 'grenade',
  'citron', 'orange', 'pamplemousse', 'mandarine', 'clementine', 'yuzu', 'bergamote', 'lime', 'mangue', 'ananas', 'passion', 'fruitdelapassion', 'papaye', 'goyave', 'litchi',
  'coco', 'peche', 'abricot', 'pomme', 'poire', 'banane', 'raisin', 'prune', 'melon', 'pasteque', 'kiwi', 'figue', 'vanille', 'chocolat', 'cacao', 'caramel',
  'menthe', 'cafe', 'matcha', 'cannelle', 'gingembre', 'miel', 'noisette', 'amande', 'pistache', 'cola', 'lavande', 'rose', 'violette', 'nature',
  'neutre', 'sale', 'fumee', 'barbecue', 'fromage', 'tomate', 'basilic', 'olive', 'truffe', 'curcuma', 'reglisse', 'anis', 'coquelicot', 'sureau',
]);
/** Métaphores fréquentes derrière un article · « le goût de la passion », « le goût de la nature ». */
const AMBIGUS_APRES_ARTICLE = new Set(['passion', 'nature']);
/** Familles · « fruits rouges » couvre la fraise, pas la mangue. */
const FAMILLES: ReadonlyArray<{ famille: string[]; membres: string[] }> = [
  { famille: ['fruit', 'rouge'], membres: ['fraise', 'framboise', 'cerise', 'groseille', 'cassis', 'mure', 'myrtille', 'canneberge', 'grenade'] },
  { famille: ['fruit', 'bois'], membres: ['fraise', 'framboise', 'mure', 'myrtille', 'cassis', 'groseille'] },
  { famille: ['agrume'], membres: ['citron', 'orange', 'pamplemousse', 'mandarine', 'clementine', 'yuzu', 'bergamote', 'lime'] },
  { famille: ['fruit', 'exotique'], membres: ['mangue', 'ananas', 'passion', 'fruitdelapassion', 'papaye', 'goyave', 'litchi', 'coco', 'banane', 'kiwi'] },
];
const ARTICLES = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'a', 'au', 'aux', 'en', 'un', 'une']);

/** Le mot du lexique, tel quel (invariable) ou au singulier · `null` hors lexique. */
const motDuLexique = (m: string): string | null => (LEXIQUE_SAVEURS.has(m) ? m : LEXIQUE_SAVEURS.has(singulier(m)) ? singulier(m) : null);

/** Les saveurs affirmées par un texte · fenêtre IMMÉDIATE après le mot-clé ; « goût mangue et passion » donne deux valeurs. */
function saveursDe(texte: string): Assertion[] {
  const out: Assertion[] = [];
  const p = plat(texte).replace(/\bfruits? de la passion\b/g, 'fruitdelapassion');
  for (const m of p.matchAll(/\b(?:gout|saveur|parfum|arome)s?\b([^.;:!?·\n,]*)/g)) {
    const mots = (m[1] ?? '').replace(/[^a-z0-9' -]/g, ' ').split(/[\s']+/).filter(Boolean);
    const valeurs: string[][] = [];
    let courant: string[] = [];
    let apresArticle = false;
    for (let i = 0; i < mots.length; i++) {
      const brut = mots[i]!;
      if (ARTICLES.has(brut)) { apresArticle = true; continue; }
      if ((brut === 'et' || brut === 'ou') && courant.length) { valeurs.push(courant); courant = []; apresArticle = false; continue; }
      const mot = motDuLexique(brut);
      // Un mot hors lexique, ou une métaphore derrière un article, clôt la fenêtre.
      if (!mot || (apresArticle && AMBIGUS_APRES_ARTICLE.has(mot) && courant.length === 0)) break;
      courant.push(mot);
      apresArticle = false;
    }
    if (courant.length) valeurs.push(courant);
    for (const v of valeurs) out.push({ nature: 'gout', valeur: v.join(' '), brut: m[0].trim() });
  }
  return out;
}

/** Unités d'une contenance et leur conversion vers l'unité de base de leur famille. */
const UNITES_CONTENANCE: Readonly<Record<string, { base: string; facteur: number }>> = {
  gomme: { base: 'gomme', facteur: 1 }, gommes: { base: 'gomme', facteur: 1 }, gelule: { base: 'gélule', facteur: 1 }, gelules: { base: 'gélule', facteur: 1 },
  capsule: { base: 'capsule', facteur: 1 }, capsules: { base: 'capsule', facteur: 1 }, comprime: { base: 'comprimé', facteur: 1 }, comprimes: { base: 'comprimé', facteur: 1 },
  sachet: { base: 'sachet', facteur: 1 }, sachets: { base: 'sachet', facteur: 1 }, dose: { base: 'dose', facteur: 1 }, doses: { base: 'dose', facteur: 1 },
  ml: { base: 'ml', facteur: 1 }, cl: { base: 'ml', facteur: 10 }, l: { base: 'ml', facteur: 1000 }, g: { base: 'g', facteur: 1 }, kg: { base: 'g', facteur: 1000 },
};
const UNITES_ALT = 'gommes?|gelules?|capsules?|comprimes?|sachets?|doses?|ml|cl|l|g|kg';
const UNITE = `(${UNITES_ALT})(?![a-z])`;
const NOMBRE = '(\\d+(?:[.,]\\d+)?)';
const CONTENANTS = '(?:pot|boite|flacon|bouteille|tube|etui|coffret|bocal|paquet|recharge|canette|brique|bidon|cure)s?';
/** Une dose ou une offre juste après la quantité · ce n'est pas une contenance. */
const PAS_UNE_CONTENANCE = /^\s*(?:par\s+(?:jour|prise|dose|repas|semaine)|\/\s*(?:jour|j)\b|offerts?|gratuits?|en\s+plus)/;

function contenance(n: string, u: string, brut: string): Assertion {
  const x = UNITES_CONTENANCE[u]!;
  return { nature: 'quantite', valeur: `${Math.round(Number(n.replace(',', '.')) * x.facteur * 1000) / 1000} ${x.base}`, brut };
}

/**
 * Les contenances d'un texte · « contenant (de) N unité » ; côté produit, une
 * ligne qui n'est QUE « N unité » (« 60 GOMMES » en tête d'étiquette) aussi.
 */
function contenancesDe(texte: string, cote: 'pub' | 'produit'): Assertion[] {
  const p = plat(texte);
  const out: Assertion[] = [];
  for (const m of p.matchAll(new RegExp(`\\b${CONTENANTS}\\s+(?:de\\s+|d')?${NOMBRE}\\s*${UNITE}`, 'g'))) {
    if (PAS_UNE_CONTENANCE.test(p.slice(m.index! + m[0].length))) continue;
    out.push(contenance(m[1]!, m[2]!, m[0]));
  }
  if (cote === 'produit') {
    const seule = new RegExp(`^\\s*${NOMBRE}\\s*${UNITE}\\s*$`).exec(p);
    if (seule) out.push(contenance(seule[1]!, seule[2]!, seule[0].trim()));
  }
  return out;
}

/** Ce qu'un texte affirme du produit · goût et contenance, rien d'autre. */
export function assertionsDe(texte: string, cote: 'pub' | 'produit' = 'pub'): Assertion[] {
  return [...saveursDe(texte), ...contenancesDe(texte, cote)];
}

/**
 * Les quantités d'un texte de la pub qui ne sont PAS des contenances (« 2 gommes
 * par jour », « 60 gommes pour un mois ») · jamais comparées, jamais bloquantes,
 * dites « non vérifiées » par la relecture.
 */
export function quantitesNonComparees(texte: string): string[] {
  const p = plat(texte);
  const contenances = new Set(contenancesDe(texte, 'pub').map((a) => a.brut));
  const out: string[] = [];
  for (const m of p.matchAll(new RegExp(`${NOMBRE}\\s*(${UNITES_ALT}|mg)(?![a-z])`, 'g'))) {
    if ([...contenances].some((c) => c.includes(m[0]))) continue;
    out.push(texte.slice(m.index!, m.index! + m[0].length));
  }
  return out;
}

function compatibles(nature: NatureAttribut, a: string, b: string): boolean {
  // Deux contenances de la même unité (le filtre de `contradictionsProduit`) · égales ou contradictoires.
  if (nature === 'quantite') return a === b;
  const x = new Set(a.split(' ')); const y = new Set(b.split(' '));
  const inclus = (p: Set<string>, q: Set<string>) => [...p].every((t) => q.has(t));
  if (inclus(x, y) || inclus(y, x)) return true;
  return FAMILLES.some((f) => {
    const estFamille = (s: Set<string>) => f.famille.every((t) => s.has(t));
    const estMembre = (s: Set<string>) => f.membres.some((t) => s.has(t));
    return (estFamille(x) && estMembre(y)) || (estFamille(y) && estMembre(x));
  });
}

export interface ContradictionProduit {
  role: string;
  texte: string;
  nature: NatureAttribut;
  /** Ce que le texte de la pub affirme. */
  annonce: string;
  /** Ce que les faits du produit disent, pour cette nature. */
  produit: string[];
}

/**
 * Les textes imposés qui contredisent les faits du produit. Une nature que les
 * faits ne mentionnent pas ne se juge pas (aucune référence, aucun verdict).
 */
export function contradictionsProduit(textes: readonly ChaineImposee[], faits: readonly string[]): ContradictionProduit[] {
  const duProduit = faits.flatMap((f) => assertionsDe(f, 'produit'));
  const out: ContradictionProduit[] = [];
  for (const t of textes) {
    for (const a of assertionsDe(t.texte, 'pub')) {
      // Une contenance ne se compare qu'à une contenance de la MÊME unité · sinon, silence.
      const memes = duProduit.filter((p) => p.nature === a.nature && (a.nature !== 'quantite' || p.valeur.split(' ')[1] === a.valeur.split(' ')[1]));
      if (!memes.length) continue;
      if (memes.some((p) => compatibles(a.nature, a.valeur, p.valeur))) continue;
      if (out.some((c) => c.role === t.role && c.nature === a.nature && c.annonce === a.valeur)) continue;
      out.push({ role: t.role, texte: t.texte, nature: a.nature, annonce: a.valeur, produit: [...new Set(memes.map((p) => p.valeur))] });
    }
  }
  return out;
}

const LIBELLE_NATURE: Readonly<Record<NatureAttribut, string>> = { gout: 'goût', quantite: 'quantité' };

export function phraseContradiction(c: ContradictionProduit): string {
  return `${c.role} « ${c.texte} » contredit le produit · ${LIBELLE_NATURE[c.nature]} « ${c.annonce} » annoncé, « ${c.produit.join(' », « ')} » sur le produit`;
}

/** Les faits du produit épinglé et du brief · ce que la cohérence compare. */
export function faitsDuProduit(e: { produit: ReferenceProduitEpinglee | null; brief: BriefCanonique | null }): string[] {
  const p = e.produit;
  return [
    ...(p ? [p.nom, ...p.faits.filter((f) => f.cle === 'nom' || f.cle === 'description' || f.cle === 'promesse').map((f) => f.valeur), p.variante.id ? p.variante.libelle : '', ...p.attributsImmuables] : []),
    // Seuls les faits du brief qui citent le PRODUIT · un fait relevé sur une annonce concurrente ne dit rien du nôtre.
    ...(e.brief?.facts ?? []).filter((f) => f.kind !== 'hypothesis' && f.sourceIds.some((id) => id.startsWith(idSourceProduit('')))).map((f) => f.claim),
  ].filter((s) => typeof s === 'string' && s.trim().length > 0);
}

/* ───────────────────────────── La relecture ──────────────────────────────── */

/** Ce que la vision a PERÇU · même forme que `ControlePub` (`packages/ai`), rien d'interprété. */
export interface ConstatPubEntiere {
  texteLu: string[];
  produitFidele: boolean | null;
  ecartsProduit: string[];
  texteLisible: boolean | null;
  problemesLisibilite: string[];
}

export const SCHEMA_RELECTURE = 'relecture_pub_entiere/1' as const;
export type StatutRelecture = 'conforme' | 'a_reprendre' | 'non_conclue';

export interface VerdictRelecturePubEntiere {
  schema: typeof SCHEMA_RELECTURE;
  statut: StatutRelecture;
  /** Pourquoi c'est à reprendre · vide quand conforme. */
  raisons: string[];
  /** Ce qui n'a pas pu être vérifié · dit, jamais compté comme conforme. */
  nonVerifie: string[];
  copie: VerdictCopie | null;
  contradictions: ContradictionProduit[];
}

export const LIBELLES_RELECTURE: Readonly<Record<StatutRelecture, string>> = {
  conforme: 'Relue · conforme',
  a_reprendre: 'À reprendre',
  non_conclue: 'Relecture non conclue · relis la pub toi-même',
};

const motsCompares = (s: string) => (s || '').replace(/[’‘]/g, '\'').toLowerCase().split(/[\s]+/).map((m) => m.replace(/^[«"(]+|[»",.;:!?)]+$/g, '')).filter(Boolean);

/** Les mots manquants et les mots en trop d'une ligne lue · multiensembles, ordre ignoré. */
export function ecartMots(attendu: string, lu: string): { manquants: string[]; enTrop: string[] } {
  const a = motsCompares(attendu); const b = motsCompares(lu);
  const reste = [...b];
  const manquants: string[] = [];
  for (const m of a) { const i = reste.indexOf(m); if (i >= 0) reste.splice(i, 1); else manquants.push(m); }
  return { manquants, enTrop: reste };
}

/**
 * Le verdict d'une pub entière · perception de la vision, jugement en code.
 * À reprendre dès qu'un mot imposé n'est pas exact (absent, réécrit, mot en
 * trop, accents perdus), que le packaging diffère de la photo, qu'un texte est
 * illisible, ou qu'un texte contredit les faits du produit. Sans constat
 * (vision absente ou muette) : non conclue, jamais conforme par défaut.
 */
export function relecturePubEntiere(e: { copie: CopieDessinee; constat: ConstatPubEntiere | null; faits: readonly string[]; motif?: string | null }): VerdictRelecturePubEntiere {
  const imposees = chainesDeLaCopie(e.copie);
  // La cohérence avec le produit se juge AVANT l'image : elle vaut sans vision.
  const contradictionsCarte = contradictionsProduit(imposees, e.faits);
  if (!e.constat) {
    return {
      schema: SCHEMA_RELECTURE, statut: contradictionsCarte.length ? 'a_reprendre' : 'non_conclue',
      raisons: contradictionsCarte.map(phraseContradiction), nonVerifie: [`mots, packaging et lisibilité non relus${e.motif ? ` · ${e.motif}` : ''}`],
      copie: null, contradictions: contradictionsCarte,
    };
  }
  const k = e.constat;
  const copie = verifieCopie(imposees, k.texteLu);
  const raisons: string[] = [];
  const nonVerifie: string[] = [];
  for (const l of copie.lignes) {
    if (l.etat === 'absente') raisons.push(`${l.role} « ${l.attendu} » absent de l’image`);
    else if (l.etat === 'accents') raisons.push(`${l.role} : accents perdus · lu « ${l.lu} »`);
    else if (l.etat === 'deformee') {
      const d = ecartMots(l.attendu, l.lu ?? '');
      const detail = [d.manquants.length ? `mot${d.manquants.length > 1 ? 's' : ''} manquant${d.manquants.length > 1 ? 's' : ''} « ${d.manquants.join(' ')} »` : '', d.enTrop.length ? `mot${d.enTrop.length > 1 ? 's' : ''} en trop « ${d.enTrop.join(' ')} »` : ''].filter(Boolean).join(', ');
      raisons.push(`${l.role} réécrit · lu « ${l.lu} »${detail ? ` (${detail})` : ''}`);
    }
  }
  if (k.produitFidele === false) raisons.push(`packaging différent de la photo du produit${k.ecartsProduit.length ? ` · ${k.ecartsProduit.join(' ; ')}` : ''}`);
  if (k.produitFidele === null) nonVerifie.push('packaging non comparé à la photo du produit');
  if (k.texteLisible === false) raisons.push(`texte difficile à lire${k.problemesLisibilite.length ? ` · ${k.problemesLisibilite.join(' ; ')}` : ''}`);
  if (k.texteLisible === null) nonVerifie.push('lisibilité non jugée');
  // Ce que l'image montre en plus des mots imposés (l'étiquette, surtout) est un fait du produit.
  const lusPris = new Set(copie.lignes.map((l) => l.lu).filter((x): x is string => !!x));
  const lusProduit = k.texteLu.filter((t) => !lusPris.has(t));
  const contradictions = contradictionsProduit(imposees, [...e.faits, ...lusProduit]);
  for (const t of imposees) for (const q of quantitesNonComparees(t.texte)) nonVerifie.push(`quantité « ${q} » de l’${t.role} non comparée au produit (ce n’est pas une contenance)`);
  raisons.push(...contradictions.map(phraseContradiction));
  return { schema: SCHEMA_RELECTURE, statut: raisons.length ? 'a_reprendre' : 'conforme', raisons, nonVerifie, copie, contradictions };
}

/** Relecture défensive d'un verdict stocké (`studio_jobs.result`) · `null` sinon. */
export function lireVerdictRelecture(x: unknown): VerdictRelecturePubEntiere | null {
  if (!estObjet(x) || x.schema !== SCHEMA_RELECTURE) return null;
  if (x.statut !== 'conforme' && x.statut !== 'a_reprendre' && x.statut !== 'non_conclue') return null;
  if (!Array.isArray(x.raisons) || !x.raisons.every((r) => typeof r === 'string')) return null;
  if (!Array.isArray(x.nonVerifie) || !x.nonVerifie.every((r) => typeof r === 'string')) return null;
  return x as unknown as VerdictRelecturePubEntiere;
}

/** Clé du verdict dans `studio_jobs.result` · à côté des médias livrés. */
export const CLE_RELECTURE_JOB = 'relecturePubEntiere' as const;
