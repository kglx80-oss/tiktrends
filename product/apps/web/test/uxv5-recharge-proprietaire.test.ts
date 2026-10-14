import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Lot V5 · B · le « + » de la pastille ouvre le menu de recharge EXISTANT, dont
 * l'achat passe par `createTopupCheckoutAction`. La V5 ne change rien à cette
 * garde · un non-propriétaire (admin, membre, client) est refusé AVANT tout
 * appel à Stripe. On rejoue l'action réelle, session simulée, et on lit où elle
 * renvoie (le RÉSULTAT), pas qu'une fonction est appelée.
 */
const etat = vi.hoisted(() => ({ role: 'owner' as string }));
class Redirection extends Error { constructor(public cible: string) { super(cible); } }
vi.mock('next/navigation', () => ({ redirect: (cible: string) => { throw new Redirection(cible); } }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ role: etat.role, workspaceId: 'w1', user: { email: 'u@exemple.invalid' } }) }));
vi.mock('@tiktrends/db', () => ({ db: {}, schema: { workspaces: {} } }));
// Stripe non configuré · un propriétaire passe la garde de rôle et s'arrête ici.
vi.mock('../lib/stripe', () => ({ getStripe: () => null, priceIdFor: () => null }));

const { createTopupCheckoutAction } = await import('../app/actions/stripe');
const { CREDIT_PACKS } = await import('../lib/credit-packs');

async function acheter(role: string): Promise<string> {
  etat.role = role;
  const fd = new FormData();
  fd.set('pack', CREDIT_PACKS[0]!.key);
  try { await createTopupCheckoutAction(fd); } catch (e) { if (e instanceof Redirection) return e.cible; throw e; }
  return 'aucune redirection';
}

describe('recharge · réservée au propriétaire (inchangé par la V5)', () => {
  beforeEach(() => { etat.role = 'owner'; });
  for (const role of ['admin', 'member', 'client_viewer']) {
    it(`${role} · refusé avant Stripe`, async () => {
      expect(await acheter(role)).toBe('/billing?e=forbidden');
    });
  }
  it('owner · passe la garde de rôle (s’arrête ensuite sur Stripe non configuré)', async () => {
    expect(await acheter('owner')).toBe('/billing?e=stripe');
  });
});
