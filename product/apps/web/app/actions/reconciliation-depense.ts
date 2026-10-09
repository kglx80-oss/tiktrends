'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db, reconcilierDepense, type BaseDepense } from '@tiktrends/db';
import {
  validerSaisieReconciliation, decisionReconciliation,
  type ErreurSaisieReconciliation,
} from '@tiktrends/core';
import { porteDepenses } from '../(app)/admin/depenses/porte';

/**
 * R5 · réconcilier une dépense « à réconcilier » avec la facture du
 * fournisseur · geste PLATEFORME (fondateur), audité, idempotent.
 *
 * Dans l'ordre, et rien ne se lit ni ne s'écrit avant la porte :
 *  1. porte de `/admin/depenses` (`porteDepenses`) · admin d'espace ET
 *     fondateur ; un admin d'espace seul est refusé sans aucun accès en base ;
 *  2. saisie vérifiée par le noyau (`validerSaisieReconciliation`) · montant
 *     exact en micro-unités, devise gérée (USD, aucune conversion inventée),
 *     identifiant de preuve et motif obligatoires, clé d'idempotence ;
 *  3. une transaction (`reconcilierDepense`, `@tiktrends/db`) · verrou sur la
 *     ligne, décision du noyau (`decisionReconciliation`), AJOUT d'une
 *     réconciliation. La ligne `ai_spend` n'est pas touchée.
 *
 * L'audit, ce sont les colonnes de la réconciliation (auteur, date, preuve,
 * motif, montant réservé à l'instant du geste, montant facturé) dans une table
 * en ajout seul · aucune table d'audit plateforme n'existe dans le dépôt.
 */

export interface EtatReconciliationForm {
  statut: 'initial' | 'refus' | 'erreur';
  message: string;
  erreurs?: ErreurSaisieReconciliation[];
}

export async function reconcilierDepenseAction(_prec: EtatReconciliationForm, fd: FormData): Promise<EtatReconciliationForm> {
  const porte = await porteDepenses();
  if (!porte.ok) {
    return { statut: 'refus', message: 'Réservé au fondateur (plateforme) · aucune ligne n’a été lue ni modifiée.' };
  }
  const v = validerSaisieReconciliation({
    ligne: fd.get('ligne'), montant: fd.get('montant'), devise: fd.get('devise'),
    preuve: fd.get('preuve'), motif: fd.get('motif'), cle: fd.get('cle'),
  });
  if (!v.ok) return { statut: 'refus', message: 'Réconciliation refusée · corrige les champs signalés, rien n’a été enregistré.', erreurs: v.erreurs };
  if (!db) return { statut: 'erreur', message: 'Base indisponible · rien n’a été enregistré.' };

  const s = v.saisie;
  let r: Awaited<ReturnType<typeof reconcilierDepense>>;
  try {
    r = await reconcilierDepense(db as unknown as BaseDepense, {
      aiSpendId: s.aiSpendId, billedMicros: s.billedMicros, currency: s.devise, providerRef: s.preuve, reason: s.motif,
      authorId: porte.session.user.id, idempotencyKey: s.cle,
    }, (etat) => decisionReconciliation(etat, s.aiSpendId));
  } catch (e) {
    console.error('[depenses] réconciliation non enregistrée', e instanceof Error ? e.message : e);
    return { statut: 'erreur', message: 'Réconciliation non enregistrée · erreur en base, rien n’a changé.' };
  }
  if (!r.ok) return { statut: 'refus', message: r.message };

  // L'écran relit ce qui EST enregistré (même clé ⇒ même réconciliation, aucun doublon).
  revalidatePath('/admin/depenses');
  revalidatePath('/jarvis/sources');
  redirect(`/admin/depenses?reconciliee=${r.reconciliation.id}${r.statut === 'deja_enregistree' ? '&deja=1' : ''}#reconciliees`);
}
