import 'server-only';
import { regimeSession } from '../../../../../../lib/credits-appels';
import { and, count, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  CIBLE_CONCEPT, MENTION_COUT_MESSAGE_CONCEPT, actionsConceptResolues, capacitesDuRefus, champsBrief, completudeFicheMarque, ciblerCouloirs, couloirsDepuisLignee,
  couloirsDepuisProjet, dateCourteUtc, detailTache, phraseSourcesIllisibles, provenanceSource, raisonCanevasIndisponible, retourVeilleProjet, etatGeneration, extraitBulle, gesteGenerer, mentionAppelTexte, pastilleEnregistrement, relectureNecessaire,
  resumeFicheMarque, sousTitreProjet, texteTourJarvis, titreSource, vueVariantes, LIBELLES_TYPE_SOURCE,
  type ErreurStudio, type EtatJob, type ClassePastille,
} from '@tiktrends/core';
import type { Session } from '../../../../../../lib/auth';
import { effectiveAccess } from '../../../../../../lib/access';
import { FEATURES, denyReason, roleAtLeast } from '../../../../../../lib/rbac';
import { gardeStudio } from '../../../../../../lib/studios/garde';
import { etatInterrupteurs } from '../../../../../../lib/studios/interrupteurs';
import { liensAtelierProjet } from '../../../../../../lib/navigation';
import { listerVariantes } from '../../../../../../lib/studios/variantes/variantes';
import { accesAdsmap, etatRelecture } from '../../../../../../lib/studios/variantes/acces';
import { listerTachesProjet } from '../../../../../../lib/studios/execution/commandes';
import { urlsApercu } from '../../../../../../lib/studios/editeur/apercus';
import { lireProjetDetail } from '../../../../../actions/studios/sources';
import { lireLigneeProjet } from '../../../../../actions/studios/lignee';
import { lireCanvasProjet } from '../../../../../actions/studios/canvas';
import { listerPropositions } from '../../../../../actions/studios/propositions';
import { chatThreadAction } from '../../../../../actions/jarvis-chat';
import type { RaisonEtat } from '../../../../../../spatial/vues/projet/EtatProjet';
import type { LotSpatial, PropsProjet, TacheSpatiale, VarianteSpatiale } from '../../../../../../spatial/vues/projet/types';

/**
 * Lecture serveur de la fiche projet Spatial · les MÊMES sources que la fiche
 * V5 (retirée · Spatial sert la fiche) : `lireProjetDetail`, la
 * lignée (`lireLigneeProjet`), les variantes et lots (`listerVariantes`), les
 * tâches, les propositions, le fil Jarvis du projet, les interrupteurs de
 * l'espace, le canvas métier et la disposition personnelle (`lireCanvasProjet`,
 * « Disposition libre »). LECTURE seule · la visite n'écrit rien, ne génère rien.
 */

const feature = FEATURES.find((f) => f.key === 'studio')!;

/** Un refus studio → l'état Spatial qui le dit (mêmes cas, mêmes phrases que la V5). */
export function raisonDuRefus(r: ErreurStudio, s: Session, quoi: string): RaisonEtat {
  const coupees = capacitesDuRefus(r);
  if (coupees.length) return { type: 'capacite', capacites: coupees };
  if (r.code === 'FORBIDDEN' || r.code === 'AUTH_REQUIRED') return { type: 'refuse', plan: denyReason(effectiveAccess(s), feature) === 'plan', quoi };
  if (r.code === 'NOT_FOUND') return { type: 'introuvable', message: r.message };
  return { type: 'erreur', message: r.message, traceId: r.traceId };
}

/**
 * Les ateliers d'un projet pour la rangée de navigation · actifs pour l'espace
 * (interrupteurs), l'export masqué sous le rôle Membre (mêmes règles que la
 * fiche). Lecture seule.
 */
export async function atelierDuProjet(s: Session, projectId: string): Promise<Array<{ segment: string; href: string | null }>> {
  const inter = await etatInterrupteurs(s.workspaceId);
  const exportAutorise = roleAtLeast(s.role, 'member');
  return liensAtelierProjet(projectId, inter.actif).map((a) => ({ segment: a.segment, href: a.segment === 'export' && !exportAutorise ? null : a.href }));
}

const TON_TACHE: Record<string, ClassePastille> = { interrompu: 'w', echec: 'w', termine: 'g', attente: 'c' };

/** La fiche marque lue en base (complétude réelle) · mêmes champs que l'Accueil V5. */
async function lireFiche(workspaceId: string, brandId: string) {
  if (!db) return null;
  const [b] = await db.select({
    nom: schema.brands.name, description: schema.brands.description, usp: schema.brands.usp, audience: schema.brands.audience,
    category: schema.brands.category, categoryNeeds: schema.brands.categoryNeeds, tone: schema.brands.tone,
    industryTags: sql<number>`coalesce(cardinality(${schema.brands.industryTags}), 0)`,
    colors: sql<number>`coalesce(cardinality(${schema.brands.colors}), 0)`,
    concurrents: sql<number>`coalesce(cardinality(${schema.brands.competitors}), 0)`,
  }).from(schema.brands).where(and(eq(schema.brands.id, brandId), eq(schema.brands.workspaceId, workspaceId))).limit(1);
  if (!b) return null;
  const n = async (t: typeof schema.personas | typeof schema.scenarios | typeof schema.products) =>
    Number((await db!.select({ n: count() }).from(t).where(eq(t.brandId, brandId)))[0]?.n ?? 0);
  const [personas, scenarios, produits] = await Promise.all([n(schema.personas), n(schema.scenarios), n(schema.products)]);
  const c = completudeFicheMarque({ ...b, industryTags: Number(b.industryTags), colors: Number(b.colors), concurrents: Number(b.concurrents), personas, scenarios, produits });
  return { nom: b.nom, score: c.score, ...resumeFicheMarque(b.nom, { score: c.score, ton: b.tone, couleurs: Number(b.colors), manques: c.manques }) };
}

export async function chargerProjet(s: Session, id: string, versionDemandee?: string): Promise<{ ok: true; props: PropsProjet } | { ok: false; raison: RaisonEtat }> {
  const r = await lireProjetDetail({ projectId: id, ...(versionDemandee ? { versionId: versionDemandee } : {}) });
  if (!r.ok) return { ok: false, raison: raisonDuRefus(r, s, 'Les projets du Studio') };
  const d = r.detail;
  const pid = d.projet.id;
  const courante = d.versions.find((v) => v.courante) ?? null;
  const ancienne = d.version.id !== courante?.id;
  const inter = await etatInterrupteurs(s.workspaceId);
  const atelier = liensAtelierProjet(pid, inter.actif);
  const lien = (seg: string) => atelier.find((a) => a.segment === seg)?.href ?? null;
  const exportAutorise = roleAtLeast(s.role, 'member');
  const generationActive = inter.actif(d.projet.kind === 'video' ? 'video' : 'generation_image');

  const g = await gardeStudio('studio.read');
  const [lignee, variantes, taches, propositions, fil, fiche, canvas] = await Promise.all([
    lireLigneeProjet({ projectId: pid }).catch(() => null),
    g.ok ? listerVariantes(g.ctx, { projectId: pid }, { adsmapAcces: await accesAdsmap(), relecture: await etatRelecture() }).catch(() => null) : Promise.resolve(null),
    g.ok ? listerTachesProjet(g.ctx, { projectId: pid }).catch(() => null) : Promise.resolve(null),
    courante ? listerPropositions({ projectId: pid }).catch(() => null) : Promise.resolve(null),
    chatThreadAction({ projectId: pid }).catch(() => ({ error: 'Le fil de Jarvis n’a pas pu être lu.' } as { thread?: undefined; error?: string })),
    lireFiche(s.workspaceId, d.projet.brandId).catch(() => null),
    // Canvas libre · la version VUE (une ancienne version garde son graphe), la disposition de CETTE personne.
    lireCanvasProjet({ projectId: pid, versionId: d.version.id }).catch(() => null),
  ]);

  const donnees = variantes?.ok ? variantes.donnees : null;
  const vue = donnees ? vueVariantes(donnees) : null;
  const assetIds = donnees ? [...donnees.variantes.map((v) => v.assetId), ...donnees.lots.flatMap((l) => l.sorties.map((x) => x.assetId))] : [];
  const apercus = urlsApercu(assetIds, pid);
  const ficheHref = fiche && roleAtLeast(s.role, 'admin') ? `/brands/${d.projet.brandId}` : null;
  const ficheNoeud = fiche ? { titre: fiche.titre, texte: fiche.texte, href: ficheHref } : null;

  // ── Canvas · la lignée réelle, sinon ce que la fiche porte ───────────────
  const hypotheseVue = d.hypothese ? { enonce: d.hypothese.statement, mesure: d.hypothese.metric || null } : null;
  const couloirsLus = lignee?.ok && lignee.lignee.lignee.noeuds.length > 1
    ? couloirsDepuisLignee(lignee.lignee.lignee, {
      versionVue: d.version.id,
      apercusCreations: Object.fromEntries((donnees?.variantes ?? []).flatMap((v) => (apercus[v.assetId] ? [[`creation:${v.id}`, apercus[v.assetId]!]] : []))),
      apercusReferences: Object.fromEntries(d.sources.flatMap((x) => (x.apercu ? [[`reference:${x.sourceId}`, x.apercu]] : []))),
      fiche: ficheNoeud, hypotheseVue,
    })
    : couloirsDepuisProjet({
      versionId: d.version.id, versionN: d.version.n, marque: d.projet.marque,
      objectif: d.brief?.objective || null, hypothese: hypotheseVue, direction: d.brief?.styleIntent || null,
      produit: d.produit ? { nom: d.produit.nom, detail: `${d.produit.faits.length} fait${d.produit.faits.length > 1 ? 's' : ''} · instantané du ${dateCourteUtc(d.produit.instantaneLe)}` } : null,
      sources: d.sources.map((x) => ({ id: x.sourceId, titre: titreSource(x), detail: `${LIBELLES_TYPE_SOURCE[x.type]} · ${x.plateforme}`, href: x.lienSource, apercu: x.apercu })),
      creations: (donnees?.lots ?? []).flatMap((l) => l.sorties.flatMap((x) => (apercus[x.assetId] ? [{ id: x.assetId, src: apercus[x.assetId]!, titre: `Lot ${l.lot} · sortie ${x.position + 1}` }] : []))),
    }, ficheNoeud);
  // « Cibler Jarvis » · seulement sur la version courante, et seulement si le rôle peut demander une proposition.
  const listeLue = propositions?.ok ? propositions : null;
  const couloirs = ciblerCouloirs(couloirsLus, {
    versionCourante: ancienne ? null : d.version.id,
    cibles: listeLue?.peutProposer ? listeLue.cibles.map((c) => ({ cible: c.cible, libelle: c.libelle })) : [],
  });
  const nbNoeuds = couloirs.reduce((t, c) => t + c.noeuds.length, 0);

  // ── Jarvis ───────────────────────────────────────────────────────────────
  const liste = propositions?.ok ? propositions : null;
  const briefPret = !!liste && !!liste.cibles.find((c) => c.cible === CIBLE_CONCEPT)?.champs.some((ch) => ch.forme !== 'objectif-brief');
  const actions = actionsConceptResolues({
    kind: d.projet.kind, peutProposer: liste?.peutProposer ?? false, briefPret, jarvisDisponible: !!liste?.jarvis.disponible,
    jarvisRaison: liste?.jarvis.raison ?? '', generationImageActive: inter.actif('generation_image'), ancienneVersion: ancienne,
  });
  const thread = fil.thread ?? null;
  const derniere = thread ? [...thread.turns].reverse().find((t) => t.role === 'assistant') : undefined;
  const ouverte = liste?.propositions.find((x) => x.etat === 'proposed') ?? null;
  const premiereSortie = (donnees?.lots ?? []).flatMap((l) => l.sorties).find((x) => apercus[x.assetId]);

  // ── Créations ────────────────────────────────────────────────────────────
  const lots: LotSpatial[] = (vue?.versions ?? []).flatMap((bv) => bv.lots.map((l) => {
    const lu = donnees!.lots.find((x) => x.jobId === l.jobId)!;
    return {
      jobId: l.jobId, titre: l.titre, version: bv.titre, note: bv.note, etat: etatGeneration(lu.etat as EtatJob), qualite: l.qualite, message: l.message,
      sorties: l.sorties.map((x) => ({ assetId: x.assetId, libelle: `${l.titre} · ${x.libelle}`, apercu: apercus[x.assetId] ?? null, detail: x.dimensions, choisir: x.choisir, raison: x.raison, varianteId: x.varianteId })),
    };
  }));
  const varSpatiales: VarianteSpatiale[] = (vue?.variantes ?? []).map((v) => {
    const lu = donnees!.variantes.find((x) => x.id === v.id)!;
    return {
      id: v.id, libelle: v.libelle, apercu: apercus[lu.assetId] ?? null, version: v.versionTitre, statut: `${v.statutTechnique} · ${v.statutQualite}`,
      hypothese: v.hypothese, variable: v.variable, comparaison: v.comparaison,
      test: v.test ? { href: v.test.adsmapHref, resume: v.test.resume, verdict: v.test.verdict, details: v.test.details, isolation: v.test.isolation } : null,
      noteRangement: v.noteRangement,
      lienTest: lu.test?.linkId ?? null,
      lecture: v.lecture ? { conclusion: v.lecture.conclusion, phrase: v.lecture.phrase, prudence: v.lecture.prudence, variableSuivante: v.lecture.variableSuivante } : null,
      gestes: v.gestes,
      rattachement: { hypothese: lu.hypothese, variable: lu.variable, aUnParent: lu.parentVariantId !== null },
    };
  });
  const tachesSp: TacheSpatiale[] | null = taches?.ok ? taches.taches.map((t) => ({
    id: t.id, titre: t.etat.titre, classe: TON_TACHE[t.etat.ton] ?? '', detail: detailTache(t), progression: t.progression,
    explication: t.etat.explication, interrompue: t.etat.interrompu,
  })) : null;
  const relecture = donnees?.relecture ?? { disponible: false, raison: null, coutMaxUsd: null };

  const preparer = d.projet.kind === 'video' ? lien('video') : inter.actif('generation_image') ? lien('produit') : null;

  return {
    ok: true,
    props: {
      projet: { id: pid, titre: d.projet.title, sousTitre: sousTitreProjet({ marque: d.projet.marque, libelleType: d.projet.libelleType, versionN: d.version.n, ancienne }), kind: d.projet.kind },
      pastille: pastilleEnregistrement({ versionN: d.version.n, ancienne }),
      exporterHref: exportAutorise ? lien('export') : null,
      generer: gesteGenerer({
        kind: d.projet.kind, projetId: pid, ancienne, cadre: !!d.brief && !!(d.brief.composition.trim() || d.brief.objective.trim()), generationActive,
        liens: { produit: lien('produit'), video: lien('video'), textes: lien('textes') },
      }),
      couloirs,
      retourVeille: retourVeilleProjet(d.sources),
      libre: canvas?.ok
        ? { ok: true, canvas: { projectId: canvas.canvas.projectId, version: canvas.canvas.version, modele: canvas.canvas.modele, apercus: canvas.canvas.apercus, disposition: canvas.canvas.disposition, rev: canvas.canvas.rev } }
        : { ok: false, raison: canvas ? raisonCanevasIndisponible(canvas) : 'La disposition libre n’a pas pu être lue · recharge la page pour réessayer.' },
      aideCanvas: lignee?.ok ? `${nbNoeuds} nœud${nbNoeuds > 1 ? 's' : ''} · la lignée réelle du projet` : 'Ce que la fiche du projet porte · la lignée complète n’est pas disponible',
      jarvis: {
        projectId: pid, marque: d.projet.marque,
        sousTitre: `Dans ce projet${fiche ? ` · fiche ${d.projet.marque} ${fiche.score} %` : ''}`,
        message: derniere ? extraitBulle(texteTourJarvis(derniere.content)) : `Décris ce que tu veux créer pour ${d.projet.marque || 'ta marque'} · Jarvis t’aide à cadrer le concept, chaque proposition reste à valider.`,
        fil: thread ? { conversationId: thread.conversationId ?? null, tours: thread.turns.map((t) => ({ id: t.id, role: t.role, texte: t.role === 'assistant' ? texteTourJarvis(t.content) : t.content })) } : null,
        erreurFil: fil.error ?? null,
        suggestion: ouverte ? {
          id: ouverte.id, libelle: ouverte.libelleCible,
          texte: extraitBulle(ouverte.changements[0] ? `${ouverte.changements[0].libelle} · « ${ouverte.changements[0].apres} »` : ouverte.explication || ouverte.libelleCible, 160),
          apercu: premiereSortie ? { src: apercus[premiereSortie.assetId]!, bandeau: '' } : null,
        } : null,
        actions: actions.map((a) => ({ cle: a.def.key, libelle: a.def.label, etat: a.etat, raison: a.raison, effet: a.def.effet, genre: a.def.genre, cible: a.def.cibleBrief ?? null })),
        mentionCout: liste?.jarvis.mentionCout ?? null,
        mentionConversation: MENTION_COUT_MESSAGE_CONCEPT,
        versionCourante: courante ? { id: courante.id, n: courante.n } : null,
        preparerHref: lien('produit'),
        conversationOuverte: !fil.error,
      },
      brief: {
        projectId: pid, versionId: d.version.id, versionN: d.version.n, ancienne,
        titreBrief: `Brief · version ${d.version.n}`,
        etatBrief: d.briefIllisible ? 'illisible' : d.brief ? 'ok' : 'vide',
        champs: d.brief ? champsBrief(d.brief, d.hypothese) : [],
        references: d.sources.map((x) => ({
          id: x.sourceId, titre: titreSource(x), apercu: x.apercu, href: x.lienSource,
          detail: `${LIBELLES_TYPE_SOURCE[x.type]} · ${x.plateforme} · observée le ${dateCourteUtc(x.observeLe)}${x.statut !== 'active' ? ' · plus accessible' : ''}`,
          libelleLien: x.type === 'veille_ad' ? 'Voir la source dans la Veille' : 'Voir la sauvegarde',
          provenance: provenanceSource(x, !!x.lienSource),
        })),
        sourcesIllisibles: phraseSourcesIllisibles(d.sourcesIllisibles),
        produit: d.produit ? {
          nom: d.produit.nom, instantane: dateCourteUtc(d.produit.instantaneLe), photo: null, href: lien('produit'),
          faits: d.produit.faits.filter((f) => f.cle !== 'nom').map((f) => `${f.libelle} · ${f.valeur}`),
          manques: d.produit.manques.map((m) => m.libelle),
        } : null,
        veilleHref: '/veille',
        fiche: fiche ? { score: fiche.score, texte: fiche.texte, href: ficheHref } : null,
        manques: d.completude.manques.map((m) => ({ cle: m.cle, libelle: m.libelle, bloquant: m.bloquant })),
        versions: d.versions.map((v) => ({
          id: v.id, n: v.n, date: dateCourteUtc(v.createdAt), raison: v.reason || null, courante: v.courante, vue: v.id === d.version.id,
          href: v.courante ? `/studio/projets/${pid}` : `/studio/projets/${pid}?version=${v.id}`,
        })),
        atelier: atelier.map((a) => ({ segment: a.segment, libelle: a.libelle, href: a.segment === 'export' && !exportAutorise ? null : a.href, mention: a.mention })),
        exportBrief: { autorise: exportAutorise, possible: !!d.brief },
        propositions: { initial: propositions, versionCourante: courante ? { id: courante.id, n: courante.n } : null },
      },
      creations: {
        projectId: pid, versionCouranteId: courante?.id ?? null, lots,
        messageVide: vue?.message ?? (variantes && !variantes.ok ? variantes.message : 'Aucune création pour ce projet.'),
        editeurHref: ['ads', 'image'].includes(d.projet.kind) ? lien('image') : null,
        preparerHref: preparer, videoHref: d.projet.kind === 'video' ? lien('video') : null,
        variantes: varSpatiales,
        erreurVariantes: variantes && !variantes.ok ? `${variantes.message} · identifiant support ${variantes.traceId}` : g.ok ? null : 'Accès refusé · ton rôle ne permet pas d’ouvrir les variantes de ce projet.',
        relecture: { disponible: relecture.disponible, raison: relecture.raison, coutMaxUsd: relecture.coutMaxUsd, mention: relecture.coutMaxUsd !== null ? mentionAppelTexte(regimeSession(s), relecture.coutMaxUsd) : null },
        taches: tachesSp,
        erreurTaches: taches && !taches.ok ? `${taches.message} · identifiant support ${taches.traceId}` : null,
        peutProposer: !!donnees?.droits.proposer,
        adsmap: donnees ? donnees.adsmap : null,
        relire: relectureNecessaire((donnees?.lots ?? []).map((l) => l.etat as EtatJob)),
      },
    },
  };
}
