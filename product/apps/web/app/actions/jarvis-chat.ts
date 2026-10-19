'use server';

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { starters, startersOnboarding, personnalisationAccueil, MARQUEUR_SOURCE, type TypeConnaissance } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { canAccess, FEATURES } from '../../lib/rbac';
import { refusJarvis, TEXTE_REFUS_JARVIS } from '../../lib/jarvis-acces';
import { effectiveAccess } from '../../lib/access';
import { jarvisStats, jarvisHookView } from '../../lib/jarvis-memory';
import { connaissancesPourReponse, titresDesSources } from '../../lib/jarvis-connaissances';
import { logAndTranslate } from '../../lib/error-log';
import { GUARD } from '../../lib/guard-error';
import { listerConversations, messagesDeConversation, effacerMessagesConversation, conversationAppartient, type ConversationLue } from '../../lib/jarvis/conversations';
import { messagesOnboarding, effacerOnboarding } from '../../lib/jarvis/onboarding';

export type { ConversationLue };

/**
 * Lecture et effacement du fil.
 *
 * L'envoi passe par `/api/jarvis/chat` parce qu'il doit répondre au fur et à
 * mesure · le reste tient dans des actions serveur, qui sont plus simples à
 * appeler et n'ont rien à streamer.
 */

const adsmap = FEATURES.find((f) => f.key === 'adsmap')!;

export interface ChatTurn { id: string; role: 'user' | 'assistant'; content: string; at: string }

/**
 * Le contexte de marque, à la demande · ce sur quoi Jarvis s'appuie, montré sans
 * quitter la conversation. Chaque élément est propre à la MARQUE active · c'est
 * sa portée, affichée telle quelle. Rien de nouveau n'est exposé · c'est le
 * contenu de la marque du membre, en lecture.
 */
/**
 * Les accroches, mot pour mot · ce que Jarvis injecte tel quel dans chaque
 * génération, avec ce que chacune a donné. Portée marque, derrière l'offre Plus
 * (comme la mémoire mesurée) · null quand l'accès manque ou qu'il n'y a rien.
 */
export type ChatHooks = Awaited<ReturnType<typeof jarvisHookView>>;

export interface ChatContexte {
  brandId: string;
  /** Identité déclarée · description, promesse, audience · vide si rien. */
  identity: string | null;
  /** Consignes créatives maison · injectées dans chaque génération. Portée marque. */
  rules: string | null;
  /** Accroches mesurées et de marché · portée marque, offre Plus. null sinon. */
  hooks: ChatHooks | null;
  /**
   * Connaissances de l'équipe plateforme INCLUSES dans le contexte des
   * prochaines réponses pour cette marque · ce panneau n'en montre que le
   * titre et le type. Ce n'est PAS une protection : le texte est dans la
   * consigne de Jarvis, et un client peut lui en demander le contenu (la
   * consigne lui interdit de le recopier, ce qui ne vaut pas garantie).
   * null si la lecture a échoué.
   */
  connaissances?: { inclus: Array<{ ref: string; titre: string; type: TypeConnaissance; tronquee: boolean }>; horsPlace: number } | null;
}

export interface ChatThread {
  turns: ChatTurn[];
  /** Entrées proposées quand le fil est vide · elles apprennent ce que Jarvis sait faire. */
  starters: string[];
  /** Combien de tests nourrissent ses réponses · dit ce qu'on peut en attendre. */
  measuredAds: number;
  brandName: string;
  /** Ce que Jarvis a comme contexte de marque · ouvert à la demande. */
  contexte: ChatContexte;
  /**
   * Les sources citées dans le fil (`[[SOURCE:ref]]`) · leur titre, et si elles
   * sont toujours en service. Seules les références présentes dans CE fil et
   * applicables à CETTE marque sont résolues.
   */
  sources?: Record<string, { titre: string; enService: boolean }>;
  /** La conversation ouverte · `null` = le fil principal (messages sans conversation). */
  conversationId: string | null;
  /** Les conversations nommées de la marque · pour la colonne « Mes conversations ». */
  conversations: ConversationLue[];
}

/**
 * Lit le fil d'UNE conversation (et la liste des conversations nommées).
 *
 * `conversationId` · `null` ouvre le fil principal (messages sans conversation,
 * le fil unique d'avant la V5) ; un identifiant ouvre la conversation nommée
 * correspondante, APRÈS vérification qu'elle appartient bien à la portée
 * (espace + marque + personne) · un identifiant étranger retombe sur le fil
 * principal plutôt que d'exposer la conversation d'autrui.
 */
export async function chatThreadAction(conversationId: string | null = null): Promise<{ thread?: ChatThread; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  // Même porte que la route · la feature `jarvis` AVANT la marque, le fil et
  // les connaissances (titres, types, sources citées).
  const refus = refusJarvis(s);
  // La vraie raison (offre ou rôle), dans les mots de l'écran `RefusJarvis` ·
  // « rôle administrateur » était faux pour un Starter, un freelance, un lecteur.
  if (refus) return { error: TEXTE_REFUS_JARVIS[refus] };

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Sélectionne une marque active pour parler à Jarvis.' };

  try {
    const portee = { workspaceId: s.workspaceId, brandId: brand.id, userId: s.user.id };
    // Une conversation nommée demandée doit appartenir à la portée · sinon on
    // ouvre le fil principal (jamais la conversation d'autrui).
    const ouverte = conversationId && (await conversationAppartient(portee, conversationId)) ? conversationId : null;
    const voitMemoire = canAccess(effectiveAccess(s), adsmap);
    const [rows, conversations, stats, ws, ident, hooks] = await Promise.all([
      messagesDeConversation(portee, ouverte),
      listerConversations(portee).catch(() => [] as ConversationLue[]),
      voitMemoire ? jarvisStats(brand.id, s.workspaceId).catch(() => null) : Promise.resolve(null),
      db.select({ onboarding: schema.workspaces.onboarding }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1),
      db.select({
        description: schema.brands.description, usp: schema.brands.usp,
        audience: schema.brands.audience, creativeRules: schema.brands.creativeRules,
      }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1),
      // Accroches · même provenance que la page Sources, même garde (offre Plus).
      voitMemoire ? jarvisHookView(brand.id, s.workspaceId).catch(() => null) : Promise.resolve(null),
    ]);

    const ctx = { workspaceId: s.workspaceId, brandId: brand.id };
    const citees = [...new Set(rows.flatMap((r) => r.role === 'assistant'
      ? [...r.content.matchAll(new RegExp(MARQUEUR_SOURCE.source, 'g'))].map((m) => m[1]!)
      : []))];
    const [bloc, sources] = await Promise.all([
      connaissancesPourReponse(ctx).catch(() => null),
      titresDesSources(citees, ctx).catch(() => ({})),
    ]);

    const n = stats?.nAds ?? 0;
    // L'objectif déclaré à l'accueil oriente les trois suggestions · c'est ici
    // que ses réponses cessent d'être un formulaire sans effet.
    const { objectif } = personnalisationAccueil(ws[0]?.onboarding);
    const b = ident[0];
    const identity = [b?.description, b?.usp, b?.audience].filter(Boolean).join('\n').trim() || null;
    return {
      thread: {
        turns: rows.map((r) => ({
          id: r.id, role: r.role as ChatTurn['role'], content: r.content,
          at: (r.createdAt as Date).toISOString(),
        })),
        starters: starters({ measuredAds: n, hasMarket: false, objectif }),
        measuredAds: n,
        brandName: brand.name,
        contexte: {
          brandId: brand.id, identity, rules: b?.creativeRules?.trim() || null, hooks,
          connaissances: bloc ? {
            inclus: bloc.inclus.map((i) => ({ ref: i.ref, titre: i.titre, type: i.type, tronquee: i.tronquee })),
            horsPlace: bloc.exclues.length,
          } : null,
        },
        sources,
        conversationId: ouverte,
        conversations,
      },
    };
  } catch (e) {
    return { error: logAndTranslate('jarvis:thread', e, { subject: 'la conversation', workspaceId: s.workspaceId }) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Onboarding · le fil sans marque (compte neuf)                             */
/* -------------------------------------------------------------------------- */

export interface OnboardingThread { turns: ChatTurn[]; starters: string[] }

/**
 * Le fil d'onboarding (sans marque) · portée espace + personne. Jarvis reste
 * vivant et guide vers la création de la première marque · aucune marque n'est
 * lue (il n'y en a pas), aucun chiffre n'est fabriqué.
 */
export async function onboardingThreadAction(): Promise<{ thread?: OnboardingThread; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const refus = refusJarvis(s);
  if (refus) return { error: TEXTE_REFUS_JARVIS[refus] };
  try {
    const rows = await messagesOnboarding({ workspaceId: s.workspaceId, userId: s.user.id });
    return {
      thread: {
        turns: rows.map((r) => ({ id: r.id, role: r.role as ChatTurn['role'], content: r.content, at: (r.createdAt as Date).toISOString() })),
        starters: startersOnboarding(),
      },
    };
  } catch (e) {
    return { error: logAndTranslate('jarvis:onboarding:thread', e, { subject: 'Jarvis', workspaceId: s.workspaceId }) };
  }
}

export async function clearOnboardingAction(): Promise<{ ok?: boolean; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  try {
    await effacerOnboarding({ workspaceId: s.workspaceId, userId: s.user.id });
    return { ok: true };
  } catch (e) {
    return { error: logAndTranslate('jarvis:onboarding:clear', e, { subject: 'le fil', workspaceId: s.workspaceId }) };
  }
}

/**
 * Repart de zéro.
 *
 * Un fil long finit par tirer la conversation vers son passé · pouvoir le couper
 * fait partie de l'outil, et l'effacement est total plutôt que partiel : garder
 * la moitié d'un contexte produit des réponses qui font référence à ce qu'on
 * vient de supprimer.
 */
export async function clearChatAction(conversationId: string | null = null): Promise<{ ok?: boolean; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };
  try {
    const portee = { workspaceId: s.workspaceId, brandId: brand.id, userId: s.user.id };
    // Efface SEULEMENT le fil de la conversation ouverte · une conversation
    // étrangère (hors portée) n'a aucun message dans la portée, donc rien à
    // effacer. Un identifiant nommé non possédé retombe sur le fil principal.
    const cible = conversationId && (await conversationAppartient(portee, conversationId)) ? conversationId : null;
    await effacerMessagesConversation(portee, cible);
    return { ok: true };
  } catch (e) {
    return { error: logAndTranslate('jarvis:clear', e, { subject: 'l’effacement du fil', workspaceId: s.workspaceId }) };
  }
}
