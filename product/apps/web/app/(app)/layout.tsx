import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '../../lib/auth';
import { RAIL_COOKIE, railCollapsedFromCookie } from '../../lib/rail-preference';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { railNav, accountSections, roleAtLeast, planAtLeast, ROLE_LABEL, PLAN_LABEL, RAIL_GROUP_LABEL } from '../../lib/rbac';
import { listBrands, getActiveBrand } from '../../lib/brands';
import { AppShell } from '../../components/AppShell';
import { ToastProvider } from '../../components/Toast';
import { IndicateurGenerations } from '../../components/IndicateurGenerations';
import { logoutAction } from '../actions/auth';
import { isFounder } from '../../lib/founder';
import { effectiveAccess } from '../../lib/access';
import { unlimitedCredits } from '../../lib/credits';
import { entreesMarque } from '@tiktrends/core';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const s = await getSession();
  if (!s) redirect('/login');

  // Le fondateur voit tout, quelle que soit l'offre de son espace · cf. lib/access.
  const access = effectiveAccess(s);
  const [brands, activeBrand, ws, meRow] = await Promise.all([
    listBrands(s.workspaceId),
    getActiveBrand(s.workspaceId),
    db ? db.select({ c: schema.workspaces.creditsBalance, ob: schema.workspaces.onboardedAt }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1) : Promise.resolve([]),
    db ? db.select({ a: schema.users.avatarUrl, h: schema.users.hidePersonalInfo }).from(schema.users).where(eq(schema.users.id, s.user.id)).limit(1) : Promise.resolve([]),
  ]);
  // Onboarding non fait (nouveau propriétaire self-service) : on l'y envoie d'abord.
  const wsRow = (ws as Array<{ c: number; ob: Date | null }>)[0];
  if (roleAtLeast(s.role, 'owner') && wsRow && !wsRow.ob) redirect('/onboarding');
  const me = (meRow as Array<{ a: string | null; h: boolean | null }>)[0];
  const avatarUrl = me?.a ?? '';

  // Préférence de repli du rail · lue AU RENDU serveur pour que la coquille
  // sorte à la bonne largeur dès le premier pixel (cf. lib/rail-preference).
  const collapsedInitial = railCollapsedFromCookie((await cookies()).get(RAIL_COOKIE)?.value);

  // Espace « Marque » (rail) : accès direct aux sections de la marque active.
  // Le libellé de section est « Marque » (Kevin 30/09 · ex-« TA MARQUE »). Les
  // entrées sont DÉCIDÉES dans un module pur (`entreesMarque`, packages/core) ·
  // Aperçu + les deux facettes d'identité ancrées de H3 (Couleurs `#couleurs`,
  // Charte `#charte`) + Audience/Produits/Concurrents. Pas d'« Assets » en double ·
  // le rail principal le porte déjà (même route, même marque active) · l'accès
  // depuis la fiche suit `accesAssets`. L'état actif ancre-conscient vit dans la
  // coquille (railEntreeActive).
  const bid = activeBrand?.id;
  const brandNav = roleAtLeast(s.role, 'admin') && bid ? [{
    group: 'Marque',
    items: entreesMarque(bid),
  }] : [];

  return (
    <AppShell
      nav={[...railNav(access).map((g) => ({ ...g, group: RAIL_GROUP_LABEL[g.group] ?? g.group })), ...brandNav]}
      accountGroups={accountSections(access)}
      isStaff={isFounder(s.user.email)}
      showUpgrade={roleAtLeast(s.role, 'admin') && !planAtLeast(access.plan, 'business')}
      brands={brands}
      activeBrandId={activeBrand?.id ?? null}
      canManageBrands={roleAtLeast(s.role, 'admin')}
      creditBalance={ws[0]?.c ?? 0}
      creditsUnlimited={unlimitedCredits(s.user.email)}
      userName={s.user.name || ''}
      userEmail={s.user.email}
      avatarUrl={avatarUrl}
      hidePersonalInfo={!!me?.h}
      roleLabel={ROLE_LABEL[s.role]}
      planLabel={PLAN_LABEL[s.plan]}
      workspaceName={s.workspaceName}
      collapsedInitial={collapsedInitial}
      logout={logoutAction}
    >
      {/* Canal de retour unique · `useToast()` sous ce fournisseur pose un
          retour au même endroit partout (cf. components/Toast.tsx). */}
      {/* Canal de retour unique · `useToast()` sous ce fournisseur pose un
          retour au même endroit partout (cf. components/Toast.tsx). */}
      <ToastProvider>
        {children}
        {/* « Ça tourne » · visible partout tant qu'un lot génère, même après
            avoir quitté le studio (le store vit au niveau module). */}
        <IndicateurGenerations />
      </ToastProvider>
    </AppShell>
  );
}
