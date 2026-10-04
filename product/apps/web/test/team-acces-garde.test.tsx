import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 9 · autorisation Kevin · `/team` réservé aux propriétaires et admins.
 *
 * On REND la page serveur avec une session simulée et une base factice qui
 * compte ses lectures. Autorisé · les e-mails et le lien d'invitation sont dans
 * le HTML. Refusé (membre, client en lecture, sans session) · redirection AVANT
 * toute lecture, et aucune donnée sensible ne peut sortir.
 */
const etat = vi.hoisted(() => ({
  session: null as null | { workspaceId: string; workspaceName: string; role: string; plan: string; user: { id: string; email: string } },
  lectures: 0,
}));

vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect:${u}`); }, useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('../lib/mailer', () => ({ appUrl: () => 'https://app.exemple.invalid' }));
vi.mock('../app/actions/invites', () => ({ revokeInviteAction: async () => {}, createInviteAction: async () => {} }));
vi.mock('@tiktrends/db', () => {
  const membres = [{ email: 'secret.membre@exemple.invalid', name: 'Membre secret', role: 'member' }];
  const invitations = [{ id: 'i1', email: 'invite.secrete@exemple.invalid', role: 'member', token: 'jeton-secret-0001', status: 'pending', expiresAt: new Date(Date.now() + 864e5), createdAt: new Date() }];
  // Chaîne Drizzle minimale · chaque `select` compte une lecture, la chaîne se
  // résout sur les membres (avec jointure) ou les invitations (sans).
  const chaine = (avecJointure: boolean) => {
    const c: Record<string, unknown> = {};
    c.from = () => c; c.innerJoin = () => { avecJointure = true; return c; }; c.where = () => c;
    c.then = (ok: (v: unknown) => unknown) => ok(avecJointure ? membres : invitations);
    return c;
  };
  return {
    db: { select: () => { etat.lectures++; return chaine(false); } },
    schema: { users: {}, workspaceMembers: {}, invites: {} },
  };
});
vi.mock('drizzle-orm', () => ({ and: () => ({}), eq: () => ({}) }));

import TeamPage from '../app/(app)/team/page';
import { FEATURES, canAccess, type Access } from '../lib/rbac';

const session = (role: string) => ({ workspaceId: 'w', workspaceName: 'Espace', role, plan: 'business', user: { id: 'u', email: 'moi@exemple.invalid' } });
const rendre = async () => renderToStaticMarkup(await TeamPage({ searchParams: Promise.resolve({}) }));
afterEach(() => { etat.session = null; etat.lectures = 0; });

describe('/team · réservé aux propriétaires et admins', () => {
  for (const role of ['owner', 'admin']) {
    it(`${role} · autorisé, voit membres et lien d'invitation`, async () => {
      etat.session = session(role);
      const html = await rendre();
      expect(html).toContain('secret.membre@exemple.invalid');
      expect(html).toContain('https://app.exemple.invalid/invite/jeton-secret-0001');
    });
  }
  for (const role of ['member', 'client_viewer']) {
    it(`${role} · refusé par redirection, AUCUNE lecture, aucune donnée sensible`, async () => {
      etat.session = session(role);
      let html = '';
      await expect((async () => { html = await rendre(); })(), 'un non-admin reçoit la page').rejects.toThrow('redirect:/dashboard');
      expect(etat.lectures, 'la base a été lue avant le refus').toBe(0);
      expect(html).not.toContain('secret.membre');
      expect(html).not.toContain('jeton-secret');
    });
  }
  it('sans session · renvoyé à la connexion, aucune lecture', async () => {
    await expect(rendre()).rejects.toThrow('redirect:/login');
    expect(etat.lectures).toBe(0);
  });
});

describe('/team · l’entrée « Membres » suit la même règle', () => {
  const membres = FEATURES.find((f) => f.key === 'team')!;
  it('visible pour owner et admin, absente pour member et client en lecture', () => {
    for (const role of ['owner', 'admin'] as const) expect(canAccess({ role, plan: 'business' } as Access, membres), role).toBe(true);
    for (const role of ['member', 'client_viewer'] as const) expect(canAccess({ role, plan: 'business' } as Access, membres), role).toBe(false);
  });
});

