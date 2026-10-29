'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  capacitesDuRefus, changementFormatManuel, infoEtapeNouveau, controleVisionDevis, formatDejaEcrit, libelleCaseControleVisuel,
  lireLigneTexte, saisieFormatDepuisBrief, signatureChoixDevis, verdictDevisRecu,
  ALLOWED_PATHS_BRIEF, MESSAGE_DEVIS_INCONNU, OPTIONS_FORMAT_ASSISTANT,
  type BriefCanonique, type ErreurStudio, type FormatDocument, type ModeImage, type SaisieFormat,
} from '@tiktrends/core';
import { creditsAppelAnnonceMicros, mentionAppelTexte } from '@tiktrends/core';
import { useRegime } from '../../../coquille/contexte';
import { compilerConsigneImage, demanderDevisImage, lireParcoursImage, retenirConsigneImage } from '../../../../app/actions/studios/image';
import { appliquerProposition, creerPropositionManuelle } from '../../../../app/actions/studios/propositions';
import { preparerLotFormats } from '../../../../app/actions/studios/lot-formats';
import { preparerLotImages } from '../../../../app/actions/studios/lot-images';
import type { DevisImageVue, VueParcoursImage } from '../../../../lib/studios/image/parcours';
import type { VueLotImages } from '../../../../lib/studios/image/lot-images';
import { MESSAGE_APPEL_PAYANT, resultatPayantIncertain, useAppelPayant } from '../../../../lib/studios/appel-payant';
import { Ic, Lien } from '../../../communs';
import { Ornement } from '../Ornement';

/**
 * Étape FORMAT & DEVIS (porté de la V5 `EtapeFormatDevis`), sur les VRAIES
 * commandes du parcours image · balisage de la maquette (`.fmtpick`, nombre
 * de visuels, tuile de devis) :
 *  · les formats (1:1 · 4:5 · 9:16) · le format source s'écrit dans le brief
 *    par une proposition manuelle appliquée (gratuit) ; plusieurs formats ou
 *    plusieurs variantes font un LOT (`preparerLotFormats` / `preparerLotImages`) ;
 *  · la relecture automatique est la ligne de devis du contrôle visuel,
 *    cochable seulement quand le serveur sait l'exécuter ;
 *  · « Préparer la consigne avec Jarvis » · appel texte PAYANT, coût annoncé
 *    au-dessus du bouton, verrou d'appel payant ; « Valider cette consigne »
 *    est gratuit ;
 *  · « Voir le devis serveur » · devis IMMUABLE, aucune dépense · une réponse
 *    qui ne correspond plus aux choix affichés est rejetée (jamais « le
 *    dernier devis du projet »). Le débit vient à l'étape suivante.
 */

const erreur = (r: ErreurStudio) => (r.violations?.length ? r.violations.map((v) => v.raison).join(' · ') : r.message);

/** La forme du format dans `.fmtpick` (même gabarit que la maquette · 56 de large, 82 de haut au plus). */
function forme(l: number, h: number) {
  const haut = Math.min(82, Math.round((56 * h) / l));
  return { width: Math.round((haut * l) / h), height: haut };
}

export function FormatDevis({ projectId, version, brief, onBriefChange, onDevisPret, onLotPret, onRetour, apercuProduitUrl }: {
  apercuProduitUrl?: string;
  projectId: string;
  version: { id: string; n: number };
  brief: BriefCanonique;
  onBriefChange: () => Promise<void> | void;
  onDevisPret: (devis: DevisImageVue) => void;
  onLotPret?: (lot: VueLotImages) => void;
  onRetour: () => void;
}) {
  const regime = useRegime();
  // Régime V2 · le contrôle visuel se paie en crédits, non mesuré : décoché d'office (29/10).
  const [saisie, setSaisie] = useState<SaisieFormat>(() => ({ ...saisieFormatDepuisBrief(brief), ...(regime === 'v2' ? { relectureAuto: false } : {}) }));
  const [vue, setVue] = useState<VueParcoursImage | null>(null);
  const [chargement, setChargement] = useState(true);
  const [nonActive, setNonActive] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [retour, setRetour] = useState<string | null>(null);
  const seqRef = useRef(0);
  const [mode, setMode] = useState<ModeImage>('generative_scene');
  const appel = useAppelPayant(projectId, 'compilation-image');
  const incertain = appel.bloque;
  const [nombre, setNombre] = useState(1);
  const nombreRef = useRef(nombre); nombreRef.current = nombre;
  const [formats, setFormats] = useState<FormatDocument[]>(() => [saisieFormatDepuisBrief(brief).format]);
  const formatsRef = useRef(formats); formatsRef.current = formats;
  const contexteRef = useRef(`${projectId}:${version.id}`); contexteRef.current = `${projectId}:${version.id}`;
  const [questions, setQuestions] = useState<string[]>([]);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await lireParcoursImage({ projectId });
      if (r.ok) { setVue(r.vue); setNonActive(null); }
      else if (capacitesDuRefus(r).length) { setNonActive(r.message); setVue(null); }
      else { setVue(null); setRetour(erreur(r)); }
    } catch { setVue(null); setRetour('Le serveur n’a pas répondu · actualise les possibilités, sans génération.'); }
    finally { setChargement(false); }
  }, [projectId]);
  useEffect(() => { void charger(); }, [charger, version.id]);

  const relectureDisponible = !!vue?.controleVision?.disponible;
  const relecture = relectureDisponible && saisie.relectureAuto;
  const signatureAffichee = signatureChoixDevis({ ...saisie, relectureAuto: relecture });
  const signatureAfficheeRef = useRef(signatureAffichee); signatureAfficheeRef.current = signatureAffichee;

  async function ecrireFormatSiBesoin(): Promise<boolean> {
    if (formatDejaEcrit(brief, saisie.format)) return true;
    const c = changementFormatManuel(saisie.format);
    const cree = await creerPropositionManuelle({ projectId, baseVersionId: vue?.version.id ?? version.id, cible: 'brief', changes: [c], explication: c.reason, allowedPaths: ALLOWED_PATHS_BRIEF });
    if (!cree.ok) { setRetour(erreur(cree)); return false; }
    if (cree.statut !== 'proposee') { setRetour('Le format n’a pas pu être enregistré · réessaie.'); return false; }
    const applique = await appliquerProposition({ proposalId: cree.proposition.id, projectId, baseVersionId: vue?.version.id ?? version.id });
    if (!applique.ok) { setRetour(erreur(applique)); return false; }
    await onBriefChange();
    return true;
  }

  async function preparerConsigne() {
    if (incertain || occupe || !vue?.disponibilite.compilation.disponible || !vue.modes.find((m) => m.mode === mode)?.pret) return;
    const tentative = appel.commencer(); if (!tentative) return;
    setOccupe(true); setRetour(null); setQuestions([]);
    try {
      if (!(await ecrireFormatSiBesoin())) { appel.terminer(tentative); return; }
      const r = await compilerConsigneImage({ projectId, mode });
      appel.terminer(tentative, resultatPayantIncertain(r));
      if (!r.ok) { setRetour(erreur(r)); return; }
      if (r.statut === 'questions') setQuestions(r.questions);
      await charger();
    } catch {
      appel.terminer(tentative, true);
      setRetour('La réponse de préparation est incertaine. Recharge le projet pour vérifier son état et son coût avant toute relance.');
    } finally { setOccupe(false); }
  }

  async function retenir() {
    if (incertain || occupe || !vue?.enAttente || !vue.disponibilite.retenir.disponible) return;
    setOccupe(true); setRetour(null);
    try {
      const r = await retenirConsigneImage({ projectId, baseVersionId: vue.version.id, runId: vue.enAttente.runId });
      if (!r.ok) { setRetour(erreur(r)); return; }
      await onBriefChange(); await charger();
    } catch { setRetour('Enregistrement non confirmé. Recharge le projet avant de poursuivre.'); }
    finally { setOccupe(false); }
  }

  async function demanderDevis() {
    if (incertain) return;
    if (vue && (!vue.retenue?.verdict.ok || !formatDejaEcrit(brief, saisie.format))) {
      setRetour('Prépare puis valide la consigne pour ce format avant de demander le devis.'); return;
    }
    const seq = ++seqRef.current;
    const nombreDemande = nombre;
    const formatsDemandes = [...formats];
    const contexteDemande = contexteRef.current;
    const saisieDemande: SaisieFormat = { ...saisie, relectureAuto: relecture };
    const signatureDemande = signatureChoixDevis(saisieDemande);
    setOccupe(true); setRetour(null);
    try {
      if (!(await ecrireFormatSiBesoin())) return;
      if ((nombreDemande > 1 || formatsDemandes.length > 1) && onLotPret) {
        const r = formatsDemandes.length > 1
          ? await preparerLotFormats({ projectId, formats: formatsDemandes, nombreParFormat: nombreDemande, controleVision: controleVisionDevis(saisieDemande) })
          : await preparerLotImages({ projectId, nombre: nombreDemande, controleVision: controleVisionDevis(saisieDemande) });
        if (seq !== seqRef.current) return;
        if (!r.ok) { setRetour(erreur(r)); return; }
        if (nombreRef.current !== nombreDemande || JSON.stringify(formatsRef.current) !== JSON.stringify(formatsDemandes) || contexteRef.current !== contexteDemande || signatureAfficheeRef.current !== signatureDemande) { setRetour(MESSAGE_DEVIS_INCONNU); return; }
        onLotPret(r.lot); return;
      }
      const d = await demanderDevisImage({ projectId, controleVision: controleVisionDevis(saisieDemande) });
      if (!d.ok) { setRetour(erreur(d)); return; }
      // Le devis vient d'être écrit · on relit et on le CORRÈLE à CETTE demande.
      const devisCreeId = d.devis?.id ?? null;
      const r = await lireParcoursImage({ projectId });
      if (!r.ok) { setRetour(erreur(r)); return; }
      const verdict = verdictDevisRecu({ seqDemande: seq, seqCourant: seqRef.current, signatureDemande, signatureAffichee: signatureAfficheeRef.current, devisCreeId, devisReluId: r.vue.devis?.id ?? null });
      if (!verdict.accepte) {
        if (verdict.raison === 'obsolete') return;
        setVue(r.vue); setRetour(MESSAGE_DEVIS_INCONNU); return;
      }
      setVue(r.vue);
      onDevisPret(r.vue.devis!);
    } catch {
      setRetour(MESSAGE_DEVIS_INCONNU);
    } finally {
      if (seqRef.current === seq) setOccupe(false);
    }
  }

  const total = nombre * (onLotPret ? formats.length : 1);
  const consigneValidee = !!vue?.retenue?.verdict.ok && formatDejaEcrit(brief, saisie.format);
  const apercuTexte = brief.texts[0] ? lireLigneTexte(brief.texts[0]).texte : null;

  return (
    <div data-zone="assistant-format" className="wz">
      {appel.bloque && <div className="banner" role="status"><Ic n="info" /><span>{MESSAGE_APPEL_PAYANT} <Lien href={`/studio/projets/${projectId}`}>Voir le suivi</Lien></span></div>}
      {nonActive ? (
        <section className="tile" data-zone="format-non-active" style={{ display: 'grid', gap: 8 }}>
          <div className="lbl">Génération d’images · non activée pour cet espace</div>
          <p className="muted" role="status" style={{ fontSize: '12.5px' }}>{nonActive}</p>
          <p className="faint" style={{ fontSize: '11.5px' }}>Le brief, la stratégie et la direction restent enregistrés · le devis s’ouvrira quand la génération sera activée.</p>
        </section>
      ) : (
        <>
          <section aria-label="Formats de sortie">
            <h2 style={{ marginBottom: 12 }}>Formats</h2>
            <div className="fmtpick" data-champ="format" role="group" aria-label="Formats de sortie">
              {OPTIONS_FORMAT_ASSISTANT.map((o) => {
                const choisi = onLotPret ? formats.includes(o.format) : o.format === saisie.format;
                return (
                  <button key={o.format} type="button" aria-pressed={choisi} data-format={o.format} disabled={occupe}
                    title={`${o.largeur} × ${o.hauteur} · ${o.placement}`}
                    onClick={() => {
                      if (!onLotPret) { setSaisie((s) => ({ ...s, format: o.format })); return; }
                      const prochains = choisi ? formats.filter((f) => f !== o.format) : [...formats, o.format];
                      if (!prochains.length) return;
                      setFormats(prochains);
                      // Ajouter une sortie ne réécrit pas le format source déjà validé.
                      if (!prochains.includes(saisie.format)) setSaisie((s) => ({ ...s, format: prochains[0]! }));
                      setRetour(null);
                    }}>
                    <i style={forme(o.largeur, o.hauteur)} />{o.libelle}
                  </button>
                );
              })}
            </div>
            <p className="faint" style={{ fontSize: '11.5px', marginTop: 8 }}>
              {OPTIONS_FORMAT_ASSISTANT.filter((o) => (onLotPret ? formats : [saisie.format]).includes(o.format)).map((o) => `${o.libelle} · ${o.largeur} × ${o.hauteur}, ${o.placement}`).join(' · ')}
              {vue && !vue.format.depuisBrief ? ` · format par défaut (${vue.format.libelle}), choisis-en un pour le fixer au brief.` : ''}
            </p>
            {(apercuProduitUrl || apercuTexte) && (
              <div className="kc" style={{ marginTop: 10, alignItems: 'flex-end' }}>
                {OPTIONS_FORMAT_ASSISTANT.filter((o) => (onLotPret ? formats : [saisie.format]).includes(o.format)).map((o) => (
                  <div key={o.format} className="ad" data-apercu-format={o.format} style={{ width: 90, aspectRatio: `${o.largeur} / ${o.hauteur}` }}>
                    <div className="ph">{apercuProduitUrl && <img src={apercuProduitUrl} alt="Photo produit de référence" />}</div>
                    {apercuTexte && <div className="band">{apercuTexte}</div>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {onLotPret && (
            <section aria-label="Nombre de visuels">
              <h2 style={{ marginBottom: 10 }}>Nombre de visuels</h2>
              <div className="kc" style={{ alignItems: 'center' }}>
                <button className="btn icon sm" style={{ width: 36 }} type="button" aria-label="Moins" data-nombre="-1" disabled={occupe || nombre <= 1} onClick={() => { setNombre((n) => Math.max(1, n - 1)); setRetour(null); }}>−</button>
                <b style={{ fontSize: 20, minWidth: 30, textAlign: 'center' }} className="num" data-champ="nombre">{nombre}</b>
                <button className="btn icon sm" style={{ width: 36 }} type="button" aria-label="Plus" data-nombre="1" disabled={occupe || nombre >= 4} onClick={() => { setNombre((n) => Math.min(4, n + 1)); setRetour(null); }}>+</button>
                <span className="faint" style={{ fontSize: '12.5px' }}>par format · même consigne validée pour chaque image, quatre au plus</span>
              </div>
            </section>
          )}

          <section aria-label="Relecture automatique">
            <h2 style={{ marginBottom: 10 }}>Relecture automatique</h2>
            {relectureDisponible ? (
              <label data-champ="relecture" className="kc" style={{ alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={saisie.relectureAuto} disabled={occupe} onChange={(e) => setSaisie((s) => ({ ...s, relectureAuto: e.target.checked }))} style={{ width: 18, height: 18 }} />
                <span>{libelleCaseControleVisuel(creditsAppelAnnonceMicros(regime, vue!.controleVision.borneParImageUsdMicros))}</span>
              </label>
            ) : (
              <p className="muted" data-champ="relecture-indisponible" style={{ fontSize: '12.5px' }}>La relecture automatique n’est pas exécutable sur ce serveur · le devis n’en portera pas la ligne.</p>
            )}
            <p className="faint" style={{ fontSize: '11.5px', marginTop: 6 }}>Fidélité produit, texte, marges et allégations. Chaque sortie est incluse dans le devis.</p>
          </section>

          <section className="tile" aria-label="Préparer la consigne" style={{ display: 'grid', gap: 10 }}>
            <div className="lbl">Consigne de création</div>
            {vue ? (
              <>
                {consigneValidee ? <p className="muted" role="status" style={{ fontSize: '12.5px' }}><Ic n="check" />Consigne validée · prête pour le devis.</p> : (
                  <>
                    <p className="muted" style={{ fontSize: '12.5px' }}>Jarvis prépare les instructions de ton image. Relis-les avant de les valider.</p>
                    <div className="seg" role="group" aria-label="Mode de création">
                      {vue.modes.map((m) => <button key={m.mode} type="button" aria-pressed={mode === m.mode} disabled={occupe || incertain || !m.pret} onClick={() => setMode(m.mode)}>{m.libelle}</button>)}
                    </div>
                    {!vue.modes.some((m) => m.pret) && <Lien className="btn sm" href={`/studio/projets/${projectId}/produit`}>Choisir le produit et sa photo</Lien>}
                    {!vue.disponibilite.compilation.disponible && <p className="faint" role="status" style={{ fontSize: '11.5px' }}>{vue.disponibilite.compilation.raison}</p>}
                    <p className="faint" data-cout="compilation" style={{ fontSize: '11.5px' }}>Préparation · {mentionAppelTexte(regime, vue.coutCompilationUsd)}</p>
                    <div className="kc">
                      <button className="btn sm" type="button" data-bouton="compiler-consigne" onClick={() => void preparerConsigne()}
                        disabled={occupe || incertain || !vue.disponibilite.compilation.disponible || !vue.modes.find((m) => m.mode === mode)?.pret}><Ic n="spark" />Préparer la consigne avec Jarvis</button>
                    </div>
                  </>
                )}
                {questions.length > 0 && (
                  <div role="status" style={{ display: 'grid', gap: 6 }}>
                    <p className="muted" style={{ fontSize: '12.5px' }}>À préciser dans le brief :</p>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '12.5px' }}>{questions.map((q) => <li key={q}>{q}</li>)}</ul>
                    <div className="kc"><button className="btn sm" type="button" onClick={onRetour}>Compléter la direction</button></div>
                  </div>
                )}
                {vue.enAttente && (
                  <div className="hcard" style={{ marginBottom: 0 }}>
                    <strong>Relis la consigne</strong>
                    <p>{vue.enAttente.generationInstruction}</p>
                    {vue.enAttente.negativeConstraints.length > 0 && <p className="faint">À éviter : {vue.enAttente.negativeConstraints.join(' · ')}</p>}
                    {vue.enAttente.protectedComponents.length > 0 && <p className="faint">À préserver : {vue.enAttente.protectedComponents.join(' · ')}</p>}
                    <div className="kc"><button className="btn sm pri" type="button" data-bouton="retenir-consigne" disabled={occupe || incertain || !vue.disponibilite.retenir.disponible} onClick={() => void retenir()}>Valider cette consigne · gratuit</button></div>
                  </div>
                )}
              </>
            ) : chargement
              ? <p className="faint" role="status" style={{ fontSize: '12.5px' }}>Chargement des possibilités de création…</p>
              : <div className="kc"><button className="btn sm" type="button" onClick={() => void charger()}>Actualiser les possibilités · sans génération</button></div>}
          </section>

          <section className="tile" aria-label="Devis de création" style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div className="lbl">Ton devis</div>
              <div className="big num" style={{ fontSize: 36 }} data-champ="sorties">{total} image{total > 1 ? 's' : ''}</div>
              <p className="muted" style={{ fontSize: '12.5px' }}>{onLotPret && formats.length > 1 ? `${nombre} visuel${nombre > 1 ? 's' : ''} × ${formats.length} formats · ` : ''}le prix exact s’affiche avec le devis serveur, après validation de la consigne.</p>
              <p className="faint" style={{ fontSize: '11.5px' }}>La préparation IA ci-dessus est une dépense distincte, annoncée avant son lancement. Le devis ne débite rien · tu confirmes le montant à l’étape suivante.</p>
            </div>
          </section>
        </>
      )}
      {retour && <div className="banner" role="alert" data-etat="erreur"><Ic n="x" /><span>{retour}</span></div>}
      <Ornement>
        <button className="btn icon" type="button" aria-label="Retour à la direction" data-bouton="retour-direction" disabled={occupe} onClick={onRetour}><Ic n="back" s={false} /></button>
        <span className="info">{nonActive ? 'Génération non activée · rien n’est lancé' : infoEtapeNouveau('format')}</span>
        {!nonActive && (
          <button className="btn pri" type="button" data-bouton="voir-devis" disabled={occupe || incertain || !consigneValidee} onClick={() => void demanderDevis()}>
            <Ic n="devis" s={false} />{occupe ? 'Calcul du devis…' : 'Voir le devis serveur'}
          </button>
        )}
      </Ornement>
    </div>
  );
}
