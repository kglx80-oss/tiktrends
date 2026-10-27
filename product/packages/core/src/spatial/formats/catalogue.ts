import type { FormatCreatifId } from '../../formats-creatifs';

/**
 * Les 28 styles de créa statique de l'interface Spatial (écrans `formats` et
 * `f-<clé>` de la maquette). Pur.
 *
 * ── Ce que ce catalogue EST, et ce qu'il n'est pas ───────────────────────────
 *
 * C'est le contenu ÉDITORIAL de la galerie · nom, famille, définition, niveaux
 * de conscience visés, objectif, anatomie (zones) et règles de mise en page. Il
 * ne remplace PAS la liste normative des formats (`formats-creatifs.ts`, 25
 * formats et Autre), qui reste la seule taxonomie de CLASSEMENT · aucune
 * annonce n'est jamais rangée dans un « style ».
 *
 * Le pont entre les deux est `formatNormatif` · le format de la liste dont le
 * style est la version statique. Les chiffres d'un style (pubs, diffusion,
 * tendance) sont ceux des annonces CLASSÉES dans ce format, et rien d'autre.
 * Un style sans format correspondant (`null`) n'a pas de chiffre · l'écran le
 * dit au lieu d'en inventer. Le pont est INJECTIF (garde) · deux styles qui
 * partageraient un format afficheraient deux fois les mêmes annonces.
 *
 * Ce qui n'a PAS été repris de la maquette · les compteurs (pubs, jours, part,
 * hausse), les accroches d'exemple et tout ce qui nomme la marque de démo · ce
 * sont des simulations, pas du contenu.
 */

export const CLES_STYLES = [
  'avap', 'vs', 'avis', 'callout', 'probsol', 'promo', 'chat', 'mag', 'ugc', 'packshot', 'liste', 'demo',
  'benef', 'logo', 'question', 'collage', 'flatlay', 'story', 'notes', 'tweet', 'meme', 'minimal', 'presse',
  'chiffre', 'social', 'texte', 'lifestyle', 'trendy',
] as const;
export type CleStyle = (typeof CLES_STYLES)[number];

export const FAMILLES_STYLES = ['Preuve', 'Comparaison', 'Message', 'Natif', 'Produit & offre', 'Design'] as const;
export type FamilleStyle = (typeof FAMILLES_STYLES)[number];

/** Les cinq niveaux de conscience du client (Schwartz), dans l'ordre. */
export const NIVEAUX_CONSCIENCE = ['Inconscient', 'Conscient du problème', 'Conscient de la solution', 'Conscient du produit', 'Prêt à acheter'] as const;

export type ObjectifStyle = 'Conversion' | 'Accroche' | 'CTR' | 'Notoriété';

/** Une zone de l'anatomie · son nom, ce qu'elle porte, et son repère (en % de la miniature). */
export type ZoneStyle = readonly [titre: string, role: string, repere: readonly [x: number, y: number]];

export interface StyleCrea {
  cle: CleStyle;
  nom: string;
  famille: FamilleStyle;
  /** Les noms de ce style dans les bibliothèques publicitaires (en anglais). */
  enVeille: readonly string[];
  definition: string;
  /** Index dans `NIVEAUX_CONSCIENCE`. */
  conscience: readonly number[];
  objectif: ObjectifStyle;
  /** Le format de la liste normative dont ce style est la version statique · `null` = aucun. */
  formatNormatif: FormatCreatifId | null;
  zones: readonly ZoneStyle[];
  regles: readonly string[];
}

const S = (s: StyleCrea) => s;

export const STYLES_CREA: readonly StyleCrea[] = [
  S({ cle: 'avap', nom: 'Avant / Après', famille: 'Preuve', enVeille: ['Before & After'], definition: 'Le problème vécu, puis le résultat avec le produit, côte à côte.', conscience: [1, 2], objectif: 'Conversion', formatNormatif: 'avant_apres',
    zones: [['Avant', 'Le problème, désaturé, sans le produit', [25, 40]], ['Après', 'Le même cadre, avec le produit et de la couleur', [75, 40]], ['Légende', 'Une phrase qui nomme le bénéfice', [50, 86]]],
    regles: ['Même cadrage des deux côtés : seul le résultat change.', 'Le « avant » doit rester crédible, sans exagération.', 'Pas d’allégation interdite dans la légende (« garanti »).'] }),
  S({ cle: 'vs', nom: 'Nous vs les autres', famille: 'Comparaison', enVeille: ['Us vs. Them', 'Comparison'], definition: 'Un tableau à deux colonnes : tes atouts face aux défauts des autres.', conscience: [2, 3], objectif: 'Conversion', formatNormatif: 'comparatif',
    zones: [['Titre', 'La question qui ouvre la comparaison', [50, 10]], ['Tes atouts', '3 points vérifiables, cochés', [25, 55]], ['Les autres', 'Les défauts, sans nommer de marque', [75, 55]]],
    regles: ['Jamais de comparaison nominative (règle de la fiche marque).', '3 lignes maximum, lisibles en 1 seconde.', 'Des atouts que la marque peut prouver.'] }),
  S({ cle: 'avis', nom: 'Avis client', famille: 'Preuve', enVeille: ['Testimonial', 'Testimonials / Reviews'], definition: 'Une capture d’avis autorisé, avec la note et le prénom.', conscience: [2, 3, 4], objectif: 'Conversion', formatNormatif: 'avis_client',
    zones: [['Visuel', 'Le produit en situation', [50, 35]], ['Note', '5 étoiles, en haut de la carte', [30, 68]], ['Citation', 'L’avis autorisé, mot pour mot', [50, 80]]],
    regles: ['Uniquement des avis autorisés dans la fiche marque.', 'La citation courte bat la citation longue.', 'Le prénom rassure plus qu’un pseudo.'] }),
  S({ cle: 'callout', nom: 'Callout', famille: 'Comparaison', enVeille: ['Feature Framing'], definition: 'Le produit annoté par des étiquettes qui pointent ses atouts.', conscience: [3, 4], objectif: 'CTR', formatNormatif: 'callout',
    zones: [['Produit', 'Centré, net, bien éclairé', [50, 45]], ['Étiquettes', '2 à 4 atouts, collés aux bonnes zones', [22, 20]], ['Bandeau', 'La promesse en une ligne', [50, 90]]],
    regles: ['4 étiquettes maximum.', 'Chaque étiquette pointe une partie réelle du produit.', 'Le bandeau reprend l’accroche gagnante.'] }),
  S({ cle: 'probsol', nom: 'Problème / Solution', famille: 'Message', enVeille: ['Problem / Solution', 'Outcome Focused'], definition: 'Le problème vécu en haut, le produit qui le règle en bas.', conscience: [1, 2], objectif: 'Accroche', formatNormatif: null,
    zones: [['Problème', 'Une question qui nomme la douleur', [50, 10]], ['Produit', 'La solution, au centre', [50, 50]], ['Solution', 'La réponse, en une ligne', [50, 90]]],
    regles: ['Le problème posé en question.', 'Une seule douleur par créa.', 'La solution répond mot pour mot au problème.'] }),
  S({ cle: 'promo', nom: 'Promo / Offre', famille: 'Produit & offre', enVeille: ['Offer', 'Sale', 'Deals & Discounts'], definition: 'L’offre comme accroche principale, avec un badge visible.', conscience: [3, 4], objectif: 'Conversion', formatNormatif: 'promo',
    zones: [['Badge', 'La réduction, en gros', [78, 18]], ['Produit', 'Le produit qui est en promo', [45, 50]], ['Code', 'Le code ou la condition', [50, 86]]],
    regles: ['Une seule offre par visuel.', 'Uniquement des offres actives de la fiche marque.', 'La date de fin crée l’urgence.'] }),
  S({ cle: 'chat', nom: 'Fake chat', famille: 'Natif', enVeille: ['Fake chat', 'Social Platform'], definition: 'Une conversation façon messagerie, qui ressemble à un vrai échange.', conscience: [0, 1], objectif: 'Accroche', formatNormatif: 'conversation',
    zones: [['Fond', 'Le produit, flouté, en arrière-plan', [50, 30]], ['Message 1', 'L’accroche, écrite comme un vrai message', [35, 62]], ['Réponse', 'Le produit nommé dans la réponse', [65, 78]]],
    regles: ['Le ton d’un vrai message, sans majuscules partout.', '3 bulles maximum.', 'Le produit arrive dans la deuxième bulle, pas la première.'] }),
  S({ cle: 'mag', nom: 'Advertorial', famille: 'Message', enVeille: ['Advertorial', 'Media / News'], definition: 'Un faux article de presse : titre éditorial et visuel.', conscience: [0, 1], objectif: 'CTR', formatNormatif: 'advertorial',
    zones: [['Rubrique', 'Le nom du faux magazine', [30, 8]], ['Titre', 'Une promesse éditoriale, sans parler du produit', [50, 20]], ['Visuel', 'Le produit, en illustration', [50, 65]]],
    regles: ['Le titre ne cite pas la marque.', 'Le ton d’un article, pas d’une pub.', 'Fonctionne bien en tout début de parcours.'] }),
  S({ cle: 'ugc', nom: 'UGC / POV', famille: 'Natif', enVeille: ['UGC'], definition: 'Une vidéo ou photo façon créateur, avec un texte POV par-dessus.', conscience: [0, 1, 2], objectif: 'Accroche', formatNormatif: 'brut',
    zones: [['Texte POV', 'Une ligne, en haut, façon TikTok', [50, 14]], ['Scène', 'Une vraie situation, pas un studio', [50, 50]], ['Pseudo', 'Le compte du créateur', [25, 90]]],
    regles: ['Droits du créateur à confirmer avant usage.', 'Le texte tient en une ligne.', 'Filmé au téléphone, pas trop léché.'] }),
  S({ cle: 'packshot', nom: 'Packshot', famille: 'Produit & offre', enVeille: ['Product Focused', 'Product Showcase'], definition: 'Le produit seul, net, sur fond propre, avec le prix.', conscience: [3, 4], objectif: 'Conversion', formatNormatif: 'packshot',
    zones: [['Produit', 'Seul, au centre, bien détouré', [50, 45]], ['Fond', 'Uni ou décor de marque', [15, 20]], ['Prix', 'Le prix ou la gamme', [50, 88]]],
    regles: ['Efficace en retargeting, moins en découverte.', 'Le prix affiché lève un frein.', 'Change de fond avant de changer de produit.'] }),
  S({ cle: 'liste', nom: 'Liste / Guide', famille: 'Message', enVeille: ['Listicle', 'Tips & Hacks'], definition: 'Une liste numérotée de conseils, avec le produit en filigrane.', conscience: [0, 1, 2], objectif: 'CTR', formatNormatif: 'liste',
    zones: [['Titre', 'Le nombre et le sujet', [50, 20]], ['Liste', '3 points courts, numérotés', [50, 45]], ['Fond', 'Le produit, flouté', [50, 85]]],
    regles: ['3 points, pas plus.', 'Le dernier point mène au produit.', 'Un titre avec un chiffre.'] }),
  S({ cle: 'demo', nom: 'Démonstration', famille: 'Preuve', enVeille: ['Process', 'Explainer'], definition: 'Le produit en action, étape par étape.', conscience: [2, 3], objectif: 'Conversion', formatNormatif: null,
    zones: [['Étapes', '3 vignettes numérotées', [50, 35]], ['Gestes', 'Les mains, en gros plan', [20, 40]], ['Bandeau', 'Le résultat en une ligne', [50, 88]]],
    regles: ['3 étapes, de gauche à droite.', 'Les mêmes mains sur chaque vignette.', 'Le bandeau donne le bénéfice, pas la notice.'] }),
  S({ cle: 'benef', nom: 'Bénéfices', famille: 'Comparaison', enVeille: ['Benefits', 'Features & Benefits'], definition: 'Le produit d’un côté, 3 bénéfices cochés de l’autre.', conscience: [2, 3], objectif: 'Conversion', formatNormatif: null,
    zones: [['Produit', 'Net, sur la moitié gauche', [25, 50]], ['Titre', 'La promesse en une ligne', [75, 22]], ['Bénéfices', '3 bénéfices cochés, courts', [75, 60]]],
    regles: ['3 bénéfices, pas plus.', 'Un bénéfice, pas une caractéristique.', 'Le titre reprend l’accroche gagnante.'] }),
  S({ cle: 'logo', nom: 'Gros logo', famille: 'Design', enVeille: ['Big Logo'], definition: 'La marque en très grand, le produit en appui.', conscience: [3, 4], objectif: 'Notoriété', formatNormatif: null,
    zones: [['Logo', 'Le nom de marque, en très grand', [50, 16]], ['Signature', 'Une ligne sous le logo', [50, 32]], ['Produit', 'En bas, dans une arche', [50, 75]]],
    regles: ['Réservé aux marques déjà connues de l’audience.', 'Une seule couleur de marque, pas trois.', 'Efficace en retargeting et en fin de parcours.'] }),
  S({ cle: 'question', nom: 'Grande question', famille: 'Message', enVeille: ['Big Questions'], definition: 'Une question en très gros qui remplit l’image.', conscience: [0, 1], objectif: 'Accroche', formatNormatif: null,
    zones: [['Question', 'Le texte, en très gros', [45, 25]], ['Produit', 'Dans une pastille, en coin', [75, 80]], ['Fond', 'Une couleur vive et unie', [15, 80]]],
    regles: ['La question nomme une douleur réelle.', '10 mots maximum.', 'Une seule question, sans la réponse dans le visuel.'] }),
  S({ cle: 'collage', nom: 'Collage', famille: 'Design', enVeille: ['Collage'], definition: '4 photos en mosaïque, une étiquette au centre.', conscience: [2, 3], objectif: 'CTR', formatNormatif: null,
    zones: [['Mosaïque', '4 photos, des angles différents', [25, 25]], ['Étiquette', 'La promesse, au centre', [50, 50]], ['Couleurs', 'Montrer la variété', [75, 75]]],
    regles: ['4 photos, pas plus.', 'Varie l’angle ou la couleur, pas le produit.', 'Idéal pour montrer une gamme ou des coloris.'] }),
  S({ cle: 'flatlay', nom: 'Flatlay', famille: 'Produit & offre', enVeille: ['Flatlay'], definition: 'Vue de dessus : le produit entouré de son univers.', conscience: [2, 3], objectif: 'CTR', formatNormatif: null,
    zones: [['Produit', 'Au centre, légèrement incliné', [50, 45]], ['Univers', 'Les accessoires de l’usage', [18, 18]], ['Titre', 'En bas, une ligne', [50, 88]]],
    regles: ['Des accessoires qui racontent l’usage.', 'Le produit reste le plus contrasté.', 'Fond chaud et uni.'] }),
  S({ cle: 'story', nom: 'Story Instagram', famille: 'Natif', enVeille: ['IG Story'], definition: 'Une story avec sondage, qui se fond dans les stories.', conscience: [0, 1, 2], objectif: 'Accroche', formatNormatif: null,
    zones: [['Barres', 'Les barres de progression en haut', [50, 4]], ['Texte', 'Un texte de story, centré', [50, 32]], ['Sondage', 'Le sondage, qui fait interagir', [50, 82]]],
    regles: ['Doit ressembler à une vraie story, pas à une pub.', 'Le sondage crée l’interaction.', 'Placement Stories et Reels uniquement.'] }),
  S({ cle: 'notes', nom: 'Notes iPhone', famille: 'Natif', enVeille: ['iPhone Notes'], definition: 'Une note de téléphone, comme une liste personnelle.', conscience: [0, 1], objectif: 'Accroche', formatNormatif: null,
    zones: [['En-tête', 'L’interface de Notes', [30, 6]], ['Titre', 'Le titre de la note', [45, 22]], ['Liste', 'Des cases cochées, la dernière nomme le produit', [45, 48]]],
    regles: ['Le ton d’une note perso, pas d’une pub.', 'Le produit est le dernier point de la liste.', 'Garde l’interface d’origine, sans logo.'] }),
  S({ cle: 'tweet', nom: 'Post X / réseau social', famille: 'Natif', enVeille: ['Twitter / X'], definition: 'Un post de réseau social, avec un avis spontané.', conscience: [0, 1, 2], objectif: 'Accroche', formatNormatif: null,
    zones: [['Profil', 'Photo, nom et pseudo', [30, 12]], ['Texte', 'Le post, écrit comme un vrai', [50, 30]], ['Photo', 'Le produit en situation', [50, 65]]],
    regles: ['Un vrai avis, autorisé, pas inventé.', 'Pas de majuscules partout, ton naturel.', 'Les compteurs restent discrets.'] }),
  S({ cle: 'meme', nom: 'Mème', famille: 'Natif', enVeille: ['Meme'], definition: 'Le format mème : une phrase relatable au-dessus d’une image.', conscience: [0, 1], objectif: 'Accroche', formatNormatif: 'meme',
    zones: [['Phrase', 'Le texte « moi quand… »', [50, 14]], ['Image', 'La réaction, ou le produit', [50, 62]], ['Chute', 'Un mot en gros, en bas', [50, 90]]],
    regles: ['Le ton de la marque doit le permettre.', 'Un mème connu, détourné, pas inventé.', 'Teste-le en découverte, pas en retargeting.'] }),
  S({ cle: 'minimal', nom: 'Minimaliste', famille: 'Design', enVeille: ['Minimalistic', 'Simple Layout'], definition: 'Beaucoup de vide, le produit et une phrase.', conscience: [3, 4], objectif: 'Notoriété', formatNormatif: null,
    zones: [['Produit', 'Petit, centré', [50, 32]], ['Phrase', '3 mots maximum', [50, 74]], ['Marque', 'Discrète, en bas', [50, 92]]],
    regles: ['3 mots maximum.', 'Le vide est voulu : ne le remplis pas.', 'Fonctionne pour les marques premium.'] }),
  S({ cle: 'presse', nom: 'Vu dans la presse', famille: 'Preuve', enVeille: ['PR Callout'], definition: 'Une citation de média et les logos des titres qui en parlent.', conscience: [2, 3], objectif: 'Conversion', formatNormatif: null,
    zones: [['Citation', 'Le titre ou l’extrait du média', [50, 18]], ['Visuel', 'Le produit en situation', [50, 62]], ['Logos', 'Les médias, en bandeau', [50, 93]]],
    regles: ['Uniquement des citations réelles, avec l’accord du média.', 'Le logo du média le plus connu en premier.', 'Pas de « vu à la télé » sans preuve.'] }),
  S({ cle: 'chiffre', nom: 'Promesse chiffrée', famille: 'Preuve', enVeille: ['Make a claim!'], definition: 'Un chiffre en très gros qui porte la promesse.', conscience: [2, 3, 4], objectif: 'Conversion', formatNormatif: 'infographie',
    zones: [['Chiffre', 'En très gros, en haut', [30, 18]], ['Contexte', 'Ce que mesure le chiffre', [40, 40]], ['Produit', 'En coin, en bas', [75, 78]]],
    regles: ['Un chiffre vérifiable, avec sa source.', 'Jamais de « garanti » ni d’allégation de santé.', 'Le chiffre le plus concret gagne.'] }),
  S({ cle: 'social', nom: 'Preuve sociale', famille: 'Preuve', enVeille: ['Social Proof'], definition: 'Des avatars, des étoiles et le nombre de clients.', conscience: [2, 3, 4], objectif: 'Conversion', formatNormatif: null,
    zones: [['Visuel', 'Le produit en situation', [50, 35]], ['Avatars', 'Des visages de clients', [25, 70]], ['Promesse', 'Le nombre, avec la note', [50, 82]]],
    regles: ['Un nombre réel, issu de tes ventes.', 'La note et le nombre d’avis ensemble.', 'Des avatars variés, jamais de stock trop lisse.'] }),
  S({ cle: 'texte', nom: 'Texte fort', famille: 'Message', enVeille: ['Strong Copy'], definition: 'Le texte fait tout : un titre puissant et 2 lignes.', conscience: [0, 1, 2], objectif: 'Accroche', formatNormatif: 'texte_seul',
    zones: [['Titre', 'Une phrase choc, en couleur', [45, 18]], ['Texte', '2 lignes qui racontent', [45, 42]], ['Produit', 'Une pastille discrète', [18, 85]]],
    regles: ['Un titre qui se lit en 1 seconde.', 'Le texte raconte, il ne liste pas.', 'Contraste maximal : fond sombre, texte clair.'] }),
  S({ cle: 'lifestyle', nom: 'Lifestyle', famille: 'Produit & offre', enVeille: ['Lifestyle'], definition: 'Une photo d’ambiance, le produit dans la vraie vie.', conscience: [0, 1, 2], objectif: 'Notoriété', formatNormatif: 'mise_en_situation',
    zones: [['Scène', 'Une vraie situation, lumière chaude', [50, 40]], ['Phrase', 'Courte, en bas à gauche', [30, 82]], ['Marque', 'Discrète, sous la phrase', [25, 92]]],
    regles: ['Une vraie scène, pas un studio.', 'Le produit visible sans être collé à l’objectif.', 'Peu de texte : l’image raconte.'] }),
  S({ cle: 'trendy', nom: 'Tendance', famille: 'Design', enVeille: ['Trendy'], definition: 'Couleurs vives, stickers et typo épaisse, façon réseaux.', conscience: [0, 1], objectif: 'Accroche', formatNormatif: null,
    zones: [['Produit', 'Dans une arche bordée de blanc', [50, 40]], ['Stickers', '2 stickers inclinés', [20, 8]], ['Titre', 'Typo épaisse, en bas', [50, 88]]],
    regles: ['Pour une audience jeune, habituée aux réseaux.', '2 stickers maximum.', 'Garde les couleurs de la marque dans le dégradé.'] }),
];

const PAR_CLE = new Map<string, StyleCrea>(STYLES_CREA.map((s) => [s.cle, s]));

export function estCleStyle(v: unknown): v is CleStyle {
  return typeof v === 'string' && PAR_CLE.has(v);
}

export function styleCrea(cle: CleStyle): StyleCrea {
  return PAR_CLE.get(cle)!;
}

/** Le style dont un format normatif est la version statique · `null` si aucun. */
export function styleDuFormat(id: FormatCreatifId | null | undefined): CleStyle | null {
  if (!id) return null;
  return STYLES_CREA.find((s) => s.formatNormatif === id)?.cle ?? null;
}

/** Le texte qu'on cherche · nom, noms anglais, définition, famille, en minuscules. */
export function texteRechercheStyle(s: StyleCrea): string {
  return `${s.nom} ${s.enVeille.join(' ')} ${s.definition} ${s.famille}`.toLowerCase();
}

/** Le style correspond-il à la recherche libre ? Une recherche vide garde tout. */
export function styleCorrespond(s: StyleCrea, q: string): boolean {
  const t = q.trim().toLowerCase();
  return !t || texteRechercheStyle(s).includes(t);
}

/** La consigne passée à la préparation d'un projet (`?angle=`) · le format, nommé et défini. */
export function consigneStyle(cle: CleStyle): string {
  const s = styleCrea(cle);
  return `Format « ${s.nom} » · ${s.definition}`;
}
