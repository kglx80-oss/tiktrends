import 'server-only';
import nodemailer from 'nodemailer';
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

function getTransport(): nodemailer.Transporter | null {
  if (transport !== undefined) return transport;
  const url = process.env.SMTP_URL;
  // Délais explicites (`DELAI_SMTP_MS`) · les défauts de nodemailer (connexion
  // 2 min, accueil 30 s, inactivité 10 min) laissaient un envoi muet plus
  // longtemps que le seuil d'abandon du récap hebdomadaire.
  transport = url
    ? nodemailer.createTransport({ url, connectionTimeout: DELAI_SMTP_MS, greetingTimeout: DELAI_SMTP_MS, socketTimeout: DELAI_SMTP_MS } as Parameters<typeof nodemailer.createTransport>[0])
    : null;
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
    return { ok: false, error: (e as Error).message, definitif: refusDefinitifSmtp(e as { responseCode?: unknown; command?: unknown }) };
  }
}
