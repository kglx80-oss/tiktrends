/**
 * Spatial · fiche projet · onglet « Créations » · les filtres LOCAUX
 * (lot 8 V5 · PC C15 « Toutes / 4:5 / 9:16 »).
 *
 * Pur. On ne filtre que les créations déjà lues sous leur droit (les sorties
 * réelles des lots du projet) · rien n'est relu, rien n'est écrit. Quatre axes,
 * chacun proposé SEULEMENT s'il sépare vraiment quelque chose (au moins deux
 * valeurs présentes) · un filtre qui ne filtre rien n'est pas montré :
 *
 *  · format · le RAPPORT RÉEL du fichier livré (largeur × hauteur), pas le
 *    format demandé · un « 4:5 » rendu en 768 × 1024 se dit « 3:4 » ;
 *  · état · prête, en préparation, sans sortie (échec ou annulée) ;
 *  · retenue · retenue comme variante, ou non ;
 *  · version · la version courante ou une branche antérieure.
 *
 * Le résumé dit combien de créations restent et quels filtres sont actifs,
 * pour qu'on sache toujours pourquoi la grille est plus courte.
 */

export type EtatCreationFiltre = 'prete' | 'en_cours' | 'sans_sortie';
export type RetenueCreation = 'retenue' | 'non_retenue';
export type AxeFiltreCreations = 'format' | 'etat' | 'retenue' | 'version';

export interface CreationFiltrable {
  /** Le rapport réel (`formatCreation`) · `null` pour un lot sans sortie ou sans dimensions. */
  format: string | null;
  etat: EtatCreationFiltre;
  /** `null` · un lot sans sortie n'a rien à retenir. */
  retenue: RetenueCreation | null;
  version: string;
}

export type FiltresCreations = Record<AxeFiltreCreations, string | null>;

export const FILTRES_CREATIONS_VIDES: FiltresCreations = { format: null, etat: null, retenue: null, version: null };

export const LIBELLES_AXE_CREATIONS: Readonly<Record<AxeFiltreCreations, string>> = {
  format: 'Format', etat: 'État', retenue: 'Variante', version: 'Version',
};

const LIBELLES_ETAT: Readonly<Record<EtatCreationFiltre, string>> = {
  prete: 'Prêtes', en_cours: 'En préparation', sans_sortie: 'Sans sortie',
};
const LIBELLES_RETENUE: Readonly<Record<RetenueCreation, string>> = { retenue: 'Retenues', non_retenue: 'Non retenues' };
const ORDRE_ETAT: readonly EtatCreationFiltre[] = ['prete', 'en_cours', 'sans_sortie'];
const ORDRE_RETENUE: readonly RetenueCreation[] = ['retenue', 'non_retenue'];

/** Rapports nommés de la diffusion, essayés quand la fraction exacte serait illisible (dimensions arrondies par un fournisseur). */
const RAPPORTS_CONNUS: ReadonlyArray<[string, number]> = [['1:1', 1], ['4:5', 4 / 5], ['3:4', 3 / 4], ['2:3', 2 / 3], ['9:16', 9 / 16], ['16:9', 16 / 9], ['3:2', 3 / 2], ['4:3', 4 / 3]];
/**
 * Écart relatif toléré vers un rapport nommé · mesuré sur les tailles livrées
 * par les fournisseurs du dépôt (`fal-image.ts` · 576 × 1024, 768 × 1024,
 * 1024 × 1536, 1024 × 1024 ; compositions 1080 × 1350 / 1080 × 1920 / 1080 ×
 * 1080) : toutes tombent EXACTEMENT sur leur fraction (écart 0). La tolérance
 * ne sert qu'aux arrondis d'un pixel (1080 × 1351 → 0,07 %) · 1 % laisse
 * quatorze fois cette marge sans jamais confondre 4:5 (0,800) et 3:4 (0,750),
 * écartés de 6,7 %.
 */
const TOLERANCE_RAPPORT = 0.01;
const TERME_MAX_LISIBLE = 21;

const pgcd = (a: number, b: number): number => (b === 0 ? a : pgcd(b, a % b));

/** Le format RÉEL d'un fichier · « 4:5 », « 9:16 », « 3:4 »… ou « 1000 × 1251 » si aucun rapport ne tombe juste. `null` sans dimensions. */
export function formatCreation(largeur: number | null | undefined, hauteur: number | null | undefined): string | null {
  if (!largeur || !hauteur || !Number.isInteger(largeur) || !Number.isInteger(hauteur) || largeur < 1 || hauteur < 1) return null;
  const g = pgcd(largeur, hauteur);
  const a = largeur / g;
  const b = hauteur / g;
  if (a <= TERME_MAX_LISIBLE && b <= TERME_MAX_LISIBLE) return `${a}:${b}`;
  const r = largeur / hauteur;
  const proche = RAPPORTS_CONNUS.find(([, v]) => Math.abs(r - v) / v <= TOLERANCE_RAPPORT);
  return proche ? proche[0] : `${largeur} × ${hauteur}`;
}

/** L'état d'une création pour le filtre · depuis l'état réel du lot (`etatGeneration`). */
export function etatCreationFiltre(e: { pret: boolean; actif: boolean }): EtatCreationFiltre {
  return e.pret ? 'prete' : e.actif ? 'en_cours' : 'sans_sortie';
}

const valeurAxe = (c: CreationFiltrable, axe: AxeFiltreCreations): string | null => c[axe];

export interface OptionFiltreCreations { valeur: string; libelle: string; n: number }
export interface AxeFiltreCreationsVue { axe: AxeFiltreCreations; libelle: string; options: OptionFiltreCreations[] }

function libelleValeur(axe: AxeFiltreCreations, v: string): string {
  if (axe === 'etat') return LIBELLES_ETAT[v as EtatCreationFiltre] ?? v;
  if (axe === 'retenue') return LIBELLES_RETENUE[v as RetenueCreation] ?? v;
  return v;
}

function ordreValeurs(axe: AxeFiltreCreations, valeurs: string[]): string[] {
  if (axe === 'etat') return ORDRE_ETAT.filter((v) => valeurs.includes(v));
  if (axe === 'retenue') return ORDRE_RETENUE.filter((v) => valeurs.includes(v));
  // Format · les rapports nommés dans l'ordre de la diffusion, puis le reste ; version · l'ordre de lecture (la courante d'abord).
  if (axe === 'format') {
    const connus = RAPPORTS_CONNUS.map(([n]) => n);
    return [...valeurs].sort((x, y) => (connus.includes(x) ? connus.indexOf(x) : 99) - (connus.includes(y) ? connus.indexOf(y) : 99) || x.localeCompare(y));
  }
  return valeurs;
}

/**
 * Les axes proposés · chacun avec ses valeurs PRÉSENTES et leur compteur réel
 * (« 4:5 · 3 »). Un axe à une seule valeur ne sépare rien · il n'est pas proposé.
 */
export function axesFiltresCreations(items: readonly CreationFiltrable[]): AxeFiltreCreationsVue[] {
  const axes: AxeFiltreCreations[] = ['format', 'etat', 'retenue', 'version'];
  return axes.flatMap((axe) => {
    const valeurs: string[] = [];
    for (const c of items) { const v = valeurAxe(c, axe); if (v !== null && !valeurs.includes(v)) valeurs.push(v); }
    if (valeurs.length < 2) return [];
    return [{
      axe, libelle: LIBELLES_AXE_CREATIONS[axe],
      options: ordreValeurs(axe, valeurs).map((v) => ({ valeur: v, libelle: libelleValeur(axe, v), n: items.filter((c) => valeurAxe(c, axe) === v).length })),
    }];
  });
}

/** Les créations qui passent TOUS les filtres actifs · l'ordre d'entrée est conservé. */
export function filtrerCreations<T extends CreationFiltrable>(items: readonly T[], f: FiltresCreations): T[] {
  const actifs = (Object.keys(f) as AxeFiltreCreations[]).filter((a) => f[a] !== null);
  return items.filter((c) => actifs.every((a) => valeurAxe(c, a) === f[a]));
}

/** Un clic sur une valeur · la choisit, ou la retire si elle était choisie (retour à « Toutes »). */
export function basculerFiltreCreations(f: FiltresCreations, axe: AxeFiltreCreations, valeur: string | null): FiltresCreations {
  return { ...f, [axe]: valeur === null || f[axe] === valeur ? null : valeur };
}

/**
 * Ce que l'écran dit des filtres · « 3 créations sur 8 · Format 4:5 · Retenues »,
 * ou rien quand aucun filtre n'est actif. `vide` · la phrase quand plus rien ne passe.
 */
export function resumeFiltresCreations(total: number, visibles: number, f: FiltresCreations): { actif: boolean; phrase: string | null; vide: string | null } {
  const actifs = (Object.keys(f) as AxeFiltreCreations[]).filter((a) => f[a] !== null);
  if (!actifs.length) return { actif: false, phrase: null, vide: null };
  const libelles = actifs.map((a) => `${LIBELLES_AXE_CREATIONS[a]} ${libelleValeur(a, f[a]!)}`);
  return {
    actif: true,
    phrase: `${visibles} création${visibles > 1 ? 's' : ''} sur ${total} · ${libelles.join(' · ')}`,
    vide: visibles === 0 ? 'Aucune création ne passe ces filtres · réinitialise-les pour tout revoir.' : null,
  };
}
