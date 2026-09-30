'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { qualiteCarte, texteAttenduDansImage, lienAdsmapCarte, etatApresSuivi, type EtatVerdictCarte } from '@tiktrends/core';
import { CarteCreative, type ActionCarte } from '../../../../components/CarteCreative';
import { RatingControl } from '../../../../components/CreativeActions';
import { trackGeneratedAdAction } from '../../../actions/adsmap-bridge';
import { verifierFaitAction } from '../../../actions/ads-faits';
import type { AdItem } from '../../../actions/ads';

/**
 * La carte d'une pub GÉNÉRÉE, dans la grille Pubs IA · l'adaptateur qui branche
 * une `AdItem` sur la carte créative commune. Toute la spécificité Pubs IA vit
 * ici (le suivi Adsmap et son état, la traduction du contrôle en synthèse
 * qualité) · la carte, elle, reste générique et réutilisable ailleurs.
 *
 * Trois signaux, chacun à sa place · pertinence (vote qui entraîne Jarvis),
 * qualité (relecture automatique · `qualiteCarte`), performance (verdict marché).
 * L'aperçu ne rogne jamais une créa qu'on a produite (`fit="contain"`).
 */
export function CartePub({ ad, format, sousTitre, meta, note, vignetteUrl, fullUrl, onOpen, onArchive, trackable }: {
  ad: AdItem;
  format: string;
  /** Distingueur des titres homonymes (variante/date) · calculé sur tout le lot. */
  sousTitre?: string;
  meta?: ReactNode;
  note?: ReactNode;
  vignetteUrl: string;
  fullUrl: string;
  onOpen: () => void;
  onArchive: () => void;
  trackable: boolean;
}) {
  // Le suivi Adsmap · son état ne vit que le temps de la session. Une fois suivie,
  // la créa passe « en mesure » · c'est le retour visible, dans la zone
  // performance, à l'endroit où le verdict tombera.
  const [suivi, setSuivi] = useState<'idle' | 'busy' | 'done' | 'err'>('idle');
  const [suiviNote, setSuiviNote] = useState('');
  // L'ad créée par « Suivre » · le lien vers son test s'ouvre sans rechargement.
  const [adSuivie, setAdSuivie] = useState<string | null>(null);
  const [enVerif, demarrerVerif] = useTransition();
  const [erreurVerif, setErreurVerif] = useState('');

  // Vérifier un fait · on enregistre la preuve (source obligatoire). L'action
  // revalide le studio · la carte reflète l'état réel (vérifié / caduc), calculé
  // au serveur, sans rafraîchissement piloté par le navigateur.
  function verifier(cle: string, source: string) {
    setErreurVerif('');
    demarrerVerif(async () => {
      const r = await verifierFaitAction({ adId: ad.id, factCle: cle, source });
      if (r.error) setErreurVerif(r.error);
    });
  }

  async function suivre() {
    if (suivi === 'busy' || suivi === 'done') return;
    setSuivi('busy');
    const r = await trackGeneratedAdAction(ad.id);
    if (r.error) { setSuivi('err'); setSuiviNote(r.error); return; }
    setSuivi('done');
    setAdSuivie(r.adId ?? null);
    setSuiviNote(r.prelaunch ?? 'Ajoutée à la carte · complète son hypothèse avant de la lancer.');
  }

  // Optimiste · une créa qu'on vient de suivre entre dans Adsmap en BROUILLON ·
  // elle n'est pas lancée, rien ne se mesure encore · « à lancer », jamais « en
  // mesure » (I1). Un verdict déjà connu n'est pas touché.
  const verdict: EtatVerdictCarte | null = suivi === 'done' ? etatApresSuivi(ad.verdict) : (ad.verdict ?? null);
  // Le passage vers le test · seulement vers une ad CONNUE de la marque active,
  // et seulement avec l'accès Adsmap (`trackable`).
  const lien = lienAdsmapCarte({ adsmapAdId: ad.adsmapAdId ?? adSuivie, etat: verdict, acces: trackable });

  const secondaires: ActionCarte[] = [
    { cle: 'dl', label: `Télécharger`, icon: 'download', href: fullUrl, download: `pub-${ad.id}.png` },
    ...(trackable ? [{
      cle: 'suivre',
      label: suivi === 'done' ? 'Suivie · à lancer' : suivi === 'busy' ? 'Suivi…' : suivi === 'err' ? 'Suivi · réessayer' : 'Suivre dans Adsmap',
      icon: 'map',
      onClick: suivre,
      disabled: suivi === 'done' || suivi === 'busy',
      hint: (suivi === 'err' || suivi === 'done') && suiviNote ? suiviNote : 'Mesurer cette créa dans Adsmap',
    } as ActionCarte] : []),
    { cle: 'arch', label: 'Archiver', icon: 'x', onClick: onArchive, danger: true },
  ];

  return (
    <CarteCreative
      media={{ url: vignetteUrl, aspect: '4 / 5', fit: 'contain' }}
      titre={ad.headline}
      sousTitre={sousTitre}
      format={format}
      meta={meta}
      note={note}
      onApercu={onOpen}
      pertinence={<RatingControl genId={ad.id} rating={ad.rating} />}
      qualite={qualiteCarte({ ...(ad.controle ?? {}), faits: ad.faits ?? [], renduPorteTexte: texteAttenduDansImage(ad.mode), provenance: { date: (ad.createdAt ?? '').slice(0, 10) || null } })}
      performance={{ verdict, prediction: typeof ad.score === 'number' ? ad.score : null, lien }}
      onVerifierFait={verifier}
      verifEnCours={enVerif}
      erreurVerif={erreurVerif}
      actionPrincipale={{ cle: 'ouvrir', label: 'Ouvrir', icon: 'frame', onClick: onOpen, variant: 'neutre' }}
      actionsSecondaires={secondaires}
    />
  );
}
