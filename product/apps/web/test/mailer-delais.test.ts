import { describe, expect, it, vi } from 'vitest';

/**
 * Les délais SMTP arrivent au transport que `sendMail` UTILISE · aucun mock de
 * nodemailer, aucun réseau (un transport n'ouvre de connexion qu'à l'envoi).
 *
 * `createTransport({ url, …délais })` paraissait les passer · nodemailer 9.0.5
 * ne lit alors que l'URL et jette le reste, et un garde qui regardait
 * l'argument passé à un mock restait vert. On lit ici le transport mis en
 * cache par le mailer, `SMTP_URL` posée, et les options qu'il utilisera ·
 * délais, ET ce que l'URL porte (compte, hôte, port, options `tls.*` gardées
 * par le `Mailer`).
 */

vi.hoisted(() => { process.env.SMTP_URL = 'smtps://utilisateur:secret-de-test@smtp.exemple.test:465/?tls.rejectUnauthorized=false'; });

import { DELAI_SMTP_MS } from '@tiktrends/core';
import { creerTransport, transportCourant } from '../lib/mailer';

type OptionsSmtp = { connectionTimeout?: number; greetingTimeout?: number; socketTimeout?: number; host?: string; port?: number; secure?: boolean; auth?: { user?: string; pass?: string } };
type MailerLu = { options: { tls?: { rejectUnauthorized?: boolean } }; transporter: { options: OptionsSmtp; name: string } };

describe('le transport SMTP réellement utilisé porte les délais explicites et ce que dit l’URL', () => {
  it('le transport en cache de `sendMail` · délais, compte, hôte, port, chiffrement', () => {
    const m = transportCourant() as unknown as MailerLu | null;
    expect(m, 'SMTP_URL posée mais aucun transport').not.toBeNull();
    const o = m!.transporter.options;
    expect(o.connectionTimeout, 'le délai de connexion n’arrive pas au transport · le défaut de nodemailer (2 min) reste actif').toBe(DELAI_SMTP_MS);
    expect(o.greetingTimeout, 'le délai d’accueil n’arrive pas au transport').toBe(DELAI_SMTP_MS);
    expect(o.socketTimeout, 'le délai d’inactivité n’arrive pas au transport · le défaut de nodemailer (10 min) reste actif').toBe(DELAI_SMTP_MS);
    expect(o.auth, 'le compte de l’URL est perdu').toEqual({ user: 'utilisateur', pass: 'secret-de-test' });
    expect([o.host, o.port, o.secure]).toEqual(['smtp.exemple.test', 465, true]);
    expect(m!.transporter.name).toBe('SMTP');
  });

  it('le Mailer garde les options de l’URL (tls.*)', () => {
    const m = transportCourant() as unknown as MailerLu;
    expect(m.options.tls?.rejectUnauthorized, 'les options de l’URL ne sont plus gardées par le Mailer').toBe(false);
  });

  it('`pool=` dans l’URL garde la réserve de connexions, avec les délais', () => {
    for (const v of ['true', 'yes']) {
      const m = creerTransport(`smtps://u:p@smtp.exemple.test:465/?pool=${v}`) as unknown as MailerLu;
      expect(m.transporter.name, `pool=${v}`).toBe('SMTP (pool)');
      expect(m.transporter.options.socketTimeout).toBe(DELAI_SMTP_MS);
    }
  });
});
