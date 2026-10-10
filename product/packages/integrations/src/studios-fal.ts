/**
 * Studios · F-A · fournisseur image RÉEL sur la file fal (`FournisseurStudio`),
 * et l'animation d'un plan (image → vidéo) sur la même file et la même barrière.
 *
 * Réalise le contrat L3 (`packages/core/src/studios/execution/fournisseur.ts`)
 * pour le moteur du worker (`apps/workers/src/studios/moteur.ts`). Mêmes
 * conventions que `fal.ts` : `Authorization: Key <FAL_KEY>`, file
 * `https://queue.fal.run/<modèle>`, URL de suivi reconstruites et validées
 * (`suiviFalDepuisJob`, SEC-07), redirections refusées.
 *
 * ── Ce qui ne se contourne pas ───────────────────────────────────────────────
 *
 *  · `fetch` est INJECTÉ (aucun appel réseau implicite) ; les tests rejouent
 *    les réponses documentées de fal, jamais le vrai service.
 *  · Toute soumission passe par la barrière de dépense (`BarriereDepenseStudio`,
 *    obligatoire au constructeur) : réservée AVANT l'envoi, rendue si l'échec
 *    est certain, gardée s'il est incertain. Plafond atteint ⇒ aucune requête.
 *  · Les paramètres natifs viennent de `preparer` (le worker résout l'instantané
 *    et les médias autorisés, la règle pure `requeteFalImage` décide) ; un refus
 *    de préparation bloque la tâche AVANT la barrière : 0 $, 0 requête.
 *  · `rechercheParCle` est FAUX : la file fal ne retrouve pas une requête par
 *    une clé à nous. Une réponse perdue part en réconciliation, jamais en
 *    seconde soumission.
 *  · Téléchargement borné : hôte de sortie fal en liste blanche, adresse
 *    publique vérifiée (`assertPublicUrl` de `safe-fetch.ts`), aucune clé
 *    envoyée, aucune redirection suivie, taille plafonnée, transfert coupé
 *    détecté, type RELU dans les octets (`inspecterMedia`), jamais l'annoncé.
 *  · La clé n'apparaît dans aucun message d'erreur ni aucun journal.
 */

import {
  ErreurFournisseurCertaine, ErreurFournisseurIncertaine, inspecterMedia, jobDeCleFournisseur, coutSoumissionStudio,
  issueStatutSoumission, issueErreurReseau, lireSoumissionFal, idRequeteFal, lireIdRequeteFal, urlSoumissionFal,
  lireStatutFal, lireResultatFal, urlSortieFalSure, refSortieFal, indiceSortieFal, delaiSondageMs,
  type DemandeFournisseur, type FournisseurStudio, type StatutFournisseur,
} from '@tiktrends/core';
import type { BarriereDepenseStudio } from './plafond-depense';
import { assertPublicUrl } from './safe-fetch';

/** Ce que le worker rend pour une demande · paramètres natifs déjà résolus, ou le refus. */
export type PreparationFal =
  | { ok: true; workspaceId: string; modele: string; corps: Record<string, unknown> }
  | { ok: false; motif: string };

/**
 * Plafond d'un fichier de sortie · 64 Mio, la borne de lecture des médias
 * studio (`OCTETS_MAX_MEDIA`, `apps/web/lib/studios/rendu/medias.ts`) : tout
 * fichier déposé reste relisible par le rendu.
 */
export const OCTETS_MAX_SORTIE_FAL = 64 * 1024 * 1024;
/** Délais · repris de `fal.ts` (soumission file 30 s, lecture de suivi 20 s). */
export const DELAI_SOUMISSION_FAL_MS = 30_000;
export const DELAI_LECTURE_FAL_MS = 20_000;
export const DELAI_TELECHARGEMENT_FAL_MS = 60_000;

export interface OptionsFournisseurFal {
  apiKey: string;
  queueUrl?: string | null;
  fetch: typeof fetch;
  barriere: BarriereDepenseStudio;
  preparer: (d: DemandeFournisseur, jobId: string) => Promise<PreparationFal>;
  /** Opérations à média du job (images ou clip), dans l'ordre de l'instantané (sortie i ⇒ opération i). */
  operationsDuJob: (jobId: string) => Promise<string[]>;
  /** Adresse publique ? Défaut : `assertPublicUrl` (résolution DNS, plages privées refusées). */
  verifierAdresse?: (u: URL) => Promise<boolean>;
  octetsMax?: number;
  horloge?: () => Date;
  journal?: (e: { appel: string; detail: string }) => void;
}

export class FournisseurFal implements FournisseurStudio {
  readonly nom = 'fal';
  readonly simule = false;
  readonly rechercheParCle = false;

  private readonly cle: string;
  private readonly queueUrl: string | null;
  private readonly f: typeof fetch;
  private readonly barriere: BarriereDepenseStudio;
  private readonly preparer: OptionsFournisseurFal['preparer'];
  private readonly operationsDuJob: OptionsFournisseurFal['operationsDuJob'];
  private readonly verifierAdresse: (u: URL) => Promise<boolean>;
  private readonly octetsMax: number;
  private readonly horloge: () => Date;
  private readonly noter: (e: { appel: string; detail: string }) => void;
  /** Recul du sondage par requête · mémoire du processus seulement (un redémarrage relit tout de suite). */
  private readonly sondages = new Map<string, { lectures: number; prochain: number }>();

  constructor(o: OptionsFournisseurFal) {
    if (!o.apiKey || /^simule/i.test(o.apiKey) || /\s/.test(o.apiKey)) throw new Error('fournisseur fal refusé · clé absente ou de simulation');
    if (!o.barriere) throw new Error('fournisseur fal refusé · barrière de dépense absente');
    if (typeof o.fetch !== 'function') throw new Error('fournisseur fal refusé · fetch non fourni');
    this.cle = o.apiKey;
    this.queueUrl = o.queueUrl ?? null;
    this.f = o.fetch;
    this.barriere = o.barriere;
    this.preparer = o.preparer;
    this.operationsDuJob = o.operationsDuJob;
    this.verifierAdresse = o.verifierAdresse ?? (async (u) => (await assertPublicUrl(u.toString())) !== null);
    this.octetsMax = o.octetsMax ?? OCTETS_MAX_SORTIE_FAL;
    this.horloge = o.horloge ?? (() => new Date());
    this.noter = o.journal ?? (() => {});
  }

  private entetes(json = false): Record<string, string> {
    return { authorization: `Key ${this.cle}`, ...(json ? { 'content-type': 'application/json' } : {}) };
  }

  /* ───────────────────────────── Soumettre ─────────────────────────────── */

  async soumettre(d: DemandeFournisseur): Promise<{ requestId: string }> {
    const jobId = jobDeCleFournisseur(d.cleIdempotence);
    if (!jobId) throw new ErreurFournisseurCertaine('clé fournisseur illisible · rien n’est envoyé');
    const cout = coutSoumissionStudio(d.operations);
    if (!cout.ok) throw new ErreurFournisseurCertaine(`${cout.motif} · rien n’est envoyé`);
    let prep: PreparationFal;
    try {
      prep = await this.preparer(d, jobId);
    } catch (e) {
      throw new ErreurFournisseurCertaine(`préparation impossible · rien n’est envoyé (${(e as Error).message.slice(0, 160)})`);
    }
    if (!prep.ok) throw new ErreurFournisseurCertaine(`tâche bloquée avant envoi · ${prep.motif}`);
    const url = urlSoumissionFal(this.queueUrl, prep.modele);
    if (!url) throw new ErreurFournisseurCertaine('adresse de file fal hors liste · rien n’est envoyé');

    return this.barriere.sousPlafondStudio({ workspaceId: prep.workspaceId, jobId, usd: cout.usd, modele: cout.poste }, async () => {
      this.noter({ appel: 'soumettre', detail: `${prep.modele} · ${d.cleIdempotence}` });
      let res: Response;
      try {
        res = await this.f(url, {
          method: 'POST', headers: this.entetes(true), body: JSON.stringify(prep.corps),
          redirect: 'manual', signal: AbortSignal.timeout(DELAI_SOUMISSION_FAL_MS),
        });
      } catch (e) {
        const issue = issueErreurReseau(e);
        if (issue === 'certaine') throw new ErreurFournisseurCertaine('connexion à fal impossible · rien n’est parti');
        throw new ErreurFournisseurIncertaine('réponse de fal perdue après envoi · la requête a pu être acceptée');
      }
      const issue = issueStatutSoumission(res.status);
      if (issue === 'certaine') throw new ErreurFournisseurCertaine(`fal a refusé la demande (HTTP ${res.status})`);
      if (issue === 'incertaine') throw new ErreurFournisseurIncertaine(`réponse ambiguë de fal (HTTP ${res.status}) · la requête a pu être acceptée`);
      let corps: unknown;
      try { corps = await res.json(); } catch { throw new ErreurFournisseurIncertaine('demande acceptée par fal, réponse coupée ou illisible'); }
      const s = lireSoumissionFal(corps);
      const id = s ? idRequeteFal(d.cleIdempotence, prep.modele, s, this.queueUrl) : null;
      if (!id) throw new ErreurFournisseurIncertaine('demande acceptée par fal sans identifiant exploitable');
      return { requestId: id };
    });
  }

  /* ───────────────────────────── Suivre ────────────────────────────────── */

  async statut(requestId: string): Promise<StatutFournisseur> {
    const r = lireIdRequeteFal(requestId, this.queueUrl);
    if (!r) return { etat: 'inconnu' };
    const now = this.horloge().getTime();
    const s = this.sondages.get(requestId);
    if (s && now < s.prochain) return { etat: 'en_cours' };
    const reculer = () => {
      const lectures = (s?.lectures ?? 0) + 1;
      this.sondages.set(requestId, { lectures, prochain: now + delaiSondageMs(lectures - 1) });
    };

    let st: { status: number; corps: unknown };
    try {
      st = await this.lireJson(r.statusUrl);
    } catch {
      reculer();
      return { etat: 'en_cours' };
    }
    this.noter({ appel: 'statut', detail: String(st.status) });
    const l = lireStatutFal(st.status, st.corps);
    if (l.etat === 'inconnu') return { etat: 'inconnu' };
    if (l.etat === 'transitoire' || l.etat === 'en_cours') {
      reculer();
      return l.etat === 'en_cours' && typeof l.progression === 'number' ? { etat: 'en_cours', progression: l.progression } : { etat: 'en_cours' };
    }

    let rr: { status: number; corps: unknown };
    try {
      rr = await this.lireJson(r.responseUrl);
    } catch {
      reculer();
      return { etat: 'en_cours' };
    }
    const res = lireResultatFal(rr.status, rr.corps);
    const jobId = jobDeCleFournisseur(r.cle);
    switch (res.etat) {
      case 'reussi': {
        this.sondages.delete(requestId);
        const ops = jobId ? await this.operationsDuJob(jobId) : [];
        const sorties = res.urls.slice(0, ops.length).map((_, i) => ({ operation: ops[i]!, ref: refSortieFal(i), constat: null }));
        if (sorties.length === 0) return { etat: 'echoue', facture: true, coutUsdMicros: null, motif: 'aucune sortie rattachable à une opération du job' };
        return { etat: 'reussi', sorties, coutUsdMicros: null };
      }
      case 'echoue':
        this.sondages.delete(requestId);
        if (!res.facture && jobId) await this.barriere.rendrePourJob(jobId);
        return { etat: 'echoue', facture: res.facture, coutUsdMicros: null, motif: res.motif };
      case 'annule':
        this.sondages.delete(requestId);
        return { etat: 'annule', facture: res.facture, coutUsdMicros: null };
      case 'inconnu':
        return { etat: 'inconnu' };
      default:
        reculer();
        return { etat: 'en_cours' };
    }
  }

  async annuler(requestId: string): Promise<void> {
    const r = lireIdRequeteFal(requestId, this.queueUrl);
    if (!r) return;
    try {
      const res = await this.f(r.annulationUrl, { method: 'PUT', headers: this.entetes(), redirect: 'error', signal: AbortSignal.timeout(DELAI_LECTURE_FAL_MS) });
      this.noter({ appel: 'annuler', detail: String(res.status) });
    } catch {
      // Le statut relu juste après dira l'issue · une annulation non transmise ne promet rien.
      this.noter({ appel: 'annuler', detail: 'non transmise' });
    }
    this.sondages.delete(requestId);
  }

  /* ──────────────────────────── Télécharger ────────────────────────────── */

  async telecharger(requestId: string, ref: string): Promise<{ octets: Uint8Array; mimeAnnonce: string }> {
    const r = lireIdRequeteFal(requestId, this.queueUrl);
    const i = indiceSortieFal(ref);
    if (!r || i === null) throw new ErreurFournisseurCertaine('référence de sortie illisible');
    let rr: { status: number; corps: unknown };
    try {
      rr = await this.lireJson(r.responseUrl);
    } catch {
      throw new ErreurFournisseurIncertaine('résultat fal momentanément illisible');
    }
    if (rr.status === 404 || rr.status === 410) throw new ErreurFournisseurCertaine(`résultat expiré chez fal (HTTP ${rr.status})`);
    const res = lireResultatFal(rr.status, rr.corps);
    if (res.etat !== 'reussi') throw new ErreurFournisseurIncertaine(`résultat fal non lisible (${res.etat})`);
    const brut = res.urls[i];
    const u = brut ? urlSortieFalSure(brut) : null;
    if (!u) throw new ErreurFournisseurCertaine('adresse de sortie hors des hôtes fal autorisés · rien n’est téléchargé');
    if (!(await this.verifierAdresse(u).catch(() => false))) throw new ErreurFournisseurCertaine('adresse de sortie non publique · rien n’est téléchargé');

    let res2: Response;
    try {
      // Aucune clé vers l'hôte des médias · aucune redirection suivie.
      res2 = await this.f(u.toString(), { redirect: 'manual', signal: AbortSignal.timeout(DELAI_TELECHARGEMENT_FAL_MS) });
    } catch {
      throw new ErreurFournisseurIncertaine('téléchargement interrompu');
    }
    if (res2.status >= 300 && res2.status < 400) throw new ErreurFournisseurCertaine('redirection refusée au téléchargement');
    if (res2.status === 404 || res2.status === 410) throw new ErreurFournisseurCertaine(`sortie introuvable (HTTP ${res2.status})`);
    if (!res2.ok) throw new ErreurFournisseurIncertaine(`téléchargement refusé pour l’instant (HTTP ${res2.status})`);
    const annonce = Number(res2.headers.get('content-length') ?? '');
    if (Number.isFinite(annonce) && annonce > this.octetsMax) throw new ErreurFournisseurCertaine(`sortie trop volumineuse (${annonce} octets annoncés)`);
    const octets = await this.lireBorne(res2);
    if (Number.isFinite(annonce) && annonce > 0 && octets.length !== annonce) {
      throw new ErreurFournisseurIncertaine(`transfert coupé (${octets.length} octets sur ${annonce})`);
    }
    // Le type est RELU dans les octets ; le type annoncé par l'hôte n'est jamais cru.
    return { octets, mimeAnnonce: inspecterMedia(octets)?.mime ?? 'application/octet-stream' };
  }

  /* ─────────────────────────────── Outils ──────────────────────────────── */

  private async lireJson(url: string): Promise<{ status: number; corps: unknown }> {
    const res = await this.f(url, { headers: this.entetes(), redirect: 'error', signal: AbortSignal.timeout(DELAI_LECTURE_FAL_MS) });
    let corps: unknown = null;
    try { corps = await res.json(); } catch { corps = null; }
    return { status: res.status, corps };
  }

  /** Lit le corps en flux, coupe au-delà du plafond · jamais tout en mémoire d'abord. */
  private async lireBorne(res: Response): Promise<Uint8Array> {
    const morceaux: Uint8Array[] = [];
    let total = 0;
    if (!res.body) return new Uint8Array(await res.arrayBuffer().catch(() => new ArrayBuffer(0)));
    const lecteur = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        total += value.length;
        if (total > this.octetsMax) {
          await lecteur.cancel().catch(() => {});
          throw new ErreurFournisseurCertaine(`sortie trop volumineuse (plus de ${this.octetsMax} octets)`);
        }
        morceaux.push(value);
      }
    } catch (e) {
      if (e instanceof ErreurFournisseurCertaine) throw e;
      throw new ErreurFournisseurIncertaine('transfert coupé pendant la lecture');
    }
    const out = new Uint8Array(total);
    let k = 0;
    for (const m of morceaux) { out.set(m, k); k += m.length; }
    return out;
  }
}

export { BarriereDepenseStudio, DepenseRefusee, ACTION_DEPENSE_STUDIO, type PortDepense, type ImputationStudio } from './plafond-depense';
