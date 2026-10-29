'use client';

import { useEffect, useRef, useState } from 'react';
import { detailSansEtat, infoEtapeNouveau, libelleCredits } from '@tiktrends/core';
import { lireParcoursImage } from '../../../../app/actions/studios/image';
import { creerVariante, listerVariantes } from '../../../../app/actions/studios/variantes';
import type { JobImageVue } from '../../../../lib/studios/image/parcours';
import { Ic, Lien } from '../../../communs';
import { Ornement } from '../Ornement';

/**
 * « Tes créations » (porté de la V5 `EtatCreationAssistant`) · les tâches
 * RÉELLES lancées à l'étape précédente, relues toutes les 3 s tant qu'une
 * travaille ; aucune autre tâche, aucun score inventé. « Garder » crée une
 * variante (`creerVariante`) sans accepter le contrôle qualité ; une réponse
 * perdue bloque tout nouveau geste avant relecture.
 */

const RELECTURE_MS = 3_000;
const CLASSE_ETAT: Record<string, string> = { completed: 'g', failed: 'w', reconciliation_required: 'w', cancel_requested: 'w', cancelled: '' };

function format(job: JobImageVue) {
  const m = job.media;
  if (!m?.largeur || !m.hauteur) return null;
  const pgcd = (a: number, b: number): number => (b ? pgcd(b, a % b) : a);
  const d = pgcd(m.largeur, m.hauteur);
  return `${m.largeur / d}:${m.hauteur / d}`;
}

export function Creations({ projectId, jobIds }: { projectId: string; jobIds: string[] }) {
  const idsCle = [...new Set(jobIds)].join('|');
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
    let actif = true; let minuterie: ReturnType<typeof setTimeout> | undefined;
    setJobs([]); setErreur(null);
    const ids = idsCle.split('|').filter(Boolean);
    async function lire() {
      try {
        const r = await lireParcoursImage({ projectId, jobIds: ids });
        if (!actif) return;
        if (!r.ok) { setErreur(r.message); return; }
        const courants = ids.flatMap((id) => r.vue.jobs.filter((j) => j.id === id));
        setJobs(courants);
        setErreur(courants.length !== ids.length || !ids.length ? 'Certaines tâches n’apparaissent pas dans les dernières créations. Ouvre le projet pour consulter leur état.' : null);
        if (courants.some((j) => !j.terminal)) minuterie = setTimeout(() => void lire(), RELECTURE_MS);
      } catch { if (actif) setErreur('L’état des créations n’a pas pu être relu. Vérifie les tâches avant toute nouvelle demande.'); }
    }
    void lire();
    return () => { actif = false; if (minuterie) clearTimeout(minuterie); };
  }, [projectId, idsCle, essai]);

  useEffect(() => {
    let actif = true;
    setGardes([]); setPeutGarder(false);
    void listerVariantes({ projectId }).then((r) => {
      if (!actif) return;
      if (!r.ok) { setRetour(r.message); return; }
      setGardes(r.donnees.variantes.map((v) => v.assetId)); setPeutGarder(r.donnees.droits.proposer); setIncertain(false);
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
      setGardes(relu.donnees.variantes.map((v) => v.assetId)); setPeutGarder(relu.donnees.droits.proposer);
      setRetour(r.deja ? 'Cette création était déjà gardée.' : 'Création gardée comme variante.');
    } catch { setIncertain(true); setRetour('Réponse interrompue · résultat inconnu. Actualise la sélection avant de recommencer.'); }
    finally { verrou.current = false; setOccupe(null); }
  }

  const formats = [...new Set(jobs.map(format).filter((f): f is string => !!f))];
  const visibles = jobs.filter((j) => filtre === 'Toutes' || !j.media || format(j) === filtre);
  const selection = jobs.filter((j) => j.media && gardes.includes(j.media.assetId)).length;

  return (
    <div data-zone="assistant-creation" className="wz" style={{ maxWidth: 'none' }}>
      <p className="muted" role="status" style={{ fontSize: '12.5px' }}>{jobs.filter((j) => j.media).length} image(s) disponible(s) · {jobs.filter((j) => !j.terminal).length} tâche(s) en cours</p>
      <div className="seg" role="group" aria-label="Formats des créations">
        {['Toutes', ...formats].map((f) => <button type="button" key={f} aria-pressed={filtre === f} onClick={() => setFiltre(f)}>{f} ({f === 'Toutes' ? jobs.length : jobs.filter((j) => format(j) === f).length})</button>)}
      </div>
      {erreur && <div className="banner" role="alert"><Ic n="x" /><span>{erreur}</span></div>}
      {!jobs.length && !erreur && <p className="faint" role="status" style={{ fontSize: '12.5px' }}>Lecture des tâches…</p>}
      <div className="grid3">
        {visibles.map((job, i) => {
          const garde = !!job.media && gardes.includes(job.media.assetId);
          return (
            <article className="tile" key={job.id} data-job={job.id} style={{ display: 'grid', gap: 8 }}>
              {job.media
                ? <div className={`ad ${garde ? 'won' : ''}`} style={{ aspectRatio: job.media.largeur && job.media.hauteur ? `${job.media.largeur} / ${job.media.hauteur}` : undefined }}><div className="ph"><img src={job.media.url} alt={`Création ${i + 1} du projet`} /></div></div>
                : <p className="muted" role="status" style={{ fontSize: '12.5px' }}><b>{job.libelleEtat}</b>{detailSansEtat(job.libelleEtat, job.message) && ` · ${detailSansEtat(job.libelleEtat, job.message)}`}</p>}
              <div className="kc" style={{ alignItems: 'center' }}>
                <strong style={{ fontSize: 13 }}>{format(job) ?? 'Création'} · {i + 1}</strong>
                <span className={`pill ${CLASSE_ETAT[job.etat] ?? ''}`}>{job.libelleEtat}</span>
                {job.libelleQualite && <span className="pill">{job.libelleQualite}</span>}
              </div>
              <p className="faint" style={{ fontSize: '11.5px' }}>{libelleCredits(job.creditsReserves)} réservés{job.creditsRendus !== null ? ` · ${libelleCredits(job.creditsRendus)} rendus` : ''}{job.media?.largeur && job.media.hauteur ? ` · ${job.media.largeur} × ${job.media.hauteur}` : ''}</p>
              {job.raisonEchec && <p className="muted" role="alert" style={{ fontSize: '12.5px' }}>{job.raisonEchec}</p>}
              {job.media && (
                <div className="kc">
                  <button className="btn sm" type="button" aria-pressed={garde} disabled={!peutGarder || !!occupe || incertain || garde || job.etat !== 'completed' || job.qualite === 'rejected'} onClick={() => void garder(job)}>
                    {occupe === job.media.assetId ? 'Enregistrement…' : garde ? 'Gardée' : 'Garder'}
                  </button>
                </div>
              )}
              {!job.media && job.terminal && <p className="faint" style={{ fontSize: '11.5px' }}>Consulte la tâche et son coût avant toute relance.</p>}
            </article>
          );
        })}
      </div>
      {retour && <p className="muted" role="status" style={{ fontSize: '12.5px' }}>{retour}</p>}
      {(erreur || retour || incertain) && <div className="kc"><button className="btn sm" type="button" disabled={!!occupe} onClick={() => setEssai((e) => e + 1)}>Actualiser l’état · sans génération</button></div>}
      <Ornement>
        {selection >= 2 && <Lien className="btn" href={`/studio/projets/${projectId}#variantes`}>Préparer un lot de test</Lien>}
        <span className="info">{infoEtapeNouveau('creation')}</span>
        <Lien className="btn pri" href={`/studio/projets/${projectId}`}>{jobs.some((j) => j.media) ? 'Ouvrir le projet' : 'Voir le projet et ses tâches'}</Lien>
      </Ornement>
    </div>
  );
}
