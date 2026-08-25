import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '../../lib/auth';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { railNav, accountSections, roleAtLeast, ROLE_LABEL, PLAN_LABEL } from '../../lib/rbac';
import { listBrands, getActiveBrand } from '../../lib/brands';
import { AppShell } from '../../components/AppShell';
import { logoutAction } from '../actions/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const s = await getSession();
  if (!s) redirect('/login');

  const access = { role: s.role, plan: s.plan };
  const [brands, activeBrand, ws] = await Promise.all([
    listBrands(s.workspaceId),
    getActiveBrand(s.workspaceId),
    db ? db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1) : Promise.resolve([]),
  ]);

  // Espace « Marque » (rail) : accès direct aux sections de la marque active.
  const bid = activeBrand?.id;
  const brandNav = roleAtLeast(s.role, 'admin') && bid ? [{
    group: 'Marque',
    items: [
      { key: 'm-home', label: 'Aperçu',      href: `/brands/${bid}?tab=overview`,    icon: 'store', locked: false, isSub: false },
      { key: 'm-aud',  label: 'Audience',    href: `/brands/${bid}?tab=audience`,    icon: 'users', locked: false, isSub: true },
      { key: 'm-prod', label: 'Produits',    href: `/brands/${bid}?tab=products`,    icon: 'store', locked: false, isSub: true },
      { key: 'm-comp', label: 'Concurrents', href: `/brands/${bid}?tab=competitors`, icon: 'trend', locked: false, isSub: true },
    ],
  }] : [];

  return (
    <AppShell
      nav={[...railNav(access), ...brandNav]}
      accountGroups={accountSections(access)}
      isAdmin={roleAtLeast(s.role, 'admin')}
      brands={brands}
      activeBrandId={activeBrand?.id ?? null}
      canManageBrands={roleAtLeast(s.role, 'admin')}
      creditBalance={ws[0]?.c ?? 0}
      userName={s.user.name || ''}
      userEmail={s.user.email}
      roleLabel={ROLE_LABEL[s.role]}
      planLabel={PLAN_LABEL[s.plan]}
      workspaceName={s.workspaceName}
      logout={logoutAction}
    >
      {children}
    </AppShell>
  );
}
