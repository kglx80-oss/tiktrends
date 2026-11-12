'use client';

import { useId } from 'react';
import type { FilResultat, ResultatFil, StatutHypotheseNote } from '@tiktrends/core';
import { Ic, Lien } from '../../communs';
import { CIBLE, RaisonFermee } from './briques';
import { boutonAction, type OptionsBoutonAction } from './action-serveur';

/**
 * Le RÉSULTAT sous le fil d'où une itération est née · un commentaire
 * (onglet Activité, #1066) ou une note du canvas de lignée (lot 11) · UN rendu
 * pour les deux fils (même pastille, même chiffre clé, même lien « Voir le lot
 * #n », même phrase « en test ») · seuls les attributs de lecture nomment le
 * fil (`data-resultat-commentaire` / `data-resultat-note`). Le rendu du
 * commentaire est gardé IDENTIQUE à celui d'avant la généralisation (capture
 * comparée octet pour octet · `W/test/resultat-note-db.test.tsx`).
 *
 * Et, pour une note d'où est née une hypothèse, le STATUT de sa carte
 * (`statutsHypothesesNote`) · la colonne, la conclusion, le chiffre clé et le
 * lien qu'elle porte · fermé avec sa raison hors de la marque active.
 */

/** La brique, avec la cible tactile de 44 px gardée même fermée (l'aspect fermé s'ajoute, il ne la remplace pas). */
const actionCible = (o: OptionsBoutonAction) => { const a = boutonAction(o); return { ...a, style: { ...CIBLE, ...a.style } }; };

/**
 * Le résultat des itérations nées du fil · calculé par le serveur
 * (`resultatsFil`) · conclue · le statut, le chiffre clé et le lien vers le lot
 * (fermé avec sa raison hors de la marque active) · sinon « en test ».
 */
export function ResultatsFil({ fil, resultats }: { fil: FilResultat; resultats: readonly ResultatFil[] }) {
  const id = useId();
  return (
    <span {...{ [`data-resultats-${fil}`]: '' }} style={{ display: 'grid', gap: 6, marginTop: 6 }}>
      {resultats.map((r, i) => (r.etat === 'conclue' ? (
        <span key={r.adId} {...{ [`data-resultat-${fil}`]: r.statut }} style={{ display: 'grid', gap: 4, fontSize: '11.5px' }}>
          <span><span className={`pill ${r.classe}`.trim()}><Ic n={r.icone} />{r.libelle}</span> <span className="muted" data-chiffre-resultat="">{r.variante} · lot #{r.lot.numero} · {r.chiffre}</span></span>
          {r.lot.href
            ? <Lien className="btn sm" href={r.lot.href} data-lien-lot="" style={{ ...CIBLE, justifySelf: 'start' }} aria-label={`Voir le lot #${r.lot.numero} · ${r.libelle}, ${r.variante}`}>Voir le lot #{r.lot.numero}</Lien>
            : (
              <span className="kc" style={{ alignItems: 'center' }}>
                <button className="btn sm" type="button" data-lien-lot="" aria-describedby={`${id}-lot-${i}`} {...actionCible({ occupe: false, ferme: true, focalisable: 'tout' })}>Voir le lot #{r.lot.numero}</button>
                <RaisonFermee id={`${id}-lot-${i}`} cle={`lot-resultat-${fil}`}>{r.lot.raison}</RaisonFermee>
              </span>
            )}
        </span>
      ) : (
        <span key={r.adId} {...{ [`data-resultat-${fil}`]: 'en_test' }} className="muted" style={{ fontSize: '11.5px' }}>
          <span className="pill c">{r.libelle}</span> {r.variante} · {r.phrase}
        </span>
      )))}
    </span>
  );
}

/**
 * Le statut des hypothèses nées d'une note · la règle de leur carte
 * (`statutsHypothesesNote`) · la colonne (« Hypothèse · En test »), la
 * conclusion de la carte et le chiffre clé du lot conclu quand il y en a un, la
 * phrase de l'hypothèse, puis le lien qu'elle porte (le lot, sinon la page
 * Hypothèses) · fermé avec sa raison hors de la marque active.
 */
export function StatutsHypothesesNote({ statuts }: { statuts: readonly StatutHypotheseNote[] }) {
  const id = useId();
  return (
    <span data-hypotheses-note="" style={{ display: 'grid', gap: 6, marginTop: 6 }}>
      {statuts.map((h, i) => (
        <span key={h.adId} data-hypothese-de-note={h.colonne} style={{ display: 'grid', gap: 4, fontSize: '11.5px' }}>
          <span>
            <span className="pill c" data-colonne-hypothese="">{h.libelle}</span>
            {h.conclusion && <> <span className={`pill ${h.conclusion.classe}`.trim()} data-conclusion-hypothese=""><Ic n={h.conclusion.icone} />{h.conclusion.libelle}</span></>}
            {h.chiffre && <> <span className="muted" data-chiffre-resultat="">{h.chiffre}</span></>}
          </span>
          <span className="muted" data-texte-hypothese="" style={{ overflowWrap: 'anywhere' }}>{h.texte}</span>
          {h.lien.href
            ? <Lien className="btn sm" href={h.lien.href} data-lien-hypothese="" style={{ ...CIBLE, justifySelf: 'start' }} aria-label={`${h.lien.libelle} · ${h.libelle}`}>{h.lien.libelle}</Lien>
            : (
              <span className="kc" style={{ alignItems: 'center' }}>
                <button className="btn sm" type="button" data-lien-hypothese="" aria-describedby={`${id}-hyp-${i}`} {...actionCible({ occupe: false, ferme: true, focalisable: 'tout' })}>{h.lien.libelle}</button>
                <RaisonFermee id={`${id}-hyp-${i}`} cle="lien-hypothese-note">{h.lien.raison}</RaisonFermee>
              </span>
            )}
        </span>
      ))}
    </span>
  );
}
