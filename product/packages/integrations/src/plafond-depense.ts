/**
 * Barrière de dépense des processus hors web (worker des studios).
 *
 * Le worker ne peut pas importer `apps/web/lib/spend-guard.ts` (`server-only`) :
 * il applique ici la MÊME règle, par la MÊME réservation que le site, à travers
 * un port vers la base (`@tiktrends/db` · `reserverDepense` / `annulerDepense`,
 * celles que `spend-guard.ts` appelle aussi depuis la correction R2) :
 *
 *  · plafond `AI_SPEND_CAP_USD` lu comme `spendCapUsd()` (`plafondDepenseUsd`) ;
 *  · fenêtre glissante de 30 jours, somme de `ai_spend.actual_usd` ;
 *  · décision `checkBudget` du noyau (la fonction que la barrière web appelle) ;
 *  · coût pris AVANT l'appel, rendu (`actual_usd = 0`) seulement si l'échec est
 *    CERTAIN, gardé si l'issue est incertaine (la requête a pu être facturée).
 *
 * Les lignes web et worker tombent dans la même somme ET passent par le même
 * verrou consultatif : UN seul plafond, qu'aucune course site/worker ne dépasse.
 * Cumul prouvé en base par `apps/web/test/fa-plafond-commun.test.ts`, course
 * mixte sur PostgreSQL réel par `apps/web/test/fa-course-mixte-pg.test.ts`.
 */

import {
  checkBudget, plafondDepenseUsd, debutFenetrePlafond, idDepenseDuJob, estErreurCertaine,
  ErreurFournisseurCertaine, ErreurFournisseurIncertaine,
} from '@tiktrends/core';

/** Le port vers `ai_spend` · réalisé par `@tiktrends/db` en production, en mémoire dans les tests unitaires. */
export interface PortDepense {
  reserver(
    ligne: { id: string; workspaceId: string | null; provider: string; model: string | null; action: string; usd: number },
    o: { depuis: Date; decider: (depenseUsd: number) => { allowed: boolean; reason: string } },
  ): Promise<{ ok: true; depenseAvantUsd: number } | { ok: false; raison: string; dejaEngagee: boolean }>;
  annuler(id: string): Promise<boolean>;
}

/** Libellé `ai_spend.action` des générations du worker studio. */
export const ACTION_DEPENSE_STUDIO = 'studio.generation';

/** Refus de la barrière · CERTAIN : rien n'est parti, rien n'est dû. */
export class DepenseRefusee extends ErreurFournisseurCertaine {
  readonly code = 'BUDGET_EXCEEDED' as const;
  constructor(message: string) { super(message); this.name = 'DepenseRefusee'; }
}

export interface ImputationStudio {
  workspaceId: string;
  jobId: string;
  /** Coût plafond de la soumission, en dollars (`coutSoumissionImage`). */
  usd: number;
  /** `FixedCostKind` · même libellé de modèle que les lignes fal du web. */
  modele: 'fal_image' | 'fal_video';
}

export class BarriereDepenseStudio {
  private readonly port: PortDepense;
  private readonly env: Readonly<Record<string, string | undefined>>;
  private readonly horloge: () => Date;

  constructor(o: { port: PortDepense; env?: Readonly<Record<string, string | undefined>>; horloge?: () => Date }) {
    if (!o?.port) throw new Error('barrière de dépense sans registre · refusée');
    this.port = o.port;
    this.env = o.env ?? process.env;
    this.horloge = o.horloge ?? (() => new Date());
  }

  /** Le plafond en vigueur, lu à chaque réservation (comme `spendStatus()`). */
  plafondUsd(): number { return plafondDepenseUsd(this.env.AI_SPEND_CAP_USD); }

  /**
   * Exécute un appel payant sous le plafond. L'appel doit lever une
   * `ErreurFournisseurCertaine` quand on SAIT que rien n'a été accepté (la
   * dépense est rendue) ; toute autre erreur garde la dépense.
   */
  async sousPlafondStudio<T>(imp: ImputationStudio, appel: () => Promise<T>): Promise<T> {
    const id = idDepenseDuJob(imp.jobId);
    const cap = this.plafondUsd();
    let r: Awaited<ReturnType<PortDepense['reserver']>>;
    try {
      r = await this.port.reserver(
        { id, workspaceId: imp.workspaceId, provider: 'fal', model: imp.modele, action: ACTION_DEPENSE_STUDIO, usd: imp.usd },
        { depuis: debutFenetrePlafond(this.horloge()), decider: (depense) => checkBudget({ spentUsd: depense, capUsd: cap }, imp.usd) },
      );
    } catch (e) {
      // En cas de doute, on refuse (même parti pris que la barrière web) : rien ne part.
      throw new DepenseRefusee(`compteur de dépense injoignable · rien n’est envoyé (${(e as Error).message.slice(0, 120)})`);
    }
    if (!r.ok) {
      // Une soumission déjà engagée pour ce job : son issue est inconnue d'ici,
      // jamais une seconde soumission, jamais un « certain » qui rendrait sa dépense.
      if (r.dejaEngagee) throw new ErreurFournisseurIncertaine(`${r.raison} · réconciliation, aucune seconde soumission`);
      throw new DepenseRefusee(r.raison);
    }
    try {
      return await appel();
    } catch (e) {
      if (estErreurCertaine(e)) await this.port.annuler(id).catch(() => false);
      throw e;
    }
  }

  /** Rend la dépense d'un job dont le fournisseur a dit, plus tard, qu'il n'a rien facturé. */
  async rendrePourJob(jobId: string): Promise<boolean> {
    return this.port.annuler(idDepenseDuJob(jobId)).catch(() => false);
  }
}
