'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { qualiteCarte, type EtatVerdictCarte } from '@tiktrends/core';
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
export function CartePub({ ad, format, meta, note, vignetteUrl, fullUrl, onOpen, onArchive, trackable }: {
  ad: AdItem;
  format: string;
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
    setSuiviNote(r.prelaunch ?? 'Ajoutée à la carte · complète son hypothèse avant de la lancer.');
  }

  // Optimiste · une créa qu'on vient de suivre passe « en mesure » si elle n'avait
  // pas encore de verdict · sinon on ne touche pas au verdict déjà connu.
  const verdict: EtatVerdictCarte | null = suivi === 'done' && !ad.verdict ? 'en_mesure' : (ad.verdict ?? null);

  const secondaires: ActionCarte[] = [
    { cle: 'dl', label: `Télécharger`, icon: 'download', href: fullUrl, download: `pub-${ad.id}.png` },
    ...(trackable ? [{
      cle: 'suivre',
      label: suivi === 'done' ? 'Suivie · en mesure' : suivi === 'busy' ? 'Suivi…' : suivi === 'err' ? 'Suivi · réessayer' : 'Suivre dans Adsmap',
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
      format={format}
      meta={meta}
      note={note}
      onApercu={onOpen}
      pertinence={<RatingControl genId={ad.id} rating={ad.rating} />}
      qualite={qualiteCarte({ ...(ad.controle ?? {}), faits: ad.faits ?? [], provenance: { date: (ad.createdAt ?? '').slice(0, 10) || null } })}
      performance={{ verdict, prediction: typeof ad.score === 'number' ? ad.score : null }}
      onVerifierFait={verifier}
      verifEnCours={enVerif}
      erreurVerif={erreurVerif}
      actionPrincipale={{ cle: 'ouvrir', label: 'Ouvrir', icon: 'frame', onClick: onOpen }}
      actionsSecondaires={secondaires}
    />
  );
}
