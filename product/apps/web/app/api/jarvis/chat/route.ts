import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { trimThread, personnalisationAccueil, actionsPromptBlock, costOfTokens, sha256Hex, type ChatMessage, messageServiceInactif } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { getActiveBrand } from '../../../../lib/brands';
import { canAccess, FEATURES } from '../../../../lib/rbac';
import { refusJarvis } from '../../../../lib/jarvis-acces';
import { effectiveAccess } from '../../../../lib/access';
import { jarvisFullMemory, jarvisStats } from '../../../../lib/jarvis-memory';
import { consigneAvecConnaissances, consignerUsageConnaissances } from '../../../../lib/jarvis-connaissances';
import { guardedAnthropic, SpendBlockedError } from '../../../../lib/spend-guard';
import { resoudreConversationJarvis, consignerRunConversation } from '../../../../lib/studios/prompts/resolveur';
import { assemblerConsigneJarvis } from '../../../../lib/studios/prompts/conversation';
import type { SourceTrace } from '../../../../lib/studios/prompts/traces';

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
 * ── La consigne vient du registre, recomposée à chaque tour ───────────────────
 *
 * Son TEXTE est la politique de conversation `jarvis.conversation` de la
 * release active (registre de prompts, ADMIN « IA et Studios »), résolue par le
 * PromptResolver unique (`lib/studios/prompts/resolveur.ts`) · aucune consigne
 * de repli dans le code : sans release publiée, Jarvis répond « pas encore
 * activé ». L'ASSEMBLAGE (ordre des blocs, seuils, plafonds, bloc d'actions,
 * bloc de connaissances) reste une politique du code. Chaque tour laisse une
 * trace `studio_prompt_runs` (release, version, empreintes, sources, coût) ·
 * jamais la question ni la réponse en clair.
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
  // Les droits de la feature `jarvis` (rôle, offre, matrice d'équipe) AVANT la
  // marque, le corps et les connaissances · un refus ne lit rien et ne dit rien
  // de ce que Jarvis aurait lu (voir lib/jarvis-acces).
  if (refusJarvis(s)) return json({ error: 'Accès refusé.' }, 403);

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return json({ error: 'Sélectionne une marque active.' }, 400);

  const body = (await req.json().catch(() => null)) as { message?: string } | null;
  const question = (body?.message ?? '').trim();
  if (!question) return json({ error: 'Message vide.' }, 400);

  const client = guardedAnthropic({ workspaceId: s.workspaceId, action: 'jarvis-chat' });
  // Copie client · aucun nom de clé ni de « serveur » (recette #106b).
  if (!client) return json({ error: messageServiceInactif('jarvis') }, 503);

  // La release active porte la consigne · aucune n'est publiée = Jarvis n'est
  // pas activé, comme sans fournisseur. Aucun texte de repli.
  const resolution = await resoudreConversationJarvis().catch(() => null);
  if (!resolution?.ok) return json({ error: messageServiceInactif('jarvis') }, 503);

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
    const [memoire, stats, ligne, ws] = await Promise.all([
      voitMemoire ? jarvisFullMemory(brand.id, s.workspaceId).catch(() => '') : Promise.resolve(''),
      voitMemoire ? jarvisStats(brand.id, s.workspaceId).catch(() => null) : Promise.resolve(null),
      db.select({
        rules: schema.brands.creativeRules, description: schema.brands.description,
        usp: schema.brands.usp, audience: schema.brands.audience,
      }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1),
      db.select({ onboarding: schema.workspaces.onboarding }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1),
    ]);
    const b = ligne[0];
    // Le niveau déclaré à l'accueil règle le registre d'explication de Jarvis ·
    // il ne ferme aucune fonction (cf. accueil.ts).
    const { niveau } = personnalisationAccueil(ws[0]?.onboarding);

    // Les connaissances PUBLIÉES de l'équipe, dans leur portée, délimitées ·
    // insérées avant les règles maison (voir lib/jarvis-connaissances).
    const donnees = {
      brandName: brand.name,
      memory: memoire,
      rules: b?.rules ?? null,
      identity: [b?.description, b?.usp, b?.audience].filter(Boolean).join('\n') || null,
      measuredAds: stats?.nAds ?? 0,
      canAdsmap: voitMemoire,
      // Il ne peut proposer que ce qu'on lui laisse ouvrir · sans la carte, les
      // boutons mèneraient vers des écrans fermés.
      canPropose: voitMemoire,
      niveau,
      blocActions: actionsPromptBlock(),
    };
    const { system, inclus } = await consigneAvecConnaissances(assemblerConsigneJarvis(resolution.politique, donnees), { workspaceId: s.workspaceId, brandId: brand.id });

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
    let statut: 'succeeded' | 'failed' = 'succeeded';
    const jetons = { entree: 0, sortie: 0 };
    const debut = Date.now();

    const sortie = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        try {
          for await (const ev of flux) {
            const u = ev as { type?: string; message?: { usage?: { input_tokens?: number } }; usage?: { output_tokens?: number } };
            if (u.type === 'message_start') jetons.entree = u.message?.usage?.input_tokens ?? 0;
            if (u.type === 'message_delta') jetons.sortie = u.usage?.output_tokens ?? jetons.sortie;
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
          statut = 'failed';
          ctrl.enqueue(encodeur.encode(m));
          console.error('[jarvis:chat]', (e as Error).message);
        } finally {
          if (complet.trim() && db) {
            await db.insert(schema.jarvisMessages).values({
              workspaceId: s.workspaceId, brandId: brand.id, userId: s.user.id,
              role: 'assistant', content: complet.slice(0, 12000),
            }).catch(() => { /* la réponse a été lue, la perdre en base n'annule pas le tour */ });
          }
          // Ce qui était dans le contexte de CETTE réponse, et ce qu'elle a cité.
          if (inclus.length) await consignerUsageConnaissances(inclus, complet, question).catch(() => { /* compteur, jamais bloquant */ });
          // Trace du tour (release, version, empreintes, sources) · jamais bloquante.
          const empreinte = (t: string | null | undefined) => (t ? sha256Hex(t) : null);
          const sources: SourceTrace[] = [
            ...inclus.map((i) => ({ type: 'connaissance' as const, id: i.id, version: i.ref, titre: i.titre })),
            ...(memoire.trim() ? [{ type: 'memoire' as const, id: brand.id, version: empreinte(memoire)!.slice(0, 16), titre: 'Mémoire mesurée de la marque' }] : []),
            ...(b?.rules?.trim() ? [{ type: 'regles' as const, id: brand.id, version: empreinte(b.rules)!.slice(0, 16), titre: 'Règles maison' }] : []),
          ];
          await consignerRunConversation({
            resolution, portee: { workspaceId: s.workspaceId, brandId: brand.id }, traceId: `jv_${crypto.randomUUID()}`, modele: MODEL,
            system, messages: fil,
            contexte: { marque: brand.id, identite: empreinte(donnees.identity), memoire: empreinte(memoire), regles: empreinte(b?.rules), mesurees: donnees.measuredAds, niveau, canAdsmap: voitMemoire, connaissances: inclus.map((i) => i.ref) },
            sources, reponse: complet, statut, latenceMs: Date.now() - debut, jetons, coutUsd: costOfTokens(MODEL, jetons.entree, jetons.sortie),
          }).catch((e) => console.error('[jarvis:chat] trace', (e as Error).message));
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
