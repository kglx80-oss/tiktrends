import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pubs IA · composition premium & responsive (lot Codex 28/09). L'écran tirait
 * un GROS bandeau marketing (« DÉMARRAGE RAPIDE », dégradé) et une pastille
 * « CONCEPT · SCÈNE · DESIGN » qui repoussaient la galerie hors du premier
 * écran ; la grille était figée à ~4 colonnes à 240px et les filtres s'étalaient
 * tous en ligne. On cloue au RÉSULTAT de source (l'écran tire le graphe serveur,
 * il n'est pas rendable en test). Chaque assertion tombe si le défaut revient.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const page = read('app/(app)/studio/ads/page.tsx');
const studio = read('app/(app)/studio/ads/AdsStudio.tsx');
const barre = read('components/BarreFiltresGalerie.tsx');
const contexte = read('components/ContexteCreation.tsx');
const appshell = read('components/AppShell.tsx');
const support = read('components/SupportWidget.tsx');

describe('Pubs IA · en-tête court, sans bandeau marketing', () => {
  it('titre court + explication « prochain test », pas de pastille marketing', () => {
    expect(page).toContain('Crée les variantes de ton prochain test');
    expect(page, 'la pastille marketing subsiste').not.toContain('CONCEPT · SCÈNE · DESIGN');
  });
  it('le contenu principal est borné à 1200, centré', () => {
    expect(page).toContain('maxWidth: 1200');
  });
  it('le GROS bandeau héros « DÉMARRAGE RAPIDE » a disparu (galerie dans le premier écran)', () => {
    // Mutation : réintroduire le hero (le libellé ou son dégradé) fait tomber.
    expect(studio, 'le bandeau DÉMARRAGE RAPIDE subsiste').not.toContain('DÉMARRAGE RAPIDE');
    expect(studio, 'le dégradé marketing du hero subsiste').not.toContain('linear-gradient(120deg, rgba(255,60,120,.16)');
  });
  it('une action dominante de création + un clone secondaire subsistent', () => {
    expect(studio).toContain('Créer des pubs');
    expect(studio).toContain('Cloner une pub qui tient');
  });
});

describe('Pubs IA · galerie premium responsive', () => {
  it('grille fluide bornée à la largeur dispo (4/3/2/1 selon la taille)', () => {
    // Mutation : remettre une piste fixe non bornée (ex. minmax(240px, 1fr))
    // fait retomber la responsivité et cette assertion.
    expect(studio).toContain('repeat(auto-fill, minmax(min(260px, 100%), 1fr))');
  });
});

describe('Pubs IA · recette Codex passe1 · vue mobile réellement galerie', () => {
  it('le premier écran mobile est compacté · en-tête conscient du seuil 768', () => {
    // Mutation : retirer la conscience du seuil (compact) fait retomber la
    // compaction mobile et cette assertion.
    expect(studio, 'le studio n’est pas conscient du seuil mobile').toContain("useIsMobile('(max-width: 768px)')");
    expect(studio).toContain('const compact =');
  });

  it('les réglages avancés · un contrôle sobre replié (pas de grosse carte), phrase masquée sur mobile', () => {
    // Le chrome de carte (bordure, fond) n'apparaît qu'une fois DÉPLIÉ.
    expect(studio, 'la carte volumineuse subsiste même repliée').toContain("border: avance ? '1px solid var(--line-2)' : 'none'");
    // La phrase descriptive tombe sur mobile.
    expect(studio, 'la phrase descriptive ne se replie pas sur mobile').toContain('{!compact && (');
  });

  it('l’hypothèse · résumé dépliable, action SECONDAIRE (un seul CTA rose dominant)', () => {
    // L'action de l'hypothèse ne rivalise plus avec « Créer des pubs » · elle est
    // à cadre sobre, fond transparent (pas de dégradé d'accent plein).
    expect(studio, 'l’action de l’hypothèse reprend un fond d’accent plein').toContain('background: \'transparent\', color: teinte');
    expect(studio, 'le détail de l’hypothèse ne se déplie pas').toContain('const detailVisible = !compact || hypDetail');
  });

  it('le support n’est plus une bulle FIXE sur cette route · lanceur ANCRÉ en zone de commandes', () => {
    // Recette Codex passe2 · une bulle fixe recouvrait un filtre / l'état vide au
    // défilement. Sur /studio/ads, le shell rend le support ANCRÉ (lanceur inline,
    // qui défile avec la page) au lieu du flottant. Rail et autres routes inchangés.
    expect(appshell, 'le shell ne distingue pas /studio/ads pour le support').toContain("pathname === '/studio/ads'");
    expect(appshell, 'le support n’est pas ancré sur cette route').toContain('<SupportWidget anchored');
    // Le mode ancré est un vrai dialogue · Escape ferme en rendant le focus au
    // lanceur, et le panneau porte le rôle dialog.
    expect(support, 'le mode ancré n’existe pas').toContain('anchored');
    expect(support, 'Escape ne ferme pas le dialogue ancré').toContain("e.key === 'Escape'");
    expect(support, 'le focus n’est pas rendu au lanceur').toContain('lanceurRef.current?.focus()');
    expect(support, 'le panneau ancré n’est pas un dialogue').toContain("role={anchored ? 'dialog'");
  });

  it('le contexte détaillé passe derrière un accès « Contexte » sur mobile', () => {
    expect(contexte, 'le contexte n’est pas conscient du seuil mobile').toContain("useIsMobile('(max-width: 768px)')");
    expect(contexte, 'pas d’accès « Contexte » compact sur mobile').toContain('if (compact && !ouvert)');
  });
});

describe('Pubs IA · une barre, filtres à la demande', () => {
  it('un panneau de filtres révélé par un bouton (aria-expanded), pas étalé', () => {
    expect(barre).toContain('aria-expanded={ouvert}');
    expect(barre).toContain('aria-controls={panneauId}');
    // Le panneau est masqué par défaut (display piloté par l'état, pas `hidden`
    // écrasé par un display inline).
    expect(barre).toContain("display: ouvert ? 'flex' : 'none'");
  });
  it('tous les filtres restent présents (format, qualité, performance) + tri', () => {
    for (const l of ['label="Format"', 'label="Qualité"', 'label="Performance"', 'label="Tri"']) {
      expect(barre, `filtre manquant : ${l}`).toContain(l);
    }
  });
});
