import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { DESCRIPTIF_FORMULES, FUSEAU_ACCUEIL, ORDRE_FORMULES, domaineConcurrent, initialeNom, lienNouveauProjet, prixFormule, teinteAvatar } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { canAccess, FEATURES, PLAN_LABEL, PLAN_PRICE, roleAtLeast, type Plan } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { Espace } from '../../../../spatial/vues/reglages/Espace';
import { SOUS_NAV_REGLAGES } from '../../../../spatial/vues/reglages/sous-nav';

export const dynamic = 'force-dynamic';

export default async function EspaceSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard'); // même garde que /settings V5
  const plan = s.plan as Plan;
  const active = await getActiveBrand(s.workspaceId);
  let marques: Array<{ id: string; name: string; url: string | null; category: string | null }> = [];
  let locale = 'fr';
  let nommage: string | null = null;
  if (db) {
    const [rows, [u], [nb]] = await Promise.all([
      db.select({ id: schema.brands.id, name: schema.brands.name, url: schema.brands.url, category: schema.brands.category }).from(schema.brands).where(eq(schema.brands.workspaceId, s.workspaceId)),
      db.select({ locale: schema.users.locale }).from(schema.users).where(eq(schema.users.id, s.user.id)).limit(1),
      active ? db.select({ np: schema.brands.namingPattern }).from(schema.brands).where(eq(schema.brands.id, active.id)).limit(1) : Promise.resolve([] as Array<{ np: string | null }>),
    ]);
    marques = rows;
    locale = u?.locale ?? 'fr';
    nommage = nb?.np ?? null;
  }
  const studio = FEATURES.find((f) => f.key === 'studio')!;

  return (
    <Espace
      sousNav={SOUS_NAV_REGLAGES} espace={s.workspaceName} plan={PLAN_LABEL[plan]}
      marques={marques.map((b, i) => ({
        id: b.id, initiale: initialeNom(b.name), nom: b.name,
        detail: [b.category || (b.url ? domaineConcurrent(b.url) : null) || 'Fiche à compléter', b.id === active?.id ? 'active' : null].filter(Boolean).join(' · '),
        fond: i === 0 ? null : `linear-gradient(135deg,${teinteAvatar(i)},${teinteAvatar(i + 1)})`,
      }))}
      inclus={DESCRIPTIF_FORMULES[plan].marques}
      ajouter="/brands/new"
      formules={ORDRE_FORMULES.map((k) => ({ nom: PLAN_LABEL[k], actuelle: k === plan, valeur: DESCRIPTIF_FORMULES[k].marques, detail: PLAN_PRICE[k] === 0 ? prixFormule(0) : `${prixFormule(PLAN_PRICE[k])} / mois` }))}
      preferences={{ langue: locale === 'en' ? 'en' : 'fr', fuseau: FUSEAU_ACCUEIL, devise: 'Euro (€)', nommage }}
      video={canAccess({ role: s.role, plan: s.plan, equipe: s.equipe ?? undefined }, studio) ? lienNouveauProjet({ type: 'video' }) : null}
    />
  );
}
