import { messageServiceInactif } from '../../copie-service';
import { completudeFicheMarque, ELEMENTS_FICHE_MARQUE, type FicheMarqueLue } from '../../accueil-v5';

/**
 * Spatial · Marque · les règles de la fiche (vue d'ensemble, Identité, Offre,
 * Personas). Pur · l'appelant lit la base, ce module décide ce qui s'affiche.
 */

/* ───────────────────────── À compléter ───────────────────────── */

/** Un champ texte de `brands` qu'on remplit en place (formulaire `updateBrandAction`). */
export type ChampFicheMarque = 'description' | 'usp' | 'audience' | 'category' | 'categoryNeeds' | 'tone' | 'industryTags' | 'colors' | 'competitors';

export type CibleACompleter =
  | { type: 'champ'; champ: ChampFicheMarque; saisie: 'texte' | 'virgules' | 'lignes' }
  | { type: 'lien'; href: string };

export interface LigneACompleter {
  cle: keyof FicheMarqueLue;
  titre: string;
  detail: string;
  icone: string;
  cible: CibleACompleter;
}

/** Un libellé, une icône du sprite et une destination RÉELLE par élément de la fiche (douze, `ELEMENTS_FICHE_MARQUE`). */
const LIGNES: Record<keyof FicheMarqueLue, { titre: string; detail: string; icone: string; cible: (id: string) => CibleACompleter }> = {
  description: { titre: 'Description', detail: 'Ce que vend la marque, en deux phrases', icone: 'text', cible: () => ({ type: 'champ', champ: 'description', saisie: 'texte' }) },
  usp: { titre: 'Promesse', detail: 'Ce qui la distingue de ses concurrents', icone: 'spark', cible: () => ({ type: 'champ', champ: 'usp', saisie: 'texte' }) },
  audience: { titre: 'Audience', detail: 'À qui elle s’adresse', icone: 'users', cible: () => ({ type: 'champ', champ: 'audience', saisie: 'texte' }) },
  category: { titre: 'Catégorie', detail: 'Le rayon où elle se range', icone: 'tag', cible: () => ({ type: 'champ', champ: 'category', saisie: 'texte' }) },
  categoryNeeds: { titre: 'Besoins de la catégorie', detail: 'Ce que tout client de ce rayon attend', icone: 'bulb', cible: () => ({ type: 'champ', champ: 'categoryNeeds', saisie: 'texte' }) },
  tone: { titre: 'Ton', detail: 'Comment la marque parle', icone: 'chat', cible: () => ({ type: 'champ', champ: 'tone', saisie: 'virgules' }) },
  industryTags: { titre: 'Tags du secteur', detail: 'Séparés par des virgules', icone: 'tag', cible: () => ({ type: 'champ', champ: 'industryTags', saisie: 'virgules' }) },
  colors: { titre: 'Couleurs', detail: 'Codes couleur, séparés par des virgules', icone: 'img', cible: () => ({ type: 'champ', champ: 'colors', saisie: 'virgules' }) },
  scenarios: { titre: 'Scénarios d’usage', detail: 'Les moments où le produit sert', icone: 'cal', cible: (id) => ({ type: 'lien', href: `/brands/${id}/personas` }) },
  personas: { titre: 'Personas', detail: 'Les personnes à qui parler', icone: 'users', cible: (id) => ({ type: 'lien', href: `/brands/${id}/personas` }) },
  produits: { titre: 'Produits', detail: 'Ce que la marque vend', icone: 'tag', cible: (id) => ({ type: 'lien', href: `/brands/${id}/offre` }) },
  concurrents: { titre: 'Concurrents', detail: 'Un par ligne', icone: 'eye', cible: () => ({ type: 'champ', champ: 'competitors', saisie: 'lignes' }) },
};

/** Les éléments RÉELLEMENT manquants, dans l'ordre de la fiche · `[]` quand elle est complète. */
export function lignesACompleter(f: FicheMarqueLue, brandId: string): LigneACompleter[] {
  const { checks } = completudeFicheMarque(f);
  return ELEMENTS_FICHE_MARQUE.filter((_, i) => !checks[i]).map(({ cle }) => {
    const l = LIGNES[cle];
    return { cle, titre: l.titre, detail: l.detail, icone: l.icone, cible: l.cible(brandId) };
  });
}

/* ───────────────────────── Textes en pastilles ───────────────────────── */

/**
 * Un texte libre découpé en morceaux courts (pastilles) · virgules, points-virgules,
 * retours à la ligne et « · ». Les doublons (casse ignorée) et les vides tombent.
 */
export function morceauxTexte(t: string | null | undefined, max = 8): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const brut of (t ?? '').split(/[,;\n·•]+/)) {
    const m = brut.trim().replace(/\.$/, '');
    if (!m || vus.has(m.toLowerCase())) continue;
    vus.add(m.toLowerCase());
    out.push(m);
    if (out.length >= max) break;
  }
  return out;
}

/** Une liste de `text[]` nettoyée (vides et doublons retirés). */
export function listePropre(a: readonly (string | null | undefined)[] | null | undefined, max = 12): string[] {
  return morceauxTexte((a ?? []).filter(Boolean).join('\n'), max);
}

/* ───────────────────────── Produits ───────────────────────── */

export interface ProduitLu { nom: string; prix: number | null; image: boolean; description: string | null }

/** Le prix comme la maquette · « 24,90 € ». */
export const prixEuros = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/**
 * L'état d'une fiche produit · « complète » quand prix, photo et description
 * sont là. Sinon, la PREMIÈRE pièce manquante est nommée (maquette : « photos
 * manquantes », « fiche à compléter »).
 */
export function statutFicheProduit(p: ProduitLu): { complete: boolean; detail: string } {
  const manque = p.prix == null ? 'prix manquant' : !p.image ? 'photo manquante' : !(p.description && p.description.trim()) ? 'description manquante' : null;
  const prix = p.prix != null ? `${prixEuros(p.prix)} · ` : '';
  return { complete: manque === null, detail: `${prix}${manque ?? 'fiche complète'}` };
}

export function resumeProduits(ps: readonly ProduitLu[]): { aCompleter: number; libelle: string | null } {
  const n = ps.filter((p) => !statutFicheProduit(p).complete).length;
  return { aCompleter: n, libelle: n > 0 ? `${n} fiche${n > 1 ? 's' : ''} à compléter` : null };
}

/* ───────────────────────── Sources de Jarvis ───────────────────────── */

export interface SourcesMarqueLues {
  site: string | null;
  produits: number;
  personas: number;
  assets: number;
  shopify: boolean;
  meta: boolean;
}

export interface SourceJarvis { libelle: string; branchee: boolean }

/** Ce que Jarvis lit réellement pour cette marque · chaque ligne dit si la source est là. */
export function sourcesJarvisMarque(s: SourcesMarqueLues): SourceJarvis[] {
  const n = (k: number, un: string, plusieurs: string) => `${k} ${k > 1 ? plusieurs : un}`;
  return [
    { libelle: s.site ? `${s.site} · site de la marque` : 'Site de la marque', branchee: !!s.site },
    { libelle: s.produits > 0 ? `Fiches produit · ${n(s.produits, 'produit', 'produits')}` : 'Fiches produit', branchee: s.produits > 0 },
    { libelle: s.personas > 0 ? `Personas · ${n(s.personas, 'fiche', 'fiches')}` : 'Personas', branchee: s.personas > 0 },
    { libelle: s.assets > 0 ? `Bibliothèque · ${n(s.assets, 'média', 'médias')}` : 'Bibliothèque de la marque', branchee: s.assets > 0 },
    { libelle: 'Boutique Shopify', branchee: s.shopify },
    { libelle: 'Résultats Meta Ads', branchee: s.meta },
  ];
}

export function manquantesLibelle(sources: readonly SourceJarvis[]): string | null {
  const n = sources.filter((x) => !x.branchee).length;
  return n > 0 ? `${n} manquante${n > 1 ? 's' : ''}` : null;
}

/* ───────────────────────── Retours d'action ───────────────────────── */

/**
 * Les messages des actions serveur de la fiche (`?ok=` / `?e=` posés par leur
 * redirection) · mêmes textes que l'écran V5. Un code inconnu ne dit rien.
 */
const OK_MARQUE: Record<string, string> = {
  saved: 'Fiche mise à jour.', created: 'Marque créée.', generated: 'Fiche complétée depuis le site (profil, audience, concurrents).',
  da: 'Style du site analysé · il guide désormais chaque créa générée.', 'da-edit': 'Style corrigé · ta version prime sur celle de l’agent.', persona: 'Persona ajouté.', scenario: 'Scénario ajouté.',
  product: 'Produit ajouté.', imported: 'Produits importés.', shopify: 'Boutique Shopify connectée : produits, images et charte importés.',
};
const ERR_MARQUE: Record<string, string> = {
  nourl: 'Renseigne le site de la marque pour importer.', ai: messageServiceInactif('ia_profil'), credits: 'Crédits insuffisants.',
  import: 'L’import a échoué, réessaie.', generate: 'La génération a échoué, réessaie.',
  name: 'Donne un nom à la marque.', shopify_domain: 'Indique le domaine de ta boutique Shopify.',
  shopify_notfound: 'Catalogue Shopify introuvable sur ce domaine. Vérifie l’adresse, ou essaie le domaine .myshopify.com.',
};

export function retourActionMarque(ok?: string | null, e?: string | null): { message: string; erreur: boolean } | null {
  if (e && ERR_MARQUE[e]) return { message: ERR_MARQUE[e]!, erreur: true };
  if (ok && OK_MARQUE[ok]) return { message: OK_MARQUE[ok]!, erreur: false };
  return null;
}

/** Tous les messages, indexés `ok:<code>` / `e:<code>` · ce que lit l'annonce de l'écran. */
export function messagesRetourMarque(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(OK_MARQUE)) out[`ok:${k}`] = v;
  for (const [k, v] of Object.entries(ERR_MARQUE)) out[`e:${k}`] = v;
  return out;
}

/* ───────────────────────── Personas ───────────────────────── */

const STATUT_PERSONA: Record<string, { libelle: string; classe: '' | 'g' | 'w' }> = {
  validated: { libelle: 'Validé', classe: 'g' }, proposed: { libelle: 'Proposé', classe: 'w' },
  rejected: { libelle: 'Écarté', classe: '' }, archived: { libelle: 'Archivé', classe: '' },
};

export function statutPersona(s: string | null | undefined): { libelle: string; classe: '' | 'g' | 'w' } {
  return STATUT_PERSONA[s ?? ''] ?? { libelle: 'Validé', classe: 'g' };
}

/** L'initiale d'un nom · la pastille ronde (`span.av`). */
export const initialeNom = (n: string) => (n.trim()[0] ?? '?').toUpperCase();

/**
 * Les teintes des pastilles d'avatar · celles de la maquette, dans son ordre
 * (rose, bleu, vert, ambre). Décoratives · elles ne portent aucune donnée.
 */
export const TEINTES_AVATAR_SPATIAL = ['#f4b6c8', '#a6d4e5', '#c9f2d8', '#ffe1a8'] as const;
export const teinteAvatar = (i: number) => TEINTES_AVATAR_SPATIAL[((i % TEINTES_AVATAR_SPATIAL.length) + TEINTES_AVATAR_SPATIAL.length) % TEINTES_AVATAR_SPATIAL.length]!;

/**
 * Les citations d'un persona · `personas.sources_json` (ADSMAP) peut porter des
 * extraits d'avis. On n'en garde que les textes RÉELS (chaîne ou `{ texte | text
 * | quote }`), jamais un libellé de type de source.
 */
export function citationsPersona(sources: unknown, max = 4): string[] {
  if (!Array.isArray(sources)) return [];
  const out: string[] = [];
  for (const s of sources) {
    const t = typeof s === 'string' ? s : s && typeof s === 'object' ? ((s as Record<string, unknown>).texte ?? (s as Record<string, unknown>).text ?? (s as Record<string, unknown>).quote) : null;
    if (typeof t === 'string' && t.trim().length >= 3) out.push(t.trim());
    if (out.length >= max) break;
  }
  return out;
}
