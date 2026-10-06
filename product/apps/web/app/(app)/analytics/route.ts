import { redirectionAnalytics, requeteDuRouteurClient } from '@tiktrends/core';

/**
 * `/analytics` · route historique, toujours valide (lot 19A).
 *
 * L'Analytics vit désormais DANS l'Accueil · `/dashboard?vue=analytics`, rendu
 * par le même composant et les mêmes calculs (`components/accueil/VueAnalytics`).
 *
 * ── Pourquoi un route handler, et pas une page qui appelle `redirect()` ──────
 *
 * Mesuré en production locale · une PAGE sous `(app)` passe par la coquille et
 * son `loading.tsx` · le flux est déjà parti quand `redirect()` est levé · la
 * réponse sort en 200 avec une redirection CLIENT (meta refresh + routeur). Le
 * fragment (`#attribution`) s'y perd. Ici, la réponse est une vraie 307 HTTP,
 * émise avant tout rendu.
 *
 * ── Ce qui traverse ──────────────────────────────────────────────────────────
 *
 * Chaque paramètre de requête et chaque valeur, répétées comprises
 * (`redirectionAnalytics`, noyau, sur la chaîne que Next transmet). L'ordre est
 * celui de `request.url` · mesuré en production locale, Next y remonte en tête
 * les clés purement numériques (`?b=1&2=x` arrive `?2=x&b=1`) · aucune valeur
 * n'est perdue, l'ordre des autres clés est gardé. Le fragment ne parvient
 * jamais au serveur · le navigateur le reporte de lui-même sur une cible qui
 * n'en porte pas (RFC 9110 §10.2.2), et l'ancre `#attribution` existe sur la
 * vue. `Location` est RELATIVE · elle se résout sur l'hôte demandé, jamais sur
 * l'hôte interne derrière le proxy.
 *
 * ── Le routeur client (liens `<Link href="/analytics">`) ─────────────────────
 *
 * Suivre la 307 en navigation souple laissait parfois l'écran sur l'Accueil
 * (rail 1 fois sur 5, carte « Analytics » de l'Accueil 1 fois sur 3 · même
 * chemin, autre recherche, mesuré en production locale).
 * Au routeur (`requeteDuRouteurClient`, noyau), on répond un texte qui n'est
 * pas un flux RSC · Next bascule alors en navigation COMPLÈTE vers cette même
 * adresse (fragment compris), que la 307 ci-dessous achève.
 *
 * ── Les gardes ───────────────────────────────────────────────────────────────
 *
 * Inchangées · `/analytics` n'exigeait que la session (la coquille la vérifie)
 * et aucune garde de rôle. Sans session, la cible `/dashboard` renvoie à
 * `/login`, comme avant. 307 (temporaire) · la cible peut encore bouger.
 */
export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  const recherche = new URL(request.url).search;
  const vary = { Vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch' };
  if (requeteDuRouteurClient({ rsc: request.headers.get('rsc'), recherche })) {
    return new Response('Analytics vit dans l’Accueil · navigation complète.', {
      status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...vary },
    });
  }
  return new Response(null, { status: 307, headers: { Location: redirectionAnalytics(recherche), ...vary } });
}
