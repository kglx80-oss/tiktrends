'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CIBLE_TACTILE_MIN, lienFicheAdsmap, type OptionTypeAd } from '@tiktrends/core';
import { trackSavedAdAction } from '../../../actions/adsmap-bridge';
import { Icon } from '../../../../components/Icon';
import { tuile } from '../../../../components/ui';

/**
 * « Préparer un test » · le parcours EXISTANT Sauvegardes → Adsmap
 * (`trackSavedAdAction`) · l'annonce devient un concept « imitation » en
 * brouillon. Rien n'est lancé, rien n'est généré, aucune dépense · le libellé et
 * le retour le disent. Affiché seulement quand Adsmap est ouvert à l'espace et
 * qu'une marque est active (même condition que Sauvegardes).
 *
 * Lot 21 (R3) · le retour mène à LA fiche (`lienFicheAdsmap(adId)`, tiroir de
 * cette ad), jamais à la carte nue · une annonce déjà suivie le dit et renvoie
 * la même fiche.
 *
 * Message 77 · quand le type d'ad ne s'établit pas sans inventer (vidéo
 * ambiguë, GIF, média inconnu), le serveur ne crée rien et renvoie la liste
 * compatible · l'utilisateur CHOISIT (`ChoixTypeAd`, rien de présélectionné).
 * Annuler · aucune écriture, retour au repos, focus rendu au bouton. Le focus
 * n'est déplacé que s'il est encore sur le geste (bouton, choix) ou perdu sur
 * `body` · jamais pris à un autre champ.
 */
export function PreparerTest({ platform, externalId }: { platform: string; externalId: string }) {
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'choix' | 'ok' | string>('repos');
  const [fiche, setFiche] = useState<{ adId: string | null; deja: boolean }>({ adId: null, deja: false });
  const [choix, setChoix] = useState<{ options: OptionTypeAd[]; raison: string; envoi: boolean; erreur: string | null } | null>(null);
  const verrou = useRef(false);
  const racine = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const focusApres = useRef<null | 'choix' | 'bouton' | 'lien'>(null);
  const formId = useId();

  // Le focus suit le geste APRÈS le rendu · seulement s'il est encore dans ce
  // bloc (bouton, choix) ou perdu sur `body`.
  useEffect(() => {
    const cible = focusApres.current;
    if (!cible) return;
    focusApres.current = null;
    const a = document.activeElement;
    if (a && a !== document.body && !racine.current?.contains(a)) return;
    if (cible === 'choix') racine.current?.querySelector<HTMLSelectElement>('select')?.focus();
    else if (cible === 'lien') (racine.current?.querySelector<HTMLAnchorElement>('a[data-fiche-adsmap]') ?? bouton.current)?.focus();
    else bouton.current?.focus();
  });

  const envoyer = async (formatAd?: string) => {
    if (verrou.current || etat === 'ok') return;
    verrou.current = true;
    if (formatAd) setChoix((c) => (c ? { ...c, envoi: true, erreur: null } : c));
    else setEtat('envoi');
    try {
      const r = await trackSavedAdAction(formatAd ? { platform, externalId, formatAd } : { platform, externalId });
      if (r.choixFormat) {
        const { options, raison } = r.choixFormat;
        setChoix({ options, raison, envoi: false, erreur: null });
        setEtat('choix');
        focusApres.current = 'choix';
      } else if (r.error) {
        if (formatAd) setChoix((c) => (c ? { ...c, envoi: false, erreur: r.error ?? null } : c));
        else setEtat(r.error);
      } else {
        setFiche({ adId: r.adId ?? null, deja: !!r.dejaSuivie });
        setChoix(null);
        setEtat('ok');
        if (formatAd) focusApres.current = 'lien';
      }
    } catch {
      const msg = 'Échec · vérifie ta connexion puis réessaie.';
      if (formatAd) setChoix((c) => (c ? { ...c, envoi: false, erreur: msg } : c));
      else setEtat(msg);
    } finally {
      verrou.current = false;
    }
  };
  const declencher = () => {
    if (etat === 'choix') { racine.current?.querySelector<HTMLSelectElement>('select')?.focus(); return; }
    void envoyer();
  };
  const annuler = () => {
    if (choix?.envoi) return;
    setChoix(null);
    setEtat('repos');
    focusApres.current = 'bouton';
  };

  const fait = etat === 'ok';
  const erreur = etat !== 'repos' && etat !== 'envoi' && etat !== 'ok' && etat !== 'choix' ? etat : null;
  return (
    <div ref={racine} style={{ display: 'grid', gap: 4 }}>
      <button ref={bouton} type="button" onClick={declencher} aria-disabled={fait || etat === 'envoi'} aria-expanded={etat === 'choix' ? true : undefined} aria-controls={etat === 'choix' ? formId : undefined}
        title="Crée un concept « imitation » en brouillon dans Adsmap · rien n’est lancé"
        style={{
          width: '100%', minHeight: CIBLE_TACTILE_MIN, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 10px', borderRadius: 9,
          border: '1px solid ' + (fait ? 'transparent' : 'var(--line-2)'), background: fait ? 'var(--accent-soft)' : 'var(--paper)',
          color: fait ? 'var(--accent-strong)' : 'var(--ink-2)', cursor: fait || etat === 'envoi' ? 'default' : 'pointer', fontSize: 12.5, fontWeight: 600,
        }}>
        <span style={{ display: 'inline-flex' }} aria-hidden><Icon name="map" size={15} /></span>
        <span>{fait ? (fiche.deja ? 'Déjà suivie dans Adsmap' : 'Brouillon de test créé dans Adsmap') : etat === 'envoi' ? 'Préparation…' : 'Préparer un test · Adsmap'}</span>
      </button>
      {choix && <ChoixTypeAd id={formId} options={choix.options} raison={choix.raison} envoi={choix.envoi} erreur={choix.erreur} onValider={(f) => { void envoyer(f); }} onAnnuler={annuler} />}
      <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.4, color: erreur ? 'var(--danger, #e5484d)' : 'var(--muted)' }}>
        {/* Le lien a sa propre ligne · en ligne, sa hauteur de 44 px écartait
            la suite du texte (vu sur la capture à 1440 et 390). */}
        {erreur ?? (fait ? <>{fiche.adId ? <><a href={lienFicheAdsmap(fiche.adId)} data-fiche-adsmap style={{ display: 'flex', width: 'fit-content', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, color: 'var(--accent-strong)', fontWeight: 700 }}>Ouvrir la fiche dans Adsmap</a>{' '}</> : null}Hypothèse et variable à compléter avant le test.</> : '')}
      </p>
    </div>
  );
}

/**
 * Message 77 · le choix EXPLICITE du type d'ad Adsmap, partagé par « Préparer
 * un test » (Formats) et « Suivre dans Adsmap » (Sauvegardes).
 *
 * Rien n'est présélectionné (la valeur vide est un invite, non choisissable) ·
 * « Créer la fiche » sans choix le dit sans rien envoyer · Entrée valide, Échap
 * annule (comme « Annuler ») · le choix est conservé pendant l'envoi et après
 * une erreur · aucun bouton n'est `disabled` (le focus n'y tombe pas sur
 * `body`), l'envoi en cours est dit par `aria-disabled`.
 */
export function ChoixTypeAd({ id, options, raison, envoi, erreur, onValider, onAnnuler }: {
  id?: string; options: OptionTypeAd[]; raison: string; envoi: boolean; erreur: string | null;
  onValider: (formatAd: string) => void; onAnnuler: () => void;
}) {
  const [valeur, setValeur] = useState('');
  const [manque, setManque] = useState(false);
  const base = useId();
  const champ = `${base}-type`;
  const msg = manque ? 'Choisis un type d’ad avant de créer la fiche.' : erreur;
  return (
    <form id={id} data-choix-type-ad noValidate
      onSubmit={(e) => { e.preventDefault(); if (envoi) return; if (!valeur) { setManque(true); return; } onValider(valeur); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onAnnuler(); } }}
      style={{ ...tuile, display: 'grid', gap: 6, padding: 10, background: 'var(--surface)', minWidth: 0 }}>
      <p id={`${base}-raison`} style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-2)' }}>{raison}</p>
      <label htmlFor={champ} style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Type d’ad Adsmap</label>
      <select id={champ} value={valeur} aria-describedby={`${base}-raison${msg ? ` ${base}-msg` : ''}`} aria-invalid={manque || undefined}
        onChange={(e) => { setValeur(e.target.value); setManque(false); }}
        style={{ width: '100%', minHeight: CIBLE_TACTILE_MIN, padding: '6px 10px', borderRadius: 9, border: '1px solid var(--line-2)', background: 'var(--paper)', color: valeur ? 'var(--ink)' : 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
        <option value="" disabled>Choisir un type…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.libelle}</option>)}
      </select>
      {msg && <p id={`${base}-msg`} role="alert" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.4, color: 'var(--danger, #e5484d)' }}>{msg}</p>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="submit" aria-disabled={envoi || undefined}
          style={{ flex: '1 1 auto', minHeight: CIBLE_TACTILE_MIN, padding: '6px 12px', borderRadius: 9, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 700, fontSize: 12.5, cursor: envoi ? 'default' : 'pointer' }}>
          {envoi ? 'Création…' : 'Créer la fiche'}
        </button>
        <button type="button" onClick={onAnnuler} aria-disabled={envoi || undefined}
          style={{ minHeight: CIBLE_TACTILE_MIN, padding: '6px 12px', borderRadius: 9, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink-2)', fontWeight: 600, fontSize: 12.5, cursor: envoi ? 'default' : 'pointer' }}>
          Annuler
        </button>
      </div>
    </form>
  );
}
