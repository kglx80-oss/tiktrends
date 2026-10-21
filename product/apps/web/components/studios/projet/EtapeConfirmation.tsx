'use client';

import { useState, type CSSProperties } from 'react';
import {
  libelleCredits, libelleUsd, phraseCoutDevis, CIBLE_TACTILE_MIN,
  MESSAGE_LANCEMENT_INCERTAIN, peutConfirmerLancement,
  type ErreurStudio,
} from '@tiktrends/core';
import { approuverEtLancerImage } from '../../../app/actions/studios/image';
import type { DevisImageVue } from '../../../lib/studios/image/parcours';
import type { JobPresente } from '../../../lib/studios/execution/commandes';
import styles from './FormatDevis.module.css';
import { Icon } from '../../Icon';
import { btn, btnGhost } from '../../ui';

/**
 * Étape CONFIRMATION de l'assistant V5 (Lot 2c) · la confirmation payante du rendu
 * (la préparation de consigne a son propre coût explicite).
 *
 *  · le DEVIS serveur réel (lignes, montant, échéance) est affiché AVANT tout
 *    bouton · c'est ce que la personne confirme, pas un exemple ;
 *  · « J'ai vérifié le devis » puis « Confirmer et générer » appellent
 *    `approuverEtLancerImage` (approbation L3, transaction : job + réserve +
 *    outbox + débit, idempotente par la clé du clic) ;
 *  · « Modifier » revient au format · tout changement y INVALIDE ce devis
 *    (nouvel `inputHash` au prochain devis · l'ancien devient `QUOTE_EXPIRED`) ;
 *  · un dépassement du plafond rend `BUDGET_EXCEEDED` · le message le dit, rien
 *    n'est débité.
 */

const note: CSSProperties = { fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };
const titreEtape: CSSProperties = { margin: '2px 0 0', fontSize: 19, fontWeight: 500, color: 'var(--ink)' };
const sectionLbl: CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', margin: 0 };

const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

function messageErreur(r: ErreurStudio): string {
  if (r.violations?.length) return r.violations.map((v) => v.raison).join(' · ');
  return r.message;
}

/** Clé du clic gardée par devis (`sessionStorage`) · double clic / reconnexion ⇒ même job, pas de second débit. */
function cleDuClic(quoteId: string): string {
  const k = `tt-assistant-devis-cle-${quoteId}`;
  try {
    const deja = window.sessionStorage.getItem(k);
    if (deja) return deja;
    const cle = `assist-${crypto.randomUUID()}`;
    window.sessionStorage.setItem(k, cle);
    return cle;
  } catch {
    return `assist-${quoteId}`;
  }
}

export function EtapeConfirmation({ devis, onModifier, onLance, apercuProduitUrl }: {
  apercuProduitUrl?: string;
  devis: DevisImageVue;
  onModifier: () => void;
  onLance: (job: JobPresente) => void;
}) {
  const [verifie, setVerifie] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Réponse PERDUE sur cette mutation PAYANTE · le lancement a PU être accepté et
  // débité · on ne rouvre rien tant que ce n'est pas levé par un rechargement.
  const [incertain, setIncertain] = useState(false);

  async function confirmer() {
    // Garde · état incertain ⇒ aucun nouvel appel, aucune navigation (double débit).
    if (!verifie || occupe || !peutConfirmerLancement(incertain)) return;
    setOccupe(true);
    setErreur(null);
    try {
      const r = await approuverEtLancerImage({ quoteId: devis.id, inputHash: devis.inputHash, creditsAnnonces: devis.credits, idempotencyKey: cleDuClic(devis.id) });
      if (!r.ok) { setErreur(messageErreur(r)); return; }
      onLance(r.job);
    } catch {
      // La réponse réseau est perdue · on ne PROMET PAS une absence de débit.
      setIncertain(true);
      setErreur(MESSAGE_LANCEMENT_INCERTAIN);
    } finally {
      setOccupe(false);
    }
  }

  return (
    <div data-zone="assistant-confirmation" style={{ display: 'grid', gap: 16 }}>
      <div>
        <p style={{ ...note, fontSize: 12 }}>Étape 4 sur 5 · Confirmer la génération</p>
        <h2 style={titreEtape}>Confirmer la génération</h2>
        <p style={note}>Vérifie le devis serveur et le coût avant tout débit. Toute modification invalide ce devis.</p>
      </div>

      <div className={styles.confirm}>
        <aside className={styles.summary} aria-label="Résumé de la génération">{apercuProduitUrl && <img className={styles.product} src={apercuProduitUrl} alt="Photo produit de référence" />}<h3>Ton image est prête à être lancée</h3><p>La consigne relue et le format choisi sont liés à ce devis.</p><dl><div><dt>Livrable</dt><dd>1 image</dd></div><div><dt>Crédits</dt><dd>{libelleCredits(devis.credits)}</dd></div><div><dt>Validité</dt><dd>Jusqu’à {heure(devis.expiresAt)}</dd></div></dl><p>Modifier tes choix nécessite un nouveau devis.</p></aside>
      <section aria-label="Devis serveur" data-devis={devis.id} style={{ display: 'grid', gap: 10, border: '1px solid var(--line)', borderRadius: 12, padding: 16, background: 'var(--surface)' }}>
        <span style={sectionLbl}>Devis serveur</span>
        <p data-prix="devis" style={{ margin: 0, fontSize: 15, color: 'var(--ink)' }}>
          <strong className={styles.price}>{phraseCoutDevis(devis.usdMicros, devis.qualification)}</strong> · {libelleCredits(devis.credits)} · valable jusqu’à {heure(devis.expiresAt)}
        </p>
        <ul data-lignes="devis" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {devis.lignes.map((l, i) => (
            <li key={i} data-ligne-nature={l.natureCout} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13.5, color: 'var(--ink-2)' }}>
              <span>{l.libelle}</span>
              <span style={{ color: 'var(--ink)' }}>{libelleUsd(l.usdMicros)}{l.natureCout === 'borne' ? '' : ' · estimation'}</span>
            </li>
          ))}
        </ul>
        <p style={{ ...note, fontSize: 12 }}>Montant calculé par le serveur sur ces paramètres exacts · aucun débit avant ta confirmation.</p>
      </section></div>

      <label data-champ="verifie" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: CIBLE_TACTILE_MIN, fontSize: 14, color: 'var(--ink)' }}>
        <input type="checkbox" disabled={occupe || incertain} checked={verifie} onChange={(e) => setVerifie(e.target.checked)} style={{ width: 20, height: 20 }} />
        <span>J’ai vérifié le devis et je confirme la dépense.</span>
      </label>

      {erreur && <p role="alert" data-etat="erreur" style={{ margin: 0, fontSize: 13.5, color: 'var(--err-text)' }}>{erreur}</p>}

      <footer style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 4 }}>
        <button type="button" data-bouton="modifier" onClick={onModifier} disabled={occupe || incertain} style={{ ...btnGhost, minHeight: CIBLE_TACTILE_MIN, opacity: (occupe || incertain) ? 0.55 : 1 }}>‹ Modifier</button>
        <button type="button" data-bouton="confirmer-generer" onClick={() => void confirmer()} disabled={!verifie || occupe || incertain}
          style={{ ...btn, minHeight: CIBLE_TACTILE_MIN, opacity: (!verifie || occupe || incertain) ? 0.55 : 1 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="spark" size={14} />{occupe ? 'Lancement…' : `Confirmer et générer · ${libelleCredits(devis.credits)}`}</span>
        </button>
      </footer>
    </div>
  );
}
