import { redirect } from 'next/navigation';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import type { InspoAd } from '@tiktrends/integrations';
import { lireCriteresFormats, lireFormatCreatif } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { Icon } from '../../../../components/Icon';
import { cadrePage, h1 } from '../../../../components/ui';
import { VueFormats, type AnnonceSauvegardee } from './VueFormats';

export const dynamic = 'force-dynamic';

const Veille = FEATURES.find((f) => f.key === 'inspo')!;
const Adsmap = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * Formats créatifs · v1 manuelle (lot 19C).
 *
 * Périmètre RÉEL · les annonces que l'espace a sauvegardées (même portée que
 * Sauvegardes · marque active s'il y en a une), classées à la main. Ce n'est
 * pas la bibliothèque de la Veille · aucune annonce affichée par la Veille ne
 * porte de format (le connecteur n'en fournit pas). Aucun classement IA, aucun
 * rattrapage, aucune dépense.
 *
 * Les critères vivent dans l'URL et sont relus à chaque rendu (serveur) · le
 * bouton Retour retrouve la vue. Accès · même contrôle que `/veille`.
 */
export default async function FormatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const s = await getSession();
  if (!s) redirect('/login');

  const access = effectiveAccess(s);
  if (!canAccess(access, Veille)) {
    const why = denyReason(access, Veille);
    return (
      <main style={cadrePage}>
        <h1 style={h1}>Formats créatifs</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="lock" size={30} /></div>
          <h2 style={{ margin: '10px 0 6px', fontSize: 18, color: 'var(--ink)' }}>
            {why === 'plan' ? 'Fonctionnalité incluse dès l’abonnement Core' : 'Accès réservé'}
          </h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '0 auto' }}>
            {why === 'plan'
              ? 'Les formats créatifs font partie de la Veille, disponible à partir du plan Core. Passe ton espace en Core dans Réglages puis Abonnement.'
              : 'Ton rôle ne permet pas d’accéder à la Veille.'}
          </p>
        </div>
      </main>
    );
  }

  const criteres = lireCriteresFormats(sp);
  const marque = db ? await getActiveBrand(s.workspaceId) : null;
  let annonces: AnnonceSauvegardee[] = [];
  const suivis = new Set<string>();
  if (db) {
    const ou = marque
      ? and(eq(schema.savedAds.workspaceId, s.workspaceId), eq(schema.savedAds.brandId, marque.id))
      : eq(schema.savedAds.workspaceId, s.workspaceId);
    const suiviOu = marque
      ? and(eq(schema.followedBrands.workspaceId, s.workspaceId), eq(schema.followedBrands.brandId, marque.id))
      : eq(schema.followedBrands.workspaceId, s.workspaceId);
    const [lignes, fl] = await Promise.all([
      db.select().from(schema.savedAds).where(ou).orderBy(desc(schema.savedAds.createdAt)),
      db.select({ platform: schema.followedBrands.platform, name: schema.followedBrands.name }).from(schema.followedBrands).where(suiviOu),
    ]);
    for (const b of fl) suivis.add(b.platform + ':' + b.name);
    annonces = lignes.map((r) => {
      const ad = (r.snapshot ?? {}) as InspoAd;
      return {
        id: r.id, platform: r.platform, externalId: r.externalId, ad,
        mediaType: ad.mediaType ?? null, daysRunning: ad.daysRunning ?? null,
        sauvegardeLe: r.createdAt.toISOString(), format: lireFormatCreatif(r.snapshot), auteurNom: null,
      };
    });
    // Qui a classé · le NOM d'un membre de CET espace, rien d'autre (message 55 ·
    // b). La lecture de `users` passe par l'appartenance à l'espace de la
    // session · une personne d'un autre espace (ou partie) n'est pas lue, et
    // l'e-mail n'est jamais sélectionné · un membre sans nom reçoit un libellé.
    const auteurs = [...new Set(annonces.map((a) => a.format.auteur).filter((x): x is string => !!x && /^[0-9a-f-]{36}$/i.test(x)))];
    if (auteurs.length) {
      const us = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)
        .innerJoin(schema.workspaceMembers, and(eq(schema.workspaceMembers.userId, schema.users.id), eq(schema.workspaceMembers.workspaceId, s.workspaceId)))
        .where(inArray(schema.users.id, auteurs));
      const noms = new Map(us.map((u) => [u.id, u.name?.trim() || 'un membre de l’espace']));
      for (const a of annonces) if (a.format.auteur) a.auteurNom = noms.get(a.format.auteur) ?? null;
    }
  }
  const adsmapOuvert = !!marque && canAccess(access, Adsmap);

  return (
    <main style={cadrePage}>
      <VueFormats annonces={annonces} criteres={criteres} marque={marque?.name ?? null} suivis={[...suivis]} adsmap={adsmapOuvert} />
    </main>
  );
}
