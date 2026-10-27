import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * V5 · A4a · CLIQUET des couleurs littérales.
 *
 * Le thème clair ne peut atteindre que ce qui passe par les jetons
 * (`var(--ink)`…). Une couleur écrite en dur dans un style en ligne reste
 * sombre en clair · c'est la dette que les lots suivants résorbent, répertoire
 * par répertoire. Cette garde empêche qu'elle GRANDISSE pendant ce temps :
 *
 *  · le compte de chaque répertoire, et le total, ne peuvent pas monter ;
 *  · chaque fichier qui en porte garde au plus son compte d'aujourd'hui ;
 *  · un fichier qui n'en porte aucun (« déjà propre » · tout fichier absent de
 *    `PLAFOND_PAR_FICHIER`, y compris un fichier nouveau) ne peut pas en gagner.
 *
 * Quand un lot tokenise, il ABAISSE les valeurs ci-dessous (et retire le
 * fichier de la table quand il tombe à zéro) · le gain devient le nouveau
 * plafond. Une baisse ne fait pas échouer la garde, une hausse si.
 *
 * Ce qu'on compte · dans `app/`, `components/` et `lib/` de `apps/web`, les
 * `.ts` / `.tsx` hors tests, commentaires retirés : chaque `#rgb`, `#rgba`,
 * `#rrggbb`, `#rrggbbaa`, et chaque `rgb(`, `rgba(`, `hsl(`, `hsla(`.
 *
 * Mesuré le 15/10/2026 · main (0aa7a59, coquille V5 comprise) en portait
 * 1141 ; ce lot retire celui du layout racine (`themeColor`) · plafond 1140,
 * 132 fichiers en portent sur 531 (399 déjà propres).
 *
 * V5 · T4 · Adsmap (Résultats) et Jarvis passent en jetons · 115 + 93 = 208
 * littéraux retirés, leurs 25 fichiers sont propres · plafond 1131 − 208 = 923
 * (1131 est le plafond après l'accueil #800).
 * V5 · T1 (composants partagés) · `components/` (hors `accueil/`, laissé à la
 * branche Accueil, fusionnée depuis), `components/studios/` et `lib/` passent
 * de 211 à 11. Après fusion de `origin/main` (Accueil #800, qui a ramené
 * `components/accueil` à 1 et `brands` à 28),  avant la fusion de T3 · c'est
 * le nouveau plafond. Les 11 de `components/` sont hors thème par nature ·
 * `AssistantHome` (3 · dégradé d'une tuile, laissé à la branche Accueil),
 * `BrandGuidelines` (2 · valeur d'un `<input type="color">`, une donnée de
 * marque), `HomeMarques` (2 · assise grise FIXE derrière un logo, mesurée pour
 * les logos noirs ET blancs) et `LogoMarque` (4 · bord et ombre calculés sur le
 * fond du LOGO). Deux fichiers d'export rejoignent `EXCLUS` (blanc = pixel du média).
 * T3 (15/10/2026 · après fusion de #800, base origin/main à 1131) ·
 * l'administration (`app/(app)/admin`, 142) et la console (`app/(app)/console`,
 * 24) passent par les jetons · plafond 965, leurs 20 fichiers sont désormais
 * « déjà propres ».
 *
 * Fusion T1 + T3 (15/10/2026) · les deux réductions cumulées · total mesuré 765 · plafond 765.
 * Fusion T4 (15/10/2026) · adsmap et jarvis à 0 (−208) · total mesuré 557 · plafond 557.
 *
 * V5 · T5 (écrans authentifiés restants, hors admin/console/adsmap/jarvis) ·
 * `analytics`, `assets`, `billing`, `brands`, `connections`, `credits`,
 * `profile`, `radar`, `saved`, `settings`, `studio`, `support`, `team`,
 * `usage`, `veille` passent par les jetons · 136 littéraux retirés · plafond
 * 557 − 136 = 421. Huit répertoires tombent à 0 et sortent des tables
 * (`billing`, `profile`, `radar`, `saved`, `settings`, `studio`, `support`,
 * `usage`). Aucun jeton ni aucune paire nouveaux · tous les rôles existaient
 * déjà. Les 84 littéraux qui restent dans ce périmètre sont des RESTES assumés,
 * par nature :
 *  · `connections/page` (41) · teintes OFFICIELLES des marques tierces (aperçu
 *    de connecteur), comme `components/BrandIcons` · ne suivent pas le thème ;
 *  · `veille/scale/SwipeFile` (13) · 10 teintes catégorielles d'angle
 *    (`ANGLE_COLOR`) + leur texte sombre `#0d070c` (pastille sur média) +
 *    `#140f18` (fond derrière un média) + `#2fd6a0` (donnée · croissance) ;
 *  · `credits/page` (12) · deux pastilles sur dégradé vif (texte sombre, gardées
 *    telles quelles pour rester lisibles · à juger en clair), un lavis décoratif
 *    magenta·violet, un aplat de code blanc discret ;
 *  · `analytics/MetaKeyMetrics` (4) · pastille delta bespoke (texte sombre sur
 *    aplat pâle, sans jeton exact · à juger en clair) ;
 *  · `analytics/CreativeIntel` (2) · dégradé décoratif de barre violet·magenta ;
 *  · `brands` (6) · `#767676` (assise neutre d'un logo, mesurée · comme
 *    `HomeMarques`), lavis de marque Shopify (`rgba(150,220,170,.06)`) et
 *    plusieurs `var(--surface-2, rgba(255,255,255,.03))` (aplat très discret) ;
 *  · `assets` (4) · lavis de marque Google Drive (`rgba(66,133,244,.06)`),
 *    aplats blancs discrets, et un rouge d'erreur bespoke (`rgba(255,120,140,
 *    .08)`, symétrique du vert tokenisé · pas de jeton exact) ;
 *  · `team` (2) · deux fonds de pastille blancs très discrets (`rgba(255,255,
 *    255,.06)`).
 * Les voiles translucides deviennent `teinte('<rôle>', part)` (exact au pixel en
 * sombre) ; `st.color + '22'` des statuts de ticket devient `teinte(role,
 * 0x22/255)`.
 * V5 · T2 (16/10/2026) · les PAGES PUBLIQUES (hors `(app)`) passent par les
 * jetons · `app/c`, `app/legal`, `app/login` à 0 ; `app/onboarding` 11 → 5 ;
 * `app/tarifs` 60 → 8 ; `app/Landing.tsx` 241 → 142. Plafond 557 − 170 = 387.
 * Ce qui RESTE littéral, par nature (hors thème) · le mur de créatives
 * illustratives de l'accueil (dégradés + halos des fausses pubs, étiquettes et
 * maquettes produit · une créative reste vive dans les deux thèmes), les fonds
 * sombres des cartes d'APERÇU (captures décoratives du produit), le logo
 * TikTrends, la menthe `#7fe3c0` et l'ambre `#f5c37a` (sans jeton exact · ne pas
 * décaler le sombre validé), et les blancs d'accent de survol au-delà de 0,20
 * (hors de la portée de --line-2). L'onboarding garde le dégradé de sa vitrine
 * (aplat de marque saturé) et sa pastille cochée verte (aplat autoportant).
 *
 * Spatial · vague 2 · Marque · la fiche V5 (`BrandDA` 2, `PaletteMarque` 1,
 * `ShopifyConnect` 1) et `/brands/new` (1) sont retirées · 251 − 5 = 246.
 */
const WEB = process.cwd();

/** Exclus, avec la raison · la couleur y fait partie du MÉDIA, pas de l'interface. */
const EXCLUS: Record<string, string> = {
  'components/BrandIcons.tsx': 'logos de marques tierces · teintes officielles des SVG',
  'components/logos-outils.ts': 'tracés Simple Icons · teinte officielle de chaque marque',
  'lib/ad-render.tsx': 'rendu d’export · la couleur fait partie de la publicité produite',
  'app/api/ad/[id]/route.tsx': 'rendu d’export (ImageResponse) · image servie telle quelle',
  'app/opengraph-image.tsx': 'image Open Graph exportée · vue hors de l’application',
  'lib/emails.ts': 'HTML d’e-mail · rendu par le client mail, hors thème',
  'lib/studios/produit/compression-photo.ts': 'fond blanc d’un JPEG recompressé · pixel de la photo produite, pas de l’interface',
  'lib/studios/rendu/masque-pixels.ts': 'fond d’aplatissement d’un export JPEG · pixel du média produit',
};

/** Plafond par répertoire · le plan des lots de tokenisation. */
const PLAFOND_PAR_REPERTOIRE: Record<string, number> = {
  'app': 142,
  'app/(app)/analytics': 6,
  'app/(app)/assets': 4,
  'app/(app)/brands': 1,
  'app/(app)/connections': 41,
  'app/(app)/credits': 12,
  'app/(app)/team': 2,
  'app/(app)/veille': 13,
  'app/onboarding': 5,
  'app/tarifs': 8,
  'components': 11,
  'components/accueil': 1,
};

/** Plafond par fichier · tout fichier absent de cette table est « déjà propre » (0). */
const PLAFOND_PAR_FICHIER: Record<string, number> = {
  'app/(app)/analytics/CreativeIntel.tsx': 2,
  'app/(app)/analytics/MetaKeyMetrics.tsx': 4,
  'app/(app)/assets/AssetsLibrary.tsx': 2,
  'app/(app)/assets/DriveConnect.tsx': 1,
  'app/(app)/assets/page.tsx': 1,
  'app/(app)/brands/[id]/competitors/[name]/page.tsx': 1,
  'app/(app)/connections/page.tsx': 41,
  'app/(app)/credits/page.tsx': 12,
  'app/(app)/team/page.tsx': 2,
  'app/(app)/veille/scale/SwipeFile.tsx': 13,
  'app/Landing.tsx': 142,
  'app/onboarding/OnboardingWizard.tsx': 5,
  'app/tarifs/page.tsx': 8,
  'components/accueil/VueAnalytics.tsx': 1,
  'components/AssistantHome.tsx': 3,
  'components/BrandGuidelines.tsx': 2,
  'components/HomeMarques.tsx': 2,
  'components/LogoMarque.tsx': 4,
};

const PLAFOND_TOTAL = 246;

const RACINES = ['app', 'components', 'lib'];

function fichiersInterface(): string[] {
  const out: string[] = [];
  const parcourir = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$|\.d\.ts$/.test(n)) out.push(relative(WEB, p).split('\\').join('/'));
    }
  };
  for (const r of RACINES) parcourir(join(WEB, r));
  return out.sort();
}

/** Retire les commentaires (bloc et ligne · une URL `https://` n'est pas un commentaire). */
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/** Une couleur littérale · hex précédé d'un non-mot (pas une ancre `#veille`,
 *  pas une entité `&#123;`), ou une fonction de couleur. */
const LITTERAL = /(?<![\w&#/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?)\(/g;

function compterLitteraux(source: string): number {
  return (sansCommentaires(source).match(LITTERAL) ?? []).length;
}

/** Répertoire de rattachement · `app/(app)/<écran>`, sinon les deux premiers niveaux. */
function repertoire(f: string): string {
  const s = f.split('/');
  if (s[0] === 'app' && s[1] === '(app)') return s.length > 3 ? s.slice(0, 3).join('/') : 'app/(app)';
  return s.length > 2 ? s.slice(0, 2).join('/') : s[0]!;
}

function mesurer() {
  const parFichier: Record<string, number> = {};
  const parRepertoire: Record<string, number> = {};
  let total = 0;
  for (const f of fichiersInterface()) {
    if (f in EXCLUS) continue;
    const n = compterLitteraux(readFileSync(join(WEB, f), 'utf8'));
    parFichier[f] = n;
    parRepertoire[repertoire(f)] = (parRepertoire[repertoire(f)] ?? 0) + n;
    total += n;
  }
  return { parFichier, parRepertoire, total };
}

describe('cliquet des couleurs littérales · le compte ne monte pas', () => {
  const m = mesurer();

  it('le compteur compte ce qu’il doit, et seulement ça', () => {
    expect(compterLitteraux(`color: '#fff', background: 'rgba(0,0,0,.5)', border: '1px solid #ffffff1f'`)).toBe(3);
    expect(compterLitteraux(`boxShadow: '0 0 0 1px rgb(255 255 255 / 10%)', c: 'hsl(330 80% 50%)', d: '#C8295F'`)).toBe(3);
    expect(compterLitteraux(`// fond #120810\n/* accent #fe2c55 */ color: 'var(--ink)'`)).toBe(0);
    expect(compterLitteraux(`href="#veille" t="&#123;" url="https://x.y/#abc"`)).toBe(0);
    // limite assumée · une ancre de 3 à 8 lettres hexadécimales (`#add`) compte · elle reste constante, le cliquet ne bouge pas
    expect(compterLitteraux(`href="#add"`)).toBe(1);
  });

  it('chaque exclusion existe encore et dit pourquoi', () => {
    for (const [f, raison] of Object.entries(EXCLUS)) {
      expect(existsSync(join(WEB, f)), `exclusion obsolète · ${f} n'existe plus`).toBe(true);
      expect(raison.length, `exclusion sans raison · ${f}`).toBeGreaterThan(10);
    }
  });

  it(`total · au plus ${PLAFOND_TOTAL}`, () => {
    expect(m.total, `couleurs littérales en hausse · ${m.total} > ${PLAFOND_TOTAL} · passe par un jeton (var(--…)) de packages/ui/tokens.css`).toBeLessThanOrEqual(PLAFOND_TOTAL);
  });

  it('par répertoire · aucun ne monte (absent du tableau = déjà propre = 0)', () => {
    const hausses = Object.entries(m.parRepertoire)
      .filter(([r, n]) => n > (PLAFOND_PAR_REPERTOIRE[r] ?? 0))
      .map(([r, n]) => `${r} · ${n} > ${PLAFOND_PAR_REPERTOIRE[r] ?? 0}`);
    expect(hausses, 'couleurs littérales en hausse dans ces répertoires').toEqual([]);
  });

  it('par fichier · un fichier déjà propre ne regagne aucun littéral, les autres ne montent pas', () => {
    const hausses = Object.entries(m.parFichier)
      .filter(([f, n]) => n > (PLAFOND_PAR_FICHIER[f] ?? 0))
      .map(([f, n]) => (f in PLAFOND_PAR_FICHIER ? `${f} · ${n} > ${PLAFOND_PAR_FICHIER[f]}` : `${f} · déjà propre, regagne ${n} littéral(aux)`));
    expect(hausses, 'couleurs littérales en hausse · passe par un jeton (var(--…))').toEqual([]);
  });

  it('les tables sont cohérentes · le plafond d’un répertoire couvre ses fichiers', () => {
    const somme: Record<string, number> = {};
    for (const [f, n] of Object.entries(PLAFOND_PAR_FICHIER)) somme[repertoire(f)] = (somme[repertoire(f)] ?? 0) + n;
    expect(somme).toEqual(Object.fromEntries(Object.entries(PLAFOND_PAR_REPERTOIRE).filter(([, n]) => n > 0)));
    expect(Object.values(PLAFOND_PAR_REPERTOIRE).reduce((a, b) => a + b, 0)).toBe(PLAFOND_TOTAL);
  });
});
