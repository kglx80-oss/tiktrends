import { daVisuelleUtile, normaliserDaVisuelle, type DaVisuelleMarque } from '../../da-visuelle';

/**
 * Spatial · Marque · TOUS les champs modifiables de la fiche (repris du
 * formulaire de profil de l'écran V5 `/brands/[id]`, `BrandOverviewForm`).
 * « À compléter » n'ouvre que les manquants ; cette liste rouvre aussi une
 * valeur DÉJÀ remplie. Chaque champ part par `updateBrandAction`, les autres
 * valeurs en caché (rien n'est écrasé). Pur.
 */
export type SaisieChampMarque = 'ligne' | 'texte' | 'virgules' | 'lignes';

export interface ChampModifiableMarque {
  champ: string;
  titre: string;
  aide: string;
  icone: string;
  saisie: SaisieChampMarque;
  /** La valeur actuelle, résumée pour la liste · `null` quand le champ est vide. */
  apercu: string | null;
}

const CHAMPS: ReadonlyArray<Omit<ChampModifiableMarque, 'apercu'>> = [
  { champ: 'name', titre: 'Nom', aide: 'Le nom affiché partout dans l’outil', icone: 'tag', saisie: 'ligne' },
  { champ: 'url', titre: 'Site', aide: 'Le site de la marque (ex. gruns.co)', icone: 'arrow', saisie: 'ligne' },
  { champ: 'description', titre: 'Description', aide: 'Ce que vend la marque, en deux phrases', icone: 'text', saisie: 'texte' },
  { champ: 'usp', titre: 'Promesse', aide: 'Ce qui la distingue · une proposition par ligne', icone: 'spark', saisie: 'texte' },
  { champ: 'audience', titre: 'Audience', aide: 'À qui elle s’adresse', icone: 'users', saisie: 'texte' },
  { champ: 'category', titre: 'Catégorie', aide: 'Le rayon où elle se range', icone: 'tag', saisie: 'ligne' },
  { champ: 'categoryNeeds', titre: 'Besoins de la catégorie', aide: 'Ce que tout client de ce rayon attend', icone: 'bulb', saisie: 'texte' },
  { champ: 'industry', titre: 'Secteur', aide: 'Le secteur d’activité', icone: 'grid', saisie: 'ligne' },
  { champ: 'industryTags', titre: 'Tags du secteur', aide: 'Séparés par des virgules', icone: 'tag', saisie: 'virgules' },
  { champ: 'moreAbout', titre: 'En savoir plus', aide: 'Tout ce que Jarvis doit savoir d’autre', icone: 'text', saisie: 'texte' },
  { champ: 'tone', titre: 'Ton', aide: 'Comment la marque parle', icone: 'chat', saisie: 'texte' },
  { champ: 'languages', titre: 'Langues', aide: 'Séparées par des virgules', icone: 'chat', saisie: 'virgules' },
  { champ: 'colors', titre: 'Couleurs', aide: 'Codes couleur, séparés par des virgules', icone: 'img', saisie: 'virgules' },
  { champ: 'fonts', titre: 'Polices', aide: 'Séparées par des virgules', icone: 'text', saisie: 'virgules' },
  { champ: 'preferredWords', titre: 'Mots à utiliser', aide: 'Séparés par des virgules', icone: 'check', saisie: 'virgules' },
  { champ: 'avoidWords', titre: 'Mots à éviter', aide: 'Séparés par des virgules · Jarvis les évite dans chaque texte', icone: 'x', saisie: 'virgules' },
  { champ: 'competitors', titre: 'Concurrents', aide: 'Un par ligne', icone: 'eye', saisie: 'lignes' },
];

/** Les champs ÉDITABLES par `updateBrandAction` · la garde vérifie qu'aucun n'est oublié. */
export const CHAMPS_PROFIL_MARQUE: readonly string[] = CHAMPS.map((c) => c.champ);

const LONGUEUR_APERCU = 90;

function apercu(v: string | undefined, saisie: SaisieChampMarque): string | null {
  const t = (v ?? '').trim();
  if (!t) return null;
  const une = saisie === 'lignes' ? t.split(/\n+/).map((x) => x.trim()).filter(Boolean).join(', ') : t.replace(/\s+/g, ' ');
  return une.length > LONGUEUR_APERCU ? `${une.slice(0, LONGUEUR_APERCU - 1).trimEnd()}…` : une;
}

/** Chaque champ de la fiche, avec sa valeur actuelle résumée (ou `null` quand il est vide). */
export function champsModifiablesMarque(valeurs: Readonly<Record<string, string>>): ChampModifiableMarque[] {
  return CHAMPS.map((c) => ({ ...c, apercu: apercu(valeurs[c.champ], c.saisie) }));
}

/* ───────────────────────── Style visuel déduit ───────────────────────── */

/**
 * Le style visuel déduit du site (`brandKit`, repris de l'écran V5 · « Style
 * déduit du site »), lisible en mots et corrigeable sans repayer. `utile` dit
 * s'il y a quelque chose à montrer ; `champs` alimente la correction
 * (`saveBrandVisualDaAction`, mêmes noms de champs que le formulaire V5).
 */
export function styleVisuelMarque(da: DaVisuelleMarque | null | undefined): {
  utile: boolean;
  lignes: Array<{ libelle: string; valeur: string }>;
  champs: Array<{ nom: string; libelle: string; valeur: string; exemple: string }>;
} {
  const d = normaliserDaVisuelle(da);
  const champs = [
    { nom: 'style', libelle: 'Style', valeur: d.style, exemple: 'éditorial minimaliste, beaucoup de blanc, cadrages nets' },
    { nom: 'photo', libelle: 'Photo', valeur: d.photo, exemple: 'macro produit sur fond texturé, lifestyle lumineux…' },
    { nom: 'ambiance', libelle: 'Ambiance', valeur: d.ambiance, exemple: 'premium et rassurant, énergique et pop…' },
    { nom: 'lumiere', libelle: 'Lumière', valeur: d.lumiere, exemple: 'lumière naturelle douce, ombres tenues' },
    { nom: 'couleurs', libelle: 'Couleurs', valeur: d.couleurs, exemple: 'tons crème et vert sauge, contrastes doux' },
    { nom: 'aEviter', libelle: 'À éviter', valeur: d.aEviter.join(', '), exemple: 'rendu stock, dégradés criards, surcharge' },
  ];
  return { utile: daVisuelleUtile(da), lignes: champs.filter((c) => c.valeur).map((c) => ({ libelle: c.libelle, valeur: c.valeur })), champs };
}
