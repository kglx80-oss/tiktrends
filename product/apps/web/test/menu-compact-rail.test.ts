import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Menu compact pour portable 14 pouces (capture Kevin · le rail 184 px tassait
 * l'identité sous le bouton Réduire, l'espace se rognait en « Ag… », et le groupe
 * « Observer » démarrait trop bas). La coquille tire le graphe serveur · elle
 * n'est pas rendable en test. On cloue donc les RÉSULTATS de source qui, mesurés
 * à l'écran (Playwright · 1280×800, 1440×900, zoom 125, h720, replié, tiroir
 * mobile), tiennent : identité compacte, sélecteur d'espace DISTINCT, bascule
 * Réduire/Développer AU PIED, et cibles de nav à 44 px. Chaque assertion tombe
 * si on remet le défaut · la mutation est notée en regard.
 */
const SRC = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');

describe('menu compact · en-tête du rail', () => {
  it('l’identité est un mot-symbole COMPACT, pas un sélecteur ni un gros carré', () => {
    // Mutation : refusionner l'identité dans le bouton d'espace (« TikTrends »
    // comme libellé du sélecteur) fait tomber cette paire.
    expect(SRC, 'le nom TikTrends a disparu de l’en-tête').toContain('>TikTrends</span>');
    // L'ancienne identité-carré de 30 px (LogoHome) est réduite à 22 (symbole).
    const logo = readFileSync(join(process.cwd(), 'components/LogoHome.tsx'), 'utf8');
    expect(logo, 'le symbole reste un gros carré 30 px').not.toContain('width: 30, height: 30');
    expect(logo).toContain('width: 22, height: 22');
  });

  it('le sélecteur d’ESPACE est distinct de la marque · sa propre ligne 44, libellé complet au menu', () => {
    // Le bouton d'espace porte l'infobulle du libellé complet et la cible 44.
    expect(SRC).toContain('title={`Espace · ${workspaceName}`}');
    expect(SRC).toContain("aria-haspopup=\"menu\" aria-expanded={wsMenuOpen}");
  });

  it('la bascule Réduire/Développer a QUITTÉ l’en-tête · elle vit au pied, avec ses deux libellés', () => {
    // Mutation : remettre le bouton « Replier la barre » collé à l'identité
    // (l'ancien défaut) réintroduit l'écrasement. On exige les DEUX libellés de
    // la commande de pied, et l'absence de l'ancien libellé d'en-tête.
    expect(SRC, 'la commande de pied ne nomme pas ses deux états').toContain("collapsed ? 'Développer la barre' : 'Réduire la barre'");
    expect(SRC, 'l’ancien bouton « Replier la barre » de l’en-tête subsiste').not.toContain('title="Replier la barre"');
  });
});

describe('menu compact · cibles et discrétion', () => {
  it('les entrées de navigation atteignent la cible 44 (le padding seul tombait à 41)', () => {
    // Mutation : retirer ce minHeight fait retomber les items à 41 px (mesuré).
    const i = SRC.indexOf("padding: it.isSub ? '8px 10px 8px 30px' : '10px 11px'");
    expect(i, 'la tête de branche du rail est introuvable').toBeGreaterThan(-1);
    const bloc = SRC.slice(i, i + 200);
    expect(bloc, 'la tête de branche ne pose pas la cible 44').toContain('minHeight: CIBLE_TACTILE_MIN');
  });

  it('le groupe « Observer » (et ses voisins) reste discret · 11 px', () => {
    // Le libellé de groupe est en 11 px (charte : 11–12), pas ré-agrandi.
    expect(SRC).toContain("fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase'");
  });
});
