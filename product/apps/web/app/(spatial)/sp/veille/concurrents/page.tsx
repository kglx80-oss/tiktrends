import { redirect } from 'next/navigation';
import { and, eq, like } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { costFor, euroCourt, ilYa, lectureRapportConcurrent, nouveautesMarque, pastilleMarque } from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { FEATURES, canAccess, denyReason, roleAtLeast, PLAN_LABEL } from '../../../../../lib/rbac';
import { effectiveAccess } from '../../../../../lib/access';
import { getActiveBrand } from '../../../../../lib/brands';
import { analyzeCompetitorAction, type CompetitorReport } from '../../../../actions/competitor';
import { Concurrents, type ConcurrentScanne, type SuggestionConcurrent } from '../../../../../spatial/vues/veille/Concurrents';
import { VeilleFermee } from '../../../../../spatial/vues/veille/Fermee';
import { pastilleRadar } from '../acces';

export const dynamic = 'force-dynamic';

const Veille = FEATURES.find((f) => f.key === 'inspo')!;
const SEP = '\n';

/**
 * Le scan, depuis le formulaire OU depuis le bouton d'un concurrent de la
 * fiche (`cible` = marque + nom). Enveloppe MINCE de l'action existante
 * `analyzeCompetitorAction` · elle garde ses gardes (admin, marque de
 * l'espace), son débit de crédits (prix affiché sur le bouton), sa barrière de
 * dépense IA (`guardedAnthropic`) et sa redirection vers le rapport.
 */
async function scanner(fd: FormData): Promise<void> {
  'use server';
  const cible = typeof fd.get('cible') === 'string' ? String(fd.get('cible')) : '';
  const f = new FormData();
  if (cible) {
    const i = cible.indexOf(SEP);
    f.set('brandId', i > 0 ? cible.slice(0, i) : '');
    f.set('name', i > 0 ? cible.slice(i + 1) : '');
  } else {
    f.set('brandId', String(fd.get('brandId') ?? ''));
    f.set('name', String(fd.get('name') ?? ''));
  }
  await analyzeCompetitorAction(f);
}

/**
 * « Concurrents » (Spatial · nouvelle adresse) · la liste des concurrents de la
 * marque active. Lecture seule ici · seul le scan écrit, par l'action existante.
 * Garde de lecture · la Veille (`inspo`) · scan · administrateur (comme la V5).
 */
export default async function ConcurrentsSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  const access = effectiveAccess(s);
  const radar = pastilleRadar(access);
  if (!canAccess(access, Veille)) {
    const plan = denyReason(access, Veille) === 'plan';
    return <VeilleFermee titre="Concurrents" actif="/veille/concurrents" pastilleRadar={radar}
      raison={plan ? `La Veille est incluse dès l’offre ${PLAN_LABEL.core}.` : 'Ton rôle ne permet pas d’accéder à la Veille.'}
      texte={plan ? 'Le scan des concurrents s’ouvre avec elle.' : 'Demande l’accès à un administrateur de l’espace.'}
      action={plan && s.role === 'owner' ? { href: '/billing', libelle: 'Voir les forfaits' } : null} />;
  }

  const active = db ? await getActiveBrand(s.workspaceId) : null;
  const admin = roleAtLeast(s.role, 'admin');
  const cout = costFor('report');
  if (!db || !active) {
    return <Concurrents pastilleRadar={radar} marque={null} scanner={null} refus={null} cout={cout} suggestions={[]} scannes={[]} />;
  }

  const [[fiche], memoire, suivis, evenements] = await Promise.all([
    db.select({ competitors: schema.brands.competitors }).from(schema.brands).where(and(eq(schema.brands.id, active.id), eq(schema.brands.workspaceId, s.workspaceId))).limit(1),
    db.select({ value: schema.agentMemory.value }).from(schema.agentMemory).where(and(eq(schema.agentMemory.brandId, active.id), like(schema.agentMemory.key, 'competitor:%'))),
    db.select({ id: schema.followedBrands.id, platform: schema.followedBrands.platform, name: schema.followedBrands.name }).from(schema.followedBrands)
      .where(and(eq(schema.followedBrands.workspaceId, s.workspaceId), eq(schema.followedBrands.brandId, active.id))),
    db.select({ followedBrandId: schema.brandTrackerEvents.followedBrandId, seenAt: schema.brandTrackerEvents.seenAt }).from(schema.brandTrackerEvents)
      .where(eq(schema.brandTrackerEvents.workspaceId, s.workspaceId)).limit(500),
  ]);

  const maintenant = new Date();
  const rapports = memoire.map((m) => m.value as CompetitorReport | null).filter((r): r is CompetitorReport => !!r && typeof r.name === 'string' && !!r.aggregates)
    .sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
  const scannesNoms = new Set(rapports.map((r) => r.name.trim().toLocaleLowerCase('fr')));
  const suiviMeta = new Map(suivis.filter((f) => f.platform === 'meta').map((f) => [f.name.trim().toLocaleLowerCase('fr'), f.id]));
  const nonVues = (id: string | undefined) => (id ? evenements.filter((e) => e.followedBrandId === id && !e.seenAt).length : 0);

  const suggestions: SuggestionConcurrent[] = (fiche?.competitors ?? [])
    .map((n) => n.trim()).filter((n, i, t) => n && t.findIndex((x) => x.toLocaleLowerCase('fr') === n.toLocaleLowerCase('fr')) === i)
    .filter((n) => !scannesNoms.has(n.toLocaleLowerCase('fr')))
    .map((nom) => ({ nom, ...pastilleMarque(nom), detail: 'Renseigné dans la fiche · pas encore scanné', cible: `${active.id}${SEP}${nom}` }));

  const scannes: ConcurrentScanne[] = rapports.map((r) => {
    const l = lectureRapportConcurrent(r);
    const domaine = r.aggregates.landingDomains?.[0]?.label;
    const id = suiviMeta.get(r.name.trim().toLocaleLowerCase('fr'));
    const q = new URLSearchParams({ q: r.name, p: 'meta', searchIn: 'brand' });
    return {
      nom: r.name, ...pastilleMarque(r.name),
      detail: [domaine, `scanné ${ilYa(r.analyzedAt, maintenant)}`].filter(Boolean).join(' · '),
      nouveautes: nouveautesMarque(nonVues(id)),
      stats: [
        ['Pubs actives', `${l.actives} / ${l.pubs}`],
        ['Durée moyenne', `${l.dureeMoyenne} j`],
        ['Dépense estimée', l.depense != null ? euroCourt(l.depense) : 'n/c'],
        ['Meta / TikTok', l.metaTiktok],
      ],
      medias: l.medias,
      accroches: l.accroches,
      angle: l.angle ?? (r.insights ? 'non dégagé par l’analyse' : 'analyse IA non faite · le rapport ne compte que les pubs'),
      voir: `/veille?${q}`,
      analyse: admin ? `/brands/${active.id}/competitors/${encodeURIComponent(r.name)}` : null,
      suivi: !!id,
    };
  });

  return (
    <Concurrents
      pastilleRadar={radar}
      marque={{ id: active.id, nom: active.name }}
      scanner={admin ? scanner : null}
      refus={admin ? null : 'Le scan est réservé aux administrateurs de l’espace'}
      cout={cout}
      suggestions={suggestions}
      scannes={scannes}
    />
  );
}
