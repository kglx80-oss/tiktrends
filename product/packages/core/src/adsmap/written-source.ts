/**
 * Décrire une créa à partir de ce qui est ÉCRIT sur elle.
 *
 * ── Le gisement dormant ──────────────────────────────────────────────────────
 *
 * La mémoire de Jarvis a huit dimensions. Quatre se déduisent de la structure du
 * graphe — mécanisme, format, stade de conscience, avatar — et se remplissent
 * dès l'import. Les quatre autres — type d'accroche, ouverture, talent, durée —
 * et **toute la bibliothèque d'accroches** viennent de la description de l'asset.
 *
 * Or sur un historique importé, l'asset est un lien Drive. Le modèle ne peut pas
 * l'ouvrir · l'appel échoue, l'ad est écartée, et la moitié la plus riche de la
 * mémoire reste vide pour toujours.
 *
 * Pourtant tout est là, en toutes lettres : l'hypothèse du test, la variable
 * changée, le titre du concept, l'accroche de l'angle, les apprentissages qu'on
 * en a tirés. **De la prose qui décrit la pub.** L'agent sait déjà travailler
 * sans image · il suffisait de lui donner ces mots plutôt qu'un lien mort.
 *
 * ── Ce qu'on refuse de faire ─────────────────────────────────────────────────
 *
 * Une description tirée d'un brief n'a pas la même valeur qu'une description
 * lue sur la vidéo. Le brief dit ce qu'on VOULAIT faire, le fichier dit ce qui a
 * été fait, et l'écart entre les deux est précisément ce qui fait rater un test.
 *
 * On ne les mélange donc pas en silence : la provenance est enregistrée, la
 * confiance est plafonnée, et l'écran le dit. Une mémoire qui ne sait plus d'où
 * elle tient ce qu'elle sait finit par se tromper avec assurance.
 *
 * Pur : ni base, ni réseau.
 */

/**
 * Hôtes qui servent une PAGE, jamais une image.
 *
 * Volontairement court. On refuse uniquement ce dont on est sûr · pour tout le
 * reste on tente, parce que beaucoup de CDN servent des images sans extension
 * dans l'URL et qu'une règle trop stricte perdrait de vrais assets en silence.
 * Un lien qui échoue coûte un aller-retour et bascule sur le texte ; un lien
 * rejeté à tort ne se voit jamais.
 */
const PAGES_DE_PARTAGE = [
  'drive.google.com', 'docs.google.com', 'dropbox.com', 'www.dropbox.com',
  'notion.so', 'www.notion.so', 'figma.com', 'www.figma.com',
  'wetransfer.com', 'we.tl', 'onedrive.live.com', 'sharepoint.com',
  'youtube.com', 'youtu.be', 'vimeo.com', 'loom.com',
];

/**
 * L'URL peut-elle raisonnablement être ouverte comme une image ?
 *
 * `null` quand on est certain que non · l'appel doit alors partir sans image,
 * plutôt que d'échouer puis d'être réessayé.
 */
export function usableImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith('data:image/')) return u;
  if (!/^https?:\/\//i.test(u)) return null;
  try {
    const h = new URL(u).hostname.toLowerCase();
    if (PAGES_DE_PARTAGE.some((p) => h === p || h.endsWith(`.${p}`))) return null;
  } catch {
    return null;   // URL non analysable · on ne la donne pas au modèle
  }
  return u;
}

/** Vrai quand le lien existe mais mène à une page, pas à un fichier. */
export function isSharePage(url: string | null | undefined): boolean {
  return !!url && !usableImageUrl(url);
}

/* -------------------------------------------------------------------------- */
/*  Le dossier écrit                                                          */
/* -------------------------------------------------------------------------- */

export interface WrittenFacts {
  conceptTitle?: string | null;
  /** Ce que l'ad pariait · le champ le plus informatif du tableau. */
  hypothesis?: string | null;
  testedVariable?: string | null;
  variableValue?: string | null;
  /** Mécanisme de l'angle · déjà en taxonomie fermée. */
  mechanism?: string | null;
  callout?: string | null;
  valueBlock?: string | null;
  format?: string | null;
  adType?: string | null;
  /** Apprentissages validés sur cette ad · ce qu'on a retenu après coup. */
  learnings?: string[];
}

const LIGNES: Array<[keyof WrittenFacts, string]> = [
  ['conceptTitle', 'Concept'],
  ['callout', 'Accroche de l’angle'],
  ['valueBlock', 'Promesse'],
  ['hypothesis', 'Hypothèse du test'],
  ['testedVariable', 'Variable testée'],
  ['variableValue', 'Valeur de la variable'],
  ['mechanism', 'Mécanisme'],
  ['adType', 'Type d’ad'],
];

/** Au-delà, on paie des jetons pour du remplissage. */
const MAX_CARS = 1800;

/**
 * Compose le dossier écrit d'une ad.
 *
 * Renvoie `null` quand il n'y a pas de quoi décrire · **deux champs minimum**.
 * Avec un seul titre de concept, un modèle remplirait quand même le formulaire,
 * et ces valeurs entreraient dans les statistiques comme si elles avaient été
 * observées. Refuser est ici le service rendu.
 */
export function writtenDossier(f: WrittenFacts): string | null {
  const lignes: string[] = [];
  for (const [cle, label] of LIGNES) {
    const v = f[cle];
    if (typeof v === 'string' && v.trim()) lignes.push(`${label} : ${v.trim()}`);
  }
  const apprentissages = (f.learnings ?? []).map((l) => l.trim()).filter(Boolean);
  if (apprentissages.length) {
    lignes.push(`Ce qu’on en a retenu :\n${apprentissages.slice(0, 4).map((l) => `- ${l}`).join('\n')}`);
  }

  // Un seul champ ne décrit pas une publicité · il la nomme.
  if (lignes.length < 2) return null;

  const corps = lignes.join('\n').slice(0, MAX_CARS);
  return `${EN_TETE}\n\n${corps}`;
}

/**
 * L'avertissement qui accompagne le dossier.
 *
 * Sans lui, le modèle décrit des plans, des coupes et des sous-titres qu'il n'a
 * jamais vus · il ne ment pas, il comble. Le dire explicitement transforme une
 * invention en abstention, et une abstention se rattrape.
 */
const EN_TETE = [
  'ATTENTION · tu ne vois PAS la créa. Ce qui suit est le brief écrit qui a servi à la produire.',
  'Décris uniquement ce que ce texte permet d’établir · type d’accroche, mécanisme, promesse.',
  'Laisse VIDE tout ce qui demande de regarder l’image : nombre de coupes, présence de sous-titres,',
  'seconde d’apparition du produit ou du CTA. Ne devine pas · une case vide se complète plus tard,',
  'une case inventée fausse une statistique pour toujours.',
].join('\n');

/* -------------------------------------------------------------------------- */
/*  Provenance                                                                */
/* -------------------------------------------------------------------------- */

export type AnalysisSource = 'asset' | 'written';

/**
 * Plafond de confiance d'une description tirée du seul brief.
 *
 * Le brief dit ce qu'on voulait faire, l'asset dit ce qui a été fait · l'écart
 * entre les deux est précisément ce qui fait rater un test. Une description
 * écrite ne peut donc pas prétendre à la même certitude, même quand le modèle
 * se dit sûr de lui.
 */
export const WRITTEN_CONFIDENCE_CAP = 0.6;

/** Suffixe du modèle enregistré · rend la provenance lisible en base. */
export function sourceTag(model: string, source: AnalysisSource): string {
  return source === 'written' ? `${model}:texte` : model;
}

export function sourceOf(analysisModel: string | null | undefined): AnalysisSource | 'manual' | null {
  if (!analysisModel) return null;
  if (analysisModel === 'manuel') return 'manual';
  return analysisModel.endsWith(':texte') ? 'written' : 'asset';
}

/**
 * Coût d'une description tirée du seul texte.
 *
 * Moins chère qu'une description d'asset (0,02 $, cf. `radar.ts`) parce qu'une
 * vignette pèse à elle seule près de la moitié des jetons d'entrée. Arrondi vers
 * le haut, comme l'autre : une estimation optimiste d'un coût est fausse dans le
 * seul sens qui fasse mal.
 */
export const COST_WRITTEN_USD = 0.013;

/** Ce que coûtera une tranche · dit AVANT de la lancer, jamais après. */
export function estimateAnalysisCost(withAsset: number, written: number): number {
  return Math.ceil((withAsset * 0.02 + written * COST_WRITTEN_USD) * 100) / 100;
}

/** Ce qu'on affiche pour dire d'où vient une description. */
export const SOURCE_LABEL: Record<AnalysisSource | 'manual', string> = {
  asset: 'lue sur la créa',
  written: 'déduite du brief',
  manual: 'saisie à la main',
};
