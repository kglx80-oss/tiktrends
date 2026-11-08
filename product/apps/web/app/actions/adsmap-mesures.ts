'use server';

import { db, schema, eq, and, sql } from '@tiktrends/db';
import {
  enteteDuFichier, lectureSeparateur, lireMesuresMeta, planImportMesures, refusColonnes,
  LIBELLE_LIGNE_ECARTEE, LIBELLE_PAR, LIBELLE_RATTACHEMENT, PHRASE_PRIORITE_MESURES,
  type LectureMesures, type PlanMesures, type TotauxPlan,
} from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { refreshDecisions } from '../../lib/decisions';
import { daterJalons, invalidateJarvisMemory } from '../../lib/jarvis-memory';
import {
  adsDeLaMarque, existantesParCle, journaliserRemontee, lireJourneesRetenues, recalculerVerdicts, type AdDeLaMarque,
} from '../../lib/adsmap-mesures';

/**
 * Résultats · import des MESURES d'un export Ads Manager (lot 4 V5).
 *
 * Deux temps, comme l'import du tableau · on prévisualise (rien n'est écrit),
 * on relit ce qui sera rattaché, ambigu ou laissé de côté, puis on écrit. Le
 * serveur REJOUE le plan à l'écriture · l'aperçu affiché n'est jamais cru sur
 * parole, seules les confirmations cochées sont reprises (et seulement pour des
 * propositions qui existent encore).
 *
 * Mêmes gardes que l'import du tableau (`adsmapGuard`, admin) · une écriture de
 * mesures décide des verdicts. Aucun modèle, aucun connecteur, aucune dépense.
 */

const MAX_CSV_BYTES = 4_000_000;
const guard = () => adsmapGuard({ minRole: 'admin' });
/** Lignes écartées montrées au plus · le reste est compté. */
const ECARTEES_MONTREES = 12;

export interface AnnonceApercu {
  cle: string;
  /** Le nom lu dans le fichier · TEXTE saisi, rendu comme texte. */
  nom: string | null;
  idMeta: string | null;
  lignes: number;
  periode: { debut: string; fin: string };
  etat: 'rattachee' | 'a_confirmer' | 'ambigue' | 'non_rattachee';
  libelle: string;
  /** Pourquoi · la raison du noyau, ou comment la ligne a été rattachée. */
  raison: string;
  /** L'ad visée · « Lot #2 · v1 » et son nom régie. */
  cible: { lot: number | null; variante: string; nomRegie: string | null } | null;
  bilan: { nouvelles: number; identiques: number; misesAJour: number; meta: number } | null;
}

export interface ApercuMesures {
  lecture: string;
  reconnues: string[];
  annonces: AnnonceApercu[];
  totaux: TotauxPlan;
  lignesLues: number;
  ecartees: Array<{ ligne: number; raison: string }>;
  ecarteesMasquees: number;
  notes: string[];
  priorite: string;
}

export interface ResultatApercuMesures {
  apercu?: ApercuMesures;
  error?: string;
  /** Sur un refus · les intitulés lus et les colonnes absentes, rendus comme texte. */
  guide?: { lus: string[]; manquantes: string[] };
}

function lectureEnMots(l: LectureMesures): string {
  const langue = l.langue === 'fr' ? 'en-tête en français' : l.langue === 'en' ? 'en-tête en anglais' : 'langue de l’en-tête non tranchée';
  return `${lectureSeparateur(l.separateur)} · ${langue}`;
}

function notes(l: LectureMesures, plan: PlanMesures): string[] {
  const n: string[] = [];
  if (l.sansAchats) n.push('Aucune colonne d’achats dans l’export · les verdicts ne pourront rien conclure sur le coût par achat. Ajoute « Achats » aux colonnes avant d’exporter.');
  if (!l.lignes.some((x) => x.adIdMeta)) n.push('L’export n’a pas la colonne « Identifiant de la publicité » · chaque ligne se rattache par son nom. Avec l’identifiant, deux annonces de même nom ne se confondent plus.');
  if (l.identifiantsAbimes) n.push(`${l.identifiantsAbimes} identifiant(s) d’annonce réécrit(s) par le tableur (notation scientifique) · ces lignes se rattachent par leur nom.`);
  if (l.regroupees) n.push(`${l.regroupees} ligne(s) d’une même annonce et d’une même période additionnée(s) · export ventilé (placement, âge…).`);
  if (l.doublons) n.push(`${l.doublons} ligne(s) recopiée(s) à l’identique, comptée(s) une fois.`);
  if (plan.periodes) n.push('L’export porte des périodes de plusieurs jours · une période compte entière dans la fenêtre d’évaluation. Pour la fenêtre exacte du protocole, exporte « par jour » (Ventilation › Par période › Jour).');
  if (plan.totaux.meta) n.push(`${plan.totaux.meta} journée(s) déjà mesurée(s) par la connexion Meta · elles sont gardées, mais la connexion l’emporte.`);
  return n;
}

async function preparer(csvText: string, ws: string, brandId: string, confirmees: ReadonlySet<string>): Promise<
  { error: string; guide?: ResultatApercuMesures['guide'] } | { lecture: LectureMesures; plan: PlanMesures; ads: AdDeLaMarque[] }
> {
  const lecture = lireMesuresMeta(csvText);
  if (lecture.refus) {
    // Le tableau historique déposé ici · on le dit, au lieu d'une liste de colonnes absentes.
    if (refusColonnes(enteteDuFichier(csvText)) === null) {
      return { error: 'Ce fichier est le tableau historique, pas un export de mesures · choisis « Tableau » pour le reprendre.' };
    }
    return { error: lecture.refus, guide: { lus: lecture.intitules.slice(0, 15), manquantes: lecture.manquantes } };
  }
  if (!lecture.lignes.length) {
    return { error: `Aucune ligne de mesure lisible · ${lecture.ecartees.length} ligne(s) écartée(s) (${[...new Set(lecture.ecartees.map((e) => LIBELLE_LIGNE_ECARTEE[e.motif]))].join(', ') || 'fichier vide'}).` };
  }
  const ads = await adsDeLaMarque(ws, brandId);
  // LA lecture des mesures (connexion puis export) · ce qui est déjà en base et les jours que la connexion garde.
  const lu = await lireJourneesRetenues(brandId, { ads });
  const plan = planImportMesures(lecture, ads, { existantes: existantesParCle(lu.csv), joursMeta: lu.joursMeta, confirmees });
  return { lecture, plan, ads };
}

/** Analyse l'export et rend ce qui serait écrit · n'écrit rien. */
export async function previewMesuresAction(csvText: string): Promise<ResultatApercuMesures> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  if (!csvText?.trim()) return { error: 'Le fichier est vide.' };
  if (csvText.length > MAX_CSV_BYTES) return { error: 'Fichier trop volumineux (4 Mo maximum).' };
  try {
    const p = await preparer(csvText, g.s.workspaceId, g.brand.id, new Set());
    if ('error' in p) return { error: p.error, guide: p.guide };
    const parId = new Map(p.ads.map((a) => [a.id, a]));
    const annonces: AnnonceApercu[] = p.plan.annonces.map((a) => {
      const r = a.rattachement;
      const adId = r.etat === 'rattachee' || r.etat === 'a_confirmer' ? r.adId : null;
      const c = adId ? parId.get(adId) : undefined;
      return {
        cle: a.cle, nom: a.nom, idMeta: a.adIdMeta, lignes: a.lignes.length, periode: { debut: a.debut, fin: a.fin },
        etat: r.etat, libelle: LIBELLE_RATTACHEMENT[r.etat],
        raison: r.etat === 'rattachee' ? LIBELLE_PAR[r.par] : r.raison,
        cible: c ? { lot: c.lot, variante: c.variante, nomRegie: c.nomRegie } : null,
        bilan: a.bilan ?? (r.etat === 'a_confirmer' ? { nouvelles: a.lignes.length, identiques: 0, misesAJour: 0, meta: 0 } : null),
      };
    });
    return {
      apercu: {
        lecture: lectureEnMots(p.lecture), reconnues: p.lecture.reconnues, annonces, totaux: p.plan.totaux,
        lignesLues: p.lecture.lignes.length + p.lecture.regroupees + p.lecture.doublons,
        ecartees: p.lecture.ecartees.slice(0, ECARTEES_MONTREES).map((e) => ({ ligne: e.ligne, raison: LIBELLE_LIGNE_ECARTEE[e.motif] })),
        ecarteesMasquees: Math.max(0, p.lecture.ecartees.length - ECARTEES_MONTREES),
        notes: notes(p.lecture, p.plan), priorite: PHRASE_PRIORITE_MESURES,
      },
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:mesures-preview', e, { subject: 'la lecture de l’export', workspaceId: g.s.workspaceId }) };
  }
}

export interface ResultatEcritureMesures {
  ok?: true;
  error?: string;
  ecrit?: { ads: number; nouvelles: number; identiques: number; misesAJour: number; meta: number; verdicts: number; lots: Array<{ id: string; numero: number }> };
}

/**
 * Écrit les mesures rattachées (et les propositions confirmées), épingle les
 * identifiants Meta lus, recalcule les verdicts des lots touchés. Idempotent ·
 * la clé (ad, début, fin) réécrit une ligne déjà importée au lieu de l'ajouter.
 */
export async function applyMesuresAction(csvText: string, confirmees: readonly string[] = [], fichier: string | null = null): Promise<ResultatEcritureMesures> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  if (!csvText?.trim()) return { error: 'Le fichier est vide.' };
  if (csvText.length > MAX_CSV_BYTES) return { error: 'Fichier trop volumineux (4 Mo maximum).' };
  const ws = g.s.workspaceId;
  const brandId = g.brand.id;
  try {
    const p = await preparer(csvText, ws, brandId, new Set(confirmees));
    if ('error' in p) return { error: p.error };
    if (!p.plan.aEcrire.length) return { error: 'Aucune annonce rattachée à une ad de la marque · rien n’est écrit.' };

    const nomFichier = fichier?.trim().slice(0, 200) || null;
    const lignes = p.plan.aEcrire.map((e) => ({
      adId: e.adId, workspaceId: ws, brandId, dateDebut: e.debut, dateFin: e.fin,
      spend: e.mesures.spend, impressions: e.mesures.impressions, linkClicks: e.mesures.linkClicks, purchases: e.mesures.purchases,
      reach: e.mesures.reach ?? null, clicks: e.mesures.clicks ?? null, purchaseValue: e.mesures.purchaseValue ?? null,
      video3s: e.mesures.video3s ?? null, thruplays: e.mesures.thruplays ?? null, videoP50: e.mesures.videoP50 ?? null,
      addToCart: e.mesures.addToCart ?? null, landingViews: e.mesures.landingViews ?? null,
      metaAdId: e.source.adIdMeta, nomAnnonce: e.source.nom, campagne: e.source.protocole.campagne, campagneId: e.source.protocole.campagneId,
      ensemble: e.source.protocole.ensemble, ensembleId: e.source.protocole.ensembleId, budgetJour: e.source.protocole.budgetJour, cbo: e.source.protocole.cbo,
      fichier: nomFichier, importePar: g.s.user.id, importeLe: new Date(),
    }));
    await db!.transaction(async (tx) => {
      for (let i = 0; i < lignes.length; i += 200) {
        await tx.insert(schema.mesuresCsv).values(lignes.slice(i, i + 200)).onConflictDoUpdate({
          target: [schema.mesuresCsv.adId, schema.mesuresCsv.dateDebut, schema.mesuresCsv.dateFin],
          set: {
            spend: sql`excluded.spend`, impressions: sql`excluded.impressions`, linkClicks: sql`excluded.link_clicks`, purchases: sql`excluded.purchases`,
            reach: sql`excluded.reach`, clicks: sql`excluded.clicks`, purchaseValue: sql`excluded.purchase_value`, video3s: sql`excluded.video_3s`,
            thruplays: sql`excluded.thruplays`, videoP50: sql`excluded.video_p50`, addToCart: sql`excluded.add_to_cart`, landingViews: sql`excluded.landing_views`,
            metaAdId: sql`excluded.meta_ad_id`, nomAnnonce: sql`excluded.nom_annonce`, campagne: sql`excluded.campagne`, campagneId: sql`excluded.campagne_id`,
            ensemble: sql`excluded.ensemble`, ensembleId: sql`excluded.ensemble_id`, budgetJour: sql`excluded.budget_jour`, cbo: sql`excluded.cbo`,
            fichier: sql`excluded.fichier`, importePar: sql`excluded.importe_par`, importeLe: sql`excluded.importe_le`,
          },
        });
      }
      // L'identifiant lu est épinglé sur l'ad qui n'en avait pas · la synchro ne devinera plus, même si l'annonce est renommée.
      for (const e of p.plan.epingles) {
        await tx.update(schema.ads)
          .set({ externalIds: sql`coalesce(${schema.ads.externalIds}, '{}'::jsonb) || ${JSON.stringify({ ad_id: e.idMeta })}::jsonb` })
          .where(and(eq(schema.ads.id, e.adId), eq(schema.ads.workspaceId, ws), sql`(${schema.ads.externalIds} ->> 'ad_id') is null`));
      }
    });

    const touchees = new Set(p.plan.aEcrire.map((e) => e.adId));
    const v = await recalculerVerdicts({ id: brandId, name: g.brand.name, workspaceId: ws }, p.ads, touchees);
    invalidateJarvisMemory(brandId);
    try { await refreshDecisions(ws, brandId); } catch (e) { console.error('[adsmap] décisions après import', brandId, (e as Error).message); }
    await daterJalons(brandId, ws);

    const lots = [...new Map(p.ads.filter((a) => touchees.has(a.id) && a.lotId && a.lot !== null).map((a) => [a.lotId!, a.lot!])).entries()]
      .map(([id, numero]) => ({ id, numero })).sort((a, b) => a.numero - b.numero);
    const t = p.plan.totaux;
    await journaliserRemontee({
      workspaceId: ws, brandId, source: 'csv', declencheur: 'import', ok: true,
      resume: { variantes: t.ads, journees: t.nouvelles + t.misesAJour + t.identiques, verdicts: v.verdicts, lots: lots.length, fichier: nomFichier, lotsNumeros: lots.map((l) => l.numero) },
    });
    return { ok: true, ecrit: { ads: t.ads, nouvelles: t.nouvelles, identiques: t.identiques, misesAJour: t.misesAJour, meta: t.meta, verdicts: v.verdicts, lots } };
  } catch (e) {
    await journaliserRemontee({ workspaceId: ws, brandId, source: 'csv', declencheur: 'import', ok: false, erreur: e });
    return { error: logAndTranslate('adsmap:mesures-apply', e, { subject: 'l’écriture des mesures', workspaceId: ws }) };
  }
}

/**
 * La remontée nocturne de la marque · active (par défaut, comme aujourd'hui) ou
 * suspendue. Ne touche ni à la connexion ni au jeton · « Mesurer maintenant »
 * reste possible. Même garde que les autres actions Adsmap (admin).
 */
export async function reglerRemonteeNocturneAction(active: boolean): Promise<{ ok?: true; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  try {
    await db!.update(schema.brands).set({ adsmapRemonteeSuspendueLe: active ? null : new Date() })
      .where(and(eq(schema.brands.id, g.brand.id), eq(schema.brands.workspaceId, g.s.workspaceId)));
    return { ok: true };
  } catch (e) {
    return { error: logAndTranslate('adsmap:remontee-reglage', e, { subject: 'le réglage de la remontée', workspaceId: g.s.workspaceId }) };
  }
}
