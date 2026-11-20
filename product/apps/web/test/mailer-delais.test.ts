import { describe, expect, it } from 'vitest';
import { DELAI_SMTP_MS } from '@tiktrends/core';
import { creerTransport } from '../lib/mailer';

/**
 * Les délais SMTP arrivent au VRAI transport · aucun mock de nodemailer.
 *
 * `createTransport({ url, …délais })` paraissait les passer · nodemailer 9.0.5
 * ne lit alors que l'URL et jette le reste, et un garde qui regardait
 * l'argument passé à un mock restait vert. On construit ici le transport réel
 * (rien n'est envoyé, aucune connexion n'est ouverte avant un envoi) et on lit
 * les options qu'il UTILISERA.
 */

type Options = { connectionTimeout?: number; greetingTimeout?: number; socketTimeout?: number; host?: string; port?: number; secure?: boolean; auth?: { user?: string } };
const optionsDe = (url: string) => (creerTransport(url) as unknown as { transporter: { options: Options; name: string } }).transporter;

describe('le transport SMTP réel porte les délais explicites', () => {
  for (const url of ['smtps://utilisateur:secret@smtp.exemple.test:465', 'smtp://smtp.exemple.test:587', 'smtps://u:p@smtp.exemple.test:465/?pool=true']) {
    it(url.replace(/:[^:@/]+@/, ':***@'), () => {
      const t = optionsDe(url);
      expect(t.options.connectionTimeout, 'le délai de connexion n’arrive pas au transport · le défaut de nodemailer (2 min) reste actif').toBe(DELAI_SMTP_MS);
      expect(t.options.greetingTimeout, 'le délai d’accueil n’arrive pas au transport').toBe(DELAI_SMTP_MS);
      expect(t.options.socketTimeout, 'le délai d’inactivité n’arrive pas au transport · le défaut de nodemailer (10 min) reste actif').toBe(DELAI_SMTP_MS);
      // L'URL est toujours lue · hôte, port, chiffrement, compte.
      expect(t.options.host).toBe('smtp.exemple.test');
      expect(t.options.port).toBe(url.includes(':465') ? 465 : 587);
      expect(t.options.secure).toBe(url.startsWith('smtps:'));
    });
  }

  it('l’URL qui demande une réserve de connexions la garde', () => {
    expect(optionsDe('smtps://u:p@smtp.exemple.test:465/?pool=true').name).toBe('SMTP (pool)');
    expect(optionsDe('smtps://u:p@smtp.exemple.test:465').name).toBe('SMTP');
  });
});
