import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspect } from 'node:util';

/**
 * `sendMail` n'écrit JAMAIS une adresse au journal · ni sans SMTP, ni quand le
 * serveur refuse. nodemailer ajoute la réponse du serveur au message de
 * l'erreur (`_formatError` · `err.message += ': ' + response`), et cette
 * réponse porte souvent l'adresse (`550 5.1.1 <anne@…>: Recipient address
 * rejected`) · journaliser `e.message` l'écrivait en clair. Le journal ne porte
 * plus que `code`, `responseCode`, `command` et l'identifiant (`qui`) donné
 * par l'appelant.
 *
 * VRAI mailer · seul le transport de nodemailer est remplacé (il lève l'erreur
 * telle que nodemailer 9.0.5 la construit). Chaque argument du journal est lu
 * en profondeur (`inspect`) · un objet passé tel quel ne cache pas une adresse
 * derrière « [object Object] ». 0 $ · aucun réseau.
 */

const ADRESSE = 'anne.martin@exemple.test';
const h = vi.hoisted(() => ({ erreur: null as null | Error }));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: async () => { if (h.erreur) throw h.erreur; return { messageId: 'faux' }; },
    }),
  },
}));

/** Le refus tel que nodemailer le construit au RCPT · message ET réponse portent l'adresse. */
function refusRcpt(): Error {
  const reponse = `550 5.1.1 <${ADRESSE}>: Recipient address rejected: User unknown`;
  return Object.assign(new Error(`Can't send mail - all recipients were rejected: ${reponse}`), {
    code: 'EENVELOPE', response: reponse, responseCode: 550, command: 'RCPT TO', rejected: [ADRESSE],
  });
}

type Journal = { niveau: string; ligne: string }[];

/** Le mailer neuf (son transport est mis en cache au premier envoi) · `SMTP_URL` posée ou non. */
async function mailer(smtp: string | null) {
  vi.resetModules();
  if (smtp) vi.stubEnv('SMTP_URL', smtp); else vi.stubEnv('SMTP_URL', '');
  return import('../lib/mailer');
}

/** Tout ce que le mailer écrit, tous niveaux confondus. */
async function journalDe<T>(f: () => Promise<T>): Promise<{ r: T; journal: Journal }> {
  const journal: Journal = [];
  const espions = (['log', 'info', 'warn', 'error', 'debug'] as const).map((n) =>
    vi.spyOn(console, n).mockImplementation((...a: unknown[]) => { journal.push({ niveau: n, ligne: a.map((x) => (typeof x === 'string' ? x : inspect(x, { depth: 6 }))).join(' ') }); }));
  try { return { r: await f(), journal }; } finally { for (const e of espions) e.mockRestore(); }
}

afterEach(() => { vi.unstubAllEnvs(); h.erreur = null; });

describe('sendMail · le journal ne porte jamais l’adresse', () => {
  it('sans SMTP_URL · une ligne `[mail:skip]`, l’identifiant de l’appelant, aucune adresse (chaîne ou objet, avec ou sans `qui`)', async () => {
    const { sendMail } = await mailer(null);
    const { r, journal } = await journalDe(async () => [
      await sendMail({ to: ADRESSE, subject: 'Bienvenue', html: '<p>x</p>', qui: 'u-123' }),
      await sendMail({ to: { name: '', address: ADRESSE }, subject: 'Invitation', html: '<p>x</p>' }),
    ]);
    expect(r, 'sans SMTP, l’envoi n’est pas dit « sauté »').toEqual([{ ok: false, skipped: true }, { ok: false, skipped: true }]);
    expect(journal.map((j) => j.ligne).filter((l) => l.includes('@')), 'une adresse est écrite au journal sans SMTP').toEqual([]);
    expect(journal).toHaveLength(2);
    expect(journal[0]!.ligne).toContain('[mail:skip]');
    expect(journal[0]!.ligne).toContain('u-123');
    expect(journal[1]!.ligne).toContain('destinataire non journalisé');
  });

  it('refus du serveur dont le message porte l’adresse · `[mail:error]` avec code, code de réponse, commande et `qui` · jamais l’adresse ni le message brut', async () => {
    const { sendMail } = await mailer('smtp://faux.exemple.test:25');
    h.erreur = refusRcpt();
    const { r, journal } = await journalDe(() => sendMail({ to: ADRESSE, subject: 'Récap', html: '<p>x</p>', qui: 'u-456' }));
    expect(journal.map((j) => j.ligne).filter((l) => l.includes(ADRESSE) || l.includes('@')), 'une adresse est écrite au journal par `[mail:error]`').toEqual([]);
    expect(journal.map((j) => j.ligne).filter((l) => l.includes('Recipient address rejected') || l.includes('all recipients were rejected')), 'le message brut du serveur est écrit au journal').toEqual([]);
    expect(journal, 'un refus n’écrit pas exactement une ligne').toHaveLength(1);
    expect(journal[0]).toMatchObject({ niveau: 'error' });
    expect(journal[0]!.ligne, 'le refus n’est plus lisible au journal (code, réponse, commande, qui)').toBe('[mail:error] code=EENVELOPE · réponse=550 · commande=RCPT TO · qui=u-456');
    expect(r.ok).toBe(false);
    expect(r.definitif, 'un 550 5.1.1 au RCPT n’est plus reconnu définitif').toBe(true);
    expect(inspect(r), 'le résultat rendu à l’appelant porte l’adresse · un appelant qui le journalise la fuiterait').not.toContain('@');
  });

  it('les appelants sans `qui` (bienvenue, mot de passe, invitation) · refus journalisé sans adresse, `ok: false` rendu, rien ne lève', async () => {
    const { sendMail } = await mailer('smtp://faux.exemple.test:25');
    h.erreur = refusRcpt();
    const { r, journal } = await journalDe(async () => [
      await sendMail({ to: ADRESSE, subject: 'Bienvenue', html: '<p>x</p>' }),
      await sendMail({ to: { name: '', address: ADRESSE }, subject: 'Invitation', html: '<p>x</p>' }),
    ]);
    expect(r.map((x) => x.ok), 'un refus est rendu comme un envoi parti · l’écran Équipe dirait « e-mail envoyé »').toEqual([false, false]);
    expect(journal.map((j) => j.ligne).filter((l) => l.includes('@')), 'une adresse est écrite au journal').toEqual([]);
    expect(journal.map((j) => j.ligne)).toEqual(Array(2).fill('[mail:error] code=EENVELOPE · réponse=550 · commande=RCPT TO · qui=destinataire non journalisé'));
    h.erreur = null;
    const { r: parti } = await journalDe(() => sendMail({ to: { name: '', address: ADRESSE }, subject: 'Invitation', html: '<p>x</p>' }));
    expect(parti, 'témoin · un envoi qui part est rendu `ok`').toEqual({ ok: true });
  });
});
