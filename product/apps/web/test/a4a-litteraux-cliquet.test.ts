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
 * T3 (15/10/2026) · l'administration (`app/(app)/admin`, 142) et la console
 * (`app/(app)/console`, 24) passent par les jetons · plafond 974, leurs 20
 * fichiers sont désormais « déjà propres ».
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
};

/** Plafond par répertoire · le plan des lots de tokenisation. */
const PLAFOND_PAR_REPERTOIRE: Record<string, number> = {
  'app': 241,
  'app/(app)/adsmap': 115,
  'app/(app)/analytics': 7,
  'app/(app)/assets': 20,
  'app/(app)/billing': 9,
  'app/(app)/brands': 32,
  'app/(app)/connections': 54,
  'app/(app)/credits': 37,
  'app/(app)/jarvis': 93,
  'app/(app)/profile': 1,
  'app/(app)/radar': 8,
  'app/(app)/saved': 2,
  'app/(app)/settings': 6,
  'app/(app)/studio': 1,
  'app/(app)/support': 10,
  'app/(app)/team': 8,
  'app/(app)/usage': 4,
  'app/(app)/veille': 25,
  'app/c': 8,
  'app/legal': 2,
  'app/login': 3,
  'app/onboarding': 11,
  'app/tarifs': 60,
  'components': 161,
  'components/accueil': 6,
  'components/studios': 38,
  'lib': 11,
  'lib/studios': 1,
};

/** Plafond par fichier · tout fichier absent de cette table est « déjà propre » (0). */
const PLAFOND_PAR_FICHIER: Record<string, number> = {
  'app/(app)/adsmap/AdDrawer.tsx': 7,
  'app/(app)/adsmap/AdsMapTable.tsx': 20,
  'app/(app)/adsmap/BuildPanel.tsx': 3,
  'app/(app)/adsmap/Canvas.tsx': 16,
  'app/(app)/adsmap/Inbox.tsx': 4,
  'app/(app)/adsmap/PartageGagnante.tsx': 2,
  'app/(app)/adsmap/SharePanel.tsx': 5,
  'app/(app)/adsmap/SyncButton.tsx': 1,
  'app/(app)/adsmap/import/ImportPanel.tsx': 12,
  'app/(app)/adsmap/lots/Lots.tsx': 8,
  'app/(app)/adsmap/protocole/ProtocolForm.tsx': 10,
  'app/(app)/adsmap/protocole/page.tsx': 1,
  'app/(app)/adsmap/radar/Radar.tsx': 6,
  'app/(app)/adsmap/suites/Suites.tsx': 9,
  'app/(app)/adsmap/tri/Curation.tsx': 11,
  'app/(app)/analytics/CreativeIntel.tsx': 2,
  'app/(app)/analytics/MetaKeyMetrics.tsx': 5,
  'app/(app)/assets/AssetsLibrary.tsx': 6,
  'app/(app)/assets/DriveConnect.tsx': 8,
  'app/(app)/assets/page.tsx': 6,
  'app/(app)/billing/page.tsx': 9,
  'app/(app)/brands/[id]/BrandDA.tsx': 7,
  'app/(app)/brands/[id]/PaletteMarque.tsx': 5,
  'app/(app)/brands/[id]/ShopifyConnect.tsx': 4,
  'app/(app)/brands/[id]/competitors/[name]/page.tsx': 4,
  'app/(app)/brands/[id]/page.tsx': 4,
  'app/(app)/brands/new/page.tsx': 5,
  'app/(app)/brands/page.tsx': 3,
  'app/(app)/connections/DataConnections.tsx': 7,
  'app/(app)/connections/page.tsx': 47,
  'app/(app)/credits/page.tsx': 37,
  'app/(app)/jarvis/DescribePanel.tsx': 2,
  'app/(app)/jarvis/JarvisChat.tsx': 5,
  'app/(app)/jarvis/JarvisContexte.tsx': 8,
  'app/(app)/jarvis/JarvisRules.tsx': 6,
  'app/(app)/jarvis/JarvisTraining.tsx': 9,
  'app/(app)/jarvis/MarketPanel.tsx': 13,
  'app/(app)/jarvis/error.tsx': 2,
  'app/(app)/jarvis/sections/SectionAttribution.tsx': 10,
  'app/(app)/jarvis/sections/SectionEssais.tsx': 24,
  'app/(app)/jarvis/sources/page.tsx': 14,
  'app/(app)/profile/ProfileIdentity.tsx': 1,
  'app/(app)/radar/page.tsx': 8,
  'app/(app)/saved/FormatChoix.tsx': 2,
  'app/(app)/settings/page.tsx': 6,
  'app/(app)/studio/projets/page.tsx': 1,
  'app/(app)/support/[id]/page.tsx': 7,
  'app/(app)/support/page.tsx': 3,
  'app/(app)/team/page.tsx': 8,
  'app/(app)/usage/page.tsx': 4,
  'app/(app)/veille/formats/PreparerTest.tsx': 1,
  'app/(app)/veille/page.tsx': 2,
  'app/(app)/veille/scale/SwipeFile.tsx': 22,
  'app/Landing.tsx': 241,
  'app/c/[token]/page.tsx': 8,
  'app/legal/layout.tsx': 2,
  'app/login/page.tsx': 3,
  'app/onboarding/OnboardingWizard.tsx': 11,
  'app/tarifs/page.tsx': 60,
  'components/AdMedia.tsx': 5,
  'components/ApercuExemple.tsx': 5,
  'components/AppShell.tsx': 9,
  'components/AssistantChat.tsx': 3,
  'components/AssistantHome.tsx': 3,
  'components/AuthShell.tsx': 3,
  'components/AvatarSite.tsx': 1,
  'components/Bandeau.tsx': 6,
  'components/BrandGuidelines.tsx': 2,
  'components/BrandOnboarding.tsx': 7,
  'components/BrandSwitcher.tsx': 4,
  'components/BrandWizard.tsx': 13,
  'components/CommandPalette.tsx': 2,
  'components/CopierTexte.tsx': 2,
  'components/CreditsMenu.tsx': 2,
  'components/DiagnosticDeploiement.tsx': 8,
  'components/DraftCard.tsx': 2,
  'components/Empty.tsx': 3,
  'components/HomeBandeau.tsx': 4,
  'components/HomeMarques.tsx': 3,
  'components/InspoButtons.tsx': 2,
  'components/JourneyPanel.tsx': 6,
  'components/LegalDoc.tsx': 1,
  'components/LogoMarque.tsx': 4,
  'components/MarquesSuivies.tsx': 2,
  'components/Modal.tsx': 2,
  'components/NotificationBell.tsx': 4,
  'components/PageInfo.tsx': 1,
  'components/ProfileModal.tsx': 2,
  'components/QuickSettingsModal.tsx': 1,
  'components/RenameMarque.tsx': 1,
  'components/SavedBoards.tsx': 2,
  'components/SavedTabs.tsx': 1,
  'components/ScenarioCard.tsx': 2,
  'components/StorageConfigurator.tsx': 14,
  'components/SupportWidget.tsx': 10,
  'components/Toast.tsx': 6,
  'components/TrackerFeed.tsx': 6,
  'components/accueil/VueAnalytics.tsx': 6,
  'components/studios/PreparerCreation.tsx': 10,
  'components/studios/editeur/SurfaceDocument.tsx': 5,
  'components/studios/export/PanneauExport.tsx': 5,
  'components/studios/produit/compression-photo.ts': 1,
  'components/studios/projet/BarreProjet.tsx': 1,
  'components/studios/projet/CarteProjet.tsx': 3,
  'components/studios/projet/ExporterBrief.tsx': 2,
  'components/studios/projet/NouveauProjet.tsx': 1,
  'components/studios/projet/PreparationProjet.tsx': 1,
  'components/studios/projet/VueProjet.tsx': 9,
  'components/ui.tsx': 7,
  'lib/analysis.ts': 6,
  'lib/studios/rendu/masque-pixels.ts': 1,
  'lib/theme.ts': 5,
};

const PLAFOND_TOTAL = 974;

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
