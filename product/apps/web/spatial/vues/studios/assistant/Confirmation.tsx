'use client';

import { useRef, useState } from 'react';
import {
  infoEtapeNouveau, libelleCredits, libelleUsd, peutConfirmerLancement, phraseCoutDevis,
  MESSAGE_LANCEMENT_INCERTAIN,
  type ErreurStudio,
} from '@tiktrends/core';
import { approuverEtLancerImage } from '../../../../app/actions/studios/image';
import { approuverLotImages } from '../../../../app/actions/studios/lot-images';
import type { DevisImageVue } from '../../../../lib/studios/image/parcours';
import type { VueLotImages } from '../../../../lib/studios/image/lot-images';
import type { JobPresente } from '../../../../lib/studios/execution/commandes';
import { MESSAGE_APPEL_PAYANT, resultatPayantIncertain, useAppelPayant } from '../../../../lib/studios/appel-payant';
import { Ic, Lien } from '../../../communs';
import { Ornement } from '../Ornement';

/**
 * CONFIRMATION de la génération (porté de la V5 `EtapeConfirmation` et
 * `ConfirmationLotImages`) · le seul geste qui débite :
 *  · le devis serveur RÉEL (montant, lignes, échéance) est affiché AVANT tout
 *    bouton ; « J'ai vérifié le devis » doit être coché ;
 *  · une image · `approuverEtLancerImage` (transaction job + réserve + débit,
 *    idempotente par la clé du clic gardée par devis) ;
 *  · un lot · `approuverLotImages` avec le manifeste EXACT annoncé (empreinte,
 *    crédits, montant) · le serveur approuve tout ou rien ;
 *  · réponse perdue · état incertain, verrou d'appel payant, aucun second clic
 *    ni navigation ; un refus (plafond, devis périmé) est montré, rien n'est lancé.
 */

const heure = (iso: string | Date) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const messageErreur = (r: ErreurStudio) => (r.violations?.length ? r.violations.map((v) => v.raison).join(' · ') : r.message);

/** Clé du clic gardée par devis (`sessionStorage`) · double clic ou reconnexion ⇒ même job, pas de second débit. */
function cleDuClic(quoteId: string): string {
  const k = `tt-assistant-devis-cle-${quoteId}`;
  try {
    const deja = window.sessionStorage.getItem(k);
    if (deja) return deja;
    const cle = `assist-${crypto.randomUUID()}`;
    window.sessionStorage.setItem(k, cle);
    return cle;
  } catch { return `assist-${quoteId}`; }
}

function Resume({ apercuProduitUrl, titre, texte, lignes }: { apercuProduitUrl?: string; titre: string; texte: string; lignes: ReadonlyArray<[string, string]> }) {
  return (
    <section className="tile" aria-label="Résumé de la génération" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
      {apercuProduitUrl && <img src={apercuProduitUrl} alt="Photo produit de référence" style={{ width: 120, borderRadius: 14 }} />}
      <strong style={{ fontSize: 14 }}>{titre}</strong>
      <p className="muted" style={{ fontSize: '12.5px' }}>{texte}</p>
      <div className="mtable">
        {lignes.map(([k, v]) => <div key={k} className="kc" style={{ justifyContent: 'space-between', fontSize: '12.5px' }}><span className="faint">{k}</span><b>{v}</b></div>)}
      </div>
    </section>
  );
}

export function ConfirmationDevis({ projectId, devis, onModifier, onLance, apercuProduitUrl }: {
  projectId: string; apercuProduitUrl?: string; devis: DevisImageVue; onModifier: () => void; onLance: (job: JobPresente) => void;
}) {
  const [verifie, setVerifie] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const appel = useAppelPayant(projectId, 'generation-image');
  const incertain = appel.bloque;

  async function confirmer() {
    if (!verifie || occupe || !peutConfirmerLancement(incertain)) return;
    const tentative = appel.commencer(); if (!tentative) return;
    setOccupe(true); setErreur(null);
    try {
      const r = await approuverEtLancerImage({ quoteId: devis.id, inputHash: devis.inputHash, creditsAnnonces: devis.credits, idempotencyKey: cleDuClic(devis.id) });
      appel.terminer(tentative, resultatPayantIncertain(r));
      if (!r.ok) { setErreur(messageErreur(r)); return; }
      onLance(r.job);
    } catch {
      appel.terminer(tentative, true);
      setErreur(MESSAGE_LANCEMENT_INCERTAIN);
    } finally { setOccupe(false); }
  }

  return (
    <div data-zone="assistant-confirmation" className="wz">
      <div className="grid2" style={{ alignItems: 'start' }}>
        <Resume apercuProduitUrl={apercuProduitUrl} titre="Ton image est prête à être lancée" texte="La consigne relue et le format choisi sont liés à ce devis. Modifier tes choix nécessite un nouveau devis."
          lignes={[['Livrable', '1 image'], ['Crédits', libelleCredits(devis.credits)], ['Validité', `Jusqu’à ${heure(devis.expiresAt)}`]]} />
        <section className="tile" aria-label="Devis serveur" data-devis={devis.id} style={{ display: 'grid', gap: 10 }}>
          <div className="lbl">Devis serveur</div>
          <div data-prix="devis">
            <div className="big num" style={{ fontSize: 36 }}>{libelleUsd(devis.usdMicros)}</div>
            <p className="muted" style={{ fontSize: '12.5px' }}>{phraseCoutDevis(devis.usdMicros, devis.qualification)} · {libelleCredits(devis.credits)} · valable jusqu’à {heure(devis.expiresAt)}</p>
          </div>
          <div className="mtable" data-lignes="devis">
            {devis.lignes.map((l, i) => (
              <div key={i} data-ligne-nature={l.natureCout} className="kc" style={{ justifyContent: 'space-between', fontSize: '12.5px' }}>
                <span className="muted">{l.libelle}</span><b>{libelleUsd(l.usdMicros)}{l.natureCout === 'borne' ? '' : ' · estimation'}</b>
              </div>
            ))}
          </div>
          <p className="faint" style={{ fontSize: '11.5px' }}>Montant calculé par le serveur sur ces paramètres exacts · aucun débit avant ta confirmation.</p>
          <label data-champ="verifie" className="kc" style={{ alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" disabled={occupe || incertain} checked={verifie} onChange={(e) => setVerifie(e.target.checked)} style={{ width: 18, height: 18 }} />
            <span>J’ai vérifié le devis et je confirme la dépense.</span>
          </label>
        </section>
      </div>
      {incertain && <div className="banner" role="status"><Ic n="info" /><span>{MESSAGE_APPEL_PAYANT} <Lien href={`/studio/projets/${projectId}`}>Voir les tâches</Lien></span></div>}
      {erreur && <div className="banner" role="alert" data-etat="erreur"><Ic n="x" /><span>{erreur}</span></div>}
      <Ornement>
        <button className="btn icon" type="button" aria-label="Modifier les paramètres" data-bouton="modifier" disabled={occupe || incertain} onClick={onModifier}><Ic n="back" s={false} /></button>
        <span className="info">{infoEtapeNouveau('confirm')}</span>
        <button className="btn pri" type="button" data-bouton="confirmer-generer" disabled={!verifie || occupe || incertain} onClick={() => void confirmer()}>
          <Ic n="spark" s={false} />{occupe ? 'Lancement…' : `Confirmer et générer · ${libelleCredits(devis.credits)}`}
        </button>
      </Ornement>
    </div>
  );
}

/** Le serveur approuve le manifeste complet du lot · aucune boucle de génération côté navigateur. */
export function ConfirmationLot({ lot, onModifier, onLance, apercuProduitUrl }: {
  lot: VueLotImages; onModifier: () => void; onLance: (jobIds: string[]) => void; apercuProduitUrl?: string;
}) {
  const [confirme, setConfirme] = useState(false);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const verrou = useRef(false);
  const appel = useAppelPayant(lot.projectId, 'generation-image');

  async function lancer() {
    if (!confirme || verrou.current || appel.bloque) return;
    const tentative = appel.commencer(); if (!tentative) return;
    verrou.current = true; setOccupe(true); setErreur('');
    try {
      const r = await approuverLotImages({ lotId: lot.id, empreinte: lot.empreinte, creditsAnnonces: lot.totalCredits, usdMicrosAnnonces: lot.totalUsdMicros, confirme: true });
      appel.terminer(tentative, resultatPayantIncertain(r));
      if (!r.ok) { setErreur(r.message); return; }
      onLance(r.jobs.map((j) => j.id));
    } catch {
      appel.terminer(tentative, true);
      setErreur('La réponse du lancement est incertaine. Consulte les tâches du projet avant toute nouvelle demande.');
    } finally { verrou.current = false; setOccupe(false); }
  }

  return (
    <div data-zone="confirmation-lot-images" className="wz">
      <div className="grid2" style={{ alignItems: 'start' }}>
        <Resume apercuProduitUrl={apercuProduitUrl} titre={`${lot.nombre} images`}
          texte={`${lot.type === 'images-formats' ? `Formats : ${[...new Set(lot.formats)].join(' · ')}` : 'Même format'} · consigne validée.`}
          lignes={[['Crédits du lot', libelleCredits(lot.totalCredits)], ['Validité', `Jusqu’à ${heure(lot.expiresAt)}`]]} />
        <section className="tile" aria-label="Devis total du lot" style={{ display: 'grid', gap: 10 }}>
          <div className="lbl">Ton devis</div>
          <div className="big num" style={{ fontSize: 36 }} data-prix="lot">{libelleUsd(lot.totalUsdMicros)}</div>
          <p className="muted" style={{ fontSize: '12.5px' }}>{phraseCoutDevis(lot.totalUsdMicros, lot.qualification)}</p>
          <p className="faint" style={{ fontSize: '11.5px' }}>{lot.nombre} sorties · aucune variation d’accroche ou de composition imposée.</p>
          <label className="kc" data-champ="verifie" style={{ alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={confirme} disabled={occupe || appel.bloque} onChange={(e) => setConfirme(e.target.checked)} style={{ width: 18, height: 18 }} />
            <span>J’ai vérifié le devis et je confirme la dépense.</span>
          </label>
        </section>
      </div>
      {erreur && <div className="banner" role="alert"><Ic n="x" /><span>{erreur}</span></div>}
      {appel.bloque && <div className="banner" role="status"><Ic n="info" /><span>{MESSAGE_APPEL_PAYANT} <Lien href={`/studio/projets/${lot.projectId}`}>Voir les tâches</Lien></span></div>}
      <Ornement>
        <button className="btn icon" type="button" aria-label="Modifier les paramètres" data-bouton="modifier" disabled={occupe || appel.bloque} onClick={onModifier}><Ic n="back" s={false} /></button>
        <span className="info">{infoEtapeNouveau('confirm')}</span>
        <button className="btn pri" type="button" data-bouton="confirmer-lot" disabled={!confirme || occupe || appel.bloque} onClick={() => void lancer()}>
          <Ic n="spark" s={false} />{occupe ? 'Lancement…' : `Confirmer et générer ${lot.nombre} images`}
        </button>
      </Ornement>
    </div>
  );
}
