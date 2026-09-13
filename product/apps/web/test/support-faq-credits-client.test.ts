import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le widget de support est monté pour TOUS les utilisateurs. Sa FAQ crédits
 * renvoyait vers « Crédits (console admin) » · la route /credits est réservée
 * aux admins (redirect /dashboard sinon) · un membre non-admin qui suit le
 * conseil est éjecté. On pointe vers les surfaces CLIENTES · le menu crédits du
 * rail (solde) et « Utilisation des crédits » (/usage), déclarée pour le client.
 *
 * Client à actions serveur · non rendable seul. Adoption par la source, bornée
 * à la réponse FAQ crédits.
 */
const src = readFileSync(join(process.cwd(), 'components/SupportWidget.tsx'), 'utf8');
const i = src.indexOf('Comment fonctionnent les crédits');
const rep = src.slice(i, i > -1 ? i + 320 : undefined);

describe('Support · la FAQ crédits ne renvoie plus vers une page admin', () => {
  it('la réponse FAQ crédits existe', () => {
    expect(i, 'FAQ crédits introuvable').toBeGreaterThan(-1);
  });

  it('ne renvoie plus vers la console admin (route /credits gated)', () => {
    expect(rep, 'la FAQ crédits renvoie encore vers la console admin').not.toContain('console admin');
  });

  it('pointe vers la surface cliente « Utilisation des crédits »', () => {
    expect(rep, 'la FAQ crédits ne nomme pas la surface cliente').toContain('Utilisation des crédits');
  });
});
