'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { lireParcoursImage } from '../../../app/actions/studios/image';
import type { JobImageVue } from '../../../lib/studios/image/parcours';
import { libelleCredits } from '@tiktrends/core';
import { btn, btnGhost } from '../../ui';
import styles from './FormatDevis.module.css';

/** Lecture seule de la tâche réellement lancée. Aucun contrôle qualité ni relance automatique. */
export function EtatCreationAssistant({ projectId, jobId, onFermer }: { projectId: string; jobId: string; onFermer: () => void }) {
  const [job, setJob] = useState<JobImageVue | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    let actif = true; let timer: ReturnType<typeof setTimeout> | undefined;
    async function lire() {
      try {
        const r = await lireParcoursImage({ projectId });
        if (!actif) return;
        if (!r.ok) { setErreur(r.message); return; }
        const courant = r.vue.jobs.find(j => j.id === jobId);
        if (!courant) { setErreur('Cette tâche n’apparaît pas dans les dernières créations. Ouvre le projet pour consulter son état.'); return; }
        setJob(courant); setErreur(null);
        if (!courant.terminal) timer = setTimeout(() => void lire(), 3000);
      } catch { if (actif) setErreur('L’état de la création n’a pas pu être relu. Vérifie la tâche avant toute nouvelle demande.'); }
    }
    void lire(); return () => { actif = false; if (timer) clearTimeout(timer); };
  }, [projectId, jobId, essai]);
  return <section data-zone="assistant-creation" className={styles.column}>
    <header><p>Étape 5 sur 5 · Création</p><h2>{job?.media ? 'Ton image' : job?.libelleEtat || 'Suivi de ta création'}</h2></header>
    {erreur && <div role="alert"><p>{erreur}</p><button type="button" style={btnGhost} onClick={() => setEssai(e => e + 1)}>Actualiser l’état · sans génération</button></div>}
    {!job && !erreur && <p role="status">Lecture de la tâche…</p>}
    {job && <>
      <div className={styles.review}><strong role="status">{job.libelleEtat}</strong><p>{job.message}</p><p>{libelleCredits(job.creditsReserves)} réservés{job.creditsRendus !== null ? ` · ${libelleCredits(job.creditsRendus)} rendus` : ''}</p>{job.raisonEchec && <p role="alert">{job.raisonEchec}</p>}</div>
      {job.media && <figure style={{margin:0}}><img src={job.media.url} alt="Image générée pour ce projet" style={{display:'block',maxWidth:'100%',maxHeight:420,objectFit:'contain',borderRadius:16}} /><figcaption>{job.media.largeur && job.media.hauteur ? `${job.media.largeur} × ${job.media.hauteur} · ` : ''}{job.libelleQualite}</figcaption></figure>}
      {!job.media && job.terminal && <p>Consulte la tâche et son coût avant toute relance.</p>}
    </>}
    <footer style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'space-between'}}><button type="button" style={btnGhost} onClick={onFermer}>Fermer</button><Link href={`/studio/projets/${projectId}${job?.media ? '/image' : ''}`} style={btn}>{job?.media ? 'Ouvrir dans le Studio' : 'Voir le projet et ses tâches'}</Link></footer>
  </section>;
}
