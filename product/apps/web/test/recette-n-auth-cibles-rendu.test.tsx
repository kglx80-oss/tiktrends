import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Recette N · authentification à 390 px. Mesuré dans le navigateur · « Oublié ? »
 * faisait 45×18 px sur /login, « ← Retour à la connexion » 152×15 px sur
 * /forgot (deux états) et /reset/[token] · des liens SEULS sur leur ligne (pas
 * des liens dans une phrase), donc des cibles qu'on vise au doigt.
 *
 * On REND les vraies pages (anonyme, ni base ni réseau) et on lit ces liens ·
 * chacun doit offrir une cible d'au moins 44 px de haut.
 */
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error('redirect ' + u); } }));
vi.mock('../lib/auth', () => ({ getSession: async () => null, signupOpen: () => true }));
vi.mock('../app/actions/auth', () => ({ loginAction: async () => {}, forgotPasswordAction: async () => {}, resetPasswordAction: async () => {}, signupAction: async () => {} }));
vi.mock('drizzle-orm', () => ({ and: () => null, eq: () => null, gt: () => null, isNull: () => null }));
// Jeton VALIDE simulé · la requête rend une ligne, la page montre le formulaire.
vi.mock('@tiktrends/db', () => {
  const chaine: Record<string, unknown> = {};
  Object.assign(chaine, { select: () => chaine, from: () => chaine, where: () => chaine, limit: async () => [{ id: 'r' }] });
  return { db: chaine, schema: { passwordResets: { id: 'id', token: 'token', usedAt: 'used_at', expiresAt: 'expires_at' } } };
});

import LoginPage from '../app/login/page';
import ForgotPage from '../app/forgot/page';
import ResetPage from '../app/reset/[token]/page';

/** La balise ouvrante du lien dont le texte visible est `texte`. */
function lien(html: string, texte: string): string {
  const m = [...html.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].find((x) => x[2]!.replace(/<[^>]+>/g, '').trim() === texte);
  return m ? m[1]! : '';
}
const HAUT_MIN = /min-height:(4[4-9]|[5-9]\d)px/;

describe('Recette N · authentification · les liens seuls se visent au doigt (≥ 44 px)', () => {
  it('/login · « Oublié ? »', async () => {
    const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));
    const a = lien(html, 'Oublié ?');
    expect(a, 'lien « Oublié ? » introuvable').not.toBe('');
    expect(a, '« Oublié ? » reste une cible de 18 px de haut à 390').toMatch(HAUT_MIN);
  });

  it('/forgot · « ← Retour à la connexion » (formulaire et confirmation d’envoi)', async () => {
    for (const sent of [undefined, '1']) {
      const html = renderToStaticMarkup(await ForgotPage({ searchParams: Promise.resolve({ sent }) }));
      const a = lien(html, '← Retour à la connexion');
      expect(a, `lien retour introuvable (sent=${sent})`).not.toBe('');
      expect(a, `« ← Retour à la connexion » reste une cible de 15 px de haut (sent=${sent})`).toMatch(HAUT_MIN);
    }
  });

  it('/reset/[token] valide · « ← Retour à la connexion »', async () => {
    const html = renderToStaticMarkup(await ResetPage({ params: Promise.resolve({ token: 'jeton-synthetique' }), searchParams: Promise.resolve({}) }));
    expect(html, 'le jeton simulé valide ne montre pas le formulaire').toContain('Nouveau mot de passe');
    const a = lien(html, '← Retour à la connexion');
    expect(a, 'lien retour introuvable').not.toBe('');
    expect(a, '« ← Retour à la connexion » reste une cible de 15 px de haut sur /reset').toMatch(HAUT_MIN);
  });
});
