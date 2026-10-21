import { preparerVeilleVisuelle } from '../../../../lib/jarvis/veille-visuelle';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { trimThread, personnalisationAccueil, actionsPromptBlock, costOfTokens, sha256Hex, contexteSelonPuces, consigneOnboardingJarvis, type ChatMessage, messageServiceInactif } from '@tiktrends/core';
import { messagesDeConversation, conversationAppartient, conversationDuProjet, creerConversation, toucherConversation } from '../../../../lib/jarvis/conversations';
import { messagesOnboarding, insererMessageOnboarding } from '../../../../lib/jarvis/onboarding';
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
import { blocProjetsJarvis, blocConceptJarvis } from '../../../../lib/studios/jarvis-projets';

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
 * PromptResolver unique (`lib/studios/prompts/resolveur.ts`). Sans release
 * publiée, il garde la version 1.0.0 migrée (le texte d'avant, prouvé
 * identique), tracée `repli_1_0_0` · Jarvis n'est jamais coupé faute de
 * publication. L'ASSEMBLAGE (ordre des blocs, seuils, plafonds, bloc d'actions,
 * bloc de connaissances) reste une politique du code. Chaque tour laisse une
 * trace `studio_prompt_runs` (release, version, empreintes, sources, coût) ·
 * jamais la question ni la réponse en clair.
 *
 * Les projets Studios de la marque active y entrent comme un bloc de données
 * (avant les règles maison) · lus sous les gardes de l'écran « Projets »,
 * bornés par le noyau (`resumerProjetsPourJarvis`), vides sans droit ni projet.
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

  const body = (await req.json().catch(() => null)) as { message?: string; conversationId?: string | null; projectId?: string | null; sources?: string[]; veille?: unknown; brandId?: string } | null;
  const question = (body?.message ?? '').trim();
  if (!question) return json({ error: 'Message vide.' }, 400);

  const client = guardedAnthropic({ workspaceId: s.workspaceId, action: 'jarvis-chat' });
  // Copie client · aucun nom de clé ni de « serveur » (recette #106b).
  if (!client) return json({ error: messageServiceInactif('jarvis') }, 503);

  // La release active porte la consigne ; sans release, la version 1.0.0
  // migrée (voir resoudreConversationJarvis). Échec de lecture ou release
  // publiée sans politique Jarvis : service inactif, rien ne part. L'onboarding
  // passe AUSSI par le resolver (même garde de disponibilité).
  const resolution = await resoudreConversationJarvis().catch(() => null);
  if (!resolution?.ok) return json({ error: messageServiceInactif('jarvis') }, 503);

  // ── ONBOARDING · pas de marque active · Jarvis reste VIVANT et guide vers la
  // création de la première marque (consigne générique, SANS contexte de
  // marque). Pas de mur « Sélectionne une marque ». Fil portée espace + personne.
  if (!brand && body?.veille) return json({ error: 'Choisis une marque avant de cloner.' }, 409);
  if (!brand) return fluxOnboarding({ workspaceId: s.workspaceId, userId: s.user.id }, client, question);

  let veille: Awaited<ReturnType<typeof preparerVeilleVisuelle>> | null = null;
  if (body?.veille) {
    if (!brand || body.brandId !== brand.id) return json({ error: 'La marque active a changé. Rouvre la référence pour continuer.' }, 409);
    try { veille = await preparerVeilleVisuelle(body.veille, { workspaceId: s.workspaceId, brandId: brand.id }); }
    catch (e) { return json({ error: (e as Error).message }, 400); }
  }

  const portee = { workspaceId: s.workspaceId, brandId: brand.id, userId: s.user.id };
  // La conversation demandée doit appartenir à la portée · un identifiant
  // étranger retombe sur le fil principal (jamais la conversation d'autrui). Le
  // tour s'écrit alors dans CETTE conversation (ou le fil principal).
  const demandee = typeof body?.conversationId === 'string' ? body.conversationId : null;
  let conversationId = demandee && (await conversationAppartient(portee, demandee)) ? demandee : null;

  if (veille && !conversationId) conversationId = await creerConversation(portee);

  // Concept créatif V5 · un message de concept (`projectId` fourni) ne tombe
  // JAMAIS dans le fil principal de la marque · à défaut de conversation liée
  // résolue, on réutilise celle du concept (portée + `project_id`) ou on en crée
  // une. Le lien marque↔concept reste porté par la ligne de conversation, lue
  // côté serveur par `conversationDuProjet` (pas de clé navigateur).
  const projectId = typeof body?.projectId === 'string' ? body.projectId : null;
  if (projectId && !conversationId) {
    const existantes = await conversationDuProjet(portee, projectId).catch(() => []);
    conversationId = existantes[0]?.id ?? (await creerConversation(portee, { projectId }));
  }
  // Les puces de contexte (Veille / Fiche marque · seule « Fiche marque » est
  // réelle) · décocher « Fiche marque » EXCLUT l'identité et la mémoire mesurée
  // du contexte assemblé pour CE tour (règle pure `contexteSelonPuces`).
  const { ficheMarque } = contexteSelonPuces(body?.sources ?? null);

  try {
    // Le fil de CETTE conversation tel qu'il est en base, PUIS la question du
    // tour · on n'écrit la question qu'après avoir lu, sinon elle apparaîtrait
    // deux fois.
    const anciens = (await messagesDeConversation(portee, conversationId)).slice(-40);

    const fil = trimThread([
      ...anciens.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
      { role: 'user', content: question },
    ]);

    const voitMemoire = canAccess(effectiveAccess(s), adsmap);
    const [memoire, stats, ligne, ws, projets, concept] = await Promise.all([
      voitMemoire ? jarvisFullMemory(brand.id, s.workspaceId).catch(() => '') : Promise.resolve(''),
      voitMemoire ? jarvisStats(brand.id, s.workspaceId).catch(() => null) : Promise.resolve(null),
      db.select({
        rules: schema.brands.creativeRules, description: schema.brands.description,
        usp: schema.brands.usp, audience: schema.brands.audience,
      }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1),
      db.select({ onboarding: schema.workspaces.onboarding }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1),
      // Les projets Studios de la marque, sous les gardes de l'écran « Projets »
      // (portée espace + marque + restrictions, capacité) · bloc court et borné
      // (règle pure du noyau), vide sans droit ni projet. Jamais bloquant.
      blocProjetsJarvis(brand.id).catch(() => ''),
      // L'état du concept LIÉ · seulement si la conversation porte un `projectId`
      // (page concept). Mêmes gardes, lecture seule, borné (règle pure du noyau) ·
      // vide sans projet lié, sans droit ou sur panne. Jamais bloquant, et sur la
      // page /jarvis (sans projectId) la consigne reste exactement celle d'avant.
      projectId ? blocConceptJarvis(brand.id, projectId).catch(() => '') : Promise.resolve(''),
    ]);
    const b = ligne[0];
    // Le niveau déclaré à l'accueil règle le registre d'explication de Jarvis ·
    // il ne ferme aucune fonction (cf. accueil.ts).
    const { niveau } = personnalisationAccueil(ws[0]?.onboarding);

    // Les connaissances PUBLIÉES de l'équipe, dans leur portée, délimitées ·
    // insérées avant les règles maison (voir lib/jarvis-connaissances).
    const donnees = {
      brandName: brand.name,
      // « Fiche marque » décochée · ni mémoire mesurée ni identité dans le
      // contexte de CE tour (le choix client pilote un contexte réel).
      memory: ficheMarque ? memoire : '',
      rules: b?.rules ?? null,
      identity: ficheMarque ? ([b?.description, b?.usp, b?.audience].filter(Boolean).join('\n') || null) : null,
      measuredAds: stats?.nAds ?? 0,
      canAdsmap: voitMemoire,
      // Il ne peut proposer que ce qu'on lui laisse ouvrir · sans la carte, les
      // boutons mèneraient vers des écrans fermés.
      canPropose: voitMemoire,
      niveau,
      blocActions: actionsPromptBlock(),
      blocProjets: projets,
      // Présent uniquement quand la conversation est liée à un concept · ailleurs
      // la chaîne est vide et l'assemblage ne l'ajoute pas (consigne inchangée).
      blocConcept: concept,
    };
    const { system: systemBase, inclus } = await consigneAvecConnaissances(assemblerConsigneJarvis(resolution.politique, donnees), { workspaceId: s.workspaceId, brandId: brand.id });

    const system = veille ? `${systemBase}\n\n${veille.consigne}` : systemBase;
    const messages = veille?.image ? fil.map((m, i) => i === fil.length - 1 ? { role: m.role, content: [veille.image!, { type: 'text' as const, text: m.content }] } : m) : fil;

    await db.insert(schema.jarvisMessages).values({
      workspaceId: s.workspaceId, brandId: brand.id, userId: s.user.id, conversationId,
      role: 'user', content: question.slice(0, 4000),
    });
    // Une conversation nommée remonte en tête de « Mes conversations » dès qu'on
    // y écrit · le fil principal (conversationId null) n'a pas de ligne à toucher.
    if (conversationId) await toucherConversation(portee, conversationId).catch(() => { /* remontée cosmétique, jamais bloquante */ });

    const flux = (await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system,
      messages,
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
              workspaceId: s.workspaceId, brandId: brand.id, userId: s.user.id, conversationId,
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
            contexte: { ...(veille ? { veille: { consigne: sha256Hex(veille.consigne), image: veille.image ? sha256Hex(veille.image.source.data) : null } } : {}), marque: brand.id, identite: empreinte(donnees.identity), memoire: empreinte(memoire), regles: empreinte(b?.rules), mesurees: donnees.measuredAds, niveau, canAdsmap: voitMemoire, connaissances: inclus.map((i) => i.ref), ...(projets ? { projets: empreinte(projets) } : {}), ...(projectId ? { projet: projectId } : {}), ...(concept ? { concept: empreinte(concept) } : {}) },
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

/**
 * Le fil d'ONBOARDING · sans marque. Consigne GÉNÉRIQUE (pas de contexte de
 * marque) qui guide vers la création de la première marque · aucune lecture de
 * marque, aucun chiffre fabriqué. Le fil est portée espace + personne et
 * survit au rechargement (`jarvis_onboarding_messages`). La dépense passe par
 * le même garde (`guardedAnthropic`) · aucune dépense nouvelle. La trace
 * `studio_prompt_runs` est portée marque (NOT NULL) · elle n'est donc pas écrite
 * ici (pas de marque à tracer), le resolver gardant la disponibilité en amont.
 */
async function fluxOnboarding(
  portee: { workspaceId: string; userId: string },
  client: NonNullable<ReturnType<typeof guardedAnthropic>>,
  question: string,
) {
  if (!db) return json({ error: messageServiceInactif('jarvis') }, 503);
  try {
    const anciens = (await messagesOnboarding(portee)).slice(-40);
    const fil = trimThread([
      ...anciens.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
      { role: 'user', content: question },
    ]);
    const system = consigneOnboardingJarvis();

    await insererMessageOnboarding(portee, 'user', question.slice(0, 4000));

    const flux = (await client.messages.create({
      model: MODEL, max_tokens: 900, system, messages: fil, stream: true,
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
          const m = e instanceof SpendBlockedError ? `\n\n[${e.message}]` : '\n\n[Réponse interrompue.]';
          complet += m;
          ctrl.enqueue(encodeur.encode(m));
          console.error('[jarvis:onboarding]', (e as Error).message);
        } finally {
          if (complet.trim() && db) {
            await insererMessageOnboarding(portee, 'assistant', complet.slice(0, 12000)).catch(() => { /* la réponse a été lue */ });
          }
          ctrl.close();
        }
      },
    });

    return new Response(sortie, {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
    });
  } catch (e) {
    if (e instanceof SpendBlockedError) return json({ error: e.message }, 429);
    console.error('[jarvis:onboarding]', (e as Error).message);
    return json({ error: 'Jarvis n’a pas pu répondre. Réessaie.' }, 500);
  }
}
