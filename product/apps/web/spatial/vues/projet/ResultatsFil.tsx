'use client';

import { useId } from 'react';
import { phraseNeeDeGagnante, type FilResultat, type GesteIterationCommentaire, type ResultatFil, type StatutHypotheseNote } from '@tiktrends/core';
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
 * Sous un résultat CONFIRMÉ seulement, « Itérer depuis la gagnante »
 * (`gestesGagnantesFil`, noyau) · un LIEN vers l'écran Itérer existant parti
 * de la gagnante (l'écran relit tout, rien n'est créé avant son clic) · fermé
 * avec sa raison écrite à côté · absent ailleurs, et le rendu d'un fil sans
 * résultat confirmé reste celui d'avant (capture `W/test/fixtures/fils-sans-confirmee-avant.html`).
 * Une itération partie d'une gagnante du même fil dit « née de la gagnante V7 ».
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
export function ResultatsFil({ fil, resultats, gagnantes }: { fil: FilResultat; resultats: readonly ResultatFil[]; gagnantes?: Readonly<Record<string, GesteIterationCommentaire>> }) {
  const id = useId();
  return (
    <span {...{ [`data-resultats-${fil}`]: '' }} style={{ display: 'grid', gap: 6, marginTop: 6 }}>
      {resultats.map((r, i) => (r.etat === 'conclue' ? (
        <span key={r.adId} {...{ [`data-resultat-${fil}`]: r.statut }} style={{ display: 'grid', gap: 4, fontSize: '11.5px' }}>
          <span><span className={`pill ${r.classe}`.trim()}><Ic n={r.icone} />{r.libelle}</span> <span className="muted" data-chiffre-resultat="">{r.variante} · lot #{r.lot.numero} · {r.chiffre}</span>{r.depuis && <span className="muted" data-nee-de-gagnante=""> · {phraseNeeDeGagnante(r.depuis)}</span>}</span>
          {r.lot.href
            ? <Lien className="btn sm" href={r.lot.href} data-lien-lot="" style={{ ...CIBLE, justifySelf: 'start' }} aria-label={`Voir le lot #${r.lot.numero} · ${r.libelle}, ${r.variante}`}>Voir le lot #{r.lot.numero}</Lien>
            : (
              <span className="kc" style={{ alignItems: 'center' }}>
                <button className="btn sm" type="button" data-lien-lot="" aria-describedby={`${id}-lot-${i}`} {...actionCible({ occupe: false, ferme: true, focalisable: 'tout' })}>Voir le lot #{r.lot.numero}</button>
                <RaisonFermee id={`${id}-lot-${i}`} cle={`lot-resultat-${fil}`}>{r.lot.raison}</RaisonFermee>
              </span>
            )}
          {gagnantes?.[r.adId] && <GesteGagnante fil={fil} geste={gagnantes[r.adId]!} variante={r.variante} raisonId={`${id}-gagnante-${i}`} />}
        </span>
      ) : (
        <span key={r.adId} {...{ [`data-resultat-${fil}`]: 'en_test' }} className="muted" style={{ fontSize: '11.5px' }}>
          <span className="pill c">{r.libelle}</span> {r.variante}{r.depuis && <span data-nee-de-gagnante="">, {phraseNeeDeGagnante(r.depuis)}</span>} · {r.phrase}
        </span>
      )))}
    </span>
  );
}

/**
 * « Itérer depuis la gagnante » · une NAVIGATION vers l'écran Itérer existant
 * (aucune action serveur ici · « Créer l'itération » là-bas rejoue les gardes)
 * · fermé · un bouton focalisable par la brique, sa raison écrite à côté.
 */
function GesteGagnante({ fil, geste, variante, raisonId }: { fil: FilResultat; geste: GesteIterationCommentaire; variante: string; raisonId: string }) {
  return geste.href
    ? <Lien className="btn sm" href={geste.href} data-iterer-gagnante="ouvert" data-geste="iterer-gagnante" style={{ ...CIBLE, justifySelf: 'start' }} aria-label={`${geste.libelle} · ${variante}`}><Ic n="loop" />{geste.libelle}</Lien>
    : (
      <span className="kc" data-iterer-gagnante="ferme" style={{ alignItems: 'center' }}>
        <button className="btn sm" type="button" data-geste="iterer-gagnante" aria-describedby={raisonId} {...actionCible({ occupe: false, ferme: true, focalisable: 'tout' })}><Ic n="loop" />{geste.libelle}</button>
        <RaisonFermee id={raisonId} cle={`iterer-gagnante-${fil}`}>{geste.raison}</RaisonFermee>
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
