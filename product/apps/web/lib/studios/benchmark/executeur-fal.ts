/**
 * Benchmark Studios · F-D · exécuteur image RÉEL (`ExecuteurMedias`) sur
 * l'adaptateur fal du lot F-A (`FournisseurFal` : soumettre, sonder avec recul,
 * télécharger borné).
 *
 * ── Une barrière, une ligne ──────────────────────────────────────────────────
 *
 * La campagne appelle déjà `sousPlafond` autour de `produire` (une ligne
 * `ai_spend` par média, réservée avant, rendue si l'échec est certain). Cet
 * exécuteur N'EN REPOSE PAS une seconde : `FournisseurFal` exige une
 * `BarriereDepenseStudio`, on lui donne un port « déjà compté » qui n'écrit
 * rien, et qui refuse une seconde réservation pour la même demande (une
 * réponse perdue ne repart jamais : réconciliation). Le double comptage est
 * prouvé absent par `fd-executeur-fal.test.ts` (une seule ligne par média).
 *
 * ── Ce qui part, ce qui ne part pas ──────────────────────────────────────────
 *
 *  - `preparer` (avant la barrière, donc 0 $) : profil image seulement, une
 *    consigne `image.compile` validée, des références du jeu synthétique
 *    transmises en data URI (jamais une URL fournie de l'extérieur), et la
 *    règle pure `requeteFalImage` du noyau (modèle routé, corps natif). Une
 *    image clé sans consigne compilée (F20) est refusée ici.
 *  - Retouche masquée (F05, lot G-B) : MÊME chemin que le worker. La consigne
 *    est le `result` validé de `edit.mask` ; la règle pure `requeteFalRetouche`
 *    décide le corps (modèle d'édition existant, source en image de départ,
 *    zone décrite, masque jamais transmis) ; la sortie téléchargée est ramenée
 *    explicitement à la résolution de la source et recomposée sous le masque
 *    par `appliquerMasqueAuxPixels` (L5-A) : 0 pixel hors zone avant encodage,
 *    contrôlé puis recontrôlé sur le PNG. La sortie brute n'est jamais rendue.
 *    Sans consigne `edit.mask` dans la demande : refus avant la barrière.
 *  - `produire` : UNE soumission ; sondage avec le recul de l'adaptateur F-A,
 *    borné en durée ; téléchargement borné, type relu dans les octets.
 *  - Issue INCERTAINE (réponse perdue, délai dépassé, requête inconnue) :
 *    `ErreurFournisseurIncertaine` · la campagne s'arrête, sans resoumission.
 *
 * Construit seulement par la commande en `--reel` (et par les tests, avec un
 * `fetch` injecté). Aucun `fetch` implicite : il est exigé au constructeur.
 */

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import {
  ErreurFournisseurCertaine, ErreurFournisseurIncertaine, MODELE_FAL_EDITION_DEFAUT, MODELE_FAL_GENERATION_DEFAUT, PORTEE_BENCHMARK,
  cleFournisseurDuJob, inspecterMedia, parametresImageDuDevis, requeteFalImage, requeteFalRetouche, parametresRetoucheDuDevis,
  masqueDepuisRvba, boiteDuMasque, versionDepuisEmpreinte,
  type ConsigneImage, type ConsigneRetouche, type MasqueBrut, type MediaResolu, type ModelesRoutes, type RequeteFal,
} from '@tiktrends/core';
import { BarriereDepenseStudio, FournisseurFal, type PortDepense } from '@tiktrends/integrations';
import { appliquerMasqueAuxPixels } from '../rendu/masque-pixels';
import type { DemandeMedia, ExecuteurMedias, MediaProduit } from './campagne';
import type { Jeu } from './scenarios';

/** Durée maximale d'attente d'un résultat · politique (pas une mesure) : 10 min, puis issue incertaine. */
export const ATTENTE_MAX_MS = 10 * 60 * 1000;
/** Pas de la boucle de sondage · l'adaptateur F-A applique son propre recul (2 s → 15 s). */
export const PAS_SONDAGE_MS = 2_000;

export interface OptionsExecuteurFal {
  apiKey: string;
  fetch: typeof fetch;
  jeu: Jeu;
  queueUrl?: string | null;
  modeles?: ModelesRoutes;
  attendre?: (ms: number) => Promise<void>;
  horloge?: () => Date;
  verifierAdresse?: (u: URL) => Promise<boolean>;
  attenteMaxMs?: number;
}

/**
 * Port « déjà compté » · la campagne a écrit la ligne `ai_spend` de ce média
 * (`sousPlafond`). Ce port n'écrit rien ; il refuse une seconde réservation
 * pour la même demande (issue incertaine ⇒ jamais deux soumissions).
 */
export function portDejaCompte(): PortDepense & { reservations: string[] } {
  const reservations: string[] = [];
  return {
    reservations,
    async reserver(ligne) {
      if (reservations.includes(ligne.id)) return { ok: false, raison: 'demande déjà soumise', dejaEngagee: true };
      reservations.push(ligne.id);
      return { ok: true, depenseAvantUsd: 0 };
    },
    async annuler() { return false; },
  };
}

/**
 * Retouches masquées du benchmark · la source et le masque du jeu synthétique,
 * MÊMES identifiants que l'entrée `edit.mask` du scénario (garde de cohérence
 * dans `gb-executeur-f05.test.ts`). Fondu 0 : l'oracle F05 compte comme
 * « hors masque » tout pixel changé hors du rectangle (`comparerSousMasque`).
 */
export interface RetoucheBenchmark { source: string; masque: string; fonduPx: number }
export const RETOUCHES_BENCHMARK: Readonly<Record<string, RetoucheBenchmark>> = {
  F05: { source: 'f05-etalon', masque: 'f05-masque', fonduPx: 0 },
};

/**
 * Identifiant `sta_<uuid>` SYNTHÉTIQUE d'un média du jeu (portée du benchmark
 * seulement) · dérivé de son identifiant, stable d'une campagne à l'autre.
 */
export function idStudioSynthetique(idJeu: string): string {
  const h = createHash('sha256').update(`benchmark:${idJeu}`).digest('hex');
  return `sta_${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const estConsigneRetouche = (x: unknown): x is ConsigneRetouche => {
  const c = x as Partial<ConsigneRetouche> | null;
  return !!c && typeof c.generationInstruction === 'string' && Array.isArray(c.preserve) && Array.isArray(c.expectedChanges);
};

const estConsigne = (x: unknown): x is ConsigneImage => {
  const c = x as Partial<ConsigneImage> | null;
  return !!c && typeof c.generationInstruction === 'string' && Array.isArray(c.negativeConstraints) && Array.isArray(c.referenceBindings)
    && Array.isArray(c.protectedComponents) && typeof c.needsDeterministicOverlay === 'boolean';
};

function modelesDepuisEnv(env: Readonly<Record<string, string | undefined>>): ModelesRoutes {
  return { generation: env.FAL_IMAGE_MODEL?.trim() || MODELE_FAL_GENERATION_DEFAUT, edition: env.FAL_IMAGE_MODEL_EDIT?.trim() || MODELE_FAL_EDITION_DEFAUT };
}

export function executeurMediasFal(o: OptionsExecuteurFal): ExecuteurMedias & { port: ReturnType<typeof portDejaCompte> } {
  const port = portDejaCompte();
  const modeles = o.modeles ?? modelesDepuisEnv(process.env);
  const attendre = o.attendre ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const horloge = o.horloge ?? (() => new Date());
  const attenteMax = o.attenteMaxMs ?? ATTENTE_MAX_MS;

  type Retouche = { octetsSource: Uint8Array; masque: MasqueBrut; fonduPx: number };
  const preparerRetouche = (d: DemandeMedia, def: RetoucheBenchmark): (Extract<RequeteFal, { ok: true }> & { retouche: Retouche }) | { ok: false; motif: string } => {
    if (!estConsigneRetouche(d.consigne)) return { ok: false, motif: 'aucune consigne edit.mask validée dans la demande de retouche · rien n’est envoyé' };
    if (d.unites !== 1) return { ok: false, motif: 'une retouche rend exactement une image' };
    const src = o.jeu.get(def.source);
    const msk = o.jeu.get(def.masque);
    if (!src?.image || !msk?.image || src.mime !== 'image/png') return { ok: false, motif: 'source ou masque absent du jeu synthétique · aucune substitution' };
    // Le masque du jeu (RVBA noir/blanc, antérieur au format canonique) est converti EXPLICITEMENT.
    const masque = masqueDepuisRvba(msk.image.largeur, msk.image.hauteur, msk.image.pixels);
    const dims = { largeur: src.image.largeur, hauteur: src.image.hauteur };
    const source = { assetId: idStudioSynthetique(src.id), assetVersion: versionDepuisEmpreinte(src.sha256), sha256: src.sha256, ...dims };
    const masqueMedia = { assetId: idStudioSynthetique(msk.id), assetVersion: versionDepuisEmpreinte(msk.sha256), sha256: msk.sha256, largeur: masque.largeur, hauteur: masque.hauteur };
    const parametres = parametresRetoucheDuDevis({ consigne: d.consigne, source, masque: masqueMedia, fonduPx: def.fonduPx });
    const violations = masque.largeur === dims.largeur && masque.hauteur === dims.hauteur ? [] : [`le masque (${masque.largeur}×${masque.hauteur}) doit avoir la résolution de la source (${dims.largeur}×${dims.hauteur})`];
    const r = requeteFalRetouche({
      operations: [{ operation: `${d.cas}:${d.etapeId}#${d.sortie}:0`, profil: 'image_generation' }],
      parametres,
      source: { assetId: source.assetId, etat: 'autorise', url: `data:image/png;base64,${Buffer.from(src.octets).toString('base64')}`, sha256: src.sha256 },
      dimensionsSource: dims,
      masque: { violations, boite: boiteDuMasque(masque) },
      modeles,
    });
    return r.ok ? { ...r, retouche: { octetsSource: new Uint8Array(src.octets), masque, fonduPx: def.fonduPx } } : { ok: false, motif: `${r.code} · ${r.motif}` };
  };

  const preparerRequete = (d: DemandeMedia): (Extract<RequeteFal, { ok: true }> & { retouche?: Retouche }) | { ok: false; motif: string } => {
    if (d.profil !== 'image_generation') return { ok: false, motif: `profil ${d.profil} hors du fournisseur image` };
    const def = RETOUCHES_BENCHMARK[d.cas];
    if (def) return preparerRetouche(d, def);
    if (!estConsigne(d.consigne)) return { ok: false, motif: 'aucune consigne image.compile validée pour cette étape (retouche masquée ou image clé sans compilation)' };
    const consigne = d.consigne;
    const references = consigne.referenceBindings.map((b) => {
      const m = o.jeu.get(b.referenceId);
      return m ? { assetId: m.id, assetVersion: 'v1', sha256: m.sha256, role: b.role } : null;
    });
    if (references.some((r) => r === null)) return { ok: false, motif: 'référence liée absente du jeu synthétique · aucune substitution' };
    const format = d.format ?? { largeur: 1080, hauteur: 1080 };
    const parametres = parametresImageDuDevis({ consigne, references: references as NonNullable<(typeof references)[number]>[], largeur: format.largeur, hauteur: format.hauteur });
    const medias: MediaResolu[] = consigne.referenceBindings.map((b) => {
      const m = o.jeu.get(b.referenceId)!;
      return m.mime === 'image/png'
        ? { assetId: m.id, etat: 'autorise', url: `data:image/png;base64,${Buffer.from(m.octets).toString('base64')}`, sha256: m.sha256 }
        : { assetId: m.id, etat: 'sans_media', motif: 'média non image' };
    });
    const operations = Array.from({ length: d.unites }, (_, k) => ({ operation: `${d.cas}:${d.etapeId}#${d.sortie}:${k}`, profil: 'image_generation' as const }));
    const r = requeteFalImage({ operations, parametres, medias, modeles });
    return r.ok ? r : { ok: false, motif: `${r.code} · ${r.motif}` };
  };

  const fournisseur = (r: Extract<RequeteFal, { ok: true }>) => new FournisseurFal({
    apiKey: o.apiKey, queueUrl: o.queueUrl ?? null, fetch: o.fetch,
    barriere: new BarriereDepenseStudio({ port, horloge }),
    preparer: async () => ({ ok: true, workspaceId: PORTEE_BENCHMARK.workspaceId, modele: r.modele, corps: r.corps }),
    operationsDuJob: async () => r.operations,
    ...(o.verifierAdresse ? { verifierAdresse: o.verifierAdresse } : {}),
    horloge,
  });

  return {
    nom: 'fal-benchmark (F-A, sous la barrière de la campagne)',
    profils: ['image_generation'],
    port,
    preparer(d) {
      const r = preparerRequete(d);
      return r.ok ? { ok: true } : { ok: false, motif: r.motif };
    },
    async produire(d): Promise<MediaProduit[]> {
      // Règle pure, recalculée : la même demande donne la même requête qu'au contrôle.
      const r = preparerRequete(d);
      if (!r.ok) throw new ErreurFournisseurCertaine(`demande refusée avant envoi · ${r.motif}`);
      const f = fournisseur(r);
      const jobId = randomUUID();
      const { requestId } = await f.soumettre({ cleIdempotence: cleFournisseurDuJob(jobId), operations: r.operations.map((operation) => ({ operation, profil: 'image_generation' as const })), parametres: {} });
      const debut = horloge().getTime();
      for (;;) {
        const st = await f.statut(requestId);
        if (st.etat === 'reussi') {
          const sorties: MediaProduit[] = [];
          for (const s of st.sorties) {
            const t = await f.telecharger(requestId, s.ref);
            const mime = inspecterMedia(t.octets)?.mime;
            if (!mime || !mime.startsWith('image/')) throw new ErreurFournisseurIncertaine('sortie téléchargée illisible · réconciliation');
            if (r.retouche) {
              // Même chemin que le worker : redimension explicite, composition stricte, contrôle avant encodage.
              const c = await appliquerMasqueAuxPixels({
                original: r.retouche.octetsSource, generation: t.octets, masque: r.retouche.masque, featherPx: r.retouche.fonduPx,
                format: 'png', redimensionnerGeneration: true,
              });
              // Générée et facturée, mais jamais rendue brute : la dépense reste comptée.
              if (!c.ok) throw new ErreurFournisseurCertaine(`retouche non livrée après génération · ${c.raison}`);
              sorties.push({ octets: c.octets, mime: c.mime });
              continue;
            }
            sorties.push({ octets: Buffer.from(t.octets), mime });
          }
          return sorties;
        }
        if (st.etat === 'echoue') throw new ErreurFournisseurCertaine(`fal a terminé en échec${st.facture ? ' (facturé)' : ''} · ${st.motif ?? 'sans motif'}`);
        if (st.etat === 'annule') throw new ErreurFournisseurIncertaine('requête annulée côté fal · facturation inconnue');
        if (st.etat === 'inconnu') throw new ErreurFournisseurIncertaine('requête inconnue de fal · réconciliation, aucune resoumission');
        if (horloge().getTime() - debut > attenteMax) throw new ErreurFournisseurIncertaine(`aucun résultat après ${Math.round(attenteMax / 1000)} s · réconciliation, aucune resoumission`);
        await attendre(PAS_SONDAGE_MS);
      }
    },
  };
}
