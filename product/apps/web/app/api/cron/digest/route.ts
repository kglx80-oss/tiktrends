import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  avecAbandonRecap, avecBattementRecap, avecCourrielRecap, avecMarquesRecap, avecNotificationRecap, cleVerrouRecap, decisionVerrouRecap,
  dejaEcritRecap, dejaNotifieRecap, destinataireRecap, etatInitialRecap, finRecap, repriseRecap, semaineIso,
  type EtatVerrouRecap,
} from '@tiktrends/core';
import { weeklyDigests, digestText } from '../../../../lib/digest';
import { digestEmail } from '../../../../lib/emails';
import { sendMail } from '../../../../lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Aucun appel modèle · seulement des comptes et des envois. */
export const maxDuration = 300;

/**
 * Le récapitulatif hebdomadaire · un passage par semaine.
 *
 * Appelée le lundi matin par le worker (`weekly-digest`, motif, fuseau et
 * tentatives au noyau · `MOTIF_RECAP_HEBDO`) :
 *   Authorization: Bearer $CRON_SECRET
 *
 * ── Une semaine, un passage, qui reprend où il s'est arrêté ──────────────────
 *
 * Le premier appel d'une semaine ISO (lue à Paris) pose le verrou
 * `digest:<semaine>` dans `app_settings` (clé primaire, `onConflictDoNothing` ·
 * atomique). Le verrou porte la PROGRESSION (`EtatVerrouRecap`) · les marques
 * retenues, et par marque qui a reçu la notification et le courriel. Chaque
 * notification s'écrit DANS LA MÊME TRANSACTION que sa ligne de progression ·
 * l'une sans l'autre est impossible. Chaque écriture est conditionnée au jeton
 * du passage · un passage qui a perdu le verrou s'arrête sans rien écrire.
 *
 * Un appel suivant de la semaine :
 *  · semaine `fait` · 200 `deja_passe`, rien de renvoyé ;
 *  · un passage vivant · 409 `en_cours` (le worker retentera) ;
 *  · un passage mort (tué par un redéploiement, muet depuis
 *    `SEUIL_ABANDON_RECAP_MS`) ou `interrompu` · REPRISE, seulement ce qui
 *    n'est pas noté servi.
 *
 * Le passage BAT avant chaque marque lue, avant chaque envoi et après chaque
 * refus · et chaque battement vérifie le jeton. Un passage qui a perdu le
 * verrou (repris parce qu'il semblait mort) s'arrête AVANT d'envoyer.
 *
 * Seule fenêtre de doublon restante, déclarée · un courriel PARTI dont l'envoi
 * n'a pas pu être noté : processus tué entre l'envoi et la note, base en panne
 * au moment de noter, ou réponse SMTP perdue après `DATA` (le serveur a pris
 * le message, nous croyons à un échec et le renverrons). Aucune base ne rend un
 * envoi SMTP transactionnel.
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
 * l'échec ne fait pas perdre le passage des autres marques. Un refus passager
 * laisse le passage `interrompu` (500) · la tentative suivante ne renvoie que
 * ce courriel. Un refus DÉFINITIF (5xx sur le destinataire ou le contenu,
 * `refusDefinitifSmtp`) est noté abandonné, journalisé, et n'est plus retenté.
 */

/** Le verrou est passé à un autre passage · on s'arrête sans rien écrire. */
class VerrouPerdu extends Error { constructor() { super('verrou_perdu'); } }

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'cron_disabled' }, { status: 503 });
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!db) return NextResponse.json({ error: 'no_db' }, { status: 503 });
  const base = db;

  const maintenant = new Date();
  const semaine = semaineIso(maintenant);
  const cle = cleVerrouRecap(maintenant);
  const jeton = randomUUID();
  const A = schema.appSettings;
  const aMoi = and(eq(A.key, cle), sql`${A.value}->>'jeton' = ${jeton}`);
  let etat: EtatVerrouRecap | null = null;
  let notifiees = 0;
  let envoyees = 0;

  /** Réécrit le verrou · seulement s'il est encore à ce passage. */
  const ecrire = async (e: EtatVerrouRecap) => {
    const r = await base.update(A).set({ value: e, updatedAt: new Date() }).where(aMoi).returning({ key: A.key });
    if (!r.length) throw new VerrouPerdu();
    etat = e;
  };
  /** Bat · et vérifie au passage que le verrou est toujours à ce passage. */
  const battre = async () => { if (etat) await ecrire(avecBattementRecap(etat, new Date())); };

  try {
    // ── Prendre le verrou, ou le reprendre ──────────────────────────────────
    const neuf = etatInitialRecap(jeton, maintenant);
    const pris = await base.insert(A).values({ key: cle, value: neuf }).onConflictDoNothing().returning({ key: A.key });
    if (pris.length) {
      etat = neuf;
    } else {
      const [l] = await base.select({ value: A.value }).from(A).where(eq(A.key, cle));
      if (!l) return NextResponse.json({ error: 'en_cours', week: semaine }, { status: 409 });
      const d = decisionVerrouRecap(l.value, maintenant);
      if (d.action === 'deja_passe') {
        console.log('[cron:digest]', semaine, '· déjà passé cette semaine · rien de renvoyé');
        return NextResponse.json({ ok: true, skipped: 'deja_passe', week: semaine, brands: 0, notified: 0, mailed: 0 });
      }
      if (d.action === 'en_cours') {
        console.warn('[cron:digest]', semaine, '· un autre passage est en cours · rien de fait');
        return NextResponse.json({ error: 'en_cours', week: semaine }, { status: 409 });
      }
      const repris = repriseRecap(d.precedent, jeton, maintenant);
      // Comparer-échanger sur la valeur ENTIÈRE relue · si le passage d'origine
      // a écrit entre la lecture et ici (une note, un battement), la reprise
      // échoue au lieu d'écraser sa progression. Vaut aussi pour une valeur
      // illisible (`precedent` nul).
      const r = await base.update(A).set({ value: repris, updatedAt: new Date() })
        .where(and(eq(A.key, cle), sql`${A.value} = ${JSON.stringify(l!.value)}::jsonb`))
        .returning({ key: A.key });
      if (!r.length) return NextResponse.json({ error: 'en_cours', week: semaine }, { status: 409 });
      etat = repris;
      console.warn('[cron:digest]', semaine, '· reprise d’un passage', d.precedent?.etat ?? 'illisible', '· reprise n°', repris.reprises);
    }

    // ── Les lettres · la fenêtre du PREMIER passage, la liste figée ─────────
    const lettres = await weeklyDigests(new Date(etat.debut), { auPas: battre });
    if (etat.marques === null) await ecrire(avecMarquesRecap(etat, lettres.map((l) => l.brandId), new Date()));
    const retenues = new Set(etat.marques ?? []);
    const disparues = [...retenues].filter((id) => !lettres.some((l) => l.brandId === id));
    if (disparues.length) console.warn('[cron:digest]', semaine, '·', disparues.length, 'marque(s) retenue(s) au premier passage sans lettre à la reprise');

    let marquesEnEchec = 0;
    let courrielsEnEchec = 0;
    let lettresServies = 0;

    for (const l of lettres.filter((x) => retenues.has(x.brandId))) {
      try {
        // Les destinataires · propriétaires et administrateurs de l'espace, ceux
        // qui peuvent agir sur le geste conseillé · la règle que la cloche relit
        // (`destinataireRecap`, une seule). Une lecture en panne ÉCHOUE · une
        // liste vide passerait pour « personne à prévenir ».
        const membres = await base.select({ userId: schema.workspaceMembers.userId, role: schema.workspaceMembers.role })
          .from(schema.workspaceMembers)
          .where(eq(schema.workspaceMembers.workspaceId, l.workspaceId));
        const cibles = membres.filter((m) => destinataireRecap(m.role));
        if (!cibles.length) { lettresServies++; continue; }

        for (const m of cibles) {
          if (dejaNotifieRecap(etat, l.brandId, m.userId)) continue;
          const suite = avecNotificationRecap(etat, l.brandId, m.userId, new Date());
          // La notification et sa progression · ensemble ou pas du tout.
          await base.transaction(async (tx) => {
            await tx.insert(schema.notifications).values({
              workspaceId: l.workspaceId, userId: m.userId, type: 'digest',
              title: l.digest.headline,
              body: digestText(l.digest),
              href: l.digest.action?.href ?? '/dashboard',
            });
            const r = await tx.update(A).set({ value: suite, updatedAt: new Date() }).where(aMoi).returning({ key: A.key });
            if (!r.length) throw new VerrouPerdu();
          });
          etat = suite;
          notifiees++;
        }

        const users = await base.select({ id: schema.users.id, email: schema.users.email })
          .from(schema.users)
          .where(inArray(schema.users.id, cibles.map((c) => c.userId)));

        const mail = digestEmail({
          brandName: l.facts.brandName,
          headline: l.digest.headline,
          lines: l.digest.lines,
          action: l.digest.action,
        });
        for (const u of users) {
          if (!u.email || dejaEcritRecap(etat, l.brandId, u.id)) continue;
          // AVANT l'envoi · battre ET vérifier le jeton. Un passage repris ne doit
          // pas écrire au destinataire que la reprise va servir.
          await battre();
          const r = await sendMail({ to: u.email, subject: mail.subject, html: mail.html, text: mail.text });
          if (r.ok) {
            await ecrire(avecCourrielRecap(etat, l.brandId, u.id, new Date()));
            envoyees++;
          } else if (r.definitif) {
            await ecrire(avecAbandonRecap(etat, l.brandId, u.id, new Date()));
            console.warn('[cron:digest]', semaine, '· courriel abandonné (refus définitif) · marque', l.brandId, '· destinataire', u.id);
          } else if (!r.skipped) {
            // Refus passager · pas noté, la tentative suivante le renverra. Le passage bat · un SMTP lent n'est pas un passage mort.
            await battre();
            courrielsEnEchec++;
          }
        }
        lettresServies++;
      } catch (e) {
        if (e instanceof VerrouPerdu) throw e;
        marquesEnEchec++;
        console.error('[cron:digest]', semaine, '· marque', l.brandId, 'en échec ·', (e as Error).message);
      }
    }

    if (courrielsEnEchec) console.error('[cron:digest]', semaine, '·', courrielsEnEchec, 'courriel(s) attendu(s) non parti(s) · le passage reste interrompu, la tentative suivante les renverra');
    const echecs = marquesEnEchec + courrielsEnEchec;
    await ecrire(finRecap(etat, echecs, new Date()));
    console.log('[cron:digest]', semaine, '·', lettresServies, 'lettre(s) ·', notifiees, 'notification(s) ·', envoyees, 'courriel(s)', echecs ? `· ${marquesEnEchec} marque(s) et ${courrielsEnEchec} courriel(s) en échec` : '');
    if (echecs) {
      return NextResponse.json({ error: 'digest_incomplet', week: semaine, notified: notifiees, mailed: envoyees, failedBrands: marquesEnEchec, failedMails: courrielsEnEchec }, { status: 500 });
    }
    return NextResponse.json({ ok: true, week: semaine, brands: lettresServies, notified: notifiees, mailed: envoyees });
  } catch (e) {
    if (e instanceof VerrouPerdu) {
      console.error('[cron:digest]', semaine, '· verrou repris par un autre passage · arrêt sans rien écrire');
      return NextResponse.json({ error: 'verrou_perdu', week: semaine, notified: notifiees, mailed: envoyees }, { status: 409 });
    }
    console.error('[cron:digest]', semaine, (e as Error).message);
    // Le passage dit qu'il s'est arrêté · la tentative suivante reprend tout de suite.
    const tenu: EtatVerrouRecap | null = etat;
    if (tenu) await base.update(A).set({ value: finRecap(tenu, 1, new Date()), updatedAt: new Date() }).where(aMoi).catch(() => undefined);
    return NextResponse.json({ error: 'digest_failed', week: semaine, notified: notifiees, mailed: envoyees }, { status: 500 });
  }
}
