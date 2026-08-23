import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '../../lib/auth';
import { railNav, accountFeatures, roleAtLeast, ROLE_LABEL, PLAN_LABEL } from '../../lib/rbac';
import { listBrands, getActiveBrand } from '../../lib/brands';
import { AppShell } from '../../components/AppShell';
import { logoutAction } from '../actions/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const s = await getSession();
  if (!s) redirect('/login');

  const access = { role: s.role, plan: s.plan };
  const [brands, activeBrand] = await Promise.all([listBrands(s.workspaceId), getActiveBrand(s.workspaceId)]);

  return (
    <AppShell
      nav={railNav(access)}
      account={accountFeatures(access)}
      brands={brands}
      activeBrandId={activeBrand?.id ?? null}
      canManageBrands={roleAtLeast(s.role, 'admin')}
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
