import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { etapesParcours, lignesOffreParcours, reponsesParcours, cheminPorte } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { listBrands, getActiveBrand } from '../../../../lib/brands';
import { roleAtLeast, canAccess, FEATURES, PLAN_CREDITS, PLAN_LABEL, PLAN_PRICE, type Plan } from '../../../../lib/rbac';
import { stripeConfigured, planPurchasable } from '../../../../lib/stripe';
import { trialStatus } from '../../../../lib/trial';
import { effectiveAccess } from '../../../../lib/access';
import { getConnectionState } from '../../../actions/connections';
import { getDriveState } from '../../../actions/drive';
import { Bienvenue } from '../../../../spatial/vues/coquille/Bienvenue';
import { ParcoursAccueil } from '../../../../spatial/vues/coquille/ParcoursAccueil';
import { connecteursDepuis } from '../../../../spatial/vues/coquille/connecteurs';

export const dynamic = 'force-dynamic';

const FORMULES: Plan[] = ['core', 'plus', 'business'];
/** La formule mise en avant · la même que la page Forfaits V5 (« Populaire »). */
const POPULAIRE: Plan = 'core';

/**
 * `/onboarding` dans Spatial · l'écran « Bienvenue » de la maquette sous le
 * parcours d'accueil `#onb`. Mêmes gardes que la page V5 (`app/onboarding`) :
 * session obligatoire ; un espace déjà accueilli est renvoyé à l'accueil, sauf
 * reprise volontaire (`?redo=1`, « Démarrage » du menu profil).
 */
export default async function ParcoursSpatial({ searchParams }: { searchParams?: Promise<{ redo?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const redo = !!(await searchParams)?.redo;

  const [w] = db
    ? await db.select({
      at: schema.workspaces.onboardedAt, rep: schema.workspaces.onboarding, solde: schema.workspaces.creditsBalance,
      essai: schema.workspaces.trialEndsAt, genre: schema.workspaces.accountKind,
      sub: schema.workspaces.stripeSubscriptionId, st: schema.workspaces.subscriptionStatus,
    }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1)
    : [];
  if (w?.at && !redo) redirect('/dashboard');

  const [marques, active] = await Promise.all([listBrands(s.workspaceId), getActiveBrand(s.workspaceId)]);
  const fiche = active && db
    ? (await db.select({ description: schema.brands.description, tone: schema.brands.tone, industry: schema.brands.industry, oui: schema.brands.preferredWords, non: schema.brands.avoidWords })
      .from(schema.brands).where(eq(schema.brands.id, active.id)).limit(1))[0] ?? null
    : null;

  const admin = roleAtLeast(s.role, 'admin');
  const plan = s.plan as Plan;
  const abonne = !!w?.sub && ['active', 'trialing', 'past_due'].includes(w?.st ?? '');
  const formules = s.role === 'owner' && stripeConfigured() && !abonne && plan === 'starter'
    ? FORMULES.filter((f) => planPurchasable(f) && PLAN_PRICE[f] > 0).map((f) => ({
      cle: f, nom: PLAN_LABEL[f], prix: PLAN_PRICE[f], populaire: f === POPULAIRE,
      // Ce que la formule OUVRE · les modules du rail dont c'est la formule minimale (matrice d'accès réelle).
      lignes: lignesOffreParcours(PLAN_CREDITS[f], FEATURES.filter((x) => x.minPlan === f && !x.parent && x.group === 'Principal').map((x) => x.label)),
    }))
    : [];

  const etapes = etapesParcours({
    // La création de la première marque · `saveOnboardingAction` ne la fait que pour un admin, dans un espace sans marque.
    creerMarque: admin && marques.length === 0,
    // Brancher un outil est réservé aux admins (Connexions, Drive).
    outils: admin,
    offre: formules.length > 0,
  });

  const essai = w ? trialStatus({ trialEndsAt: w.essai, accountKind: w.genre }) : null;
  const ouvertStudios = canAccess(effectiveAccess(s), FEATURES.find((f) => f.key === 'studio')!);
  const premierTest = !ouvertStudios ? null : cheminPorte('/studio/iterer') ? '/studio/iterer' : '/studio/projets/nouveau';
  const connecteurs = active && admin ? connecteursDepuis(await getConnectionState().catch(() => null), await getDriveState()) : null;
  const prenom = ((s.user.name || s.user.email || '').trim().split(/\s+/)[0]) || '';

  return (
    <>
      <Bienvenue
        site={active?.url?.replace(/^https?:\/\//, '').replace(/\/+$/, '') || reponsesParcours(w?.rep).siteUrl || null}
        marque={active ? {
          nom: active.name, logoUrl: active.logoUrl ?? null,
          resume: fiche?.description?.trim() || [fiche?.industry, fiche?.tone].filter(Boolean).join(' · ') || null,
          aEmployer: (fiche?.oui ?? []).slice(0, 3), aEviter: (fiche?.non ?? []).slice(0, 2),
        } : null}
        premierTest={premierTest}
        fiche={active && admin ? `/brands/${active.id}` : null}
      />
      <ParcoursAccueil
        prenom={prenom}
        etapes={etapes}
        reponses={reponsesParcours(w?.rep)}
        marqueExiste={marques.length > 0}
        marqueNom={active?.name ?? null}
        connecteurs={connecteurs}
        offre={formules.length ? {
          formules,
          essai: essai?.isTrial && !essai.expired && essai.daysLeft != null
            ? `Ton essai : ${essai.daysLeft} jour${essai.daysLeft > 1 ? 's' : ''} restant${essai.daysLeft > 1 ? 's' : ''}, sans engagement.`
            : 'Sans engagement · annulable à tout moment.',
          soldeGratuit: w?.solde ?? 0,
        } : null}
      />
    </>
  );
}
