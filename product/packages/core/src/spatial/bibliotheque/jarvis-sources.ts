import { parseAnswer, JARVIS_ACTIONS } from '../../adsmap/jarvis-actions';
import { extraireCitations, citationsComptees } from '../../connaissances';
import type { StatRow } from '../../adsmap/brand-stats';

/**
 * Spatial · les gestes de Jarvis qui n'ont pas de fragment de maquette (vague 3) ·
 * RÈGLES PURES. Le concept proposé par une réponse (le seul geste payant d'une
 * réponse, son coût dit avant le clic), la mémoire mesurée rangée par dimension,
 * la force d'un règlement créatif et la couverture des créas décrites. Ni base,
 * ni réseau, ni modèle.
 */

export interface ConceptPropose { intent: string; libelle: string; cout: string; effet: string }

/**
 * Le geste payant d'une réponse · « Écrire ce concept » (`draftConceptAction`).
 * `null` quand la réponse ne le propose pas, ou sans intention (l'action
 * refuserait d'écrire). Le coût vient du vocabulaire fermé `JARVIS_ACTIONS`.
 */
export function conceptPropose(brut: string): ConceptPropose | null {
  const { texte } = extraireCitations(brut);
  const a = parseAnswer(texte).actions.find((x) => x.key === 'draft');
  const intent = a?.intent?.trim();
  if (!a || !intent) return null;
  const def = JARVIS_ACTIONS.draft;
  return { intent, libelle: def.label, cout: def.cost ?? '', effet: def.effect };
}

/**
 * Les sources citées par une réponse (`[[SOURCE:ref]]`), lisibles · seulement
 * celles que le fil sait résoudre, jamais une référence recopiée de la question.
 * Une source retirée depuis le dit.
 */
export function citationsReponse(brut: string, question: string | null, sources: Readonly<Record<string, { titre: string; enService: boolean }>>): string[] {
  const { refs } = extraireCitations(brut);
  return citationsComptees(brut, refs, question).filter((r) => sources[r]).map((r) => `${sources[r]!.titre}${sources[r]!.enService ? '' : ' · retirée depuis'}`);
}

/** Les dimensions de la mémoire mesurée, dans l'ordre de lecture (mécanismes d'abord). */
export const DIMENSIONS_MEMOIRE: ReadonlyArray<{ dimension: string; libelle: string }> = [
  { dimension: 'mechanism', libelle: 'Mécanismes' },
  { dimension: 'element', libelle: 'Éléments réutilisés' },
  { dimension: 'hook_type', libelle: 'Types d’accroche' },
  { dimension: 'opening_type', libelle: 'Ouvertures' },
  { dimension: 'layout', libelle: 'Mises en page' },
  { dimension: 'format', libelle: 'Formats' },
  { dimension: 'length_bucket', libelle: 'Durées' },
  { dimension: 'awareness', libelle: 'Stades de conscience' },
  { dimension: 'talent', libelle: 'Talents' },
  { dimension: 'avatar', libelle: 'Avatars' },
];

/** Une ligne n'a le droit de parler qu'à partir de trois tests concluants · en dessous, une anecdote. */
export const MIN_TESTS_MEMOIRE = 3;

export interface LigneMemoire { cle: string; taux: number; part: string; tests: string; auDessus: boolean }
export interface GroupeMemoire { dimension: string; libelle: string; lignes: LigneMemoire[] }

/**
 * La mémoire mesurée, rangée par dimension · seulement les lignes d'au moins
 * trois tests concluants, du meilleur taux au moins bon. `auDessus` compare à
 * la moyenne HISTORIQUE de la marque (jamais à zéro).
 */
export function memoireParDimension(stats: readonly StatRow[], moyenne: number | null): GroupeMemoire[] {
  const utiles = stats.filter((r) => r.nConclusive >= MIN_TESTS_MEMOIRE && r.hitRate !== null);
  return DIMENSIONS_MEMOIRE.map(({ dimension, libelle }) => ({
    dimension, libelle,
    lignes: utiles.filter((r) => r.dimension === dimension)
      .sort((a, b) => (b.hitRate ?? 0) - (a.hitRate ?? 0))
      .map((r) => ({
        cle: r.key, taux: r.hitRate!, part: `${Math.round(r.hitRate! * 100)} %`,
        tests: `${r.nWinners + r.nBaby}/${r.nConclusive} tests`,
        auDessus: moyenne !== null && r.hitRate! > moyenne,
      })),
  })).filter((g) => g.lignes.length > 0);
}

/** Les signaux exploitables (lignes d'au moins trois tests). */
export const signauxExploitables = (stats: readonly StatRow[]) =>
  stats.filter((r) => r.nConclusive >= MIN_TESTS_MEMOIRE && r.hitRate !== null).length;

const DIMS_REGLEMENT: ReadonlyArray<{ libelle: string; re: RegExp }> = [
  { libelle: 'Style visuel', re: /style visuel|lumi|cadrage|couleur|palette/i },
  { libelle: 'Ton', re: /\bton\b|voix|registre/i },
  { libelle: 'Toujours', re: /toujours/i },
  { libelle: 'Jamais', re: /jamais/i },
  { libelle: 'Mentions', re: /mention/i },
  { libelle: 'Edge concurrentiel', re: /edge|démarqu|concurrent|différenci/i },
];

/** La force d'un règlement créatif · les dimensions couvertes, le score sur 100, le nombre de mots. */
export function forceReglement(texte: string): { score: number; mots: number; dimensions: Array<{ libelle: string; couverte: boolean }> } {
  const dimensions = DIMS_REGLEMENT.map((d) => ({ libelle: d.libelle, couverte: d.re.test(texte) }));
  const couvertes = dimensions.filter((d) => d.couverte).length;
  const t = texte.trim();
  return { score: Math.round((couvertes / DIMS_REGLEMENT.length) * 100), mots: t ? t.split(/\s+/).length : 0, dimensions };
}

/** Les playbooks maison · un point de départ, chargé dans le champ, jamais enregistré seul. */
export const PLAYBOOKS_REGLES: ReadonlyArray<{ cle: string; libelle: string; regles: string }> = [
  { cle: 'dtc', libelle: 'DTC premium', regles: `Style visuel : premium, lumière douce, fond épuré, macro produit net, proportions réelles.
Ton : expert, désirable, rassurant.
Toujours : bénéfice concret en accroche, preuve (chiffre/ingrédient), CTA clair, packaging fidèle.
Jamais : superlatifs creux, avant/après trompeur, texte illisible.
Mentions obligatoires : aucune sauf obligation légale.
Edge concurrentiel : plus concret et spécifique que la moyenne, zéro promesse gonflée.` },
  { cle: 'beauty', libelle: 'Beauté / soin', regles: `Style visuel : peau réaliste, lumière flatteuse, textures visibles, palette marque.
Ton : sensoriel, sûr de soi, inclusif.
Toujours : résultat crédible, ingrédient héros nommé, diversité des profils.
Jamais : retouche irréaliste, promesse médicale, « miracle ».
Mentions obligatoires : mentions cosmétiques si allégation.
Edge concurrentiel : preuve + inclusivité, pas de perfection artificielle.` },
  { cle: 'supp', libelle: 'Compléments', regles: `Style visuel : clean, énergique, produit net, ingrédients naturels visibles.
Ton : pédagogue, motivant, honnête.
Toujours : bénéfice fonctionnel précis, dosage/ingrédient clé, CTA action.
Jamais : allégation santé interdite, « guérit », fausse urgence.
Mentions obligatoires : « Complément alimentaire · ne remplace pas une alimentation variée ».
Edge concurrentiel : transparence des actifs, ton anti-hype.` },
  { cle: 'fashion', libelle: 'Mode / lifestyle', regles: `Style visuel : éditorial, mouvement, lumière naturelle, cadrage dynamique.
Ton : affirmé, tendance, désirable.
Toujours : matière et coupe mises en valeur, contexte d'usage réel, CTA désir.
Jamais : proportions déformées, logos parasites, texte qui charge l'image.
Mentions obligatoires : aucune.
Edge concurrentiel : direction artistique forte et cohérente, reconnaissable.` },
];

/** Les moteurs orchestrés (information du fondateur) · interchangeables par configuration. */
export const MOTEURS_JARVIS: ReadonlyArray<{ tag: string; nom: string; role: string }> = [
  { tag: 'IMAGE', nom: 'Nano Banana 2 (Gemini)', role: 'Mise en scène produit fidèle' },
  { tag: 'VIDÉO', nom: 'Kling 2.5 turbo pro', role: 'Animation des visuels' },
  { tag: 'COPY', nom: 'Claude', role: 'Concepts, angles, copywriting' },
];

export interface CouvertureDescription {
  total: number; described: number; manual: number; withoutAsset: number; fromWritten: number;
  pendingAsset: number; pendingWritten: number; nextBatch: number; nextCostUsd: number; totalCostUsd: number;
}

/**
 * La couverture des créas décrites, dite avant le bouton · combien sont décrites,
 * la part, ce que coûte la PROCHAINE tranche et la totalité (en dollars, la
 * dépense réelle), et si le bouton a quelque chose à faire.
 */
export function lectureCouverture(c: CouvertureDescription) {
  const restant = c.pendingAsset + c.pendingWritten;
  const part = c.total > 0 ? Math.round((c.described / c.total) * 100) : null;
  const usd = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;
  const morceaux = [c.total === 0 ? 'Aucune créa dans la carte pour l’instant.' : `${c.described} créa(s) décrite(s) sur ${c.total}${part !== null ? ` · ${part} %` : ''}`];
  if (c.manual > 0) morceaux.push(`dont ${c.manual} corrigée(s) à la main, que l’agent ne touche pas`);
  if (c.fromWritten > 0) morceaux.push(`dont ${c.fromWritten} déduite(s) du brief, à confiance plafonnée`);
  if (c.withoutAsset > 0) morceaux.push(`${c.withoutAsset} sans visuel ni texte, indescriptibles en l’état`);
  const faible = part !== null && part < 50 && c.described > 0;
  return {
    restant, part, faible,
    texte: morceaux.join(' · ') + (faible ? ' · sous la moitié, les lignes tirées de ces champs restent peu fiables.' : ''),
    tranche: restant > 0 ? { cout: usd(c.nextCostUsd), detail: `${c.nextBatch} créa(s) · ${usd(c.totalCostUsd)} pour les ${restant} restantes` } : null,
    bouton: restant > 0 ? `Décrire ${c.nextBatch} créa(s) · ${usd(c.nextCostUsd)}` : 'Tout est décrit',
  };
}

const POIDS_ACCROCHE: Record<string, { libelle: string; ton: '' | 'g' | 'w' | 'r' }> = {
  proven: { libelle: 'a gagné ici', ton: 'g' },
  market: { libelle: 'marché', ton: 'w' },
  untested: { libelle: 'jamais tranchée', ton: '' },
  refuted: { libelle: 'a perdu ici', ton: 'r' },
};

/** Le poids d'une accroche du contexte · a-t-elle gagné ici, vient-elle du marché, jamais tranchée. */
export const poidsAccroche = (evidence: string) => POIDS_ACCROCHE[evidence] ?? POIDS_ACCROCHE.untested!;
