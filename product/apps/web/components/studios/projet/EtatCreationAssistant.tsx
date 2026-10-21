'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { lireParcoursImage } from '../../../app/actions/studios/image';
import { creerVariante, listerVariantes } from '../../../app/actions/studios/variantes';
import type { JobImageVue } from '../../../lib/studios/image/parcours';
import { libelleCredits } from '@tiktrends/core';
import { btn, btnGhost } from '../../ui';
import styles from './CreationAssistant.module.css';

function format(job: JobImageVue) {
  const m = job.media;
  if (!m?.largeur || !m.hauteur) return null;
  const pgcd = (a: number, b: number): number => b ? pgcd(b, a % b) : a;
  const d = pgcd(m.largeur, m.hauteur);
  return `${m.largeur / d}:${m.hauteur / d}`;
}

/** Tâches réelles uniquement. Garder crée une variante, sans accepter le contrôle qualité. */
export function EtatCreationAssistant({ projectId, jobId, jobIds, onFermer }: { projectId: string; jobId?: string; jobIds?: string[]; onFermer: () => void }) {
  const idsCle = [...new Set([...(jobIds ?? []), ...(jobId ? [jobId] : [])])].join('|');
  const [jobs, setJobs] = useState<JobImageVue[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);
  const [filtre, setFiltre] = useState('Toutes');
  const [gardes, setGardes] = useState<string[]>([]);
  const [peutGarder, setPeutGarder] = useState(false);
  const [retour, setRetour] = useState<string | null>(null);
  const [incertain, setIncertain] = useState(false);
  const [occupe, setOccupe] = useState<string | null>(null);
  const verrou = useRef(false);

  useEffect(() => {
    let actif = true; let timer: ReturnType<typeof setTimeout> | undefined;
    setJobs([]); setErreur(null);
    const ids = idsCle.split('|').filter(Boolean);
    async function lire() {
      try {
        const r = await lireParcoursImage({ projectId, jobIds: ids });
        if (!actif) return;
        if (!r.ok) { setErreur(r.message); return; }
        const courants = ids.flatMap(id => r.vue.jobs.filter(j => j.id === id));
        setJobs(courants);
        setErreur(courants.length !== ids.length || !ids.length ? 'Certaines tâches n’apparaissent pas dans les dernières créations. Ouvre le projet pour consulter leur état.' : null);
        if (courants.some(j => !j.terminal)) timer = setTimeout(() => void lire(), 3000);
      } catch { if (actif) setErreur('L’état des créations n’a pas pu être relu. Vérifie les tâches avant toute nouvelle demande.'); }
    }
    void lire(); return () => { actif = false; if (timer) clearTimeout(timer); };
  }, [projectId, idsCle, essai]);

  useEffect(() => {
    let actif = true;
    setGardes([]); setPeutGarder(false);
    void listerVariantes({ projectId }).then(r => {
      if (!actif) return;
      if (!r.ok) { setRetour(r.message); return; }
      setGardes(r.donnees.variantes.map(v => v.assetId)); setPeutGarder(r.donnees.droits.proposer); setIncertain(false);
    }).catch(() => { if (actif) setRetour('La sélection n’a pas pu être relue. Actualise avant de garder une création.'); });
    return () => { actif = false; };
  }, [projectId, essai]);

  async function garder(job: JobImageVue) {
    const assetId = job.media?.assetId;
    if (!assetId || verrou.current || !peutGarder || incertain || gardes.includes(assetId) || job.etat !== 'completed' || job.qualite === 'rejected') return;
    verrou.current = true; setOccupe(assetId); setRetour(null);
    try {
      const r = await creerVariante({ assetId });
      if (!r.ok) { setRetour(r.message); return; }
      const relu = await listerVariantes({ projectId });
      if (!relu.ok) { setIncertain(true); setRetour('La variante a été enregistrée, mais la sélection doit être relue.'); return; }
      setGardes(relu.donnees.variantes.map(v => v.assetId)); setPeutGarder(relu.donnees.droits.proposer);
      setRetour(r.deja ? 'Cette création était déjà gardée.' : 'Création gardée comme variante.');
    } catch { setIncertain(true); setRetour('Réponse interrompue : résultat inconnu. Actualise la sélection avant de recommencer.'); }
    finally { verrou.current = false; setOccupe(null); }
  }

  const formats = [...new Set(jobs.map(format).filter((f): f is string => !!f))];
  const visibles = jobs.filter(j => filtre === 'Toutes' || !j.media || format(j) === filtre);
  const selection = jobs.filter(j => j.media && gardes.includes(j.media.assetId)).length;
  return <section data-zone="assistant-creation" className={styles.root}>
    <header className={styles.header}><h2>Vos créations</h2><p role="status">{jobs.filter(j => j.media).length} image(s) disponible(s) · {jobs.filter(j => !j.terminal).length} tâche(s) en cours</p></header>
    <div className={styles.filters} aria-label="Formats des créations">{['Toutes', ...formats].map(f => <button type="button" key={f} aria-pressed={filtre === f} onClick={() => setFiltre(f)}>{f} ({f === 'Toutes' ? jobs.length : jobs.filter(j => format(j) === f).length})</button>)}</div>
    {erreur && <p role="alert">{erreur}</p>}
    {!jobs.length && !erreur && <p role="status">Lecture des tâches…</p>}
    <div className={styles.gallery}>{visibles.map((job, i) => <article className={`${styles.card} ${job.media && gardes.includes(job.media.assetId) ? styles.picked : ''}`} key={job.id}>
      {job.media ? <img className={styles.preview} src={job.media.url} alt={`Création ${i + 1} du projet`} /> : <div className={styles.pending}><strong role="status">{job.libelleEtat}</strong><p>{job.message}</p></div>}
      <div className={styles.body}><div className={styles.row}><strong>{format(job) ?? 'Création'} · {i + 1}</strong><span>{job.libelleQualite}</span></div>
        <p>{job.libelleEtat} · {job.message}</p><p>{libelleCredits(job.creditsReserves)} réservés{job.creditsRendus !== null ? ` · ${libelleCredits(job.creditsRendus)} rendus` : ''}</p>
        {job.media?.largeur && job.media.hauteur ? <small>{job.media.largeur} × {job.media.hauteur}</small> : null}
        {job.raisonEchec && <p role="alert">{job.raisonEchec}</p>}
        {job.media && <button type="button" style={btnGhost} aria-pressed={gardes.includes(job.media.assetId)} disabled={!peutGarder || !!occupe || incertain || gardes.includes(job.media.assetId) || job.etat !== 'completed' || job.qualite === 'rejected'} onClick={() => void garder(job)}>{occupe === job.media.assetId ? 'Enregistrement…' : gardes.includes(job.media.assetId) ? 'Gardée' : 'Garder'}</button>}
        {!job.media && job.terminal && <p>Consulte la tâche et son coût avant toute relance.</p>}
      </div>
    </article>)}</div>
    {retour && <p role="status">{retour}</p>}
    {(erreur || retour || incertain) && <button type="button" style={btnGhost} disabled={!!occupe} onClick={() => setEssai(e => e + 1)}>Actualiser l’état · sans génération</button>}
    <footer className={styles.footer}><button type="button" style={btnGhost} onClick={onFermer}>Fermer</button><div className={styles.row}>{selection >= 2 && <Link href={`/studio/projets/${projectId}#titre-variantes`} style={btnGhost}>Préparer un lot de test</Link>}<Link href={`/studio/projets/${projectId}`} style={btn}>{jobs.some(j => j.media) ? 'Ouvrir dans le canvas' : 'Voir le projet et ses tâches'}</Link></div></footer>
  </section>;
}
