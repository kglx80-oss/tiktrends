// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Injection HTML dans les e-mails · relecture sécurité de main 62a341e3.
 *
 * Les gabarits (`lib/emails.ts`) inséraient tels quels le nom de l'espace, le
 * nom de la personne qui invite, le nom de la marque et les lignes du
 * récapitulatif · des valeurs SAISIES. Un compte libre se nomme
 * `<a href="https://piege.test">Valider ton compte</a>`, invite n'importe quelle
 * adresse, et l'e-mail parti de NOTRE domaine porte son lien. Et
 * `createInviteAction` n'avait aucune limite de débit · un relais d'e-mails.
 *
 * On lit le RÉSULTAT · le HTML rendu de chaque gabarit (aucune balise injectée,
 * le texte échappé), le texte brut (lisible, inchangé pour un nom ordinaire),
 * et, de bout en bout, avec le VRAI `getSession` sur un jeton signé et une
 * base réelle (pglite), le courriel que nodemailer aurait envoyé et les lignes
 * d'invitation écrites. 0 $ · rien ne part.
 */

const h = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'secret-de-test-emails-0123456789abcdef';
  process.env.APP_URL = 'https://app.exemple.test';
  process.env.SMTP_URL = 'smtp://faux.exemple.test:25';
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  return {
    jeton: null as string | null,
    courriels: [] as Array<{ to?: unknown; subject?: unknown; html?: string; text?: string }>,
    ids: { ws: u(), autreWs: u(), admin: u(), autreAdmin: u() },
  };
});

vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: async (m: (typeof h.courriels)[number]) => { h.courriels.push(m); return { messageId: 'faux' }; } }) } }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect:${u}`); },
  notFound: () => { throw new Error('notFound'); },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (n === 'tt_session' && h.jeton ? { name: n, value: h.jeton } : undefined),
    getAll: () => [], has: (n: string) => n === 'tt_session' && !!h.jeton, set: () => {}, delete: () => {},
  }),
  headers: async () => new Headers({ host: 'localhost' }),
}));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});

import { SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { messagesRetourEquipe } from '@tiktrends/core';
import { welcomeEmail, inviteEmail, resetEmail, digestEmail } from '../lib/emails';
import { createInviteAction } from '../app/actions/invites';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 300_000 });

const PIEGE = '<a href="https://piege.test/x?a=1&b=2">Valider ton compte</a>';
const PIEGE_ECHAPPE = '&lt;a href=&quot;https://piege.test/x?a=1&amp;b=2&quot;&gt;Valider ton compte&lt;/a&gt;';
const APOS = 'L\'Atelier "Nord" & <Co>';
const APOS_ECHAPPE = 'L&#39;Atelier &quot;Nord&quot; &amp; &lt;Co&gt;';

/** Toutes les adresses des liens du HTML · seules celles de l'application doivent y être. */
const liens = (html: string) => [...html.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1]);

function sansInjection(html: string, quoi: string): void {
  expect(html, `${quoi} · la balise saisie est rendue telle quelle`).not.toContain('href="https://piege.test');
  expect(liens(html).every((l) => l!.startsWith('https://app.exemple.test')), `${quoi} · un lien étranger dans l’e-mail : ${liens(html).join(', ')}`).toBe(true);
}

describe('Gabarits d’e-mail · toute valeur saisie est échappée (& < > " \')', () => {
  it('bienvenue · nom de l’espace et prénom', () => {
    const m = welcomeEmail('<b>Pirate</b> Dupont', PIEGE);
    sansInjection(m.html, 'bienvenue');
    expect(m.html).toContain(PIEGE_ECHAPPE);
    expect(m.html).toContain('Bienvenue, &lt;b&gt;Pirate&lt;/b&gt;');
  });

  it('invitation · nom de qui invite, nom de l’espace, rôle', () => {
    const m = inviteEmail({ inviterName: PIEGE, workspaceName: APOS, roleLabel: 'Membre <i>', token: 'jeton_abc-123' });
    sansInjection(m.html, 'invitation');
    expect(m.html).toContain(PIEGE_ECHAPPE);
    expect(m.html).toContain(`l'espace <b>${APOS_ECHAPPE}</b>`);
    expect(m.html).toContain('<b>Membre &lt;i&gt;</b>');
    expect(m.html).toContain('href="https://app.exemple.test/invite/jeton_abc-123"');
  });

  it('récapitulatif · marque, titre, lignes, geste', () => {
    const m = digestEmail({ brandName: PIEGE, headline: APOS, lines: [PIEGE, 'Ligne <script>alert(1)</script>'], action: { label: '<img src=x onerror=1>', href: '/adsmap?v="x"', why: APOS } });
    sansInjection(m.html, 'récapitulatif');
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<img');
    expect(m.html).toContain(`<li style="margin:0 0 6px">${PIEGE_ECHAPPE}</li>`);
    expect(m.html).toContain(`>${APOS_ECHAPPE}</h1>`);
    expect(m.html).toContain('href="https://app.exemple.test/adsmap?v=&quot;x&quot;"');
  });

  it('réinitialisation · le jeton est échappé dans le lien', () => {
    const m = resetEmail('a"b<c');
    expect(m.html).toContain('href="https://app.exemple.test/reset/a&quot;b&lt;c"');
    expect(m.html).not.toContain('a"b<c');
  });

  it('texte brut · lisible (aucune entité), inchangé pour un nom ordinaire', () => {
    const t = inviteEmail({ inviterName: 'Inès', workspaceName: 'L\'Atelier "Nord" & Co', roleLabel: 'Membre', token: 't' }).text;
    expect(t).toContain('Inès t\'invite à rejoindre l\'espace L\'Atelier "Nord" & Co sur TikTrends en tant que Membre .');
    expect(t, 'une entité HTML dans le texte brut').not.toMatch(/&(amp|lt|gt|quot|#39);/);
    const w = welcomeEmail('Inès Martin', 'Maison Ordinaire');
    expect(w.html).toContain('Ton espace <b>Maison Ordinaire</b> est prêt.');
    expect(w.html).toContain('Bienvenue, Inès 👋');
    expect(w.text).toContain('Bienvenue, Inès 👋 Ton espace Maison Ordinaire est prêt.');
    expect(w.subject).toBe('Bienvenue sur TikTrends 🎬');
  });
});

/* ───────────────────── de bout en bout · invitation ───────────────────── */

async function connecter(uid: string): Promise<void> {
  h.jeton = await new SignJWT({ uid, ep: 0 }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('3600s')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
}
async function inviter(email: string, role = 'member'): Promise<string> {
  const f = new FormData(); f.set('email', email); f.set('role', role);
  try { await createInviteAction(f); return 'aucune redirection'; } catch (e) { return String((e as Error).message); }
}
const invitationsDe = async (ws: string) => (await db!.select().from(schema.invites).where(eq(schema.invites.workspaceId, ws))).length;

beforeAll(async () => {
  await db!.insert(schema.workspaces).values([
    { id: h.ids.ws, name: PIEGE, plan: 'core' },
    { id: h.ids.autreWs, name: 'Autre espace', plan: 'core' },
  ]);
  await db!.insert(schema.users).values([
    { id: h.ids.admin, email: 'admin@emails.test', name: PIEGE },
    { id: h.ids.autreAdmin, email: 'admin@autre.test', name: 'Autre' },
  ]);
  await db!.insert(schema.workspaceMembers).values([
    { workspaceId: h.ids.ws, userId: h.ids.admin, role: 'admin' },
    { workspaceId: h.ids.autreWs, userId: h.ids.autreAdmin, role: 'owner' },
  ]);
});
beforeEach(() => { h.courriels = []; });

describe('createInviteAction · VRAI getSession, base réelle', () => {
  it('le courriel d’invitation réellement envoyé ne porte pas le lien injecté', async () => {
    await connecter(h.ids.admin);
    expect(await inviter('victime@exemple.test')).toBe('redirect:/team?ok=invite_mail');
    expect(h.courriels).toHaveLength(1);
    sansInjection(h.courriels[0]!.html!, 'courriel envoyé');
    expect(h.courriels[0]!.html).toContain(PIEGE_ECHAPPE);
  });

  it('20 invitations dans l’heure passent · la 21e est refusée, rien d’écrit, aucun e-mail', async () => {
    await connecter(h.ids.admin);
    const deja = await invitationsDe(h.ids.ws); // l'invitation du cas précédent compte dans l'heure
    for (let i = deja; i < 20; i++) expect(await inviter(`personne-${i}@exemple.test`), `invitation n° ${i + 1}`).toBe('redirect:/team?ok=invite_mail');
    expect(await invitationsDe(h.ids.ws)).toBe(20);
    h.courriels = [];
    const r = await inviter('personne-21@exemple.test');
    expect(r, 'la 21e invitation de l’heure doit être refusée').toBe('redirect:/team?e=throttled');
    expect(await invitationsDe(h.ids.ws), 'la 21e invitation a été écrite').toBe(20);
    expect(h.courriels, 'la 21e invitation a envoyé un e-mail').toEqual([]);
    expect(messagesRetourEquipe()['e:throttled']).toMatch(/20 invitations par heure/);
  });

  it('un autre espace garde sa propre limite · inchangé', async () => {
    await connecter(h.ids.autreAdmin);
    expect(await inviter('quelquun@exemple.test')).toBe('redirect:/team?ok=invite_mail');
    expect(await invitationsDe(h.ids.autreWs)).toBe(1);
  });

  it('une demande invalide (e-mail vide) ne consomme rien · inchangé', async () => {
    await connecter(h.ids.autreAdmin);
    expect(await inviter('')).toBe('redirect:/team?e=email');
  });
});
