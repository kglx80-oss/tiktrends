'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  FONDS_APERCU, ZOOMS_APERCU, NOTE_TAGS_IA, ajoutBriefApercu, metaApercuComplet, messageTagsMain, navigationApercu, reglagesApercu, renduApercu, toucheNavigationDetail, validerTag,
  type DonneesDrive, type EtatDimensions, type FichierDrive, type FondApercu, type ZoomApercu,
} from '@tiktrends/core';
import { definirTagsMainAssetAction } from '../../../app/actions/assets';
import { Ic, Lien, useToucheVisible } from '../../communs';
import { boutonAction, FERME } from '../projet/action-serveur';

/**
 * Lot 12 V5 · l'APERÇU COMPLET d'un fichier de la Bibliothèque et ses TAGS
 * POSÉS À LA MAIN. Les règles sont au noyau (`apercu-complet.ts`,
 * `tags-fichier.ts`) · ici, leur traduction en écran et les gestes.
 *
 *  · grand format · l'image ou la vidéo en grand, sur un fond choisi (damier,
 *    fond de l'écran, fond inversé) et un zoom (ajusté, taille réelle) ;
 *  · métadonnées · type, dimensions lues à l'affichage, poids, source, date,
 *    dossier, droits ;
 *  · « Précédent » / « Suivant » à l'écran (cibles de 44 px) et aux flèches ←
 *    → (jamais dans un champ de saisie · `toucheNavigationDetail`, la règle de
 *    la Veille), dans la liste AFFICHÉE · aux bornes, le bouton reste
 *    focalisable, fermé, et la raison est écrite à côté ;
 *  · le focus va à la croix à l'ouverture, Échap ferme, et le parent rend le
 *    focus au bouton qui a ouvert l'aperçu (`fermer`) ;
 *  · « Ajouter au brief » · dans un projet existant (la fenêtre « Utiliser
 *    dans un projet », `verserSelectionDansProjet`) ou un nouveau projet par
 *    l'assistant, ce fichier en référence (`?media=`) · rien n'est généré.
 */

const CIBLE: CSSProperties = { minHeight: 44, minWidth: 44 };
const CHAMP: CSSProperties = { padding: '10px 14px', borderRadius: 14, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)', minHeight: 44, minWidth: 0, flex: '1 1 160px' };

/* ───────────────────────── Tags posés à la main ───────────────────────── */

export function TagsMainFichier({ f, vocabulaire, ecriture, rafraichir, toast }: {
  f: FichierDrive; vocabulaire: readonly string[]; ecriture: boolean; rafraichir: () => void; toast: (m: string) => void;
}) {
  const id = useId();
  const [main, setMain] = useState<readonly string[]>(f.ia?.main ?? []);
  const [ia, setIa] = useState<readonly string[]>(f.ia?.tags ?? []);
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [presse, setPresse] = useState<string | null>(null);
  // Un autre fichier, ou la page relue · la liste repart de ce que la base dit.
  const lu = [...(f.ia?.main ?? []), '\u0001', ...(f.ia?.tags ?? [])].join('\u0000');
  useEffect(() => { setMain(f.ia?.main ?? []); setIa(f.ia?.tags ?? []); setErreur(null); setSaisie(''); }, [f.id, lu]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f.ia) return null;

  async function enregistrer(liste: readonly string[], cle: string, iaGardes: readonly string[] = ia) {
    if (!ecriture || presse) return;
    setPresse(cle); setErreur(null);
    const r = await definirTagsMainAssetAction({ id: f.id, tags: [...liste], ia: [...iaGardes] }).catch(() => ({ error: 'L’enregistrement a échoué.' } as { ok?: true; main?: string[]; ia?: string[]; error?: string }));
    setPresse(null);
    if (r.error) { setErreur(r.error); return; }
    const avant = main.length + ia.length;
    setMain(r.main ?? liste);
    setIa(r.ia ?? iaGardes);
    if (cle === 'ajouter') setSaisie('');
    toast(messageTagsMain(avant, (r.main ?? liste).length + (r.ia ?? iaGardes).length, f.nom));
    rafraichir();
  }
  function ajouter() {
    const v = validerTag(saisie);
    if (!v.ok) { setErreur(v.raison); return; }
    void enregistrer([...main, v.tag.nom], 'ajouter');
  }
  const proposes = [...new Set(vocabulaire)].filter((t) => !main.includes(t));
  return (
    <div data-geste="tags-main" style={{ display: 'grid', gap: 8 }}>
      <span className="lbl" style={{ margin: 0 }}>Tags posés à la main</span>
      {main.length > 0
        ? <div className="chips" style={{ marginTop: 0 }} data-tags-main="">
          {main.map((t) => (
            <span className="pill" key={t} data-tag-main={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {t}
              {ecriture && <button type="button" aria-label={`Retirer le tag ${t}`} data-retirer-tag={t} style={{ ...CIBLE, background: 'none', border: 0, color: 'inherit', display: 'inline-grid', placeItems: 'center', cursor: 'pointer' }}
                {...boutonAction({ presse: presse === `retirer:${t}`, occupe: presse !== null, surClic: () => void enregistrer(main.filter((x) => x !== t), `retirer:${t}`) })}><Ic n="x" /></button>}
            </span>
          ))}
        </div>
        : <small className="faint" data-tags-main-vide="">Aucun tag posé à la main.</small>}
      {ecriture && (
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); ajouter(); }}>
          <input value={saisie} list={`${id}-voc`} aria-label={`Nouveau tag pour ${f.nom}`} placeholder="Nouveau tag" maxLength={80} aria-invalid={erreur ? true : undefined} aria-describedby={erreur ? `${id}-e` : undefined}
            onChange={(e) => { setSaisie(e.target.value); setErreur(null); }} style={CHAMP} />
          <datalist id={`${id}-voc`}>{proposes.map((t) => <option key={t} value={t} />)}</datalist>
          <button className="btn sm" type="submit" data-ajouter-tag="" style={CIBLE} {...boutonAction({ presse: presse === 'ajouter', occupe: presse !== null })}><Ic n="plus" />Tag</button>
        </form>
      )}
      {erreur && <p role="alert" id={`${id}-e`} style={{ fontSize: '12.5px', margin: 0, color: 'var(--bad)' }}>{erreur}</p>}
      {ecriture && proposes.length > 0 && <small className="faint">Le vocabulaire de la Veille de la marque est proposé à la saisie.</small>}
      {ia.length > 0 && (
        <>
          <div className="chips" style={{ marginTop: 0 }} data-tags-ia="">{ia.map((t) => (
            <span className="pill c" key={t} data-tag-ia={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {t}
              {ecriture && <button type="button" aria-label={`Retirer le tag IA ${t}`} data-retirer-tag-ia={t} style={{ ...CIBLE, background: 'none', border: 0, color: 'inherit', display: 'inline-grid', placeItems: 'center', cursor: 'pointer' }}
                {...boutonAction({ presse: presse === `ia:${t}`, occupe: presse !== null, surClic: () => void enregistrer(main, `ia:${t}`, ia.filter((x) => x !== t)) })}><Ic n="x" /></button>}
            </span>
          ))}</div>
          <small className="faint">{NOTE_TAGS_IA}</small>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Aperçu complet ───────────────────────── */

export function ApercuComplet({ f, affiches, donnees, lectureSeule, dossier, aller, fermer, versDansProjet, tags }: {
  f: FichierDrive;
  /** La liste AFFICHÉE (filtrée, dans son ordre) · la navigation la parcourt. */
  affiches: ReadonlyArray<{ id: string }>;
  donnees: DonneesDrive;
  lectureSeule: string | null;
  dossier: string;
  aller: (id: string) => void;
  fermer: () => void;
  /** « Dans un projet existant » · le parent ferme l'aperçu et ouvre la fenêtre de versement pour ce fichier. */
  versDansProjet: () => void;
  tags: ReactNode;
}) {
  const titre = useId();
  const croix = useRef<HTMLButtonElement>(null);
  const [fond, setFond] = useState<FondApercu>('damier');
  const [zoom, setZoom] = useState<ZoomApercu>('ajuste');
  const [dims, setDims] = useState<EtatDimensions>({ etat: 'attente' });
  useEffect(() => { setDims({ etat: 'attente' }); }, [f.id]);
  // Le focus va à la croix à l'OUVERTURE seulement · passer au voisin le laisse où il est.
  useEffect(() => { croix.current?.focus(); }, []);
  const voisins = navigationApercu(affiches, f.id);
  const appels = useRef({ fermer, aller, voisins });
  appels.current = { fermer, aller, voisins };
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const { fermer: x, aller: a, voisins: v } = appels.current;
      if (e.key === 'Escape') { x(); return; }
      const sens = toucheNavigationDetail({ key: e.key, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, cible: e.target as HTMLElement | null });
      if (!sens) return;
      e.preventDefault();
      const vers = sens === 'precedente' ? v.precedente : v.suivante;
      if (vers) a(vers);
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, []);

  const r = renduApercu(f);
  const reglages = reglagesApercu(f);
  const meta = metaApercuComplet(f, { dossier, dimensions: dims });
  const ajout = ajoutBriefApercu(donnees, f.id, lectureSeule);
  const raisonNav = `${titre}-nav`;
  // Lot 13 ter · `aria-keyshortcuts` lu dans la table (← →), jamais écrit à la main.
  const toucheNav = { precedente: useToucheVisible('apercu-precedent')?.aria, suivante: useToucheVisible('apercu-suivant')?.aria };
  const raisons = [...new Set([voisins.libelle, voisins.raisonPrecedente, voisins.raisonSuivante].filter((x): x is string => !!x))].join(' · ');
  const reel = zoom === 'reel';
  const media: CSSProperties = reel ? { display: 'block', margin: 'auto', maxWidth: 'none', maxHeight: 'none' } : { display: 'block', margin: 'auto', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' };
  const navBouton = (sens: 'precedente' | 'suivante') => {
    const vers = sens === 'precedente' ? voisins.precedente : voisins.suivante;
    return (
      <button type="button" className="btn" data-nav-apercu={sens} aria-disabled={!vers || undefined} aria-describedby={raisonNav}
        aria-keyshortcuts={toucheNav[sens]} style={{ ...CIBLE, ...(vers ? {} : FERME) }} onClick={() => { if (vers) aller(vers); }}>
        {sens === 'precedente' ? <><Ic n="back" />Précédent</> : <>Suivant<Ic n="arrow" /></>}
      </button>
    );
  };
  const segment = <T extends string>(libelle: string, options: ReadonlyArray<{ cle: T; libelle: string }>, valeur: T, changer: (v: T) => void, attr: string) => (
    <div className="seg" role="group" aria-label={libelle} {...{ [attr]: '' }}>
      {options.map((o) => (
        <button key={o.cle} type="button" aria-pressed={valeur === o.cle} aria-disabled={!reglages.ouvert || undefined} style={{ ...CIBLE, ...(reglages.ouvert ? {} : FERME) }}
          onClick={() => { if (reglages.ouvert) changer(o.cle); }}>{o.libelle}</button>
      ))}
    </div>
  );
  const enGrand = (
    <div data-scene-apercu={fond} data-zoom={zoom} style={{ background: FONDS_APERCU.find((x) => x.cle === fond)!.style, borderRadius: 18, border: '1px solid var(--edge)', height: 'min(64vh, 640px)', overflow: 'auto', display: 'grid', placeItems: reel ? 'start' : 'center' }}>
      {r === 'image' && <img key={f.id} src={f.url} alt={`Aperçu de ${f.nom}`} style={media}
        onLoad={(e) => setDims({ etat: 'lues', largeur: e.currentTarget.naturalWidth, hauteur: e.currentTarget.naturalHeight })} onError={() => setDims({ etat: 'illisibles' })} />}
      {r === 'video' && <video key={f.id} src={f.url} controls playsInline preload="metadata" aria-label={`Vidéo ${f.nom}`} style={media}
        onLoadedMetadata={(e) => setDims({ etat: 'lues', largeur: e.currentTarget.videoWidth, hauteur: e.currentTarget.videoHeight })} onError={() => setDims({ etat: 'illisibles' })} />}
      {r === 'audio' && <audio key={f.id} src={f.url} controls aria-label={`Son ${f.nom}`} style={{ width: 'min(100%, 420px)' }} />}
      {r === 'fichier' && <div style={{ display: 'grid', gap: 10, placeItems: 'center', textAlign: 'center', padding: 24 }}><Ic n="down" s={false} /><p className="muted" style={{ margin: 0 }}>Ce type de fichier ne s’affiche pas en grand · télécharge-le pour l’ouvrir.</p></div>}
    </div>
  );

  return (
    <div data-apercu-complet={f.id} role="dialog" aria-modal="true" aria-labelledby={titre}
      onMouseDown={(e) => { if (e.target === e.currentTarget) fermer(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--voile-fort)', display: 'grid', placeItems: 'center', padding: 16, overflowY: 'auto' }}>
      <div className="glass" style={{ width: 'min(1120px, 100%)', borderRadius: 24, padding: 16, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong id={titre} style={{ minWidth: 0, flex: '1 1 200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15 }}>{f.nom}</strong>
          <div role="group" aria-label="Parcourir la liste" data-barre-nav-apercu="" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {navBouton('precedente')}
            {navBouton('suivante')}
            <small className="faint" id={raisonNav} data-position-apercu="" role="status">{raisons}</small>
          </div>
          <button ref={croix} type="button" className="btn icon" aria-label="Fermer l’aperçu complet" data-fermer-apercu="" style={CIBLE} onClick={fermer}><Ic n="x" /></button>
        </div>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
            {enGrand}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {segment('Fond', FONDS_APERCU, fond, setFond, 'data-fond-apercu')}
              {segment('Zoom', ZOOMS_APERCU, zoom, setZoom, 'data-zoom-apercu')}
              {!reglages.ouvert && <small className="faint" data-raison-reglages="">{reglages.raison}</small>}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            <dl className="kv2" data-meta-apercu="" style={{ gridTemplateColumns: '110px minmax(0,1fr)', margin: 0 }}>
              {meta.map((m) => <FragmentMeta key={m.cle} cle={m.cle} libelle={m.libelle} valeur={m.valeur} />)}
            </dl>
            {tags}
            <section data-ajout-brief="" style={{ display: 'grid', gap: 8 }}>
              <span className="lbl" style={{ margin: 0 }}>Ajouter au brief</span>
              {ajout.ouvert ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" type="button" data-geste="brief-existant" style={CIBLE} onClick={versDansProjet}><Ic n="brush" />Dans un projet existant</button>
                  {ajout.nouveauProjet && <Lien className="btn pri" href={ajout.nouveauProjet} data-geste="brief-nouveau" style={CIBLE}><Ic n="plus" />Nouveau projet avec ce fichier</Lien>}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="btn" type="button" data-geste="brief-existant" aria-disabled="true" aria-describedby={`${titre}-brief`} style={{ ...CIBLE, ...FERME }}><Ic n="brush" />Dans un projet existant</button>
                  <small className="faint" id={`${titre}-brief`} data-raison-brief="">{ajout.raison}</small>
                </div>
              )}
              <small className="faint">Le fichier devient une référence du brief, avec le rôle et la portée que tu choisis · rien n’est généré.</small>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function FragmentMeta({ cle, libelle, valeur }: { cle: string; libelle: string; valeur: string }) {
  return <><dt>{libelle}</dt><dd data-meta={cle}>{valeur}</dd></>;
}
