import 'server-only';
import nodemailer from 'nodemailer';

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
  transport = url ? nodemailer.createTransport(url) : null;
  return transport;
}

export function mailConfigured(): boolean {
  return !!process.env.SMTP_URL;
}

export function appUrl(): string {
  return (process.env.APP_URL || 'https://app.tiktrends.co').replace(/\/$/, '');
}

const FROM = () => process.env.MAIL_FROM || 'TikTrends <no-reply@tiktrends.co>';

export async function sendMail(opts: { to: string; subject: string; html: string; text?: string }): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const t = getTransport();
  if (!t) {
    console.log(`[mail:skip] (SMTP non configuré) « ${opts.subject} » → ${opts.to}`);
    return { ok: false, skipped: true };
  }
  try {
    await t.sendMail({ from: FROM(), to: opts.to, subject: opts.subject, html: opts.html, text: opts.text });
    return { ok: true };
  } catch (e) {
    console.error('[mail:error]', (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}
