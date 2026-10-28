import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { LIBELLE_TYPE, libelleTauxFraction, memoireParDimension, poidsAccroche, rappelReconciliation, signauxExploitables, VALEUR_ABSENTE } from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { canAccess, FEATURES } from '../../../../../lib/rbac';
import { refusJarvis, TEXTE_REFUS_JARVIS } from '../../../../../lib/jarvis-acces';
import { effectiveAccess } from '../../../../../lib/access';
import { isFounder } from '../../../../../lib/founder';
import { getActiveBrand } from '../../../../../lib/brands';
import { jarvisStats, jarvisMeasuredMemory } from '../../../../../lib/jarvis-memory';
import { jarvisSnapshot, STATE_LABEL } from '../../../../../lib/jarvis-state';
import { spendStatus, depensesAReconcilier } from '../../../../../lib/spend-guard';
import { currentDeployment } from '../../../../../lib/deployment';
import { chatThreadAction } from '../../../../actions/jarvis-chat';
import { RefusJarvis } from '../../../../../spatial/vues/jarvis/RefusJarvis';
import { SourcesJarvis, type ContexteSources } from '../../../../../spatial/vues/jarvis/Sources';

export const dynamic = 'force-dynamic';

const RESULTATS = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * « Sources de Jarvis » (Spatial) · mêmes gardes et mêmes lectures que l'écran
 * V5 `/jarvis/sources` : la feature `jarvis` AVANT toute lecture ; la mémoire
 * mesurée derrière l'offre (`adsmap`) ; l'exploitation (serveur, dépense) et les
 * réglages maison derrière `isFounder`. Le contexte de marque est celui que lit
 * la conversation (`chatThreadAction`, portée espace + marque + personne).
 * Consulter n'écrit rien.
 */
export default async function SourcesJarvisSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  const refus = refusJarvis(s);
  if (refus) return <RefusJarvis raison={TEXTE_REFUS_JARVIS[refus]} plan={refus === 'plan'} proprietaire={s.role === 'owner'} />;

  const fondateur = isFounder(s.user.email);
  const voitMemoire = canAccess(effectiveAccess(s), RESULTATS);
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return <SourcesJarvis marque={null} couches={[]} memoire={null} contexte={null} testsMesures={0} fondateur={null} />;

  const [row] = db
    ? await db.select({ creativeRules: schema.brands.creativeRules, jarvisLearnings: schema.brands.jarvisLearnings, jarvisTrainedAt: schema.brands.jarvisTrainedAt })
      .from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1)
    : [];
  const [snapshot, memoire, stats, depense, aReconcilier, fil] = await Promise.all([
    jarvisSnapshot(brand.id, s.workspaceId),
    voitMemoire ? jarvisMeasuredMemory(brand.id, s.workspaceId) : Promise.resolve(''),
    voitMemoire ? jarvisStats(brand.id, s.workspaceId) : Promise.resolve(null),
    fondateur ? spendStatus() : Promise.resolve(null),
    fondateur ? depensesAReconcilier().then(rappelReconciliation).catch(() => null) : Promise.resolve(null),
    chatThreadAction(null),
  ]);
  const deploiement = fondateur ? await currentDeployment() : null;

  const t = fil.thread ?? null;
  const c = t?.contexte ?? null;
  const contexte: ContexteSources | null = c && {
    identite: c.identity, regles: c.rules,
    accroches: c.hooks && {
      resume: c.hooks.summary,
      lignes: c.hooks.entries.slice(0, 8).map((h) => ({ texte: h.text, poids: poidsAccroche(h.evidence).libelle, ton: poidsAccroche(h.evidence).ton })),
      marche: c.hooks.counts.market > 0,
    },
    connaissances: c.connaissances ? { inclus: c.connaissances.inclus.map((k) => ({ ref: k.ref, titre: k.titre, type: LIBELLE_TYPE[k.type], tronquee: k.tronquee })), horsPlace: c.connaissances.horsPlace } : null,
  };

  return (
    <SourcesJarvis
      marque={{ id: brand.id, nom: brand.name }}
      couches={snapshot.layers.map((l) => ({ cle: l.key, titre: l.title, quoi: l.what, etat: l.state, libelleEtat: STATE_LABEL[l.state], detail: l.detail, geste: l.fix ? { libelle: l.fix.label, href: l.fix.href } : null }))}
      memoire={stats && {
        taux: libelleTauxFraction(stats.tauxProtocole.taux),
        tauxDetail: `${stats.tauxProtocole.succes} / ${stats.tauxProtocole.evaluables} test(s) évaluable(s) au protocole`,
        ads: stats.nAds, signaux: signauxExploitables(stats.stats), groupes: memoireParDimension(stats.stats, stats.globalRate), brut: memoire,
        vide: stats.nAds > 0
          ? `${stats.nAds} ad(s) suivies, mais aucun verdict concluant sur au moins trois tests d’un même type. Une ligne n’apparaît qu’à partir de trois · en dessous, ce serait une anecdote présentée comme une loi.`
          : 'Jarvis apprend des verdicts, pas des intentions · sa mémoire se remplit quand des tests sont arbitrés.',
      }}
      contexte={contexte}
      testsMesures={t?.measuredAds ?? 0}
      fondateur={fondateur ? {
        serveur: deploiement && { ok: deploiement.ok, resume: deploiement.summary, detail: `maquette v${deploiement.renderVersion} · ${deploiement.applied ?? VALEUR_ABSENTE}/${deploiement.inBuild} migrations${deploiement.build ? ` · ${deploiement.build}` : ''}` },
        depense: depense && { bloquee: depense.blocked, resume: depense.summary, aReconcilier },
        apprentissages: row?.jarvisLearnings ?? '', entraineLe: row?.jarvisTrainedAt ? row.jarvisTrainedAt.toISOString() : null, regles: row?.creativeRules ?? '',
      } : null}
    />
  );
}
