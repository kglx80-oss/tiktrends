/**
 * Reconnaître une police TECHNIQUE · une fonte d'icônes ou de glyphes, jamais
 * une police de texte lisible.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * L'extraction de la DA d'un site lit les `font-family` de son CSS pour proposer
 * les polices de la marque (`apps/web/lib/brand-da.ts`). Or beaucoup de sites
 * chargent des fontes d'icônes (Font Awesome, Material Icons, IcoMoon…) déclarées
 * comme n'importe quelle `font-family`. Rien ne les distinguait d'une vraie
 * police · elles remontaient donc parmi les polices proposées, et une créa
 * pouvait hériter d'« icon font » comme police de titre · du charabia à l'écran.
 *
 * ── Règle ────────────────────────────────────────────────────────────────────
 *
 * Le nom d'une fonte d'icônes le trahit presque toujours (icon, glyph, la marque
 * de la librairie, ou le suffixe `-webfont` des exports d'icônes). On juge donc
 * sur le NOM · pur, testable, sans réseau ni DOM.
 */

/**
 * Familles de fontes techniques reconnues à leur nom. On couvre les librairies
 * d'icônes courantes, les marqueurs génériques (icon, glyph, webfont) ET les
 * fontes d'icônes de widgets/plugins fréquentes sur les sites e-commerce, dont
 * certaines ne portent PAS « icon » dans leur nom · « JudgemeStar » (étoiles
 * d'avis Judge.me) remontait ainsi comme police de marque (CDC v7 · N09).
 */
const POLICE_TECHNIQUE =
  /(icon|glyph|font.?awesome|material.?(icons|symbols)|icomoon|fontello|ionicons|themify|dashicons|bootstrap.?icons|feather|-?webfont|judgeme|swiper|slick|select2|elementor|eicons)/i;

/**
 * Vrai si `nom` désigne une fonte d'icônes/glyphes, à écarter des polices de
 * texte d'une marque. Tolère tout (chaîne vide, casse, espaces).
 */
export function policeTechnique(nom: string): boolean {
  return POLICE_TECHNIQUE.test(String(nom ?? '').trim());
}
