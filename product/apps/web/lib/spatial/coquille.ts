import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { entreesRail, entreesRailEspace, initialesAvatar } from '@tiktrends/core';
import { getSession } from '../auth';
import { effectiveAccess } from '../access';
import { isFounder } from '../founder';
import { unlimitedCredits } from '../credits';
import { listBrands, getActiveBrand } from '../brands';
import { unreadCount } from '../notifications';
import { RAIL_COOKIE, railCollapsedFromCookie } from '../rail-preference';
import { railNav, sectionsCompteOuvertes, roleAtLeast, planAtLeast, ROLE_LABEL, PLAN_LABEL, PLAN_CREDITS, type Plan } from '../rbac';
import { logoutAction } from '../../app/actions/auth';
import type { DonneesCoquille } from '../../spatial/coquille/Coquille';

const ORDRE_PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];

/** Tous les `href` d'une structure de navigation (groupes, sections, items). */
function hrefs(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) x.forEach((v) => hrefs(v, out));
  else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      if (k === 'href' && typeof v === 'string') out.add(v.split(/[?#]/)[0]!);
      else hrefs(v, out);
    }
  }
  return out;
}

/**
 * Les données RÉELLES de la coquille Spatial · mêmes gardes et mêmes sources
 * que la coquille V5 (`app/(app)/layout.tsx`) : session obligatoire, onboarding
 * d'abord pour un propriétaire neuf, accès effectif (rôle + formule), marques
 * de l'espace, crédits, notifications non lues.
 */
export async function chargerCoquille(): Promise<DonneesCoquille> {
  const s = await getSession();
  if (!s) redirect('/login');
  const access = effectiveAccess(s);
  const [marques, active, ws, moi, nonLues] = await Promise.all([
    listBrands(s.workspaceId),
    getActiveBrand(s.workspaceId),
    db ? db.select({ c: schema.workspaces.creditsBalance, ob: schema.workspaces.onboardedAt }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1) : Promise.resolve([]),
    db ? db.select({ n: schema.users.name }).from(schema.users).where(eq(schema.users.id, s.user.id)).limit(1) : Promise.resolve([]),
    unreadCount(s.user.id).catch(() => 0),
  ]);
  const w = (ws as Array<{ c: number; ob: Date | null }>)[0];
  if (roleAtLeast(s.role, 'owner') && w && !w.ob) redirect('/onboarding');

  const ouverts = hrefs([railNav(access), sectionsCompteOuvertes(access)]);
  const marque = active ? { id: active.id, nom: active.name } : null;
  const plan = s.plan as Plan;
  const suivant = ORDRE_PLANS[ORDRE_PLANS.indexOf(plan) + 1];
  const passer = roleAtLeast(s.role, 'admin') && !planAtLeast(plan, 'business') && suivant
    ? { titre: `Passer à ${PLAN_LABEL[suivant]}`, sous: `${PLAN_CREDITS[suivant].toLocaleString('fr-FR')} crédits / mois` }
    : null;
  const nom = (moi as Array<{ n: string | null }>)[0]?.n || s.user.name || '';

  return {
    entrees: entreesRail({ ouverts, marque }),
    espace: entreesRailEspace({ ouverts, marque }),
    // Le fond flou de la maquette (`--img`) · l'image de la marque active. À
    // défaut d'un visuel produit dédié, son logo · sans marque, aucun fond.
    marque: active ? { id: active.id, nom: active.name, logoUrl: active.logoUrl ?? null, imageUrl: active.logoUrl ?? null } : null,
    marques: marques.map((m) => ({ id: m.id, nom: m.name })),
    peutGererMarques: roleAtLeast(s.role, 'admin'),
    admin: isFounder(s.user.email) && roleAtLeast(s.role, 'admin'),
    passer,
    railOuvert: !railCollapsedFromCookie((await cookies()).get(RAIL_COOKIE)?.value),
    utilisateur: { nom, initiales: initialesAvatar(nom, s.user.email), email: s.user.email, role: ROLE_LABEL[s.role] },
    espaceNom: s.workspaceName,
    credits: { solde: w?.c ?? 0, dotation: PLAN_CREDITS[plan] ?? 0, illimite: unlimitedCredits(s.user.email) },
    nonLues: Number(nonLues) || 0,
    deconnexion: logoutAction,
  };
}
