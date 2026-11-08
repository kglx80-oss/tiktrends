'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ToucheReact } from 'react';
import { createPortal } from 'react-dom';
import {
  LONGUEUR_MAX_NOTE, MENTION_CONSERVATION, TAGS_MAX_PAR_SAUVEGARDE, apercuImage, cleTag, messageSauvegarde, pastilleMarque, trierTags, validerTag, verrouAction,
  type TagVeille,
} from '@tiktrends/core';
import type { InspoAd } from '@tiktrends/integrations';
import { lireSauvegardeVeille, majSauvegarde, saveAd, unsaveAd, type LectureSauvegarde } from '../../../app/actions/inspo';
import { FERME } from '../projet/focus';
import { useSpatial } from '../../coquille/contexte';
import { Ic } from '../../communs';
import { Vignette } from './base';

/**
 * Lot 6 V5 · la pop-up « Sauvegarder » (VB S01 à S10). S'ouvre au clic sur le
 * signet d'une pub (carte, liste, détail) ou sur « Modifier » d'une
 * sauvegarde. Elle LIT d'abord ce que le serveur sait de la pub ici
 * (`lireSauvegardeVeille` · gardée ou non, ses tags, sa note, ses
 * collections, le vocabulaire de la marque), puis UNE seule action écrit tout
 * · `saveAd` (« Sauvegarder », la sauvegarde existante enrichie) ou
 * `majSauvegarde` (« Mettre à jour »). L'écran ne change qu'au oui du serveur ·
 * un refus reste écrit dans la pop-up, rien n'est perdu de la saisie.
 *
 * Accessibilité · `role="dialog"` modal, focus piégé (Tab, Maj+Tab), Échap
 * ferme et rend le focus au bouton d'origine, cibles de 44 px, et toute
 * commande fermée dit pourquoi à côté.
 */

export interface ApercuSauvegarde { image: string | null; marque: { nom: string; initiale: string; fond: string }; texte: string | null }
/** Ce que l'écran apprend après le oui · la carte, le détail et le filtre « Tags » se mettent à jour avec. */
export interface EtatSauvegarde { sauvee: boolean; tags: TagVeille[]; note?: string | null; collections?: string[] }

/** L'aperçu d'une pub quand l'écran ne l'a pas calculé (Ce qui scale) · lu sur l'annonce, rien d'inventé. */
function apercuDepuisAd(ad: InspoAd): ApercuSauvegarde {
  const nom = ad.advertiserName?.trim() || 'Annonceur';
  const video = (ad.mediaType ?? '').toLowerCase().includes('vid');
  return { image: apercuImage({ isVideo: video, thumbnailUrl: ad.thumbnailUrl, mediaUrl: ad.mediaUrl }), marque: { nom, ...pastilleMarque(nom) }, texte: ad.body?.trim() || null };
}

const CIBLE: CSSProperties = { minHeight: 44 };
const CHAMP: CSSProperties = {
  width: '100%', minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '10px 14px', borderRadius: 14,
  background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)', outline: 0,
};
const FOCALISABLES = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

type Lecture = { etat: 'attente' } | { etat: 'lue'; d: Extract<LectureSauvegarde, { ok: true }> } | { etat: 'erreur'; message: string };

export function PopupSauvegarde({ ad, apercu: apercuDonne, sauvee: sauveeAnnoncee, fermer, apres }: {
  ad: InspoAd;
  /** Absent · lu sur l'annonce elle-même (`apercuDepuisAd`). */
  apercu?: ApercuSauvegarde;
  /** Ce que l'écran croit · la lecture du serveur l'emporte dès qu'elle arrive. */
  sauvee: boolean;
  fermer: () => void;
  apres: (e: EtatSauvegarde) => void;
}) {
  const id = useId();
  const apercu = apercuDonne ?? apercuDepuisAd(ad);
  const boite = useRef<HTMLDivElement>(null);
  const { toast } = useSpatial();
  const [lecture, setLecture] = useState<Lecture>({ etat: 'attente' });
  const [tags, setTags] = useState<TagVeille[]>([]);
  const [saisieTag, setSaisieTag] = useState('');
  const [raisonTag, setRaisonTag] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [collections, setCollections] = useState<string[]>([]);
  const [proposees, setProposees] = useState<string[]>([]);
  const [saisieCollection, setSaisieCollection] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const verrou = useRef(verrouAction());

  // Le focus entre dans la pop-up à l'ouverture et revient au bouton d'origine à la fermeture.
  useEffect(() => {
    const origine = document.activeElement as HTMLElement | null;
    boite.current?.querySelector<HTMLElement>('[data-premier-focus]')?.focus();
    return () => { if (origine && document.contains(origine)) origine.focus(); };
  }, []);

  useEffect(() => {
    let ignore = false;
    // Dans une promesse · même un échec immédiat de l'appel devient une lecture en échec, dite à l'écran.
    Promise.resolve().then(() => lireSauvegardeVeille({ platform: ad.platform, externalId: ad.id }))
      .then((r) => {
        if (ignore) return;
        if (!r.ok) { setLecture({ etat: 'erreur', message: r.error }); return; }
        setLecture({ etat: 'lue', d: r });
        setTags(r.sauvegarde.tags);
        setNote(r.sauvegarde.note ?? '');
        setCollections(r.sauvegarde.collections);
        setProposees([...new Set([...r.collections, ...r.sauvegarde.collections])]);
      })
      .catch(() => { if (!ignore) setLecture({ etat: 'erreur', message: 'Ce qui est déjà gardé n’a pas pu être lu · vérifie ta connexion.' }); });
    return () => { ignore = true; };
  }, [ad.platform, ad.id]);

  const sauvee = lecture.etat === 'lue' ? lecture.d.sauvee : sauveeAnnoncee;
  const vocabulaire = lecture.etat === 'lue' ? lecture.d.vocabulaire : [];
  // Mettre à jour sans avoir relu écraserait des tags qu'on n'a pas vus · fermé, raison écrite.
  const raisonFerme = envoi ? 'Enregistrement en cours…'
    : lecture.etat === 'attente' ? 'Lecture de ce qui est déjà gardé…'
      : lecture.etat === 'erreur' && sauvee ? `${lecture.message} · ferme puis rouvre pour mettre à jour.`
        : null;
  const nNote = [...note.trim()].length;
  const noteTropLongue = nNote > LONGUEUR_MAX_NOTE;

  const ajouterTag = (brut: string) => {
    const v = validerTag(brut);
    if (!v.ok) { setRaisonTag(v.raison); return; }
    if (tags.some((t) => t.cle === v.tag.cle)) { setRaisonTag(`« ${v.tag.nom} » est déjà posé.`); setSaisieTag(''); return; }
    if (tags.length >= TAGS_MAX_PAR_SAUVEGARDE) { setRaisonTag(`${TAGS_MAX_PAR_SAUVEGARDE} tags au plus par sauvegarde.`); return; }
    // Une clé déjà connue de la marque reprend SON libellé · « hook ugc » devient « Hook UGC ».
    const connu = vocabulaire.find((t) => t.cle === v.tag.cle);
    setTags((l) => [...l, connu ?? v.tag]);
    setSaisieTag(''); setRaisonTag(null);
  };
  const ajouterCollection = () => {
    const n = saisieCollection.replace(/\s+/g, ' ').trim();
    if (!n) return;
    setProposees((l) => (l.includes(n) ? l : [...l, n]));
    setCollections((l) => (l.includes(n) ? l : [...l, n]));
    setSaisieCollection('');
  };

  const envoyer = async () => {
    if (raisonFerme || noteTropLongue || !verrou.current.tenter()) return;
    setEnvoi(true); setErreur(null);
    const meta = { tags: tags.map((t) => t.nom), note: note.trim() || null, collections };
    try {
      const r = sauvee
        ? await majSauvegarde({ platform: ad.platform, externalId: ad.id, ...meta })
        : await saveAd({ platform: ad.platform, externalId: ad.id, snapshot: ad, ...meta });
      if (!r.ok) { setErreur(r.error ?? 'Sauvegarde refusée.'); return; }
      const relu = r.sauvegarde ?? { tags, note: meta.note, collections };
      toast(messageSauvegarde({ nouvelle: !sauvee, tags: relu.tags.length, note: !!relu.note, collections: relu.collections.length }));
      apres({ sauvee: true, tags: relu.tags, note: relu.note, collections: relu.collections });
      fermer();
    } catch {
      setErreur('Échec · vérifie ta connexion puis réessaie. Ta saisie est gardée ici.');
    } finally { verrou.current.relacher(); setEnvoi(false); }
  };
  const retirer = async () => {
    if (envoi || !verrou.current.tenter()) return;
    setEnvoi(true); setErreur(null);
    try {
      const r = await unsaveAd({ platform: ad.platform, externalId: ad.id });
      if (!r.ok) { setErreur(r.error ?? 'Retrait refusé.'); return; }
      toast('Retirée des sauvegardes');
      apres({ sauvee: false, tags: [] });
      fermer();
    } catch { setErreur('Échec · vérifie ta connexion puis réessaie.'); }
    finally { verrou.current.relacher(); setEnvoi(false); }
  };

  const touche = (e: ToucheReact<HTMLDivElement>) => {
    // Rien ne sort de la pop-up · ni Échap vers le détail, ni les flèches vers « Précédente / Suivante ».
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); fermer(); return; }
    if (e.key !== 'Tab') return;
    const f = [...(boite.current?.querySelectorAll<HTMLElement>(FOCALISABLES) ?? [])];
    const premier = f[0]; const dernier = f[f.length - 1];
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier?.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier?.focus(); }
  };

  const suggestions = trierTags(vocabulaire.filter((t) => !tags.some((x) => x.cle === t.cle))).slice(0, 12);
  const idRaison = `${id}-raison`;
  return createPortal(
    <div className="paywrap" data-popup-sauvegarde="" style={{ zIndex: 70 }} onMouseDown={(e) => { if (e.target === e.currentTarget) fermer(); }}>
      <div ref={boite} className="paybox glass" role="dialog" aria-modal="true" aria-labelledby={`${id}-titre`} onKeyDown={touche}
        style={{ width: 'min(520px,100%)', maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto' }}>
        <div className="sech" style={{ margin: 0, alignItems: 'center' }}>
          <h2 id={`${id}-titre`} style={{ margin: 0 }}>{sauvee ? 'Modifier la sauvegarde' : 'Sauvegarder cette pub'}</h2>
          <button className="btn icon sm" type="button" aria-label="Fermer" style={{ marginLeft: 'auto', width: 44, minHeight: 44 }} onClick={fermer}><Ic n="x" /></button>
        </div>

        <div data-apercu-sauvegarde style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr)', gap: 12, alignItems: 'center' }}>
          <Vignette image={apercu.image} />
          <div style={{ minWidth: 0 }}>
            <div className="who" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="av" style={{ background: apercu.marque.fond }}>{apercu.marque.initiale}</span><strong>{apercu.marque.nom}</strong></div>
            {apercu.texte && <p className="faint" style={{ margin: '4px 0 0', fontSize: 12.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{apercu.texte}</p>}
          </div>
        </div>

        <fieldset data-champ="collections" style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          <legend className="lbl" style={{ padding: 0, marginBottom: 6 }}>Collections</legend>
          {proposees.length === 0 && <small className="faint">Aucune collection pour l’instant · crée la première ci-dessous.</small>}
          {proposees.map((c) => (
            <label key={c} style={{ ...CIBLE, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={collections.includes(c)} style={{ width: 20, height: 20 }}
                onChange={(e) => setCollections((l) => (e.target.checked ? [...l, c] : l.filter((x) => x !== c)))} />
              <span>{c}</span>
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={saisieCollection} onChange={(e) => setSaisieCollection(e.target.value)} placeholder="Nouvelle collection" aria-label="Nom d’une nouvelle collection" style={CHAMP}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouterCollection(); } }} />
            <button type="button" className="btn sm" style={CIBLE} onClick={ajouterCollection}>Créer</button>
          </div>
        </fieldset>

        <div data-champ="tags" style={{ display: 'grid', gap: 6 }}>
          <label className="lbl" htmlFor={`${id}-tag`} style={{ margin: 0 }}>Tags</label>
          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-tags-choisis>
              {tags.map((t) => (
                <button key={t.cle} type="button" className="chip on" style={CIBLE} aria-label={`Retirer le tag « ${t.nom} »`} onClick={() => setTags((l) => l.filter((x) => x.cle !== t.cle))}>{t.nom}<Ic n="x" /></button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input id={`${id}-tag`} data-premier-focus value={saisieTag} placeholder="Ex. Hook UGC" aria-describedby={raisonTag ? `${id}-tag-r` : undefined}
              onChange={(e) => { setSaisieTag(e.target.value); setRaisonTag(null); }} style={CHAMP}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouterTag(saisieTag); } }} />
            <button type="button" className="btn sm" style={CIBLE} onClick={() => ajouterTag(saisieTag)}>Ajouter</button>
          </div>
          {raisonTag && <small id={`${id}-tag-r`} role="status" style={{ color: 'var(--warn)' }}>{raisonTag}</small>}
          {saisieTag.trim() && vocabulaire.some((t) => t.cle === cleTag(saisieTag) && !tags.some((x) => x.cle === t.cle)) && (
            <small className="faint">Déjà dans les tags de la marque · « {vocabulaire.find((t) => t.cle === cleTag(saisieTag))!.nom} » sera repris.</small>
          )}
          {suggestions.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-suggestions-tags aria-label="Tags de la marque">
              {suggestions.map((t) => <button key={t.cle} type="button" className="chip" style={CIBLE} onClick={() => ajouterTag(t.nom)}><Ic n="plus" />{t.nom}</button>)}
            </div>
          )}
        </div>

        <label style={{ display: 'grid', gap: 6 }}>
          <span className="lbl" style={{ margin: 0 }}>Note (facultatif)</span>
          <textarea value={note} rows={3} onChange={(e) => setNote(e.target.value)} placeholder="Pourquoi tu la gardes" aria-describedby={`${id}-note-n`} style={{ ...CHAMP, resize: 'vertical' }} />
          <small id={`${id}-note-n`} className="faint" style={noteTropLongue ? { color: 'var(--bad)' } : undefined}>{nNote.toLocaleString('fr-FR')} / {LONGUEUR_MAX_NOTE.toLocaleString('fr-FR')} signes{noteTropLongue ? ' · trop longue, raccourcis-la' : ''}</small>
        </label>

        <small className="faint" data-mention-conservation>{MENTION_CONSERVATION}</small>
        {lecture.etat === 'erreur' && !sauvee && <small className="faint" role="status">{lecture.message} · tu peux sauvegarder quand même.</small>}
        {erreur && <p role="alert" style={{ margin: 0, color: 'var(--bad)', fontSize: 13 }}>{erreur}</p>}

        <div className="kc" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn" style={CIBLE} onClick={fermer}>Annuler</button>
          {sauvee && <button type="button" className="btn ghost" style={{ ...CIBLE, ...(envoi ? FERME : {}) }} aria-disabled={envoi || undefined} onClick={() => void retirer()}>Retirer des sauvegardes</button>}
          <button type="button" className="btn pri" data-envoyer-sauvegarde style={{ ...CIBLE, marginLeft: 'auto', ...(raisonFerme || noteTropLongue ? FERME : {}) }}
            aria-disabled={raisonFerme || noteTropLongue ? true : undefined} aria-busy={envoi || undefined} aria-describedby={raisonFerme ? idRaison : undefined}
            onClick={() => void envoyer()}>
            <Ic n="bookmark" />{envoi ? 'Enregistrement…' : sauvee ? 'Mettre à jour' : 'Sauvegarder'}
          </button>
          {raisonFerme && <small id={idRaison} className="faint" role="status" style={{ flex: '1 1 100%' }}>{raisonFerme}</small>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
