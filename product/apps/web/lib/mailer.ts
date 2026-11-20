import 'server-only';
import nodemailer from 'nodemailer';
import { parseConnectionUrl } from 'nodemailer/lib/shared';
import { DELAI_SMTP_MS, refusDefinitifSmtp, resumeErreurSmtp } from '@tiktrends/core';

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
 * (`lib/nodemailer.js:31-37`) ne lit alors QUE l'URL et jette le reste · les
 * délais n'arrivaient jamais au transport. On lit l'URL nous-mêmes, avec le
 * MÊME analyseur (`parseConnectionUrl`), et on passe un objet SANS `url` ·
 * `createTransport` le prend alors tel quel : il choisit le transport comme
 * avant (`pool=…` ⇒ réserve de connexions) et le `Mailer` garde les options de
 * l'URL (proxy, tls.*), ce que la construction directe d'un transport perdait.
 */
export function creerTransport(url: string): nodemailer.Transporter {
  const delais = { connectionTimeout: DELAI_SMTP_MS, greetingTimeout: DELAI_SMTP_MS, socketTimeout: DELAI_SMTP_MS };
  return nodemailer.createTransport({ ...parseConnectionUrl(url), ...delais } as Parameters<typeof nodemailer.createTransport>[0]);
}

function getTransport(): nodemailer.Transporter | null {
  if (transport !== undefined) return transport;
  const url = process.env.SMTP_URL;
  transport = url ? creerTransport(url) : null;
  return transport;
}

/** Le transport que `sendMail` utilise réellement (mis en cache) · `null` sans `SMTP_URL`. */
export function transportCourant(): nodemailer.Transporter | null {
  return getTransport();
}

/** SMTP configuré ? · sans `SMTP_URL`, `sendMail` saute chaque envoi. */
export function smtpConfigure(): boolean {
  return getTransport() !== null;
}

export function appUrl(): string {
  return (process.env.APP_URL || 'https://app.tiktrends.co').replace(/\/$/, '');
}

const FROM = () => process.env.MAIL_FROM || 'TikTrends <no-reply@tiktrends.co>';

export async function sendMail(opts: { to: string | { name: string; address: string }; subject: string; html: string; text?: string; qui?: string }): Promise<{ ok: boolean; skipped?: boolean; error?: string; definitif?: boolean }> {
  const t = getTransport();
  if (!t) {
    // Jamais l'adresse au journal · l'identifiant de l'utilisateur quand l'appelant le donne.
    console.log(`[mail:skip] (SMTP non configuré) « ${opts.subject} » → ${opts.qui ?? 'destinataire non journalisé'}`);
    return { ok: false, skipped: true };
  }
  try {
    await t.sendMail({ from: FROM(), to: opts.to, subject: opts.subject, html: opts.html, text: opts.text });
    return { ok: true };
  } catch (e) {
    // Jamais `e.message` · nodemailer y ajoute la réponse du serveur, qui porte
    // souvent l'adresse (`550 5.1.1 <x@y>`). Code, code de réponse, commande et
    // `qui` seulement (`resumeErreurSmtp`) · au journal comme dans ce qui est
    // rendu à l'appelant, qui pourrait le journaliser à son tour.
    const resume = resumeErreurSmtp(e, opts.qui);
    console.error(`[mail:error] ${resume}`);
    // Refus définitif (5xx sur le destinataire ou le contenu) · réessayer n'y changera rien.
    return { ok: false, error: resume, definitif: refusDefinitifSmtp(e as { responseCode?: unknown; command?: unknown; response?: unknown }) };
  }
}
