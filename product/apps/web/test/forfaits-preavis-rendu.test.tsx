// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { preavisBascule } from '@tiktrends/core';

vi.mock('next/navigation', () => ({ usePathname: () => '/billing', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Forfaits } from '../spatial/vues/reglages/Forfaits';
import { SOUS_NAV_REGLAGES } from '../spatial/vues/reglages/sous-nav';

/**
 * Préavis de bascule (29/10, point 5) · un abonné Core lit, dans Réglages ·
 * Forfaits, la date de son échéance et le forfait qui suit, AU RÉSULTAT (HTML).
 * Sans `TARIFS_V2`, aucun préavis : la page reste celle d'aujourd'hui.
 * Mutation faite (restaurée) · bloc `data-preavis` retiré de la vue ⇒ la garde tombe.
 */
const CTX: CtxSpatial = { utilisateur: { nom: 'T', initiales: 'T', email: 't@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const action = async () => {};
const rendre = (preavis: ReturnType<typeof preavisBascule>) => renderToStaticMarkup(
  <FournisseurSpatial value={CTX}>
    <Forfaits sousNav={SOUS_NAV_REGLAGES} plan={{ nom: 'Core', dotation: 20000, solde: 12000, illimite: false, part: 60 }} rythme={{ parJour: 400, jours: 30, suffisant: true }}
      formules={[]} portail={action} abonnement={action} packs={[]} acheter={action} raisonAchat={null} faq={[]} retours={{}} preavis={preavis} />
  </FournisseurSpatial>,
);

describe('Forfaits · préavis de bascule', () => {
  it('abonné Core sous TARIFS_V2 · la date, le forfait Essentiel et ses droits réels', () => {
    const html = rendre(preavisBascule({ plan: 'core', tarifsV2: true, abonne: true, finPeriode: new Date('2026-11-12T10:00:00Z') }));
    const bloc = /<section[^>]*data-preavis="bascule"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '';
    expect(bloc).toContain('jusqu’au 12 novembre 2026');
    expect(bloc).toContain('forfait Essentiel');
    expect(bloc).toContain('1 marque');
  });
  it('sans TARIFS_V2 · aucun préavis', () => {
    expect(rendre(preavisBascule({ plan: 'core', tarifsV2: false, abonne: true, finPeriode: new Date() }))).not.toContain('data-preavis');
  });
});
