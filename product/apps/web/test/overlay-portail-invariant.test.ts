import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'invariant qui empêche le bug « premier clic » de revenir.
 *
 * ── Ce qu'on a appris (#652, #653) ───────────────────────────────────────────
 *
 * Un overlay plein écran (`position: fixed` + `inset: 0` + un voile `rgba`) rendu
 * dans le sous-arbre d'où on l'ouvre est PIÉGÉ dès qu'un ancêtre porte un
 * `transform` · son voile ne couvre plus l'écran et le chrome de page passe
 * par-dessus. La parade structurelle : monter tout overlay de ce type via
 * `Portail` (sur `<body>`), jamais en place.
 *
 * « Penser à toujours utiliser Portail » s'applique cinq fois sur six · la
 * sixième est celle qui rouvre le bug. On remplace la consigne par ce garde :
 * tout FICHIER qui rend un voile plein écran DOIT router par `Portail`. Un
 * nouvel overlay non portalisé ajoute un fichier qui n'importe pas `Portail` ·
 * le garde tombe en le nommant.
 *
 * On lit le fichier ENTIER (pas ligne à ligne) · le voile de la `Modal` a son
 * `background: rgba` sur une ligne séparée du `position: fixed`, un scanner
 * mono-ligne l'aurait raté — soit le garde qui regarde à côté que la doctrine
 * proscrit. On vérifie aussi que le détecteur trouve TOUJOURS l'inventaire connu
 * (sinon un refactor du détecteur passerait au vert sur zéro fichier).
 */

const RACINE = join(__dirname, '..');

// Chrome volontairement NON portalisé · monté à la racine de l'app (`AppShell`),
// jamais sous un ancêtre transformé. Le voile du rail mobile accompagne le tiroir
// de navigation, pas un dialogue · le portaliser n'apporterait rien. Toute
// entrée ici est une exception JUSTIFIÉE, pas un oubli.
const TOLERES = new Set<string>([
  'components/AppShell.tsx',
]);

// Le détecteur doit retrouver au moins ces overlays connus · si la détection
// casse et ne voit plus rien, ce plancher fait tomber le garde plutôt que de le
// laisser passer sur zéro fichier.
const CONNUS_MIN = [
  'components/Modal.tsx',
  'components/CommandPalette.tsx',
  'app/(app)/studio/ads/AssistantPub.tsx',
  'app/(app)/studio/ads/AdsStudio.tsx',
  'app/(app)/studio/image/AssistantImage.tsx',
  'app/(app)/studio/image/ImageStudio.tsx',
  'app/(app)/studio/video/AssistantVideo.tsx',
  'app/(app)/adsmap/AdDrawer.tsx',
  'app/(app)/adsmap/SharePanel.tsx',
];

function tsxDuDossier(rel: string): string[] {
  const abs = join(RACINE, rel);
  const out: string[] = [];
  const marche = (d: string) => {
    for (const e of readdirSync(d)) {
      if (e === 'node_modules' || e === '.next' || e === 'test') continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) marche(p);
      else if (e.endsWith('.tsx')) out.push(p);
    }
  };
  marche(abs);
  return out;
}

/** Le fichier rend-il un voile plein écran ? (les trois signaux co-présents.) */
function rendUnVoilePleinEcran(src: string): boolean {
  const fixed = /position:\s*'fixed'/.test(src);
  const inset0 = /inset:\s*0\b/.test(src);
  // Un voile · un fond rgba semi-opaque. Les attrape-clics transparents (sans
  // `background`) ne comptent pas · ils n'ont pas à couvrir l'écran.
  const voile = /background:\s*'rgba\(/.test(src);
  return fixed && inset0 && voile;
}

describe('invariant · tout voile plein écran passe par Portail (anti-piège d’empilement)', () => {
  const fichiers = [...tsxDuDossier('app'), ...tsxDuDossier('components')];
  const avecVoile = fichiers
    .map((abs) => ({ abs, rel: abs.slice(RACINE.length + 1), src: readFileSync(abs, 'utf8') }))
    .filter((f) => rendUnVoilePleinEcran(f.src));

  it('le détecteur retrouve bien l’inventaire connu des overlays', () => {
    const rels = new Set(avecVoile.map((f) => f.rel));
    for (const c of CONNUS_MIN) {
      expect(rels.has(c), `overlay connu non détecté : ${c} · le détecteur regarde à côté`).toBe(true);
    }
  });

  it('aucun voile plein écran n’est rendu hors Portail', () => {
    const coupables = avecVoile
      .filter((f) => !TOLERES.has(f.rel))
      .filter((f) => !/\bPortail\b/.test(f.src))
      .map((f) => f.rel);
    expect(
      coupables,
      `ces fichiers rendent un voile plein écran sans passer par Portail (piège d’empilement) · les router via <Portail> : ${coupables.join(', ')}`,
    ).toEqual([]);
  });
});
