import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { buildDashboard } from '../../../lib/pipeline';
import { getSession } from '../../../lib/auth';
import { getActiveBrand, listBrands } from '../../../lib/brands';
import { roleAtLeast } from '../../../lib/rbac';
import { anthropicConfigured } from '../../../lib/ai-status';
import { unlimitedCredits } from '../../../lib/credits';
import { AssistantHome } from '../../../components/AssistantHome';
import { HomeBandeau, type BandeauAccueil } from '../../../components/HomeBandeau';
import { HomeMarques } from '../../../components/HomeMarques';
import { ProchaineEtape } from '../../../components/ProchaineEtape';
import { ApercuExemple } from '../../../components/ApercuExemple';
import { onboardingState } from '../../../lib/onboarding-state';
import { cadrePage } from '../../../components/ui';

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

  // Les marques du compte, pour les cartes « reprise » de la Home.
  const marques = s ? await listBrands(s.workspaceId) : [];

  // Le bandeau à la une · copie orientée DÉCISION, priorité analyse → itération.
  // Le CTA PRIMAIRE mène à l'analyse (les tests, le marché) ; la création reste
  // accessible en SECONDAIRE. Aucun prix, promo ni partenariat fictif · une
  // seule source de contenu, l'emplacement accueillera une vraie campagne.
  const bandeau: BandeauAccueil = brand
    ? {
        titre: 'Prépare ton prochain test',
        sous: 'Analyse tes résultats, choisis quoi tester ensuite, et itère vers ce qui marche.',
        ctaLabel: 'Voir mes tests',
        href: '/adsmap',
        ctaSecLabel: 'Créer une pub',
        hrefSec: '/studio/ads',
      }
    : {
        titre: 'Prépare ton prochain test',
        sous: 'Choisis une marque pour analyser tes tests et décider quoi lancer ensuite.',
        ctaLabel: marques.length ? 'Choisir une marque' : 'Créer une marque',
        href: marques.length ? '/brands' : '/brands/new',
        ctaSecLabel: 'Observer le marché',
        hrefSec: '/veille',
      };
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
        bandeau={<HomeBandeau key="bandeau" contenu={bandeau} />}
        marques={<HomeMarques key="marques" marques={marques} activeId={brand?.id ?? null} />}
        prochaineEtape={<ProchaineEtape key="prochaine-etape" parcours={parcours} />}
        exemple={<ApercuExemple key="apercu-exemple" rows={rows} />}
      />
    </main>
  );
}

const wrap = { ...cadrePage, minHeight: '100vh' };
