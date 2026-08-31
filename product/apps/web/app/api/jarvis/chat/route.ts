import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { chatSystemPrompt, trimThread, type ChatMessage } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { getActiveBrand } from '../../../../lib/brands';
import { canAccess, FEATURES, roleAtLeast } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { jarvisFullMemory, jarvisStats } from '../../../../lib/jarvis-memory';
import { guardedAnthropic, SpendBlockedError } from '../../../../lib/spend-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Le fil de conversation avec Jarvis.
 *
 * ── Pourquoi une route et pas une action serveur ─────────────────────────────
 *
 * Une action serveur ne peut pas rendre sa réponse au fur et à mesure. Sur une
 * conversation, attendre six secondes devant un écran muet ne se lit pas comme
 * de la réflexion, ça se lit comme une panne · et on reclique.
 *
 * Le flux passe par le garde de dépense, qui a été étendu pour ça plutôt que
 * contourné : les jetons réels sont relevés sur les événements du flux et la
 * dépense est écrite à la fin, même si la connexion se coupe en route.
 *
 * ── La consigne est recomposée à chaque tour ─────────────────────────────────
 *
 * Elle n'est jamais stockée avec le fil. La mémoire de la marque bouge — un
 * verdict arbitré, une créa décrite, une accroche réfutée — et une consigne
 * figée ferait répondre Jarvis avec les chiffres d'avant-hier, sans que rien ne
 * l'indique.
 */

const adsmap = FEATURES.find((f) => f.key === 'adsmap')!;
const MODEL = process.env.ANTHROPIC_GEN_MODEL || 'claude-sonnet-5';

export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !db) return json({ error: 'Session expirée.' }, 401);
  if (!roleAtLeast(s.role, 'member')) return json({ error: 'Accès refusé.' }, 403);

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return json({ error: 'Sélectionne une marque active.' }, 400);

  const body = (await req.json().catch(() => null)) as { message?: string } | null;
  const question = (body?.message ?? '').trim();
  if (!question) return json({ error: 'Message vide.' }, 400);

  const client = guardedAnthropic({ workspaceId: s.workspaceId, action: 'jarvis-chat' });
  if (!client) return json({ error: 'L’IA n’est pas configurée sur le serveur.' }, 503);

  try {
    // Le fil tel qu'il est en base, PUIS la question du tour · on n'écrit la
    // question qu'après avoir lu, sinon elle apparaîtrait deux fois.
    const anciens = await db.select({ role: schema.jarvisMessages.role, content: schema.jarvisMessages.content })
      .from(schema.jarvisMessages)
      .where(and(
        eq(schema.jarvisMessages.brandId, brand.id),
        eq(schema.jarvisMessages.userId, s.user.id),
      ))
      .orderBy(asc(schema.jarvisMessages.createdAt))
      .limit(40);

    const fil = trimThread([
      ...anciens.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
      { role: 'user', content: question },
    ]);

    const voitMemoire = canAccess(effectiveAccess(s), adsmap);
    const [memoire, stats, ligne] = await Promise.all([
      voitMemoire ? jarvisFullMemory(brand.id, s.workspaceId).catch(() => '') : Promise.resolve(''),
      voitMemoire ? jarvisStats(brand.id, s.workspaceId).catch(() => null) : Promise.resolve(null),
      db.select({
        rules: schema.brands.creativeRules, description: schema.brands.description,
        usp: schema.brands.usp, audience: schema.brands.audience,
      }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1),
    ]);
    const b = ligne[0];

    const system = chatSystemPrompt({
      brandName: brand.name,
      memory: memoire,
      rules: b?.rules ?? null,
      identity: [b?.description, b?.usp, b?.audience].filter(Boolean).join('\n') || null,
      measuredAds: stats?.nAds ?? 0,
      canAdsmap: voitMemoire,
      // Il ne peut proposer que ce qu'on lui laisse ouvrir · sans la carte, les
      // boutons mèneraient vers des écrans fermés.
      canPropose: voitMemoire,
    });

    await db.insert(schema.jarvisMessages).values({
      workspaceId: s.workspaceId, brandId: brand.id, userId: s.user.id,
      role: 'user', content: question.slice(0, 4000),
    });

    const flux = (await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system,
      messages: fil,
      stream: true,
    })) as unknown as AsyncIterable<{ type?: string; delta?: { type?: string; text?: string } }>;

    const encodeur = new TextEncoder();
    let complet = '';

    const sortie = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        try {
          for await (const ev of flux) {
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
              complet += ev.delta.text;
              ctrl.enqueue(encodeur.encode(ev.delta.text));
            }
          }
        } catch (e) {
          // Une coupure en cours de route laisse une réponse partielle · on la
          // garde plutôt que de la jeter, et on le dit dans le fil.
          const m = e instanceof SpendBlockedError
            ? `\n\n[${e.message}]`
            : '\n\n[Réponse interrompue.]';
          complet += m;
          ctrl.enqueue(encodeur.encode(m));
          console.error('[jarvis:chat]', (e as Error).message);
        } finally {
          if (complet.trim() && db) {
            await db.insert(schema.jarvisMessages).values({
              workspaceId: s.workspaceId, brandId: brand.id, userId: s.user.id,
              role: 'assistant', content: complet.slice(0, 12000),
            }).catch(() => { /* la réponse a été lue, la perdre en base n'annule pas le tour */ });
          }
          ctrl.close();
        }
      },
    });

    return new Response(sortie, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',   // sans ça, un proxy peut tamponner tout le flux
      },
    });
  } catch (e) {
    if (e instanceof SpendBlockedError) return json({ error: e.message }, 429);
    console.error('[jarvis:chat]', (e as Error).message);
    return json({ error: 'Jarvis n’a pas pu répondre. Réessaie.' }, 500);
  }
}

function json(o: unknown, status: number) {
  return new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
}
