import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { ATTRIBUT_ROLE_CADRE } from '@tiktrends/core';

/**
 * Lot 19D · garde SOURCE des cadres, sur le périmètre du lot (composants
 * partagés et écrans listés ci-dessous). La mesure en navigateur (recette 19D)
 * prouve le rendu route par route ; ce garde empêche la dérive de revenir.
 *
 * Deux refus :
 *  1. `border: '1px solid|dashed var(--line-2)'` sur un CADRE · la bordure à
 *     20 % est celle des contrôles (champ, bouton, pilule, puce, menu). Un
 *     panneau, une carte ou un encart prennent `surface`/`tuile` (--line),
 *     un état vide prend `vide`.
 *  2. Un rayon 13 à 24 (hors 20) posé à côté d'une bordure · les cadres
 *     prennent `--r-card` (20) ou `--r-md` (12), lus via `surface`/`tuile`.
 *
 * Ce qui n'est pas un cadre est reconnu à la déclaration elle-même · pilule
 * (999, 50 %), contrôle (curseur, cible tactile, champ, balise de contrôle),
 * vignette ou pastille (largeur ou hauteur fixe < 160 × 40). Les exceptions
 * restantes sont NOMMÉES ici, avec leur raison.
 */
const WEB = process.cwd();
const PERIMETRE = [
  'components',
  ...['adsmap', 'studio', 'assets', 'tags', 'radar', 'brands', 'connections', 'billing', 'credits', 'usage', 'team', 'profile', 'settings', 'support', 'console']
    .map((d) => join('app', '(app)', d)),
  ...['depenses', 'finance', 'incidents', 'intelligence', 'paiement', 'plans', 'signups'].map((d) => join('app', '(app)', 'admin', d)),
  // Transférés au lot pour ce seul changement (rendus sur /adsmap) · le reste de jarvis/** n'est pas couvert.
  join('app', '(app)', 'jarvis', 'sections', 'SectionEssais.tsx'),
  join('app', '(app)', 'jarvis', 'sections', 'Revelation.tsx'),
];

/** Fichiers du dossier `components` hors de ce lot, et pourquoi. */
export const HORS_LOT: Readonly<Record<string, string>> = {
  'components/AppShell.tsx': 'chrome de l’application · autre lot',
  'components/Breadcrumb.tsx': 'chrome · autre lot',
  'components/AdCard.tsx': 'Veille · autre lot',
  'components/RetourVeille.tsx': 'Veille · autre lot',
  'components/DefileAncreVeille.tsx': 'Veille · autre lot',
  'components/RenameMarque.tsx': 'autre lot',
  // Composants qui ne servent QUE des écrans hors de ce lot (Accueil, Bibliothèque) ·
  // leur rôle est décrit au rapport, l'écran propriétaire les reprend.
  'components/ApercuExemple.tsx': 'Accueil seul',
  'components/AssistantChat.tsx': 'Accueil seul',
  'components/AssistantHome.tsx': 'Accueil seul',
  'components/HomeBandeau.tsx': 'Accueil seul',
  'components/HomeMarques.tsx': 'Accueil seul',
  'components/JourneyPanel.tsx': 'Accueil seul',
  'components/ProchaineEtape.tsx': 'Accueil seul',
  'components/GrammaireCategorie.tsx': 'Bibliothèque seule',
  'components/MarquesSuivies.tsx': 'Bibliothèque seule',
  'components/SavedBoards.tsx': 'Bibliothèque seule · lot 19C',
  'components/TrackerFeed.tsx': 'Bibliothèque seule',
  // Chrome de l'application, hors <main> · menus déroulants et panneau d'aide
  // flottant (prolongement d'un contrôle de la barre), hors de la mesure des pages.
  'components/BrandSwitcher.tsx': 'chrome · menu de la barre',
  'components/CommandPalette.tsx': 'chrome · palette de commandes',
  'components/CreditsMenu.tsx': 'chrome · menu de la barre',
  'components/NotificationBell.tsx': 'chrome · menu de la barre',
  'components/SupportWidget.tsx': 'chrome · widget flottant',
  // Le Canvas Adsmap ne change pas (consigne du propriétaire · CLAUDE.md).
  'app/(app)/adsmap/Canvas.tsx': 'Canvas · protégé',
};

/**
 * Déclarations gardées exprès · et pourquoi. La clé est `fichier::extrait exact
 * de la ligne` · une exception ne vaut que dans SON fichier.
 */
export const EXCEPTIONS_LIGNE_2: Readonly<Record<string, string>> = {
  "components/Composer.tsx::background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 12,":
    'Composer · menu déroulant d’un réglage · prolonge son contrôle',
};
export const EXCEPTIONS_RAYON: Readonly<Record<string, string>> = {};
const exceptee = (table: Readonly<Record<string, string>>, f: string, l: string) =>
  Object.keys(table).some((k) => { const [fk, extrait] = k.split('::') as [string, string]; return fk === f && l.includes(extrait); });

const fichiers: string[] = [];
(function parcourir(dirs: string[]) {
  for (const d of dirs) {
    if (!statSync(join(WEB, d)).isDirectory()) { fichiers.push(d.split(sep).join('/')); continue; }
    for (const n of readdirSync(join(WEB, d))) {
      const p = join(d, n);
      if (statSync(join(WEB, p)).isDirectory()) parcourir([p]);
      else if (/\.tsx?$/.test(n)) fichiers.push(p.split(sep).join('/'));
    }
  }
})(PERIMETRE);
const dansLeLot = (f: string) => !Object.keys(HORS_LOT).some((h) => f === h || f.startsWith(h + '/'));

// Fin d'un objet de style · `}}`, `};`, `} as const;`, `}),`…
const FIN_OBJET = /\}\}|\}\s*(as const)?\s*[;,)]*\s*$/;

/**
 * La déclaration de style autour d'une ligne · la ligne et ses voisines dans le
 * MÊME objet (bornée par son ouverture et sa fermeture), plus la balise JSX qui
 * le porte quand le style est écrit sur les lignes suivantes.
 */
function declaration(lignes: string[], i: number): { decl: string; balise: string } {
  let debut = i, fin = i;
  while (debut > 0 && i - debut < 4 && !/\{\{|= \{|: \{$|\(\{$/.test(lignes[debut]!) && !FIN_OBJET.test(lignes[debut - 1]!)) debut--;
  while (fin < lignes.length - 1 && fin - i < 4 && !FIN_OBJET.test(lignes[fin]!)) fin++;
  // La balise · la ligne d'ouverture si elle porte `<tag`, sinon une des deux précédentes.
  let balise = '';
  for (let k = debut; k >= Math.max(0, debut - 3); k--) {
    if (/<[A-Za-z]/.test(lignes[k]!)) { balise = lignes[k]!; break; }
    if (k < debut && /\}\}|\};|\} as const;/.test(lignes[k]!)) break;
  }
  return { decl: lignes.slice(debut, fin + 1).join('\n'), balise };
}

/** Ce qui n'est pas un cadre, reconnu à sa déclaration (et à la balise qui la porte). */
function pasUnCadre({ decl, balise }: { decl: string; balise: string }): string | null {
  if (/borderRadius: ?(999|'50%'|'var\(--r-pill\)')/.test(decl)) return 'pilule';
  if (/cursor:|CIBLE_TACTILE_MIN|outline:|resize:|fontFamily: 'inherit'/.test(decl)) return 'contrôle';
  if (/aria-pressed|role="(menu|listbox)"/.test(balise + decl)) return 'contrôle';
  // Rôle DÉCLARÉ (`data-cadre`, nommé au noyau · ATTRIBUT_ROLE_CADRE) · champ composite, barre de filtres.
  if (new RegExp(`${ATTRIBUT_ROLE_CADRE}="controle"`).test(balise + decl)) return 'contrôle déclaré';
  // Un lien n'est PAS exempté · une carte cliquable reste une carte.
  if (/<(button|input|select|textarea|summary|label|img)\b/.test(balise + decl)) return 'contrôle ou média';
  // Un champ déclaré en constante (`fld`, `champ`, `input`…) est un contrôle.
  if (/const (fld|champ|input|miniInput|quickField|taStyle|st)\b/.test(decl)) return 'contrôle';
  // Un bouton déclaré en constante et étendu (`...linkBtn`, `...btnGhost`…) reste un bouton.
  if (/\.\.\.(linkBtn|btn|btnGhost|ghost|chip|bouton|base)\b/.test(decl)) return 'contrôle';
  // Un <span> en ligne · puce, pastille, avatar (pas un cadre de bloc).
  const span = /<span\b[^\n]*$/m.exec(balise + '\n' + decl)?.[0] ?? '';
  if (span && !/display: '(block|grid|flex)'/.test(span)) return 'puce';
  const w = /\bwidth: ?(\d+)\b/.exec(decl); if (w && +w[1]! < 160) return 'vignette ou pastille';
  const h = /\bheight: ?(\d+)\b/.exec(decl); if (h && +h[1]! < 40) return 'pastille';
  if (/display: 'inline-flex'/.test(decl) && /whiteSpace: 'nowrap'|fontSize: 1[01](\.\d)?\b/.test(decl)) return 'puce';
  return null;
}

function cadresHorsRole(f: string): string[] {
  const src = readFileSync(join(WEB, f), 'utf8');
  const lignes = src.split('\n');
  const fautes: string[] = [];
  lignes.forEach((l, i) => {
    // 1 · la bordure des contrôles sur un cadre · forme littérale OU conditionnelle
    // (`border: avance ? '1px solid var(--line-2)' : 'none'`, `${x ? … : 'var(--line-2)'}`).
    // La valeur s'arrête à la virgule qui suit · sauf celles d'une parenthèse (`rgba(255,90,120,.35)`).
    if (/\bborder: ?(?:[^,(\n]|\([^)\n]*\))*var\(--line-2\)/.test(l)) {
      const exc = exceptee(EXCEPTIONS_LIGNE_2, f, l);
      if (!exc && !pasUnCadre(declaration(lignes, i))) fautes.push(`${f}:${i + 1} · cadre en --line-2 (bordure des contrôles) · prends surface/tuile (ou vide)`);
    }
    // 2 · un rayon hors charte posé à côté d'une bordure.
    const r = /borderRadius: ?(1[3-9]|2[1-4])\b/.exec(l);
    if (r) {
      const d = declaration(lignes, i);
      const bordee = /\bborder(Color)?: ?(?!'none'|0\b)/.test(d.decl);
      const excR = exceptee(EXCEPTIONS_RAYON, f, l);
      if (bordee && !excR && !pasUnCadre(d)) fautes.push(`${f}:${i + 1} · rayon ${r[1]} sur un cadre · prends var(--r-card) (surface) ou var(--r-md) (tuile)`);
    }
  });
  return fautes;
}

describe('lot 19D · garde source · bordures et rayons par rôle', () => {
  const lot = fichiers.filter(dansLeLot);
  it('on parcourt bien le périmètre du lot', () => {
    expect(lot.length).toBeGreaterThan(140);
    expect(lot).toContain('components/ui.tsx');
    expect(lot).toContain('app/(app)/console/page.tsx');
  });
  it('aucun cadre hors de son rôle (--line-2 sur un cadre, rayon 13–24 hors 20)', () => {
    const fautes = lot.flatMap(cadresHorsRole);
    expect(fautes, `Cadre(s) hors rôle :\n${fautes.join('\n')}`).toEqual([]);
  });
  it('chaque exception est nommée et existe encore', () => {
    for (const [k, raison] of Object.entries({ ...EXCEPTIONS_LIGNE_2, ...EXCEPTIONS_RAYON })) {
      expect(raison.length, k).toBeGreaterThan(10);
      const [fk, extrait] = k.split('::') as [string, string];
      expect(lot.includes(fk) && readFileSync(join(WEB, fk), 'utf8').includes(extrait), `exception périmée · ${k.slice(0, 80)}`).toBe(true);
    }
    for (const h of Object.keys(HORS_LOT)) {
      expect(fichiers.some((f) => f === h || f.startsWith(h + '/')), `hors lot périmé · ${h}`).toBe(true);
    }
  });
});
