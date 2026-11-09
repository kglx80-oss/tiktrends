'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ToucheReact } from 'react';
import { createPortal } from 'react-dom';
import { LONGUEUR_MAX_TAG, lienSauvegardesTag, trierTags, validerTag, verrouAction, type AccesHypothese, type PropositionHypotheseTag, type TagVeille } from '@tiktrends/core';
import { creerTagVeille, renommerTagVeille } from '../../../app/actions/inspo';
import { FERME } from '../projet/focus';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien } from '../../communs';
import { FormulerHypotheseTag } from '../veille/hypothese-tag-client';

/**
 * Lot 6 V5 · `/tags` · le vocabulaire des tags de Veille de la marque active
 * (VB TG01 à TG04). Le tableau dit, pour chaque tag, combien de sauvegardes il
 * porte et à quelle marque il appartient · « Voir » ouvre les Sauvegardes
 * filtrées, « Renommer » change le libellé (et la clé · deux tags ne se
 * confondent jamais), « + Ajouter un tag » en crée un vide. Rien ne supprime
 * un tag · un tag à 0 reste, prêt à resservir.
 */

export interface TagCompte extends TagVeille { id: string; n: number }
export interface DonneesTags {
  tags: ReadonlyArray<TagCompte>;
  /** « Marque X » ou « Espace, sans marque active » · le vocabulaire affiché. */
  portee: string;
  /** Ouvert, ou fermé avec la raison réelle (rôle) · la même garde que l'action. */
  ecriture: { ouvert: true } | { ouvert: false; raison: string };
  /**
   * Lot 6 bis · « Formuler une hypothèse » · une proposition par tag RÉCURRENT
   * (clé → proposition du noyau · absente sous le seuil) et la porte réelle.
   */
  hypothese?: { acces: AccesHypothese; propositions: Readonly<Record<string, PropositionHypotheseTag>> };
}

const CIBLE: CSSProperties = { minHeight: 44 };
const CHAMP: CSSProperties = {
  width: '100%', minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '10px 14px', borderRadius: 14,
  background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)', outline: 0,
};
const COLONNES = 'minmax(140px,1.6fr) .7fr 1fr minmax(190px,1.2fr)';

export function TagsVeille({ donnees }: { donnees: DonneesTags }) {
  const [tags, setTags] = useState<TagCompte[]>(() => trierTags([...donnees.tags]));
  const [popup, setPopup] = useState<{ mode: 'ajouter' } | { mode: 'renommer'; tag: TagCompte } | null>(null);
  const idRaison = useId();
  const ouvert = donnees.ecriture.ouvert;
  const raison = donnees.ecriture.ouvert ? null : donnees.ecriture.raison;
  return (
    <section className="tile" data-tags-veille="" aria-labelledby={`${idRaison}-t`} style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 id={`${idRaison}-t`} style={{ margin: 0 }}>Tags de Veille</h2>
          <small className="faint">Posés à la main sur tes sauvegardes · {donnees.portee}</small>
        </div>
        <button type="button" className="btn pri sm" data-ajouter-tag style={{ ...CIBLE, marginLeft: 'auto', ...(ouvert ? {} : FERME) }} aria-disabled={!ouvert || undefined}
          aria-describedby={raison ? `${idRaison}-r` : undefined} aria-haspopup="dialog" onClick={() => { if (ouvert) setPopup({ mode: 'ajouter' }); }}>
          <Ic n="plus" />Ajouter un tag
        </button>
        {raison && <small id={`${idRaison}-r`} className="faint" style={{ flex: '1 1 100%' }}>{raison}</small>}
      </div>
      {tags.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Aucun tag pour l’instant · pose le premier depuis le signet d’une pub de la Veille, ou ajoute-le ici.</p>
      ) : (
        <div className="atable" role="table" aria-label="Tags de Veille" style={{ overflowX: 'auto' }}>
          <div className="atr ath" role="row" style={{ gridTemplateColumns: COLONNES, minWidth: 560 }}>
            <span role="columnheader">Tag</span><span role="columnheader">Créatives</span><span role="columnheader">Portée</span><span role="columnheader" />
          </div>
          {tags.map((t) => (
            <div className="atr" role="row" key={t.id} data-ligne-tag={t.cle} style={{ gridTemplateColumns: COLONNES, minWidth: 560 }}>
              <span role="cell" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Ic n="tag" /> <b>{t.nom}</b></span>
              <span role="cell" data-compte-tag>{t.n} sauvegarde{t.n > 1 ? 's' : ''}</span>
              <span role="cell" className="faint">{donnees.portee}</span>
              <span role="cell" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {t.n > 0
                  ? <Lien className="btn sm" href={lienSauvegardesTag(t.cle)} style={CIBLE}>Voir</Lien>
                  : <span className="btn sm" aria-disabled="true" title="Aucune sauvegarde ne porte ce tag" style={{ ...CIBLE, ...FERME }}>Voir</span>}
                <button type="button" className="btn sm" style={{ ...CIBLE, ...(ouvert ? {} : FERME) }} aria-disabled={!ouvert || undefined} aria-haspopup="dialog"
                  aria-label={`Renommer le tag « ${t.nom} »`} title={raison ?? undefined} onClick={() => { if (ouvert) setPopup({ mode: 'renommer', tag: t }); }}>Renommer</button>
                {donnees.hypothese?.propositions[t.cle] && <FormulerHypotheseTag proposition={donnees.hypothese.propositions[t.cle]!} acces={donnees.hypothese.acces} style={{ justifyContent: 'flex-end' }} />}
              </span>
            </div>
          ))}
        </div>
      )}
      {popup && (
        <PopupTag titre={popup.mode === 'ajouter' ? 'Ajouter un tag' : `Renommer « ${popup.tag.nom} »`} initial={popup.mode === 'renommer' ? popup.tag.nom : ''}
          action={popup.mode === 'ajouter' ? 'Ajouter' : 'Renommer'} fermer={() => setPopup(null)}
          envoyer={async (nom) => {
            const r = popup.mode === 'ajouter' ? await creerTagVeille({ nom }) : await renommerTagVeille({ id: popup.tag.id, nom });
            if (!r.ok) return r.error;
            const n = popup.mode === 'renommer' ? popup.tag.n : 0;
            setTags((l) => trierTags([...l.filter((x) => x.id !== r.tag.id), { ...r.tag, n }]));
            return null;
          }}
          message={(nom) => (popup.mode === 'ajouter' ? `Tag « ${nom} » ajouté` : `Tag renommé en « ${nom} »`)} />
      )}
    </section>
  );
}

/** La pop-up « Nom, Ajouter » (TG01) et « Renommer » (TG04) · focus piégé, Échap ferme, focus rendu au bouton d'origine. */
function PopupTag({ titre, initial, action, envoyer, fermer, message }: { titre: string; initial: string; action: string; envoyer: (nom: string) => Promise<string | null>; fermer: () => void; message: (nom: string) => string }) {
  const id = useId();
  const boite = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const { toast } = useSpatial();
  const [nom, setNom] = useState(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const verrou = useRef(verrouAction());
  useEffect(() => {
    const origine = document.activeElement as HTMLElement | null;
    champ.current?.focus();
    return () => { if (origine && document.contains(origine)) origine.focus(); };
  }, []);
  const valider = async () => {
    const v = validerTag(nom);
    if (!v.ok) { setErreur(v.raison); champ.current?.focus(); return; }
    if (!verrou.current.tenter()) return;
    setEnvoi(true); setErreur(null);
    try {
      const e = await envoyer(v.tag.nom);
      if (e) { setErreur(e); champ.current?.focus(); return; }
      toast(message(v.tag.nom));
      fermer();
    } catch { setErreur('Échec · vérifie ta connexion puis réessaie.'); }
    finally { verrou.current.relacher(); setEnvoi(false); }
  };
  const touche = (e: ToucheReact<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); fermer(); return; }
    if (e.key !== 'Tab') return;
    const f = [...(boite.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])];
    const premier = f[0]; const dernier = f[f.length - 1];
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier?.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier?.focus(); }
  };
  return createPortal(
    <div className="paywrap" data-popup-tag="" style={{ zIndex: 70 }} onMouseDown={(e) => { if (e.target === e.currentTarget) fermer(); }}>
      <div ref={boite} className="paybox glass" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} onKeyDown={touche} style={{ width: 'min(420px,100%)' }}>
        <h2 id={`${id}-t`} style={{ margin: 0 }}>{titre}</h2>
        <form onSubmit={(e) => { e.preventDefault(); void valider(); }} style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="lbl" style={{ margin: 0 }}>Nom</span>
            <input ref={champ} value={nom} onChange={(e) => { setNom(e.target.value); setErreur(null); }} placeholder="Ex. Hook UGC" style={CHAMP} aria-describedby={`${id}-a`} />
          </label>
          <small id={`${id}-a`} className="faint">{LONGUEUR_MAX_TAG} signes au plus · « Hook UGC » et « hook ugc » sont le même tag.</small>
          {erreur && <p role="alert" style={{ margin: 0, color: 'var(--bad)', fontSize: 13 }}>{erreur}</p>}
          <div className="kc" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn" style={CIBLE} onClick={fermer}>Annuler</button>
            <button type="submit" className="btn pri" style={{ ...CIBLE, marginLeft: 'auto', ...(envoi ? FERME : {}) }} aria-busy={envoi || undefined}>{envoi ? 'Enregistrement…' : action}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
