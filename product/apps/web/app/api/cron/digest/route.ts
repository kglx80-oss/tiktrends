import { NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { weeklyDigests, digestText } from '../../../../lib/digest';
import { createNotification } from '../../../../lib/notifications';
import { digestEmail } from '../../../../lib/emails';
import { sendMail } from '../../../../lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Aucun appel modèle · seulement des comptes et des envois. */
export const maxDuration = 300;

/**
 * Le récapitulatif hebdomadaire · un passage par semaine.
 *
 * À appeler le lundi matin :
 *   Authorization: Bearer $CRON_SECRET
 *
 * ── Ce qu'il ne fait pas ─────────────────────────────────────────────────────
 *
 * Il ne dépense rien. Le digest est calculé à partir de comptes, jamais rédigé
 * par un modèle · une lettre hebdomadaire qui appelle l'IA à chaque envoi
 * finirait coupée pour la mauvaise raison, et pourrait inventer un chiffre.
 *
 * Il n'envoie pas non plus une lettre par semaine coûte que coûte : une marque
 * dont la semaine ne porte rien n'en reçoit pas. Trois « rien de neuf » et la
 * lettre est morte avant d'avoir servi.
 *
 * ── La notification part avant le courriel ───────────────────────────────────
 *
 * Elle est gratuite et ne peut pas rebondir. Le courriel dépend d'un service
 * externe · si l'envoi échoue, la lettre est quand même dans l'application, et
 * l'échec ne fait pas perdre le passage des autres marques.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'cron_disabled' }, { status: 503 });
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!db) return NextResponse.json({ error: 'no_db' }, { status: 503 });

  try {
    const lettres = await weeklyDigests();
    let notifiees = 0;
    let envoyees = 0;

    for (const l of lettres) {
      // Les destinataires · propriétaires et administrateurs de l'espace, ceux
      // qui peuvent agir sur le geste conseillé.
      const membres = await db.select({ userId: schema.workspaceMembers.userId, role: schema.workspaceMembers.role })
        .from(schema.workspaceMembers)
        .where(eq(schema.workspaceMembers.workspaceId, l.workspaceId))
        .catch(() => []);
      const cibles = membres.filter((m) => m.role === 'owner' || m.role === 'admin');
      if (!cibles.length) continue;

      for (const m of cibles) {
        await createNotification({
          workspaceId: l.workspaceId, userId: m.userId, type: 'digest',
          title: l.digest.headline,
          body: digestText(l.digest),
          href: l.digest.action?.href ?? '/dashboard',
        });
        notifiees++;
      }

      const users = await db.select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(inArray(schema.users.id, cibles.map((c) => c.userId)))
        .catch(() => []);

      const mail = digestEmail({
        brandName: l.facts.brandName,
        headline: l.digest.headline,
        lines: l.digest.lines,
        action: l.digest.action,
      });
      for (const u of users) {
        if (!u.email) continue;
        const r = await sendMail({ to: u.email, subject: mail.subject, html: mail.html, text: mail.text });
        if (r.ok) envoyees++;
      }
    }

    console.log('[cron:digest]', lettres.length, 'lettre(s) ·', notifiees, 'notification(s) ·', envoyees, 'courriel(s)');
    return NextResponse.json({ ok: true, brands: lettres.length, notified: notifiees, mailed: envoyees });
  } catch (e) {
    console.error('[cron:digest]', (e as Error).message);
    return NextResponse.json({ error: 'digest_failed' }, { status: 500 });
  }
}
