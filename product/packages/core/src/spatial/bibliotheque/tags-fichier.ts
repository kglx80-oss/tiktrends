import { PREFIXE_TAG_MAIN, TAG_TEMPLATE } from '../../templates-crea';
import { cleTag, trierTags, validerTags, type TagVeille, type Valide } from '../veille/tags-veille';
import type { ControleLocal } from '../veille/filtres-locaux';

/**
 * Bibliothèque · TAGS POSÉS À LA MAIN sur un fichier (lot 12 V5 · VB L31).
 * Règles PURES · ni base, ni réseau. L'action (`definirTagsMainAssetAction`,
 * `app/actions/assets.ts`) ne fait qu'appliquer ce qui est décidé ici.
 *
 * ── Le vocabulaire et les règles sont ceux de la Veille ──────────────────────
 * Un tag se saisit, se compare et se borne EXACTEMENT comme un tag de Veille
 * (`tags-veille.ts`, lot 6 · #1049) : libellé nettoyé, clé sans casse ni accent
 * (`cleTag` · « Hook UGC » = « hook  ugc »), 40 signes, 10 tags au plus. Le
 * vocabulaire Veille de la marque active est PROPOSÉ à la saisie (lecture
 * seule · aucun tag de Veille n'est créé depuis la Bibliothèque).
 *
 * ── Où il vit · sans migration ───────────────────────────────────────────────
 * Les tables `veille_tags*` lient un tag à une SAUVEGARDE (clé étrangère vers
 * `saved_ads`) · elles ne peuvent pas porter un fichier sans migration. Le tag
 * vit donc dans `assets.tags`, la colonne des tags IA, préfixé du marqueur
 * réservé `PREFIXE_TAG_MAIN` (comme le marqueur template · `templates-crea.ts`).
 * Le préfixe sépare la main de l'analyse :
 *  · poser ou retirer un tag à la main ne touche ni les tags IA ni le marqueur ;
 *  · une nouvelle analyse (`tagAssetAction`, payante, prix inchangé) remplace
 *    les tags IA et GARDE ceux posés à la main (`fusionTagsAnalyse`) · rien de
 *    ce que la personne a écrit ne disparaît ;
 *  · l'analyse en lot ne prend que les images SANS AUCUN tag (critère
 *    inchangé) · une image tagée à la main s'analyse à l'unité.
 *
 * Un tag IA se RETIRE à la main (le × de la maquette · `iaGardes`), il ne
 * s'ajoute jamais à la main comme tag IA · une analyse suivante peut le
 * reposer (dit à l'écran, `NOTE_TAGS_IA`). Aucun appel modèle, 0 $.
 */

export interface TagsFichier {
  /** Posés à la main · libellé et clé, dans l'ordre d'écriture. */
  main: TagVeille[];
  /** Posés par l'analyse · libellés, sans le marqueur ni les tags posés à la main. */
  ia: string[];
}

const estMain = (t: string) => t.startsWith(PREFIXE_TAG_MAIN);

/** Ce que la colonne `tags` porte · la main d'un côté, l'analyse de l'autre (le marqueur template n'est ni l'un ni l'autre). */
export function lireTagsFichier(tags: readonly string[] | null | undefined): TagsFichier {
  const main: TagVeille[] = [];
  const ia: string[] = [];
  for (const t of tags ?? []) {
    if (t === TAG_TEMPLATE) continue;
    if (estMain(t)) {
      const nom = t.slice(PREFIXE_TAG_MAIN.length);
      const cle = cleTag(nom);
      if (cle && !main.some((x) => x.cle === cle)) main.push({ cle, nom });
    } else if (t && !ia.includes(t)) ia.push(t);
  }
  return { main, ia };
}

/**
 * La colonne après « Tags posés à la main » · la liste DEMANDÉE remplace les
 * tags posés à la main (validée par la règle de la Veille, phrase « par
 * fichier »), le marqueur template reste, et les tags IA restent tels quels,
 * à leur place · sauf, quand `iaGardes` est donné, ceux qui n'y figurent plus
 * (le × d'un tag IA) · on ne peut que RETIRER un tag IA, jamais en ajouter.
 * Une liste vide retire tous les tags posés à la main.
 */
export function ecritureTagsMain(existants: readonly string[] | null | undefined, demandes: unknown, iaGardes?: unknown): Valide<{ tags: string[]; main: TagVeille[] }> {
  const v = validerTags(demandes, 'fichier');
  if (!v.ok) return v;
  if (iaGardes !== undefined && (!Array.isArray(iaGardes) || iaGardes.some((x) => typeof x !== 'string'))) return { ok: false, raison: 'Liste de tags illisible · recharge la page.' };
  const gardes = iaGardes === undefined ? null : new Set(iaGardes as string[]);
  const garde = (existants ?? []).filter((t) => !estMain(t) && (t === TAG_TEMPLATE || !gardes || gardes.has(t)));
  return { ok: true, tags: [...garde, ...v.tags.map((t) => `${PREFIXE_TAG_MAIN}${t.nom}`)], main: v.tags };
}

/**
 * La colonne après une ANALYSE · les tags IA rendus par le modèle remplacent
 * les tags IA d'avant · les tags posés à la main et le marqueur template sont
 * gardés. Un tag IA rendu ne peut jamais se faire passer pour un tag posé à la
 * main ou pour le marqueur (filtré).
 */
export function fusionTagsAnalyse(existants: readonly string[] | null | undefined, ia: readonly string[]): string[] {
  const avant = existants ?? [];
  const propres = ia.filter((t) => t && t !== TAG_TEMPLATE && !estMain(t));
  return [...propres, ...avant.filter(estMain), ...(avant.includes(TAG_TEMPLATE) ? [TAG_TEMPLATE] : [])];
}

/** Tous les tags d'un fichier, une entrée par clé · la main d'abord (elle l'emporte sur un tag IA de même clé). */
export function tagsDuFichier(t: TagsFichier | null | undefined): TagVeille[] {
  if (!t) return [];
  const out = [...t.main];
  for (const nom of t.ia) { const cle = cleTag(nom); if (cle && !out.some((x) => x.cle === cle)) out.push({ cle, nom }); }
  return out;
}

/** Le filtre « Tags » de la barre · un fichier passe s'il porte ce tag (à la main ou par l'analyse). */
export function passeTagFichier(t: TagsFichier | null | undefined, cle: string | null | undefined): boolean {
  if (!cle) return true;
  return tagsDuFichier(t).some((x) => x.cle === cle);
}

export const RAISON_TAGS_AUCUN = 'Aucun tag sur les fichiers affichés · pose-en un depuis l’aperçu.';
export const RAISON_TAGS_UN_SEUL = 'Un seul tag, porté par tous les fichiers affichés · ce filtre ne séparerait rien.';

/**
 * Le menu « Tags » de la barre locale · les tags des fichiers AFFICHÉS (avant
 * ce filtre), chacun avec son effectif. Fermé, avec sa raison, quand il ne
 * séparerait rien (même règle que les filtres locaux de la Veille ·
 * `controlesLocaux`) · aucun tag, ou un seul tag porté par tous.
 */
export function controleTagsFichiers(fichiers: ReadonlyArray<{ tags: TagsFichier | null | undefined }>): ControleLocal {
  const m = new Map<string, TagVeille & { n: number }>();
  for (const f of fichiers) for (const t of tagsDuFichier(f.tags)) { const x = m.get(t.cle); if (x) x.n++; else m.set(t.cle, { ...t, n: 1 }); }
  const options = trierTags([...m.values()]).map((t) => ({ valeur: t.cle, libelle: t.nom, n: t.n }));
  if (!options.length) return { ouvert: false, raison: RAISON_TAGS_AUCUN, options };
  if (options.length === 1 && options[0]!.n === fichiers.length) return { ouvert: false, raison: RAISON_TAGS_UN_SEUL, options };
  return { ouvert: true, raison: null, options };
}

/** La phrase dite après l'enregistrement · seulement après le oui du serveur. */
export function messageTagsMain(avant: number, apres: number, nom: string): string {
  if (apres > avant) return `Tag ajouté à « ${nom} »`;
  if (apres < avant) return `Tag retiré de « ${nom} »`;
  return `Tags de « ${nom} » enregistrés`;
}

/** Ce que l'aperçu dit des tags IA · ils se lisent, l'analyse suivante les remplace. */
export const NOTE_TAGS_IA = 'Tags IA · posés par l’analyse · un tag IA retiré peut revenir à l’analyse suivante · les tags posés à la main restent.';
