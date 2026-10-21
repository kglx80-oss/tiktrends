'use client';

import { useRef, useState } from 'react';
import { libelleCredits, libelleUsd, phraseCoutDevis } from '@tiktrends/core';
import { approuverLotImages } from '../../../app/actions/studios/lot-images';
import type { VueLotImages } from '../../../lib/studios/image/lot-images';
import { useAppelPayant, resultatPayantIncertain, MESSAGE_APPEL_PAYANT } from './useAppelPayant';
import { btn, btnGhost } from '../../ui';
import styles from './FormatDevis.module.css';

/** Le serveur approuve le manifeste complet ; aucune boucle de génération côté navigateur. */
export function ConfirmationLotImages({ lot, onModifier, onLance, apercuProduitUrl }: {
  lot: VueLotImages; onModifier: () => void; onLance: (jobIds: string[]) => void; apercuProduitUrl?: string;
}) {
  const [confirme, setConfirme] = useState(false);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const verrou = useRef(false);
  const appel = useAppelPayant(lot.projectId, `lot-images:${lot.id}`);
  async function lancer() {
    if (!confirme || verrou.current || appel.bloque) return;
    const tentative = appel.commencer();
    if (!tentative) return;
    verrou.current = true; setOccupe(true); setErreur('');
    try {
      const r = await approuverLotImages({ lotId: lot.id, empreinte: lot.empreinte, creditsAnnonces: lot.totalCredits, usdMicrosAnnonces: lot.totalUsdMicros, confirme: true });
      appel.terminer(tentative, resultatPayantIncertain(r));
      if (!r.ok) { setErreur(r.message); return; }
      onLance(r.jobs.map(j => j.id));
    } catch {
      appel.terminer(tentative, true);
      setErreur('La réponse du lancement est incertaine. Consulte les tâches du projet avant toute nouvelle demande.');
    } finally { verrou.current = false; setOccupe(false); }
  }
  return <section data-zone="confirmation-lot-images" className={`${styles.column} ${styles.root}`}>
    <header className={styles.heading}><p>Étape 4 sur 5</p><h2>Confirmer la génération</h2><p>Vérifiez les paramètres et le coût avant tout débit.</p></header>
    <div className={styles.confirm}>
      <aside className={styles.summary}>
        {apercuProduitUrl && <img src={apercuProduitUrl} className={styles.product} alt="Photo produit de référence" />}
        <h3>{lot.nombre} images</h3><p>Même format et même consigne validée.</p>
        <dl><div><dt>Crédits du lot</dt><dd>{libelleCredits(lot.totalCredits)}</dd></div><div><dt>Validité</dt><dd>{new Date(lot.expiresAt).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}</dd></div></dl>
      </aside>
      <section className={styles.quote} aria-label="Devis total du lot">
        <h3>Votre devis</h3><strong className={styles.price}>{libelleUsd(lot.totalUsdMicros)}</strong>
        <p>{phraseCoutDevis(lot.totalUsdMicros, lot.qualification)}</p>
        <p>{lot.nombre} sorties · aucune variation d’accroche ou de composition imposée.</p>
        <label><input type="checkbox" checked={confirme} onChange={e=>setConfirme(e.target.checked)} disabled={occupe || appel.bloque} /> J’ai vérifié le devis et je confirme la dépense.</label>
      </section>
    </div>
    {erreur && <p role="alert">{erreur}</p>}
    {appel.bloque && <p role="status">{MESSAGE_APPEL_PAYANT} <a href={`/studio/projets/${lot.projectId}`}>Voir les tâches</a></p>}
    <footer style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><button type="button" style={btnGhost} disabled={occupe || appel.bloque} onClick={onModifier}>‹ Modifier</button><button type="button" style={btn} disabled={!confirme || occupe || appel.bloque} onClick={()=>void lancer()}>{occupe ? 'Lancement…' : `Confirmer et générer ${lot.nombre} images`}</button></footer>
  </section>;
}
