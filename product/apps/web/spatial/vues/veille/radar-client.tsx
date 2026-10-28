'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { InspoAd } from '@tiktrends/integrations';
import { apercuImage, consigneAngleMarche, formatDominant, lienNouveauProjet, type BriefConcurrent } from '@tiktrends/core';
import { briefMarqueAction } from '../../../app/actions/brief-marque';
import { markTrackerSeenAction, scanTrackerAction } from '../../../app/actions/tracker';
import { decouverteMarcheAction } from '../../../app/actions/decouverte';
import { grammaireCategorieAction } from '../../../app/actions/layout-marche';
import { grammaireVideoAction } from '../../../app/actions/video-marche';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien } from '../../communs';
import { studioDepuisVeille } from '../../../lib/veille-link';
import { Vignette } from './base';

/**
 * Les gestes de l'ancien écran Sauvegardes (onglets « Marques suivies »,
 * « Nouveautés », « Explorer »), portés sur le Radar Spatial (vague 3) ·
 * chacun appelle l'action EXISTANTE · le brief d'un concurrent (lecture sans
 * IA), vérifier les nouveautés, tout marquer vu, découvrir les créas éprouvées
 * de la catégorie et lire sa « carte d'identité » (agrégats déjà décrits, sans
 * dépense). Le toast ne dit « c'est fait » qu'au retour de l'action.
 */

type Grammaire = Awaited<ReturnType<typeof grammaireCategorieAction>>;

/** « Brief » d'une marque suivie · une lecture immédiate de ses pubs, sans IA. */
export function BriefMarque({ platform, nom }: { platform: string; nom: string }) {
  const [brief, setBrief] = useState<BriefConcurrent | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [attente, demarrer] = useTransition();
  const lire = () => {
    if (attente) return;
    if (ouvert && brief) { setOuvert(false); return; }
    setOuvert(true); setErreur(null);
    demarrer(async () => {
      try { const r = await briefMarqueAction({ platform, name: nom }); if (r.error) setErreur(r.error); else setBrief(r.brief ?? null); }
      catch { setErreur('Échec · vérifie ta connexion puis réessaie.'); }
    });
  };
  const consigne = brief ? consigneAngleMarche({ angleLabel: brief.angles[0]?.label, marque: nom, partVideo: brief.partVideo }) : null;
  const fmt = brief ? formatDominant(brief.partVideo) : null;
  return (
    <>
      <button type="button" className="btn sm" aria-expanded={ouvert} onClick={lire} disabled={attente}><Ic n="chart" />{attente ? 'Lecture…' : 'Brief'}</button>
      {ouvert && (
        <div className="tile" style={{ flex: '1 1 100%', display: 'grid', gap: 10 }} aria-label={`Brief · ${nom}`}>
          <div className="member"><strong>Brief · {nom}</strong><small className="faint" style={{ marginLeft: 'auto' }}>lecture immédiate · sans IA</small></div>
          {attente && <small className="faint">Analyse en cours…</small>}
          {erreur && <p role="alert" style={{ fontSize: '12.5px', color: 'var(--bad)' }}>{erreur}</p>}
          {brief && !attente && (
            <>
              <div className="grid3">
                {[['Pubs lues', String(brief.total)], ['Éprouvées', `${brief.gagnants}/${brief.total}`], ['Vidéo', `${Math.round(brief.partVideo * 100)} %`], ['Ancienneté médiane', `${brief.ancienneteMediane} j`], ['La doyenne', `${brief.doyenneJours} j`]].map(([l, v]) => (
                  <div className="tile kfig" key={l}><span className="lbl">{l}</span><span className="v">{v}</span></div>
                ))}
              </div>
              {brief.angles.length > 0 && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <small className="faint">Angles dominants</small>
                  {brief.angles.map((a) => <div key={a.angle} className="bar"><i><b style={{ width: `${Math.round(a.part * 100)}%` }} /></i><span>{a.label} · {a.n}</span></div>)}
                </div>
              )}
              {consigne && brief.angles[0] && (
                <Lien className="btn pri sm" href={lienNouveauProjet({ type: fmt === 'video' ? 'video' : 'ads', angle: consigne })} style={{ justifySelf: 'start' }}>
                  <Ic n="spark" />Préparer une créa · {brief.angles[0].label}{fmt ? ` · en ${fmt}` : ''}
                </Lien>
              )}
              {brief.ctas.length > 0 && <div className="kc">{brief.ctas.map((c) => <span key={c.cta} className="chip">{c.cta} ×{c.n}</span>)}</div>}
              {brief.domaines.length > 0 && <div className="kc">{brief.domaines.map((d) => <a key={d} className="chip" href={`https://${d}`} target="_blank" rel="noopener noreferrer">{d}</a>)}</div>}
            </>
          )}
        </div>
      )}
    </>
  );
}

/** « Vérifier maintenant » et « Tout marquer vu » · les nouvelles pubs des marques suivies. */
export function GestesNouveautes({ scan, nonVues }: { scan: { actif: boolean; raison: string | null }; nonVues: number }) {
  const { toast } = useSpatial();
  const router = useRouter();
  const [attente, demarrer] = useTransition();
  const [vues, setVues] = useState(false);
  const verifier = () => demarrer(async () => {
    try {
      const r = await scanTrackerAction();
      toast(r.error ? 'Scan indisponible pour le moment.' : !r.scanned ? 'Aucune marque suivie à scanner.' : r.newAds ? `${r.newAds} nouvelle(s) pub(s) détectée(s)` : 'Rien de neuf depuis le dernier scan.');
      router.refresh();
    } catch { toast('Échec · vérifie ta connexion puis réessaie.'); }
  });
  const marquer = () => demarrer(async () => {
    try { await markTrackerSeenAction(); setVues(true); toast('Nouveautés marquées vues'); router.refresh(); }
    catch { toast('Échec · vérifie ta connexion puis réessaie.'); }
  });
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button type="button" className="btn sm" onClick={verifier} disabled={attente || !scan.actif} title={scan.raison ?? undefined}><Ic n="loop" />{attente ? 'Vérification…' : 'Vérifier maintenant'}</button>
      {nonVues > 0 && !vues && <button type="button" className="btn sm" onClick={marquer} disabled={attente}><Ic n="check" />Tout marquer vu · {nonVues}</button>}
      {scan.raison && <small className="faint">{scan.raison}</small>}
    </div>
  );
}

/** « Découvrir dans ma catégorie » · les créas éprouvées hors de ta veille, à la demande. */
export function DecouverteCategorie() {
  const [ads, setAds] = useState<InspoAd[] | null>(null);
  const [note, setNote] = useState('');
  const [attente, demarrer] = useTransition();
  const decouvrir = () => demarrer(async () => {
    setNote('');
    try { const r = await decouverteMarcheAction(); if (r.error) { setNote(r.error); setAds([]); return; } setAds(r.ads ?? []); if (r.note) setNote(r.note); }
    catch { setNote('Échec · vérifie ta connexion puis réessaie.'); }
  });
  return (
    <div className="tile" style={{ display: 'grid', gap: 10 }} aria-label="Découvrir dans ma catégorie">
      <div className="member"><strong>Découvrir dans ma catégorie</strong>
        <button type="button" className="btn sm pri" onClick={decouvrir} disabled={attente} style={{ marginLeft: 'auto' }}><Ic n="search" />{attente ? 'Recherche…' : 'Trouver des créas éprouvées'}</button></div>
      <small className="faint">Les pubs qui tiennent dans ta catégorie, hors de ta veille.</small>
      {ads && ads.length > 0 && (
        <div className="scaleL">
          {ads.map((ad) => (
            <div className="srow" key={`${ad.platform}:${ad.id}`} style={{ gridTemplateColumns: '60px minmax(0,1fr) auto' }}>
              <Vignette image={apercuImage({ isVideo: (ad.mediaType ?? '').toLowerCase().includes('vid'), thumbnailUrl: ad.thumbnailUrl, mediaUrl: ad.mediaUrl })} />
              <div style={{ minWidth: 0 }}><strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ad.advertiserName || 'Annonceur'}</strong><span className="faint" style={{ fontSize: '11.5px' }}>{Math.max(0, ad.daysRunning ?? 0)} j de diffusion</span></div>
              <Lien className="btn sm" href={studioDepuisVeille(ad)}><Ic n="copy" />Génère ta version</Lien>
            </div>
          ))}
        </div>
      )}
      {note && <small className="faint">{note}</small>}
    </div>
  );
}

/** « La carte d'identité de ma catégorie » · les repères qui reviennent chez les gagnantes (agrégats déjà décrits, sans dépense). */
export function GrammaireMarche() {
  const [stat, setStat] = useState<Grammaire | null>(null);
  const [video, setVideo] = useState<Grammaire | null>(null);
  const [attente, demarrer] = useTransition();
  const lire = () => demarrer(async () => {
    const [s, v] = await Promise.all([grammaireCategorieAction(), grammaireVideoAction()]);
    setStat(s); setVideo(v);
  });
  const volet = (titre: string, g: Grammaire) => (
    <div className="tile" style={{ display: 'grid', gap: 8 }} key={titre}>
      <strong>{titre}</strong><small className="faint">D’après {g.n} créa(s) concurrente(s) analysée(s) · ce qui revient chez les gagnantes.</small>
      <div className="grid3">{g.lignes.map((l) => <div className="tile kfig" key={l.axe}><span className="lbl">{l.axe}</span><span className="v" style={{ fontSize: '15px' }}>{l.valeur}</span></div>)}</div>
    </div>
  );
  return (
    <div className="tile" style={{ display: 'grid', gap: 10 }} aria-label="Carte d’identité de ma catégorie">
      <div className="member"><strong>La carte d’identité de ma catégorie</strong>
        <button type="button" className="btn sm" onClick={lire} disabled={attente} style={{ marginLeft: 'auto' }}><Ic n="spark" />{attente ? 'Lecture…' : 'Lire ce qui gagne dans ma catégorie'}</button></div>
      <small className="faint">Les repères visuels qui reviennent chez les concurrents installés · à réutiliser dans tes créas.</small>
      {stat && stat.lignes.length > 0 && volet('Statique · mise en page et charte', stat)}
      {video && video.lignes.length > 0 && volet('Vidéo · accroche, ouverture, présence', video)}
      {stat && stat.lignes.length === 0 && (!video || video.lignes.length === 0) && (
        <small className="faint">{stat.n > 0 ? `Rien ne se détache encore nettement dans ta catégorie (${stat.n} pub(s) analysée(s)) · il faut un motif majoritaire pour conclure.` : 'Ta catégorie n’a pas encore été décrite · lance un lot d’analyse des concurrents pour la remplir.'}</small>
      )}
    </div>
  );
}
