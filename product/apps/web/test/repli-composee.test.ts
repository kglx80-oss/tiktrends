import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le filet composée · une pub entière qui reste cassée ne se livre pas telle quelle.
 *
 * ── Ce que ça défend ─────────────────────────────────────────────────────────
 *
 * Le rattrapage rejoue l'entière une fois. Quand le modèle échoue ENCORE de la
 * même façon — accroche réécrite, texte illisible — livrer la pub « à revoir »
 * revient à rendre du connu-cassé, ce que le mode entière ne peut pas se
 * permettre. On refait alors la pub en COMPOSÉE : le texte est le nôtre, donc
 * exact ; le produit vient de la photo, donc fidèle. La bascule résout par
 * construction les trois écarts éliminatoires, et n'a pas besoin d'être relue.
 *
 * Trois propriétés le tiennent, et l'argent est la plus importante.
 */

const SRC = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');

// Le bloc du filet · on y confine les assertions de comportement pour ne pas
// les voir passer sur une autre partie du fichier.
const BLOC = SRC.slice(
  SRC.indexOf('Ce qui reste cassé après la reprise'),
  SRC.indexOf('// On construit TOUTES les recettes'),
);

describe('le filet composée tient son contrat', () => {
  it('refait la pub en COMPOSÉE, pas en entière', () => {
    // C'est le cœur du filet · demander la scène et poser NOTRE texte, au lieu
    // de rejouer une entière qui vient d'échouer deux fois.
    expect(BLOC, 'le repli ne passe plus en composée').toMatch(/genScene\(c, i, 'composee'\)/);
  });

  it('ne dépense JAMAIS au-delà de la marge déjà réservée', () => {
    // La règle qui ne se discute pas · pas un dollar qui n'ait été annoncé avant
    // le clic. Le filet puise dans le RESTE de la marge de reprise (réservée),
    // jamais dans une réservation nouvelle.
    expect(SRC, 'la réservation d’avance a changé de forme').toMatch(/imagesAReserver\(count, reprisesBudget > 0\)/);
    expect(BLOC, 'le budget du filet ne se déduit plus de la marge restante')
      .toMatch(/budgetReplis = \(o\.reprisesBudget \?\? 0\) - reprisesFaites/);
    expect(BLOC, 'le filet borne le repli à autre chose que la marge restante')
      .toMatch(/indicesARattraper\(constatsFinaux, budgetReplis\)/);
    // La reprise compte l'image qu'elle vient de dépenser · sinon le filet
    // dépenserait sans décrémenter la marge et déborderait l'annoncé.
    expect(SRC, 'la reprise ne décompte plus l’image dépensée').toMatch(/reprisesFaites\+\+/);
    // Une image repliée est FACTURÉE comme les autres · le remboursement à
    // l'image la garde honnête.
    expect(BLOC, 'l’image repliée n’est plus facturée').toMatch(/imagesFal\+\+/);
  });

  it('la composée est de confiance · aucune relecture, mode porté par l’item', () => {
    // Le texte est le nôtre et le produit vient de la photo · relire reviendrait
    // à vérifier notre propre travail. On retire donc le constat entière et on
    // marque le mode de CETTE pub seule.
    expect(BLOC, 'le repli relit une composée · il vérifie notre propre texte').not.toMatch(/relireScene/);
    expect(BLOC, 'le constat entière survit à la bascule').toMatch(/controles\.delete\(i\)/);
    expect(BLOC, 'la pub repliée ne porte pas son mode').toMatch(/modeParItem\.set\(i, 'composee'\)/);
    expect(SRC, 'la recette ne lit plus le mode par item').toMatch(/mode: modeParItem\.get\(i\) \?\? o\.mode \?\? 'composee'/);
  });

  it('ne touche pas aux essais · un essai partage une scène, le repli la romprait', () => {
    // Le filet vit dans le même garde que le rattrapage · hors essai. Reprendre
    // une pub d'un essai casserait la comparaison qu'il promet.
    const gardeRattrapage = SRC.indexOf("if (!o.essai && (o.reprisesBudget ?? 0) > 0)");
    const filet = SRC.indexOf('Ce qui reste cassé après la reprise');
    expect(gardeRattrapage, 'le garde hors-essai a disparu').toBeGreaterThan(-1);
    expect(filet, 'le filet est sorti du garde hors-essai').toBeGreaterThan(gardeRattrapage);
  });
});
