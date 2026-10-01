import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { buildDashboard } from '../../../lib/pipeline';
import { getSession } from '../../../lib/auth';
import { getActiveBrand, listBrands } from '../../../lib/brands';
import { roleAtLeast, ouverturesParRole } from '../../../lib/rbac';
import { effectiveAccess } from '../../../lib/access';
import { bandeauAccueil, cheminOuvert, type RegleChemin } from '@tiktrends/core';
import { anthropicConfigured } from '../../../lib/ai-status';
import { unlimitedCredits } from '../../../lib/credits';
import { AssistantHome } from '../../../components/AssistantHome';
import { HomeBandeau } from '../../../components/HomeBandeau';
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

  // Ce que le RÔLE ouvre, rubrique par rubrique · la matrice existante, lue
  // telle quelle (lot 11). Un verrou de formule n'est pas un refus de rôle · la
  // rubrique reste proposée, sa page explique l'offre. Rien n'est protégé ici.
  const regles: RegleChemin[] = s ? ouverturesParRole(effectiveAccess(s)) : [];
  const ouvert = (href: string) => cheminOuvert(href, regles);

  // Le bandeau à la une · copie orientée DÉCISION, priorité analyse → itération,
  // création en SECONDAIRE (`bandeauAccueil`, noyau) · un geste fermé au rôle
  // n'est plus proposé. Aucun prix, promo ni partenariat fictif.
  const bandeau = bandeauAccueil({ aMarque: !!brand, nbMarques: marques.length, ouvert });
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
        regles={regles}
        bandeau={bandeau ? <HomeBandeau key="bandeau" contenu={bandeau} /> : null}
        marques={<HomeMarques key="marques" marques={marques} activeId={brand?.id ?? null} gererMarques={ouvert('/brands/new')} />}
        prochaineEtape={<ProchaineEtape key="prochaine-etape" parcours={parcours} regles={regles} />}
        exemple={<ApercuExemple key="apercu-exemple" rows={rows} />}
      />
    </main>
  );
}

const wrap = { ...cadrePage, minHeight: '100vh' };
