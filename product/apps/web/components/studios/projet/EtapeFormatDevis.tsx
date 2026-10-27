'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  lireLigneTexte, OPTIONS_FORMAT_ASSISTANT, saisieFormatDepuisBrief, changementFormatManuel, formatDejaEcrit, controleVisionDevis,
  capacitesDuRefus, libelleCaseControleVision, ALLOWED_PATHS_BRIEF, CIBLE_TACTILE_MIN, teinte,
  signatureChoixDevis, verdictDevisRecu, MESSAGE_DEVIS_INCONNU,
  libelleCoutTexteEstime, NOTE_BORNE_TEXTE, type ModeImage,
  type SaisieFormat, type BriefCanonique, type FormatDocument, type ErreurStudio,
} from '@tiktrends/core';
import { lireParcoursImage, demanderDevisImage, compilerConsigneImage, retenirConsigneImage } from '../../../app/actions/studios/image';
import { creerPropositionManuelle, appliquerProposition } from '../../../app/actions/studios/propositions';
import type { VueParcoursImage, DevisImageVue } from '../../../lib/studios/image/parcours';
import styles from './FormatDevis.module.css';
import { preparerLotFormats } from '../../../app/actions/studios/lot-formats';
import { preparerLotImages } from '../../../app/actions/studios/lot-images';
import type { VueLotImages } from '../../../lib/studios/image/lot-images';
import {useAppelPayant,MESSAGE_APPEL_PAYANT,resultatPayantIncertain} from '../../../lib/studios/appel-payant';
import Link from 'next/link';
import { Icon } from '../../Icon';
import { btn, btnGhost, tuile } from '../../ui';

/**
 * Étape FORMAT & DEVIS de l'assistant V5 (Lot 2c), branchée sur les VRAIES
 * commandes du parcours image.
 *
 *  · le format de sortie (4:5 / 1:1 / 9:16) est un CHOIX qui écrit `brief.formats`
 *    par le vrai cycle de propositions (manuelle + application · gratuit), ce qui
 *    pilote le format réel du document ;
 *  · « Relecture automatique » est la ligne de devis `quality.visual` (contrôle
 *    visuel), proposée seulement quand le serveur sait l'exécuter ici ;
 *  · PAS de choix de moteur, PAS de score Jarvis (décisions Kevin · dépense
 *    nouvelle) ;
 *  · « Voir le devis serveur » appelle `demanderDevisImage` · devis IMMUABLE,
 *    aucune dépense. Le devis réel (lignes, montant, échéance) est remonté au
 *    parent qui ouvre la confirmation. Rien n'est fabriqué : sans consigne image
 *    retenue, le serveur le DIT (message réel), aucun faux devis.
 */

const note: CSSProperties = { fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };
const titreEtape: CSSProperties = { margin: '2px 0 0', fontSize: 26, fontWeight: 500, color: 'var(--ink)' };
const sectionLbl: CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', margin: 0 };

function messageErreur(r: ErreurStudio): string {
  if (r.violations?.length) return r.violations.map((v) => v.raison).join(' · ');
  return r.message;
}

export function EtapeFormatDevis({ projectId, version, brief, onBriefChange, onDevisPret, onLotPret, onRetour, apercuProduitUrl }: {
  apercuProduitUrl?: string;
  projectId: string;
  version: { id: string; n: number };
  brief: BriefCanonique;
  onBriefChange: () => Promise<void> | void;
  onDevisPret: (devis: DevisImageVue) => void;
  onLotPret?: (lot: VueLotImages) => void;
  onRetour: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisieFormat>(() => saisieFormatDepuisBrief(brief));
  const [vue, setVue] = useState<VueParcoursImage | null>(null);
  const [chargement, setChargement] = useState(true);
  const [nonActive, setNonActive] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  // Course réseau · numéro de la demande de devis en vol · une demande plus
  // récente rend la précédente obsolète (sa réponse ne doit rien afficher).
  const seqRef = useRef(0);
  const [mode, setMode] = useState<ModeImage>('generative_scene');
  const appel=useAppelPayant(projectId,'compilation-image');
  const incertain=appel.bloque;
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
      else { setVue(null); setRetour({ ok: false, texte: messageErreur(r) }); }
    } catch {
      setVue(null);
      setRetour({ ok: false, texte: 'Le serveur n’a pas répondu · recharge la page.' });
    } finally { setChargement(false); }
  }, [projectId]);

  useEffect(() => { void charger(); }, [charger, version.id]);

  // La relecture n'est cochable que si le serveur sait l'exécuter ici ; sinon on
  // la laisse décochée (aucune promesse) et on le dit.
  const relectureDisponible = !!vue?.controleVision?.disponible;
  const relecture = relectureDisponible && saisie.relectureAuto;

  // Signature des choix AFFICHÉS à l'instant · lue au retour du devis pour
  // rejeter une réponse qui ne correspond plus à ce qu'on voit (devis périmé).
  const signatureAffichee = signatureChoixDevis({ ...saisie, relectureAuto: relecture });
  const signatureAfficheeRef = useRef(signatureAffichee);
  signatureAfficheeRef.current = signatureAffichee;

  async function ecrireFormatSiBesoin(): Promise<boolean> {
    if (formatDejaEcrit(brief, saisie.format)) return true;
    const c = creerManuel(saisie.format);
    const cree = await creerPropositionManuelle({ projectId, baseVersionId: vue?.version.id ?? version.id, cible: 'brief', changes: [c.changement], explication: c.explication, allowedPaths: ALLOWED_PATHS_BRIEF });
    if (!cree.ok) { setRetour({ ok: false, texte: messageErreur(cree) }); return false; }
    if (cree.statut !== 'proposee') { setRetour({ ok: false, texte: 'Le format n’a pas pu être enregistré · réessaie.' }); return false; }
    const applique = await appliquerProposition({ proposalId: cree.proposition.id, projectId, baseVersionId: vue?.version.id ?? version.id });
    if (!applique.ok) { setRetour({ ok: false, texte: messageErreur(applique) }); return false; }
    await onBriefChange();
    return true;
  }

  async function preparerConsigne() {
    if (incertain || occupe || !vue?.disponibilite.compilation.disponible || !vue.modes.find(m => m.mode === mode)?.pret) return;
    const tentative=appel.commencer();if(!tentative)return;
    setOccupe(true); setRetour(null); setQuestions([]);
    try {
      if (!(await ecrireFormatSiBesoin())) {appel.terminer(tentative);return;}
      const r = await compilerConsigneImage({ projectId, mode });
      appel.terminer(tentative,resultatPayantIncertain(r));
      if (!r.ok) { setRetour({ ok: false, texte: messageErreur(r) }); return; }
      if (r.statut === 'questions') setQuestions(r.questions);
      await charger();
    } catch {
      appel.terminer(tentative,true);
      setRetour({ ok: false, texte: 'La réponse de préparation est incertaine. Recharge le projet pour vérifier son état et son coût avant toute relance.' });
    } finally { setOccupe(false); }
  }

  async function retenir() {
    if (incertain || occupe || !vue?.enAttente || !vue.disponibilite.retenir.disponible) return;
    setOccupe(true); setRetour(null);
    try {
      const r = await retenirConsigneImage({ projectId, baseVersionId: vue.version.id, runId: vue.enAttente.runId });
      if (!r.ok) { setRetour({ ok: false, texte: messageErreur(r) }); return; }
      await onBriefChange(); await charger();
    } catch { setRetour({ ok: false, texte: 'Enregistrement non confirmé. Recharge le projet avant de poursuivre.' }); }
    finally { setOccupe(false); }
  }

  async function demanderDevis() {
    if (incertain) return;
    if (vue && (!vue.retenue?.verdict.ok || !formatDejaEcrit(brief, saisie.format))) {
      setRetour({ ok: false, texte: 'Prépare puis valide la consigne pour ce format avant de demander le devis.' }); return;
    }
    const seq = ++seqRef.current;
    const nombreDemande = nombre;
    const formatsDemandes = [...formats];
    const contexteDemande = contexteRef.current;
    const saisieDemande: SaisieFormat = { ...saisie, relectureAuto: relecture };
    const signatureDemande = signatureChoixDevis(saisieDemande);
    setOccupe(true);
    setRetour(null);
    try {
      if (!(await ecrireFormatSiBesoin())) return;
      if ((nombreDemande > 1 || formatsDemandes.length > 1) && onLotPret) {
        const r = formatsDemandes.length > 1
          ? await preparerLotFormats({ projectId, formats: formatsDemandes, nombreParFormat: nombreDemande, controleVision: controleVisionDevis(saisieDemande) })
          : await preparerLotImages({ projectId, nombre: nombreDemande, controleVision: controleVisionDevis(saisieDemande) });
        if (seq !== seqRef.current) return;
        if (!r.ok) { setRetour({ok:false,texte:messageErreur(r)}); return; }
        if (nombreRef.current !== nombreDemande || JSON.stringify(formatsRef.current) !== JSON.stringify(formatsDemandes) || contexteRef.current !== contexteDemande || signatureAfficheeRef.current !== signatureDemande) { setRetour({ok:false,texte:MESSAGE_DEVIS_INCONNU}); return; }
        onLotPret(r.lot); return;
      }
      const d = await demanderDevisImage({ projectId, controleVision: controleVisionDevis(saisieDemande) });
      if (!d.ok) { setRetour({ ok: false, texte: messageErreur(d) }); return; }
      // Le devis vient d'être écrit · on relit l'état réel et on CORRÈLE la
      // réponse à CETTE demande (identifiant du devis créé, choix affichés,
      // séquence) · jamais « le dernier devis du projet ».
      const devisCreeId = d.devis?.id ?? null;
      const r = await lireParcoursImage({ projectId });
      if (!r.ok) { setRetour({ ok: false, texte: messageErreur(r) }); return; }
      const verdict = verdictDevisRecu({
        seqDemande: seq, seqCourant: seqRef.current,
        signatureDemande, signatureAffichee: signatureAfficheeRef.current,
        devisCreeId, devisReluId: r.vue.devis?.id ?? null,
      });
      if (!verdict.accepte) {
        // Obsolète · une demande plus récente décide · on ne touche à rien.
        if (verdict.raison === 'obsolete') return;
        // Périmé / non corrélé · on ne présente JAMAIS ce devis comme courant.
        setVue(r.vue);
        setRetour({ ok: false, texte: MESSAGE_DEVIS_INCONNU });
        return;
      }
      setVue(r.vue);
      onDevisPret(r.vue.devis!);
    } catch {
      // Réponse perdue · état INCONNU · aucune promesse d'absence d'effet.
      setRetour({ ok: false, texte: MESSAGE_DEVIS_INCONNU });
    } finally {
      // Ne libère le verrou que si CETTE demande est encore la courante.
      if (seqRef.current === seq) setOccupe(false);
    }
  }

  return (
    <div data-zone="assistant-format" className={styles.root} style={{ display: 'grid', gap: 16 }}>
      {appel.bloque&&<p role="status">{MESSAGE_APPEL_PAYANT} <Link href={`/studio/projets/${projectId}`}>Voir le suivi</Link></p>}
      <div>
        <p style={{ ...note, fontSize: 12 }}>Étape 4 sur 5 · Format &amp; devis</p>
        <h2 style={titreEtape}>Formats &amp; devis</h2>
        <p style={note}>Choisis le format, prépare la consigne puis vérifie le devis avant de générer.</p>
      </div>

      {nonActive ? (
        <section data-zone="format-non-active" style={{ display: 'grid', gap: 8, border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
          <span style={sectionLbl}>Génération d’images · non activée pour cet espace</span>
          <p role="status" style={note}>{nonActive}</p>
          <p style={{ ...note, fontSize: 12.5 }}>Le brief, la stratégie et la direction restent enregistrés · le devis s’ouvrira quand la génération sera activée.</p>
        </section>
      ) : (
        <>
          <div className={styles.split}><div className={styles.column}>
          <section aria-label="Format de sortie" style={{ display: 'grid', gap: 8 }}>
            <span style={sectionLbl}>Format de sortie</span>
            <div data-champ="format" role={onLotPret ? "group" : "radiogroup"} aria-label="Format de sortie" className={styles.formats}>
              {OPTIONS_FORMAT_ASSISTANT.map((o) => {
                const choisi = onLotPret ? formats.includes(o.format) : o.format === saisie.format;
                return (
                  <button key={o.format} type="button" role={onLotPret ? "checkbox" : "radio"} aria-checked={choisi} data-format={o.format}
                    onClick={() => {
                      if (!onLotPret) { setSaisie(s => ({ ...s, format: o.format })); return; }
                      const prochains = choisi ? formats.filter(f => f !== o.format) : [...formats, o.format];
                      if (!prochains.length) return;
                      setFormats(prochains);
                      // Adding an output must not rewrite the validated source format.
                      if (!prochains.includes(saisie.format)) setSaisie(s => ({ ...s, format: prochains[0]! }));
                      setRetour(null);
                    }} disabled={occupe}
                    style={{ ...tuile, textAlign: 'left', padding: 12, cursor: occupe ? 'default' : 'pointer', display: 'grid', gap: 2, minHeight: CIBLE_TACTILE_MIN, background: choisi ? teinte('accent', .12) : 'var(--bg)', borderColor: choisi ? 'var(--accent-strong)' : 'var(--line)', opacity: occupe && !choisi ? 0.6 : 1 }}>
                    <span aria-hidden className={styles.ratio} style={{ aspectRatio: `${o.largeur}/${o.hauteur}` }}>{apercuProduitUrl ? <img src={apercuProduitUrl} alt="Photo produit de référence" /> : <span>{brief.texts[0] ? lireLigneTexte(brief.texts[0]).texte : o.libelle}</span>}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{o.libelle}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{o.largeur} × {o.hauteur} · {o.placement}</span>
                  </button>
                );
              })}
            </div>
            {vue && !vue.format.depuisBrief && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Format par défaut ({vue.format.libelle}) · choisis-en un pour le fixer au brief.</span>}
          </section>

          {onLotPret && <label className={styles.preparation}>Variantes par format<select value={nombre} disabled={occupe} onChange={e=>{setNombre(Number(e.target.value));setRetour(null);}}>{[1,2,3,4].map(n=><option key={n}>{n}</option>)}</select><small>Même consigne validée pour chaque image.</small></label>}
          <section aria-label="Relecture automatique" style={{ display: 'grid', gap: 6 }}>
            <span style={sectionLbl}>Relecture automatique</span>
            {relectureDisponible ? (
              <label data-champ="relecture" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: CIBLE_TACTILE_MIN, fontSize: 13.5, color: 'var(--ink)' }}>
                <input type="checkbox" checked={saisie.relectureAuto} onChange={(e) => setSaisie((s) => ({ ...s, relectureAuto: e.target.checked }))} disabled={occupe} style={{ width: 20, height: 20 }} />
                <span>{libelleCaseControleVision(vue!.controleVision.borneParImageUsdMicros)}</span>
              </label>
            ) : (
              <p style={{ ...note, fontSize: 12.5 }} data-champ="relecture-indisponible">La relecture automatique n’est pas exécutable sur ce serveur · le devis n’en portera pas la ligne.</p>
            )}
            <p style={{ ...note, fontSize: 12 }}>Fidélité produit, texte, marges et allégations. Chaque sortie est incluse dans le devis.</p>
          </section>

          <section className={styles.preparation} aria-label="Préparer la consigne">
            <h3>Consigne de création</h3>
            {vue ? <>
              {vue.retenue?.verdict.ok && formatDejaEcrit(brief, saisie.format) ? <p role="status">Consigne validée · prête pour le devis.</p> : <>
                <p>Jarvis prépare les instructions de ton image. Relis-les avant de les valider.</p>
                <div role="radiogroup" aria-label="Mode de création" className={styles.modes}>{vue.modes.map(m => <button type="button" role="radio" aria-checked={mode === m.mode} key={m.mode} disabled={occupe || incertain || !m.pret} onClick={() => setMode(m.mode)}>{m.libelle}</button>)}</div>
                {!vue.modes.some(m => m.pret) && <Link href={`/studio/projets/${projectId}/produit`}>Choisir le produit et sa photo</Link>}
                {!vue.disponibilite.compilation.disponible && <p role="status">{vue.disponibilite.compilation.raison}</p>}
                <p data-cout="compilation">Préparation IA payante · {libelleCoutTexteEstime(vue.coutCompilationUsd)} · {NOTE_BORNE_TEXTE}</p>
                <button type="button" data-bouton="compiler-consigne" style={btnGhost} onClick={() => void preparerConsigne()} disabled={occupe || incertain || !vue.disponibilite.compilation.disponible || !vue.modes.find(m => m.mode === mode)?.pret}>Préparer la consigne avec Jarvis</button>
              </>}
              {questions.length > 0 && <div role="status"><p>À préciser dans le brief :</p><ul>{questions.map(q => <li key={q}>{q}</li>)}</ul><button type="button" onClick={onRetour} style={btnGhost}>Compléter la direction</button></div>}
              {vue.enAttente && <div className={styles.review}>
                <h4>Relis la consigne</h4><p>{vue.enAttente.generationInstruction}</p>
                {vue.enAttente.negativeConstraints.length > 0 && <p>À éviter : {vue.enAttente.negativeConstraints.join(' · ')}</p>}
                {vue.enAttente.protectedComponents.length > 0 && <p>À préserver : {vue.enAttente.protectedComponents.join(' · ')}</p>}
                <button type="button" data-bouton="retenir-consigne" onClick={() => void retenir()} style={btn} disabled={occupe || incertain || !vue.disponibilite.retenir.disponible}>Valider cette consigne · gratuit</button>
              </div>}
            </> : chargement ? <p role="status">Chargement des possibilités de création…</p> : <button type="button" style={btnGhost} onClick={() => void charger()}>Actualiser les possibilités · sans génération</button>}
          </section>
          </div><aside className={styles.quote} aria-label="Devis de création"><h3>Ton devis</h3><strong className={styles.price}>{nombre * (onLotPret ? formats.length : 1)} image{nombre * (onLotPret ? formats.length : 1) > 1 ? 's' : ''}</strong><p>Le prix exact s’affiche après validation de la consigne.</p><p>La préparation IA ci-contre est une dépense distincte, annoncée avant son lancement.</p><small>Le devis de génération ne débite rien. Tu confirmeras le montant à l’étape suivante.</small></aside></div>

          <footer style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 4 }}>
            <button type="button" data-bouton="retour-direction" onClick={onRetour} disabled={occupe} style={{ ...btnGhost, minHeight: CIBLE_TACTILE_MIN, opacity: occupe ? 0.6 : 1 }}>‹ Direction</button>
            <button type="button" data-bouton="voir-devis" onClick={() => void demanderDevis()} disabled={occupe || incertain || !vue?.retenue?.verdict.ok || !formatDejaEcrit(brief, saisie.format)}
              style={{ ...btn, minHeight: CIBLE_TACTILE_MIN, opacity: occupe ? 0.6 : 1 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="file" size={14} />{occupe ? 'Calcul du devis…' : 'Voir le devis serveur'}</span>
            </button>
          </footer>
          <p style={{ ...note, fontSize: 12.5 }}>Le devis serveur fige le prix · il ne débite rien. La confirmation vient à l’étape suivante.</p>
        </>
      )}

      {retour && <p role={retour.ok ? 'status' : 'alert'} data-etat={retour.ok ? 'ok' : 'erreur'} style={{ margin: 0, fontSize: 13.5, color: retour.ok ? 'var(--ink-2)' : 'var(--err-text)' }}>{retour.texte}</p>}
    </div>
  );
}

function creerManuel(format: FormatDocument) {
  const c = changementFormatManuel(format);
  return { changement: c, explication: c.reason };
}
