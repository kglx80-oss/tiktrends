'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LARGEUR_MIN_TABLE_TELEPHONE, LONGUEUR_MAX_TEXTE_INCIDENT, LONGUEUR_MAX_TITRE_INCIDENT, styleTableDefilante, type ErreurIncident } from '@tiktrends/core';
import { Lien } from '../../communs';
import { annoterIncidentAction, cloreIncidentAction, ouvrirIncidentAction, type ResultatIncident } from '../../../app/actions/tour-controle';
import { boutonAction, replacerFocus } from '../projet/action-serveur';
import { BoutonExportTour, type EtatExport } from './client';
import { Vide } from './base';

/**
 * « Incidents déclarés » (lot 14 · RJ IN01, IN02) · déclarer, annoter, clore,
 * sur les incidents RÉELS lus après la porte (`platform_incidents`). Chaque
 * geste passe par son action serveur (`porteAdminGeste`) puis relit la page ·
 * rien n'est simulé, rien ne se supprime. Un module client n'exporte que des
 * composants ou des types (garde `spatial-fondation`).
 */

export interface IncidentDetaille {
  id: string;
  /** Une cellule par colonne · le texte exact de la table, et de l'export. */
  cellules: readonly string[];
  classeGravite: '' | 'w' | 'r';
  classeEtat: '' | 'w' | 'g';
  constat: string;
  notes: ReadonlyArray<{ texte: string; auteur: string; quand: string }>;
  annoter: { permis: boolean; raison: string | null };
  clore: { permis: boolean; raison: string | null };
}

export interface PropsIncidentsDeclares {
  colonnes: readonly string[];
  segments: ReadonlyArray<{ cle: string; libelle: string; href: string; actif: boolean }>;
  segment: string;
  definition: string;
  lignes: readonly IncidentDetaille[];
  /** Incidents déclarés, tous segments · pour dire pourquoi la liste est vide. */
  total: number;
  limite: string | null;
  export: EtatExport;
  causes: ReadonlyArray<{ cle: string; libelle: string }>;
  causeProposee: string | null;
}

const COLONNES_GRILLE = 'minmax(0,1.6fr) .7fr .7fr .9fr .7fr .9fr .4fr .7fr minmax(0,1.4fr)';

/** Le message d'un geste · la phrase de l'action, puis les champs signalés. */
const texteRetour = (r: ResultatIncident) => (r.ok ? r.message : [r.message, ...(r.erreurs ?? []).map((e: ErreurIncident) => e.message)].join(' '));

export function IncidentsDeclares(p: PropsIncidentsDeclares) {
  const router = useRouter();
  const [occupe, setOccupe] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ cle: string; ok: boolean; texte: string } | null>(null);
  const [titre, setTitre] = useState('');
  const [gravite, setGravite] = useState('majeure');
  const [cause, setCause] = useState(p.causeProposee ?? '');
  const [constat, setConstat] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  // Le focus à replacer quand la liste RELUE sera rendue (correctif #1065) · un `setTimeout(0)` seul peut passer avant ce rendu.
  const focusApresVue = useRef<string[] | null>(null);
  useEffect(() => {
    const cibles = focusApresVue.current;
    if (!cibles) return;
    focusApresVue.current = null;
    replacerFocus('si-perdu', ...cibles);
  }, [p.lignes]);

  async function geste(cle: string, action: () => Promise<ResultatIncident>, apres: (r: Extract<ResultatIncident, { ok: true }>) => void, focus: string[]) {
    if (occupe) return;
    setOccupe(cle); setRetour(null);
    try {
      const r = await action();
      setRetour({ cle, ok: r.ok, texte: texteRetour(r) });
      if (r.ok) { apres(r); router.refresh(); }
    } catch {
      setRetour({ cle, ok: false, texte: 'Le serveur n’a pas répondu · rien n’a été confirmé. Recharge avant de réessayer.' });
    } finally {
      setOccupe(null);
      focusApresVue.current = focus;
      replacerFocus('si-perdu', ...focus);
    }
  }

  const message = (cle: string) => (retour?.cle === cle ? <p role={retour.ok ? 'status' : 'alert'} className="faint" data-retour={cle} style={{ fontSize: '12.5px', margin: '6px 0 0' }}>{retour.texte}</p> : null);

  return (
    <>
      <section className="tile sec" data-section="incidents-declares">
        <div className="sech">
          <h2>Incidents déclarés</h2>
          <span className="faint" style={{ marginLeft: 'auto', fontSize: '12.5px' }}>{p.definition}</span>
          <BoutonExportTour entree={{ ecran: 'incidents', segment: p.segment }} etat={p.export} unite={{ un: 'incident', plusieurs: 'incidents' }} />
        </div>
        <nav className="kc" aria-label="État des incidents" style={{ marginBottom: 12 }}>
          {p.segments.map((s) => <Lien key={s.cle} className="chip" href={s.href} aria-current={s.actif ? 'page' : undefined} data-segment-incident={s.cle}>{s.libelle}</Lien>)}
        </nav>
        <div className="atable" data-table="incidents" style={styleTableDefilante(LARGEUR_MIN_TABLE_TELEPHONE.declarations)}>
          <div className="atr ath" style={{ gridTemplateColumns: COLONNES_GRILLE }}>{p.colonnes.map((c) => <span key={c}>{c}</span>)}</div>
          {p.lignes.map((l) => (
            <div key={l.id} id={`incident-${l.id}`} data-incident={l.id}>
              <div className="atr" style={{ gridTemplateColumns: COLONNES_GRILLE }} data-ligne-incident={l.id}>
                {l.cellules.map((c, i) => (
                  <span key={i} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                    {i === 0 ? <b>{c}</b> : i === 1 ? <span className={`pill ${l.classeGravite}`}>{c}</span> : i === 2 ? <span className={`pill ${l.classeEtat}`}>{c}</span> : c}
                  </span>
                ))}
              </div>
              <details style={{ padding: '0 0 10px' }}>
                <summary className="btn sm" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center' }}>Constat, notes et gestes</summary>
                <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                  <p style={{ margin: 0, fontSize: '13px', whiteSpace: 'pre-wrap' }}><b>Constat · </b>{l.constat}</p>
                  {l.notes.length > 0 ? (
                    <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }} data-notes={l.id}>
                      {l.notes.map((n, i) => <li key={i} style={{ fontSize: '12.5px' }}><span style={{ whiteSpace: 'pre-wrap' }}>{n.texte}</span> <small className="faint">· {n.auteur} · {n.quand}</small></li>)}
                    </ol>
                  ) : <p className="faint" style={{ margin: 0, fontSize: '12.5px' }}>Aucune note pour l’instant.</p>}
                  <label className="field">Ajouter une note
                    <textarea className="ta" id={`note-${l.id}`} rows={2} maxLength={LONGUEUR_MAX_TEXTE_INCIDENT} value={notes[l.id] ?? ''} disabled={!l.annoter.permis} onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })} />
                  </label>
                  <div className="kc" style={{ alignItems: 'center' }}>
                    <button type="button" className="btn sm" data-geste="annoter" {...boutonAction({
                      presse: occupe === `annoter-${l.id}`, occupe: !!occupe, ferme: !l.annoter.permis, focalisable: 'tout',
                      surClic: () => { void geste(`annoter-${l.id}`, () => annoterIncidentAction({ id: l.id, texte: notes[l.id] ?? '' }), () => setNotes({ ...notes, [l.id]: '' }), [`#note-${l.id}`, `#incident-${l.id} summary`]); },
                    })}>{occupe === `annoter-${l.id}` ? 'Enregistrement…' : 'Ajouter la note'}</button>
                    {l.annoter.raison && <small className="faint">{l.annoter.raison}</small>}
                  </div>
                  {message(`annoter-${l.id}`)}
                  {l.clore.permis && (
                    <label className="field">Comment il s’est résolu
                      <textarea className="ta" id={`resolution-${l.id}`} rows={2} maxLength={LONGUEUR_MAX_TEXTE_INCIDENT} value={resolutions[l.id] ?? ''} onChange={(e) => setResolutions({ ...resolutions, [l.id]: e.target.value })} />
                    </label>
                  )}
                  <div className="kc" style={{ alignItems: 'center' }}>
                    <button type="button" className="btn sm" data-geste="clore" {...boutonAction({
                      presse: occupe === `clore-${l.id}`, occupe: !!occupe, ferme: !l.clore.permis, focalisable: 'tout',
                      surClic: () => { void geste(`clore-${l.id}`, () => cloreIncidentAction({ id: l.id, resolution: resolutions[l.id] ?? '' }), () => setResolutions({ ...resolutions, [l.id]: '' }), [`#incident-${l.id} [data-geste="clore"]`, `#incident-${l.id} summary`]); },
                    })}>{occupe === `clore-${l.id}` ? 'Clôture…' : 'Clore l’incident'}</button>
                    {l.clore.raison && <small className="faint">{l.clore.raison}</small>}
                  </div>
                  {message(`clore-${l.id}`)}
                </div>
              </details>
            </div>
          ))}
          {p.lignes.length === 0 && <Vide>{p.total ? 'Aucun incident dans cet état.' : 'Aucun incident déclaré · déclare-en un ci-dessous quand un échec touche des clients.'}</Vide>}
        </div>
        {p.limite && <p className="faint" style={{ fontSize: '11.5px', margin: '10px 0 0' }}>{p.limite}</p>}
      </section>
      <section className="tile sec" id="declarer" data-section="declarer-incident">
        <div className="sech"><h2>Déclarer un incident</h2><span className="faint" style={{ marginLeft: 'auto', fontSize: '12.5px' }}>Visible de l’équipe plateforme seulement · aucun client n’est prévenu d’ici.</span></div>
        <div className="fields" style={{ display: 'grid', gap: 10 }}>
          <label className="field">Titre
            <input id="incident-titre" type="text" maxLength={LONGUEUR_MAX_TITRE_INCIDENT} value={titre} onChange={(e) => setTitre(e.target.value)} autoComplete="off" />
          </label>
          <label className="field">Gravité
            <select id="incident-gravite" value={gravite} onChange={(e) => setGravite(e.target.value)}>
              <option value="mineure">Mineure</option><option value="majeure">Majeure</option><option value="critique">Critique</option>
            </select>
          </label>
          <label className="field">Cause du journal des échecs
            <select id="incident-cause" value={cause} onChange={(e) => setCause(e.target.value)}>
              <option value="">Aucune en particulier</option>
              {p.causes.map((c) => <option key={c.cle} value={c.cle}>{c.libelle}</option>)}
            </select>
          </label>
          <label className="field">Ce qu’on constate
            <textarea className="ta" id="incident-constat" rows={3} maxLength={LONGUEUR_MAX_TEXTE_INCIDENT} value={constat} onChange={(e) => setConstat(e.target.value)} />
          </label>
          <div className="kc">
            <button type="button" className="btn sm pri" data-geste="declarer" {...boutonAction({
              presse: occupe === 'declarer', occupe: !!occupe, focalisable: 'occupe',
              surClic: () => { void geste('declarer', () => ouvrirIncidentAction({ titre, gravite, cause, constat }), () => { setTitre(''); setConstat(''); }, ['#incident-titre']); },
            })}>{occupe === 'declarer' ? 'Déclaration…' : 'Déclarer l’incident'}</button>
          </div>
          {message('declarer')}
        </div>
      </section>
    </>
  );
}
