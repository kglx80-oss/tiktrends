import 'server-only';
import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import SMTPPool from 'nodemailer/lib/smtp-pool';
import { DELAI_SMTP_MS, refusDefinitifSmtp } from '@tiktrends/core';

/**
 * Envoi d'e-mails transactionnels via SMTP (SMTP_URL).
 * Best-effort : si le SMTP n'est pas configuré, on n'échoue jamais — on journalise
 * simplement (utile en local : le lien reste visible côté UI de toute façon).
 *
 * SMTP_URL exemple : smtps://user:pass@smtp.example.com:465
 * MAIL_FROM exemple : "TikTrends <bonjour@tiktrends.co>"
 */
let transport: nodemailer.Transporter | null | undefined;

/**
 * Le transport SMTP · avec des délais EXPLICITES (`DELAI_SMTP_MS` · connexion,
 * accueil, inactivité). Les défauts de nodemailer (2 min, 30 s, 10 min)
 * laissaient un envoi muet plus longtemps que le seuil d'abandon du récap
 * hebdomadaire.
 *
 * Pas `createTransport({ url, …délais })` · nodemailer 9.0.5
 * (`lib/nodemailer.js:31-37`) ne lit alors QUE l'URL (`parseConnectionUrl`)
 * et jette le reste · les délais n'arrivaient jamais au transport. Les
 * transports eux-mêmes (`smtp-transport`, `smtp-pool`) fusionnent l'URL et les
 * options · on les construit donc directement. `?pool=true` dans l'URL garde
 * le transport en réserve de connexions, comme avant.
 */
export function creerTransport(url: string): nodemailer.Transporter {
  const delais = { connectionTimeout: DELAI_SMTP_MS, greetingTimeout: DELAI_SMTP_MS, socketTimeout: DELAI_SMTP_MS };
  const enReserve = /[?&]pool=(true|1)(&|$)/i.test(url);
  return nodemailer.createTransport(enReserve ? new SMTPPool({ url, ...delais, pool: true }) : new SMTPTransport({ url, ...delais }));
}

function getTransport(): nodemailer.Transporter | null {
  if (transport !== undefined) return transport;
  const url = process.env.SMTP_URL;
  transport = url ? creerTransport(url) : null;
  return transport;
}

export function appUrl(): string {
  return (process.env.APP_URL || 'https://app.tiktrends.co').replace(/\/$/, '');
}

const FROM = () => process.env.MAIL_FROM || 'TikTrends <no-reply@tiktrends.co>';

export async function sendMail(opts: { to: string | { name: string; address: string }; subject: string; html: string; text?: string }): Promise<{ ok: boolean; skipped?: boolean; error?: string; definitif?: boolean }> {
  const t = getTransport();
  if (!t) {
    console.log(`[mail:skip] (SMTP non configuré) « ${opts.subject} » → ${typeof opts.to === 'string' ? opts.to : opts.to.address}`);
    return { ok: false, skipped: true };
  }
  try {
    await t.sendMail({ from: FROM(), to: opts.to, subject: opts.subject, html: opts.html, text: opts.text });
    return { ok: true };
  } catch (e) {
    console.error('[mail:error]', (e as Error).message);
    // Refus définitif (5xx sur le destinataire ou le contenu) · réessayer n'y changera rien.
    return { ok: false, error: (e as Error).message, definitif: refusDefinitifSmtp(e as { responseCode?: unknown; command?: unknown; response?: unknown }) };
  }
}
