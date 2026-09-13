import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pour un propriétaire déjà abonné, la facturation affichait « Gérer mon
 * abonnement » sur le bandeau ET sur CHAQUE carte de formule non-courante ·
 * jusqu'à quatre boutons identiques vers le même portail, et celui d'une
 * formule supérieure mentait sur son intention (on attendait « Passer à … »).
 *
 * On garde le bandeau comme foyer UNIQUE de gestion · les cartes nomment leur
 * propre action (« Passer à … » / « Revenir à … »), toujours via le portail.
 *
 * Page serveur (session, db, Stripe) · non rendable. Adoption par la source.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/billing/page.tsx'), 'utf8');

describe('Facturation · un abonné ne voit plus « Gérer mon abonnement » dédoublé', () => {
  it('les cartes ne répètent plus « Gérer mon abonnement »', () => {
    // La grille appelait cta('Gérer mon abonnement', …) sur chaque carte · plus maintenant.
    expect(src, 'les cartes répètent encore « Gérer mon abonnement »')
      .not.toContain("cta('Gérer mon abonnement'");
  });

  it('chaque carte nomme son action réelle selon le sens', () => {
    expect(src, 'le libellé montant « Passer à … » manque').toContain('`Passer à ${PLAN_LABEL[p]}`');
    expect(src, 'le libellé descendant « Revenir à … » manque').toContain('`Revenir à ${PLAN_LABEL[p]}`');
  });

  it('le bandeau reste le foyer unique de gestion', () => {
    expect(src, 'le bandeau « Gérer mon abonnement » a disparu').toContain('Gérer mon abonnement ›');
  });
});
