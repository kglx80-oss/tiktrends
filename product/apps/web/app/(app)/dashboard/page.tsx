import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { buildDashboard } from '../../../lib/pipeline';
import { getSession } from '../../../lib/auth';
import { getActiveBrand } from '../../../lib/brands';
import { roleAtLeast } from '../../../lib/rbac';
import { anthropicConfigured } from '../../../lib/ai-status';
import { unlimitedCredits } from '../../../lib/credits';
import { AssistantHome } from '../../../components/AssistantHome';
import { ProchaineEtape } from '../../../components/ProchaineEtape';
import { ApercuExemple } from '../../../components/ApercuExemple';
import { onboardingState } from '../../../lib/onboarding-state';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  // Un échantillon de démonstration du pipeline · il ne reflète pas la marque
  // (l'aperçu le dit, et il est replié). La mesure réelle vit dans Adsmap/Analytics.
  const rows = buildDashboard();
  const s = await getSession();
  let credits = 0;
  let brand: { id: string; name: string } | null = null;
  if (s) {
    if (db) {
      const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
      credits = w?.c ?? 0;
    }
    const ab = await getActiveBrand(s.workspaceId);
    if (ab) brand = { id: ab.id, name: ab.name };
  }
  const firstName = ((s?.user.name || s?.user.email || 'toi').trim().split(/\s+/)[0]) || 'toi';
  const creditsIllimites = unlimitedCredits(s?.user.email);

  // Le parcours · calculé sur la donnée réelle, jamais sur des cases cochées.
  // `null` sans marque ou pour un rôle qui n'agit pas · la prochaine étape
  // bascule alors sur « prépare ton itération » (accès Adsmap/Veille).
  const parcours = s && roleAtLeast(s.role, 'member') ? await onboardingState(s.workspaceId, roleAtLeast(s.role, 'admin')) : null;

  return (
    <main style={wrap}>
      <AssistantHome
        firstName={firstName}
        credits={credits}
        unlimited={creditsIllimites}
        brandName={brand?.name ?? null}
        brandId={brand?.id ?? null}
        aiReady={anthropicConfigured()}
        prochaineEtape={<ProchaineEtape parcours={parcours} firstName={firstName} />}
        exemple={<ApercuExemple rows={rows} />}
      />
    </main>
  );
}

const wrap = { minHeight: '100vh', padding: '32px clamp(16px, 4vw, 32px) 60px', maxWidth: 1200, margin: '0 auto' } as const;
