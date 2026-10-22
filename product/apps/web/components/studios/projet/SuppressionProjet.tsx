'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CarteProjet } from '../../../lib/studios/sources/projet';
import styles from './StudiosListe.module.css';
export function SuppressionProjet({ carte, onFermer, onSupprime }: { carte: CarteProjet; onFermer: () => void; onSupprime: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const verrou = useRef(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    const avant = document.activeElement; const el = dialog.current; el?.showModal();
    return () => { el?.close(); if (avant instanceof HTMLElement && avant.isConnected) avant.focus(); };
  }, []);
  async function supprimer() {
    if (verrou.current) return;
    verrou.current = true; setOccupe(true); setErreur('');
    try {
      const { supprimerProjet } = await import('../../../app/actions/studios/archivage');
      const r = await supprimerProjet({ projectId: carte.id });
      if (r.ok) onSupprime(); else setErreur(r.message);
    } catch { setErreur('La réponse du serveur est indisponible. Rechargez la page pour vérifier si le projet a été supprimé.'); }
    finally { verrou.current = false; setOccupe(false); }
  }
  return createPortal(<dialog ref={dialog} className={styles.deleteDialog} aria-labelledby="suppression-titre" aria-describedby="suppression-detail" onCancel={e => { e.preventDefault(); if (!verrou.current) onFermer(); }}>
    <h2 id="suppression-titre">Supprimer ce projet ?</h2><p className={styles.deleteTitle}>{carte.title}</p>
    <p id="suppression-detail">Le projet sera retiré de la liste. Ses créations et son historique seront conservés.</p>
    {erreur && <p role="alert">{erreur}</p>}
    <div className={styles.deleteButtons}><button type="button" autoFocus disabled={occupe} onClick={onFermer}>Annuler</button><button type="button" className={styles.deleteConfirm} disabled={occupe} onClick={supprimer}>{occupe ? 'Suppression…' : 'Supprimer le projet'}</button></div>
  </dialog>, document.body);
}
export function RestaurerProjet({ carte, onRestaure }: { carte: CarteProjet; onRestaure: () => void }) {
  const bouton = useRef<HTMLButtonElement>(null);
  useEffect(() => { bouton.current?.focus(); }, []);
  const verrou = useRef(false); const [occupe, setOccupe] = useState(false); const [erreur, setErreur] = useState('');
  async function restaurer() {
    if (verrou.current) return;
    verrou.current = true; setOccupe(true); setErreur('');
    try {
      const { restaurerProjet } = await import('../../../app/actions/studios/archivage');
      const r = await restaurerProjet({ projectId: carte.id });
      if (r.ok) onRestaure(); else setErreur(r.message);
    } catch { setErreur('Restauration non confirmée. Rechargez la page pour vérifier le projet.'); }
    finally { verrou.current = false; setOccupe(false); }
  }
  return <div className={styles.undoNotice}><span role="status">« {carte.title} » retiré de la liste.</span><button ref={bouton} type="button" disabled={occupe} onClick={restaurer}>{occupe ? 'Restauration…' : 'Annuler la suppression'}</button>{erreur && <span role="alert">{erreur}</span>}</div>;
}
