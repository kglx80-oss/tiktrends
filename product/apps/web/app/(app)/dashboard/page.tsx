import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { buildDashboard } from '../../../lib/pipeline';
import { getSession } from '../../../lib/auth';
import { getActiveBrand, listBrands } from '../../../lib/brands';
import { roleAtLeast, ouverturesParRole, sectionsCompteOuvertes } from '../../../lib/rbac';
import { effectiveAccess } from '../../../lib/access';
import { bandeauAccueil, bandeauEnDoublon, cheminOuvert, destinationsTete, liensPilotage, rangeeStudiosAccueil, resoudreAccueil, refusAssistant, surtitreAccueil, type RegleChemin, type ParamsRequete } from '@tiktrends/core';
import { anthropicConfigured } from '../../../lib/ai-status';
import { unlimitedCredits } from '../../../lib/credits';
import { AssistantHome } from '../../../components/AssistantHome';
import { HomeBandeau } from '../../../components/HomeBandeau';
import { HomeMarques } from '../../../components/HomeMarques';
import { ProchaineEtape } from '../../../components/ProchaineEtape';
import { ApercuExemple } from '../../../components/ApercuExemple';
import { onboardingState } from '../../../lib/onboarding-state';
import { cadrePage } from '../../../components/ui';
import { OngletsAccueil } from '../../../components/accueil/OngletsAccueil';
import { VueAnalytics } from '../../../components/accueil/VueAnalytics';
import { TeteProjets } from '../../../components/accueil/TeteProjets';
import { PilotageActivite } from '../../../components/accueil/PilotageActivite';
import { chargerTeteAccueilProjets, type TeteAccueilProjets } from '../../../lib/accueil-projets';
import { chargerAccueilV5 } from '../../../lib/accueil-v5';
import { EnTeteAccueil } from '../../../components/accueil/EnTeteAccueil';
import { ProchainesIterations } from '../../../components/accueil/ProchainesIterations';
import { TuilesAccueil, KpiAccueilBande } from '../../../components/accueil/TuilesAccueil';

export const dynamic = 'force-dynamic';

export default async function Dashboard({ searchParams }: { searchParams: Promise<ParamsRequete> }) {
  const params = await searchParams;
  const s = await getSession();

  // Ce que le RÔLE ouvre, rubrique par rubrique · la matrice existante, lue
  // telle quelle (lot 11). Un verrou de formule n'est pas un refus de rôle · la
  // rubrique reste proposée, sa page explique l'offre. Rien n'est protégé ici.
  const regles: RegleChemin[] = s ? ouverturesParRole(effectiveAccess(s)) : [];
  const ouvert = (href: string) => cheminOuvert(href, regles);

  // Lot 19A · l'Accueil réunit le Pilotage. Quelle vue, quels onglets, pour ce
  // rôle et ces paramètres · règle du noyau (`resoudreAccueil`). La vue
  // Analytics est l'ancienne page `/analytics`, montée telle quelle (mêmes
  // requêtes, mêmes calculs) · `/analytics` redirige ici.
  const { vue, onglets } = resoudreAccueil({ params, ouvert });
  if (vue === 'analytics') {
    return (
      <main style={wrap}>
        <VueAnalytics vues={<OngletsAccueil onglets={onglets} />} />
      </main>
    );
  }

  // Un échantillon de démonstration du pipeline · il ne reflète pas la marque
  // (l'aperçu le dit, et il est replié). La mesure réelle vit dans Adsmap/Analytics.
  const rows = buildDashboard();
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

  // UX V2 · lot 5 · EN TÊTE · reprendre ou créer un projet (lecture seule ·
  // l'action de la liste des projets, ses gardes et sa portée), puis piloter
  // l'activité. Quel état, quel projet, quels liens · règles du noyau
  // (`resoudreAccueilProjets`, `liensPilotage`). Un rôle sans Studios ne lit
  // rien et garde l'Accueil d'avant.
  const tete: TeteAccueilProjets = s ? await chargerTeteAccueilProjets(s, ouvert) : { etat: { etat: 'ferme' }, apercu: null, nbProjets: null };

  // UX V5 · l'Accueil sur les VRAIES données · en-tête (date du serveur ·
  // marque · « N choses t'attendent »), prochaines itérations (gagnantes
  // PROUVÉES), tuiles d'action et KPI · chaque source lue sous son droit, une
  // source fermée ou en panne se tait (règles du noyau, `accueil-v5`).
  // « Nouveau projet » et « Itérer » suivent la règle de la tête (`etat.nouveau`).
  const nouveauProjet = tete.etat.etat === 'liste' || tete.etat.etat === 'premier-usage' ? tete.etat.nouveau?.href ?? null : null;
  const v5 = s ? await chargerAccueilV5(s, { marque: brand, nouveauProjet, nbProjets: tete.nbProjets }) : null;
  // « Activité et coûts » (/usage) est une page du menu de COMPTE · proposée
  // seulement si ce menu l'ouvre (même règle que le menu, lot 12).
  const pagesCompte = new Set(s ? sectionsCompteOuvertes(effectiveAccess(s)).flatMap((g) => g.items.map((i) => i.href)) : []);
  const pilotage = liensPilotage({ ouvert, compteOuvert: (href) => pagesCompte.has(href) });
  // Le bandeau se tait quand la tête et le pilotage portent déjà tous ses gestes (`bandeauEnDoublon`).
  const bandeauAffiche = bandeau && !bandeauEnDoublon(bandeau, [...destinationsTete(tete.etat), ...pilotage.map((l) => l.href)]) ? bandeau : null;

  return (
    <main style={wrap}>
      <AssistantHome
        firstName={firstName}
        credits={credits}
        unlimited={creditsIllimites}
        brandName={brand?.name ?? null}
        brandId={brand?.id ?? null}
        aiReady={anthropicConfigured()}
        // SEC-03 · la même règle que le serveur (`askAssistant`) · un rôle que
        // l'action refuse ne voit pas l'assistant.
        assistantOuvert={!!s && refusAssistant({ roleEspace: s.role }) === null}
        regles={regles}
        projets={<TeteProjets key="projets" etat={tete.etat} apercu={tete.apercu} />}
        pilotage={<PilotageActivite key="pilotage" liens={pilotage} />}
        rangeeStudios={rangeeStudiosAccueil(tete.etat)}
        bandeau={bandeauAffiche ? <HomeBandeau key="bandeau" contenu={bandeauAffiche} /> : null}
        marques={<HomeMarques key="marques" marques={marques} activeId={brand?.id ?? null} gererMarques={ouvert('/brands/new')} />}
        prochaineEtape={<ProchaineEtape key="prochaine-etape" parcours={parcours} regles={regles} />}
        exemple={<ApercuExemple key="apercu-exemple" rows={rows} brancher={ouvert('/connections')} />}
        entete={<EnTeteAccueil key="entete" surtitre={surtitreAccueil({ maintenant: new Date(), marque: brand?.name ?? null })} prenom={firstName} attente={v5?.attente ?? null} vues={<OngletsAccueil onglets={onglets} />} />}
        v5={v5 && (
          <div key="v5">
            <ProchainesIterations etat={v5.iterations} />
            <TuilesAccueil tuiles={v5.tuiles} />
            <KpiAccueilBande kpi={v5.kpi} />
          </div>
        )}
      />
    </main>
  );
}

const wrap = { ...cadrePage, minHeight: '100vh' };
