/**
 * Benchmark Studios · exécution d'une campagne et dossiers de preuves.
 *
 * Une campagne déroule le plan de chaque cas :
 *  - chaque tâche passe par `executerTache` (registre, release, contrôles,
 *    trace `studio_prompt_runs`) avec l'adaptateur de la campagne ;
 *  - chaque média passe, en RÉEL, par la barrière `sousPlafond` autour de
 *    l'exécuteur média injecté (le branchement des fournisseurs image réels se
 *    fait à l'intégration du lot F-A : ce module ne l'importe pas) ; en SIMULÉ,
 *    par un générateur de pixels local ;
 *  - chaque calcul est un moteur déterministe local, identique dans les deux modes.
 *
 * En réel, AVANT chaque appel payant : dépense cumulée + plafond de l'appel
 * ≤ budget, sinon arrêt de la campagne (`peutLancer`). Les cas non joués sont
 * dits « arrêtés », jamais réussis.
 *
 * Le rapport et chaque fichier de preuve portent le mode (SIMULÉ / RÉEL).
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { count, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  RUBRIQUE_REFERENCE, banniere, evaluerOracle, ficheVierge, jsonCanonique, peutLancer, sceller, usdLisible, verdictCampagne, FORMAT_RAPPORT,
  type DevisAgrege, type Image, type ModeCampagne, type ObservationCas, type ObservationEtape, type PlanCas, type ProfilMedia,
  type RapportCampagne, type ResultatCas, type StatutCas, type MessageObserve,
} from '@tiktrends/core';
import { executerTache } from '../prompts/resolveur';
import type { AdaptateurModele } from '../prompts/adaptateur';
import type { EnvironnementPrompts } from '../prompts/environnement';
import { sousPlafond } from '../../spend-guard';
import { SCENARIOS, type EntreeTacheBench, type EtatCas, type Jeu } from './scenarios';
import { decoder, encoder } from './jeu-synthetique';

/* ─────────────────────────────── exécuteurs ─────────────────────────────── */

export interface DemandeMedia {
  cas: string;
  etapeId: string;
  sortie: number;
  profil: ProfilMedia;
  unites: number;
  /** Dernière consigne compilée du cas (`image.compile`, `animation.compile`…). */
  consigne: Record<string, unknown> | null;
}

export interface MediaProduit { octets: Buffer; mime: string }

/**
 * Exécuteur média RÉEL · injecté à l'intégration (lot F-A). La campagne
 * l'appelle SOUS `sousPlafond` : l'implémentation ne doit pas reposer une
 * seconde barrière sur le même appel (double comptage).
 */
export interface ExecuteurMedias {
  readonly nom: string;
  readonly profils: readonly ProfilMedia[];
  produire(d: DemandeMedia): Promise<MediaProduit[]>;
}

interface Courant { cas: string; etapeId: string; sortie: number; entree: EntreeTacheBench }

/**
 * Fournisseur texte SIMULÉ du benchmark · réponses écrites dans `scenarios.ts`.
 * Marqué `simule: true` : le résolveur le refuse hors de l'environnement
 * « test » (recette locale), comme tout adaptateur simulé.
 */
export function adaptateurSimuleBenchmark(courant: () => Courant | null): AdaptateurModele {
  return {
    nom: 'simule-benchmark',
    simule: true,
    modelePour: (profil) => (profil === 'reasoning_structured' ? 'modele-simule-benchmark' : null),
    async appeler(a) {
      const c = courant();
      const f = c ? SCENARIOS[c.cas]?.simule[c.etapeId] : undefined;
      if (!c || !f) throw new Error('Aucune réponse simulée pour cet appel.');
      const texte = JSON.stringify(f(c.sortie, c.entree));
      return { texte, modele: 'modele-simule-benchmark', jetonsEntree: Math.ceil(JSON.stringify(a.messages).length / 4), jetonsSortie: Math.ceil(texte.length / 4), coutUsd: 0 };
    },
  };
}

/** Enveloppe un adaptateur pour relever les messages RÉELLEMENT envoyés (oracles F12). */
function capturer(a: AdaptateurModele, sink: (m: MessageObserve[]) => void, etape: () => string): AdaptateurModele & { appels: number } {
  const env = {
    nom: a.nom, simule: a.simule, appels: 0,
    modelePour: (p: string) => a.modelePour(p),
    async appeler(x: Parameters<AdaptateurModele['appeler']>[0]) {
      env.appels++;
      sink(x.messages.map((m) => ({ etapeId: etape(), role: m.role === 'system' ? 'system' as const : 'user' as const, contenu: m.contenu })));
      return a.appeler(x);
    },
  };
  return env;
}

/* ─────────────────────────────── compteurs ──────────────────────────────── */

const TABLES_COMPTEES = {
  jobs: schema.studioJobs, devis: schema.studioQuotes, approbations: schema.studioApprovals,
  medias: schema.studioAssets, credits: schema.creditLedger, versions: schema.studioProjectVersions,
} as const;

export async function compteurs(workspaceId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [nom, t] of Object.entries(TABLES_COMPTEES)) {
    const [l] = await db.select({ n: count() }).from(t).where(eq(t.workspaceId, workspaceId));
    out[nom] = Number(l?.n ?? 0);
  }
  return out;
}

async function coutRun(runId: string | null): Promise<number | null> {
  if (!runId) return null;
  const [l] = await db.select({ c: schema.studioPromptRuns.costUsdMicros }).from(schema.studioPromptRuns).where(eq(schema.studioPromptRuns.id, runId));
  return l?.c ?? null;
}

/* ─────────────────────────────── campagne ───────────────────────────────── */

export interface OptionsCampagne {
  mode: ModeCampagne;
  plans: PlanCas[];
  devis: DevisAgrege;
  release: { id: string; hash: string; epinglee: boolean };
  portee: { workspaceId: string; brandId: string };
  userId: string | null;
  /** Adaptateur texte · `'simule'` = fournisseur simulé du benchmark (recette locale seulement). */
  adaptateur: AdaptateurModele | 'simule';
  medias: ExecuteurMedias | null;
  environnement: EnvironnementPrompts;
  budgetUsdMicros: number | null;
  approbationId: string | null;
  jeu: Jeu;
  /** Racine des dossiers de preuves · `null` = rien n'est écrit sur le disque. */
  racine: string | null;
  maintenant?: Date;
}

export interface ResultatCampagne {
  rapport: RapportCampagne;
  dossier: string | null;
  resultats: ResultatCas[];
  observations: ObservationCas[];
  appelsTexte: number;
  appelsMedias: number;
}

const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const tamponDossier = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const MODE_LISIBLE: Record<ModeCampagne, string> = { simule: 'SIMULÉ', reel: 'RÉEL' };

interface Journal { etape: ObservationEtape; runId: string | null; fichiers: Array<{ fichier: string; sha256: string; largeur: number; hauteur: number }>; entree?: EntreeTacheBench }

export async function executerCampagne(o: OptionsCampagne): Promise<ResultatCampagne> {
  const maintenant = o.maintenant ?? new Date();
  const dossier = o.racine ? join(o.racine, `${tamponDossier(maintenant)}-${o.mode === 'simule' ? 'SIMULE' : 'REEL'}`) : null;
  const lignes = new Map<string, (typeof o.devis.cas)[number]["lignes"][number]>((o.devis.cas ?? []).flatMap((c) => c.lignes.map((l) => [`${c.cas}/${l.etapeId}#${l.sortie}`, l] as const)));
  let courant: Courant | null = null;
  let messages: MessageObserve[] = [];
  const brut = o.adaptateur === 'simule' ? adaptateurSimuleBenchmark(() => courant) : o.adaptateur;
  const adaptateur = capturer(brut, (m) => messages.push(...m), () => courant?.etapeId ?? '');
  let cumul = 0;
  let arrete: string | null = null;
  let appelsMedias = 0;
  const resultats: ResultatCas[] = [];
  const observations: ObservationCas[] = [];
  const casRapport: RapportCampagne['cas'] = [];

  for (const plan of o.plans) {
    const sc = SCENARIOS[plan.id];
    if (!sc) throw new Error(`Scénario absent pour ${plan.id}`);
    messages = [];
    const avant = await compteurs(o.portee.workspaceId);
    const etat: EtatCas = { jeu: o.jeu, resultats: new Map(), medias: new Map(), mesures: {} };
    const journal: Journal[] = [];
    let derniereConsigne: Record<string, unknown> | null = null;
    let depenseCas = 0;

    for (const { etape, sortie } of plan.deroule) {
      const cle = `${etape.id}#${sortie}`;
      const base: ObservationEtape = { etapeId: etape.id, templateKey: etape.nature === 'tache' ? etape.templateKey : null, sortie, statut: 'non_execute', code: null, result: null, questions: [], warnings: [] };
      if (arrete) { journal.push({ etape: { ...base, code: 'ARRET_BUDGET' }, runId: null, fichiers: [] }); continue; }
      const borne = lignes.get(`${plan.id}/${cle}`)?.usdMicros ?? null;
      const payant = o.mode === 'reel' && etape.nature !== 'calcul';
      if (payant && !peutLancer(cumul, borne, o.budgetUsdMicros ?? 0)) {
        arrete = `Arrêt avant ${plan.id}/${cle} : ${usdLisible(cumul)} dépensés + ${usdLisible(borne)} au plus dépasseraient le budget de ${usdLisible(o.budgetUsdMicros)}.`;
        journal.push({ etape: { ...base, code: 'ARRET_BUDGET' }, runId: null, fichiers: [] });
        continue;
      }

      if (etape.nature === 'tache') {
        const fabrique = sc.taches[etape.id];
        if (!fabrique) throw new Error(`Entrée absente pour ${plan.id}/${etape.id}`);
        const entree = fabrique(o.jeu, sortie);
        courant = { cas: plan.id, etapeId: etape.id, sortie, entree };
        const appelsAvant = adaptateur.appels;
        const r = await executerTache({
          templateKey: etape.templateKey, portee: o.portee, acteur: { userId: o.userId, traceId: `bench_${randomUUID()}` },
          taskInputs: entree.taskInputs, contexte: { connaissances: false, ...entree.contexte },
          epinglage: o.release.epinglee ? { promptReleaseId: o.release.id } : null,
          adaptateur, environnement: o.environnement,
          ...(entree.capacites ? { capacites: entree.capacites } : {}), ...(entree.sansTexte !== undefined ? { sansTexte: entree.sansTexte } : {}),
        });
        courant = null;
        const appele = adaptateur.appels > appelsAvant;
        const runId = r.runId;
        const cout = await coutRun(runId);
        const depense = cout ?? (appele ? borne ?? 0 : 0);
        cumul += depense; depenseCas += depense;
        let obs: ObservationEtape;
        if (r.ok) {
          const s = r.sortie as unknown as { status: 'ready' | 'blocked'; result: Record<string, unknown> | null; questions: string[]; warnings: string[] };
          obs = { ...base, statut: s.status, code: s.status === 'blocked' ? 'MODELE_BLOQUE' : null, result: s.result, questions: s.questions ?? [], warnings: s.warnings ?? [] };
          if (s.status === 'ready' && s.result) { etat.resultats.set(cle, s.result); if (/compile$/.test(etape.templateKey)) derniereConsigne = s.result; }
        } else {
          obs = { ...base, statut: r.statut === 'blocked' ? 'blocked' : 'erreur', code: r.constats[0]?.code ?? r.code, questions: r.constats.map((c) => c.message) };
        }
        journal.push({ etape: obs, runId, fichiers: [], entree });
        continue;
      }

      if (etape.nature === 'media') {
        let images: Image[] = [];
        let code: string | null = null;
        try {
          if (o.mode === 'simule') {
            const g = sc.mediasSimules?.[etape.id];
            if (!g) code = 'GENERATEUR_SIMULE_ABSENT'; else images = g(etat, sortie);
          } else if (!o.medias || !o.medias.profils.includes(etape.profil)) {
            code = 'EXECUTEUR_NON_BRANCHE';
          } else {
            const medias = o.medias;
            const produits = await sousPlafond(etape.profil === 'animation' ? 'fal_video' : 'fal_image', { workspaceId: o.portee.workspaceId, action: `studio-benchmark:${plan.id}:${etape.id}`, units: etape.unites },
              () => medias.produire({ cas: plan.id, etapeId: etape.id, sortie, profil: etape.profil, unites: etape.unites, consigne: derniereConsigne }));
            cumul += borne ?? 0; depenseCas += borne ?? 0;
            images = await Promise.all(produits.filter((p) => p.mime === 'image/png').map((p) => decoder(p.octets)));
          }
        } catch (e) {
          code = (e as Error).name === 'SpendBlockedError' ? 'BUDGET_EXCEEDED' : 'PROVIDER_ERROR';
        }
        if (images.length) { etat.medias.set(cle, images); appelsMedias++; }
        const fichiers = await Promise.all(images.map(async (img, k) => {
          const octets = await encoder(img);
          const fichier = `sorties/${etape.id}-${sortie + 1}-${k + 1}.png`;
          if (dossier) { mkdirSync(join(dossier, plan.id, 'sorties'), { recursive: true }); writeFileSync(join(dossier, plan.id, fichier), octets); }
          return { fichier, sha256: sha(octets), largeur: img.largeur, hauteur: img.hauteur };
        }));
        journal.push({ etape: { ...base, statut: code ? 'erreur' : 'fait', code }, runId: null, fichiers });
        continue;
      }

      await sc.calculs?.[etape.id]?.(etat, sortie);
      const produites = etat.medias.get(cle) ?? [];
      const fichiers = await Promise.all(produites.map(async (img, k) => {
        const octets = await encoder(img);
        const fichier = `sorties/${etape.id}-${sortie + 1}-${k + 1}.png`;
        if (dossier) { mkdirSync(join(dossier, plan.id, 'sorties'), { recursive: true }); writeFileSync(join(dossier, plan.id, fichier), octets); }
        return { fichier, sha256: sha(octets), largeur: img.largeur, hauteur: img.hauteur };
      }));
      journal.push({ etape: { ...base, statut: 'fait' }, runId: null, fichiers });
    }

    const apres = await compteurs(o.portee.workspaceId);
    const observation: ObservationCas = { cas: plan.id, etapes: journal.map((j) => j.etape), messages, compteurs: { avant, apres }, mesures: etat.mesures, donnees: sc.donnees(o.jeu) };
    const invariants = evaluerOracle(observation);
    const attendus = new Map(plan.deroule.map((d) => [d.etape.id, d.etape.nature === 'tache' ? d.etape.attendu : null]));
    let statut: StatutCas = 'execute';
    let motif: string | null = null;
    const etapes = journal.map((j) => j.etape);
    if (etapes.some((e) => e.code === 'ARRET_BUDGET')) { statut = 'arrete_budget'; motif = arrete; }
    else if (etapes.some((e) => e.code === 'UNSUPPORTED_CAPABILITY' && attendus.get(e.etapeId) !== 'blocked')) { statut = 'bloque_capacite'; motif = 'Étape sur un profil non routé (vision_analysis) : bloquée avant appel.'; }
    else if (etapes.some((e) => e.statut === 'erreur')) { statut = 'erreur'; motif = etapes.filter((e) => e.statut === 'erreur').map((e) => `${e.etapeId} ${e.code ?? ''}`).join(', '); }
    const fiche = ficheVierge(plan, RUBRIQUE_REFERENCE, o.mode);
    const res: ResultatCas = { cas: plan.id, statut, motif, invariants, fiche };
    resultats.push(res);
    observations.push(observation);
    const runIds = journal.flatMap((j) => (j.runId ? [j.runId] : []));
    casRapport.push({ cas: plan.id, statut, motif, invariants, fiche: !!fiche, runIds, dossier: plan.id });

    if (dossier) ecrireDossierCas(join(dossier, plan.id), { o, adaptateur: brut, plan, journal, invariants, statut, motif, fiche, runIds, depenseCas, observation });
  }

  const verdict = verdictCampagne({ mode: o.mode, rubrique: RUBRIQUE_REFERENCE, resultats });
  const rapport = sceller({
    format: FORMAT_RAPPORT, mode: o.mode, banniere: banniere(o.mode), horodatage: maintenant.toISOString(),
    release: { id: o.release.id, hash: o.release.hash }, modele: brut.modelePour('reasoning_structured'), adaptateur: brut.nom,
    devis: o.devis.ok
      ? { chiffrable: true, totalUsdMicros: o.devis.totalUsdMicros, empreinte: o.devis.empreinte, nonChiffrables: [] }
      : { chiffrable: false, totalUsdMicros: null, empreinte: null, nonChiffrables: o.devis.nonChiffrables },
    budget: { usdMicros: o.budgetUsdMicros, approbationId: o.approbationId },
    depenseUsdMicros: cumul, arrete, cas: casRapport, verdict,
  });
  if (dossier) {
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, 'rapport.json'), `${JSON.stringify(rapport, null, 2)}\n`);
    writeFileSync(join(dossier, 'RAPPORT.md'), rapportLisible(rapport, o));
  }
  return { rapport, dossier, resultats, observations, appelsTexte: adaptateur.appels, appelsMedias };
}

/* ─────────────────────────────── écriture ───────────────────────────────── */

function json(p: string, v: unknown) { writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); }

function ecrireDossierCas(d: string, x: {
  o: OptionsCampagne; adaptateur: AdaptateurModele; plan: PlanCas; journal: Journal[]; invariants: ResultatCas['invariants']; statut: StatutCas; motif: string | null;
  fiche: ResultatCas['fiche']; runIds: string[]; depenseCas: number; observation: ObservationCas;
}) {
  mkdirSync(d, { recursive: true });
  const { o, plan } = x;
  const tete = { mode: MODE_LISIBLE[o.mode], banniere: banniere(o.mode), cas: plan.id, titre: plan.titre };
  const jeu = [...o.jeu.values()].filter((m) => m.cas.includes(plan.id)).map((m) => ({ id: m.id, fichier: `docs/studios-v2/benchmark/jeu-synthetique/${m.fichier}`, sha256: m.sha256, contenuSha256: m.contenuSha256 }));
  json(join(d, 'entrees.json'), {
    ...tete, oracleAttendu: plan.oracleAttendu, jeuSynthetique: jeu,
    etapes: x.journal.filter((j) => j.entree).map((j) => ({ etape: j.etape.etapeId, sortie: j.etape.sortie, template: j.etape.templateKey, taskInputsSha256: sha(jsonCanonique(j.entree!.taskInputs)), taskInputs: j.entree!.taskInputs, contexte: j.entree!.contexte, capacites: j.entree!.capacites ?? null, sansTexte: j.entree!.sansTexte ?? null })),
    donneesOracle: x.observation.donnees,
  });
  json(join(d, 'config.json'), {
    ...tete, release: { id: o.release.id, empreinte: o.release.hash, epinglee: o.release.epinglee }, adaptateurTexte: x.adaptateur.nom, simule: x.adaptateur.simule,
    modele: x.adaptateur.modelePour('reasoning_structured'), environnement: o.environnement,
    medias: o.mode === 'simule' ? 'générateur de pixels local (simulé)' : o.medias?.nom ?? 'aucun exécuteur branché', runIds: x.runIds,
    messagesEnvoyes: x.observation.messages.map((m) => ({ etape: m.etapeId, role: m.role, sha256: sha(m.contenu), caracteres: m.contenu.length })),
  });
  json(join(d, 'sorties.json'), {
    ...tete,
    etapes: x.journal.map((j) => ({ ...j.etape, runId: j.runId, resultSha256: j.etape.result ? sha(jsonCanonique(j.etape.result)) : null, fichiers: j.fichiers })),
    mesures: x.observation.mesures, compteurs: x.observation.compteurs,
  });
  json(join(d, 'oracle.json'), { ...tete, statut: x.statut, motif: x.motif, invariants: x.invariants, revueHumaine: plan.revueHumaine.length ? 'fiche-revue.json' : 'aucune (cas entièrement déterministe)' });
  if (x.fiche) json(join(d, 'fiche-revue.json'), { consigne: 'À remplir par un relecteur humain : chaque note 0, 1 ou 2, aucun défaut critique accepté. Le code ne note jamais.', ...x.fiche, ...tete });
  const lignes = o.devis.cas.find((c) => c.cas === plan.id)?.lignes ?? [];
  json(join(d, 'cout.json'), {
    ...tete,
    depenseUsdMicros: x.depenseCas,
    note: o.mode === 'simule' ? 'Aucune dépense : fournisseurs simulés. Le devis dit ce que ce cas coûterait au plus en réel.' : 'Dépense relevée par les traces et la barrière de dépense.',
    devis: lignes, totalDevisUsdMicros: lignes.every((l) => l.usdMicros !== null) ? lignes.reduce((s, l) => s + (l.usdMicros ?? 0), 0) : null, limites: plan.limites,
  });
}

function rapportLisible(r: RapportCampagne, o: OptionsCampagne): string {
  const m = MODE_LISIBLE[r.mode];
  const l: string[] = [];
  l.push(`# Benchmark Studios F01-F24 · campagne ${r.mode === 'simule' ? 'SIMULÉE' : 'RÉELLE'}`, '', `> **${r.banniere}**`, '');
  if (r.mode === 'simule') l.push('> Ce rapport prouve que la chaîne (registre, release, contrôles, oracles, fiches, coûts) tourne de bout en bout. Les réponses du modèle et les images sont SIMULÉES : il ne dit RIEN de la qualité réelle et ne peut pas valoir évaluation d’une release.', '');
  l.push(`- Horodatage : ${r.horodatage}`, `- Release : \`${r.release.id}\` · empreinte \`${r.release.hash}\``, `- Adaptateur texte : ${r.adaptateur} · modèle ${r.modele ?? 'aucun'}`,
    `- Devis agrégé : ${r.devis.chiffrable ? usdLisible(r.devis.totalUsdMicros) : `non chiffrable (${r.devis.nonChiffrables.join(', ')})`}`,
    `- Dépense de la campagne : ${usdLisible(r.depenseUsdMicros)}${r.arrete ? ` · ${r.arrete}` : ''}`,
    `- Verdict (${m}) : **${r.verdict.statut}** · approuvable : ${r.verdict.approuvable ? 'oui' : 'non'} · évaluation réelle : ${r.verdict.evaluationReelle ? 'oui' : 'non'}`,
    `- Invariants déterministes : ${r.verdict.invariants.passes}/${r.verdict.invariants.total} passés, ${r.verdict.invariants.echoues} en échec, ${r.verdict.invariants.nonEvaluables} non évaluables`,
    `- Motifs : ${r.verdict.motifs.join(' ; ')}`, `- Empreinte du rapport : \`${r.empreinte}\``, '');
  l.push(`## Cas (${m})`, '', '| Cas | Statut | Invariants | Revue humaine | Motif |', '| --- | --- | --- | --- | --- |');
  for (const c of r.cas) {
    const p = c.invariants.filter((i) => i.passe === true).length;
    l.push(`| ${c.cas} | ${c.statut} | ${p}/${c.invariants.length} | ${c.fiche ? 'fiche à remplir' : 'sans objet'} | ${c.motif ?? ''} |`);
  }
  l.push('', `## Devis par cas (${m})`, '', '| Cas | Appels texte | Médias | Plafond |', '| --- | --- | --- | --- |');
  for (const c of o.devis.cas) l.push(`| ${c.cas} | ${c.appels} | ${c.medias} | ${usdLisible(c.totalUsdMicros)} |`);
  l.push('', `Chaque dossier \`Fxx/\` contient : \`entrees.json\` (entrées et empreintes du jeu synthétique), \`config.json\` (release, modèle, adaptateur, traces), \`sorties.json\`, \`oracle.json\`, \`fiche-revue.json\` (si revue humaine), \`cout.json\`. Tous portent le mode ${m}.`, '');
  return `${l.join('\n')}\n`;
}
