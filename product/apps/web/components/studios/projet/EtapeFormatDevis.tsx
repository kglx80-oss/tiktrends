'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  OPTIONS_FORMAT_ASSISTANT, saisieFormatDepuisBrief, changementFormatManuel, formatDejaEcrit, controleVisionDevis,
  capacitesDuRefus, libelleCaseControleVision, ALLOWED_PATHS_BRIEF, CIBLE_TACTILE_MIN, teinte,
  signatureChoixDevis, verdictDevisRecu, MESSAGE_DEVIS_INCONNU,
  devisIndicatifImage, libelleCredits, libelleUsd,
  type SaisieFormat, type BriefCanonique, type FormatDocument, type ErreurStudio, type ModeImage,
} from '@tiktrends/core';
import { lireParcoursImage, demanderDevisImage, compilerConsigneImage, retenirConsigneImage } from '../../../app/actions/studios/image';
import { creerPropositionManuelle, appliquerProposition } from '../../../app/actions/studios/propositions';
import type { VueParcoursImage, DevisImageVue } from '../../../lib/studios/image/parcours';
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
 *  · un devis INDICATIF (calcul, 0 $) s'affiche d'emblée · il n'engage rien ;
 *  · « Compiler la consigne » est la SEULE étape payante avant le devis : un
 *    appel texte dont le coût maximal est ANNONCÉ avant le clic (`coutCompilationUsd`,
 *    barrière de dépense serveur). Geste EXPLICITE · jamais automatique. La
 *    consigne compilée est RELUE puis « Retenue » (`styleRef.consigneImage`,
 *    nouvelle version) · c'est ce qui rend le devis serveur atteignable ;
 *  · « Voir le devis serveur » appelle `demanderDevisImage` · devis IMMUABLE,
 *    aucune dépense. Il n'est proposé (cliquable) qu'une fois la consigne
 *    retenue (jamais de bouton mort). Rien n'est fabriqué : le devis réel
 *    (lignes, montant, échéance) est remonté au parent qui ouvre la confirmation.
 */

const note: CSSProperties = { fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };
const titreEtape: CSSProperties = { margin: '2px 0 0', fontSize: 19, fontWeight: 500, color: 'var(--ink)' };
const sectionLbl: CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', margin: 0 };

function messageErreur(r: ErreurStudio): string {
  if (r.violations?.length) return r.violations.map((v) => v.raison).join(' · ');
  return r.message;
}

export function EtapeFormatDevis({ projectId, version, brief, onBriefChange, onDevisPret, onRetour }: {
  projectId: string;
  version: { id: string; n: number };
  brief: BriefCanonique;
  onBriefChange: () => Promise<void> | void;
  onDevisPret: (devis: DevisImageVue) => void;
  onRetour: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisieFormat>(() => saisieFormatDepuisBrief(brief));
  const [vue, setVue] = useState<VueParcoursImage | null>(null);
  const [nonActive, setNonActive] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  // Mode de compilation choisi (composée fidèle / scène générée) · défaut : la
  // consigne en cours, sinon le premier mode que le contrôle laisse passer.
  const [mode, setMode] = useState<ModeImage | ''>('');
  // Course réseau · numéro de la demande de devis en vol · une demande plus
  // récente rend la précédente obsolète (sa réponse ne doit rien afficher).
  const seqRef = useRef(0);

  const charger = useCallback(async () => {
    try {
      const r = await lireParcoursImage({ projectId });
      if (r.ok) { setVue(r.vue); setNonActive(null); }
      else if (capacitesDuRefus(r).length) { setNonActive(r.message); setVue(null); }
      else setRetour({ ok: false, texte: messageErreur(r) });
    } catch {
      setRetour({ ok: false, texte: 'Le serveur n’a pas répondu · recharge la page.' });
    }
  }, [projectId]);

  useEffect(() => { void charger(); }, [charger, version.id]);

  // Mode par défaut dès que la vue est là (même règle que le studio image).
  useEffect(() => {
    if (vue && !mode) {
      const voulu = vue.enAttente?.mode ?? vue.retenue?.mode;
      const m = vue.modes.find((x) => x.mode === voulu && x.pret) ?? vue.modes.find((x) => x.pret);
      if (m) setMode(m.mode);
    }
  }, [vue, mode]);

  // La relecture n'est cochable que si le serveur sait l'exécuter ici ; sinon on
  // la laisse décochée (aucune promesse) et on le dit.
  const relectureDisponible = !!vue?.controleVision?.disponible;
  const relecture = relectureDisponible && saisie.relectureAuto;

  // La consigne image · retenue (devis serveur atteignable), compilée en attente
  // (à retenir), ou à compiler. Un geste explicite à chaque fois.
  const consigneRetenue = vue?.retenue ?? null;
  const consigneEnAttente = vue?.enAttente ?? null;
  const compilationDispo = vue?.disponibilite?.compilation ?? null;
  // Coût maximal ANNONCÉ de l'appel texte de compilation (micro-dollars).
  const coutCompilationMicros = vue ? Math.round(vue.coutCompilationUsd * 1_000_000) : 0;

  // Devis INDICATIF · un CALCUL assemblé des montants que le serveur a déjà
  // renvoyés (prix de grille, borne du contrôle visuel). Affiché AVANT tout
  // clic payant, recalculé quand la relecture change · n'appelle rien, ne
  // dépense rien. Le devis serveur (ci-dessous) fige ce prix et exige, lui, la
  // consigne compilée (appel texte payant, hors parcours neuf).
  const devisIndic = vue
    ? devisIndicatifImage({
        prix: vue.prix,
        relectureDisponible,
        relectureAuto: saisie.relectureAuto,
        borneRelectureParImageUsdMicros: vue.controleVision.borneParImageUsdMicros,
      })
    : null;

  // Signature des choix AFFICHÉS à l'instant · lue au retour du devis pour
  // rejeter une réponse qui ne correspond plus à ce qu'on voit (devis périmé).
  const signatureAffichee = signatureChoixDevis({ ...saisie, relectureAuto: relecture });
  const signatureAfficheeRef = useRef(signatureAffichee);
  signatureAfficheeRef.current = signatureAffichee;

  async function ecrireFormatSiBesoin(): Promise<boolean> {
    if (formatDejaEcrit(brief, saisie.format)) return true;
    const c = creerManuel(saisie.format);
    const cree = await creerPropositionManuelle({ projectId, baseVersionId: version.id, cible: 'brief', changes: [c.changement], explication: c.explication, allowedPaths: ALLOWED_PATHS_BRIEF });
    if (!cree.ok) { setRetour({ ok: false, texte: messageErreur(cree) }); return false; }
    if (cree.statut !== 'proposee') { setRetour({ ok: false, texte: 'Le format n’a pas pu être enregistré · réessaie.' }); return false; }
    const applique = await appliquerProposition({ proposalId: cree.proposition.id, projectId, baseVersionId: version.id });
    if (!applique.ok) { setRetour({ ok: false, texte: messageErreur(applique) }); return false; }
    await onBriefChange();
    return true;
  }

  // Compilation de la consigne · appel texte PAYANT, coût annoncé avant le clic,
  // barrière de dépense côté serveur. Geste explicite · jamais automatique.
  async function compiler() {
    if (!vue || !mode) return;
    setOccupe(true);
    setRetour(null);
    try {
      // On fixe le format choisi avant de compiler (la consigne porte ce format).
      if (!(await ecrireFormatSiBesoin())) return;
      const r = await compilerConsigneImage({ projectId, mode });
      if (!r.ok) { setRetour({ ok: false, texte: messageErreur(r) }); return; }
      if (r.statut === 'questions') {
        setRetour({ ok: false, texte: 'La consigne n’est pas compilée · complète le brief (stratégie, direction) puis recompile. Rien n’a été débité au-delà de cet appel.' });
        await charger();
        return;
      }
      setRetour({ ok: true, texte: 'Consigne compilée · relis-la puis retiens-la pour atteindre le devis serveur.' });
      await charger();
    } catch {
      // Réponse perdue sur un appel PAYANT · on ne promet aucune absence d'effet.
      setRetour({ ok: false, texte: 'La réponse du serveur n’a pas été reçue · la compilation a pu être facturée. Recharge le projet avant de réessayer.' });
    } finally {
      setOccupe(false);
    }
  }

  // « Retenir » · relit l'attestation de la compilation (par son runId, jamais
  // une consigne du navigateur) et l'écrit dans une nouvelle version · gratuit.
  async function retenir() {
    if (!vue || !consigneEnAttente) return;
    setOccupe(true);
    setRetour(null);
    try {
      const r = await retenirConsigneImage({ projectId, baseVersionId: vue.version.id, runId: consigneEnAttente.runId });
      if (!r.ok) { setRetour({ ok: false, texte: messageErreur(r) }); return; }
      setRetour({ ok: true, texte: 'Consigne retenue · le devis serveur est prêt.' });
      await onBriefChange();
      await charger();
    } catch {
      setRetour({ ok: false, texte: MESSAGE_DEVIS_INCONNU });
    } finally {
      setOccupe(false);
    }
  }

  async function demanderDevis() {
    const seq = ++seqRef.current;
    const saisieDemande: SaisieFormat = { ...saisie, relectureAuto: relecture };
    const signatureDemande = signatureChoixDevis(saisieDemande);
    setOccupe(true);
    setRetour(null);
    try {
      if (!(await ecrireFormatSiBesoin())) return;
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
    <div data-zone="assistant-format" style={{ display: 'grid', gap: 16 }}>
      <div>
        <p style={{ ...note, fontSize: 12 }}>Étape 4 sur 5 · Format &amp; devis</p>
        <h2 style={titreEtape}>Formats &amp; devis</h2>
        <p style={note}>Choisis le format de sortie et la relecture · le devis serveur est calculé sur ces paramètres exacts. Aucun débit avant ta confirmation.</p>
      </div>

      {nonActive ? (
        <section data-zone="format-non-active" style={{ display: 'grid', gap: 8, border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
          <span style={sectionLbl}>Génération d’images · non activée pour cet espace</span>
          <p role="status" style={note}>{nonActive}</p>
          <p style={{ ...note, fontSize: 12.5 }}>Le brief, la stratégie et la direction restent enregistrés · le devis s’ouvrira quand la génération sera activée.</p>
        </section>
      ) : (
        <>
          <section aria-label="Format de sortie" style={{ display: 'grid', gap: 8 }}>
            <span style={sectionLbl}>Format de sortie</span>
            <div data-champ="format" role="radiogroup" aria-label="Format de sortie" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              {OPTIONS_FORMAT_ASSISTANT.map((o) => {
                const choisi = o.format === saisie.format;
                return (
                  <button key={o.format} type="button" role="radio" aria-checked={choisi} data-format={o.format}
                    onClick={() => setSaisie((s) => ({ ...s, format: o.format }))} disabled={occupe}
                    style={{ ...tuile, textAlign: 'left', padding: 12, cursor: occupe ? 'default' : 'pointer', display: 'grid', gap: 2, minHeight: CIBLE_TACTILE_MIN, background: choisi ? teinte('accent', .12) : 'var(--bg)', borderColor: choisi ? 'var(--accent-strong)' : 'var(--line)', opacity: occupe && !choisi ? 0.6 : 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{o.libelle}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{o.largeur} × {o.hauteur} · {o.placement}</span>
                  </button>
                );
              })}
            </div>
            {vue && !vue.format.depuisBrief && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Format par défaut ({vue.format.libelle}) · choisis-en un pour le fixer au brief.</span>}
          </section>

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
            <p style={{ ...note, fontSize: 12 }}>Fidélité produit, texte, marges, allégations · relue à la génération. Pas de choix de moteur ni de score ici.</p>
          </section>

          {devisIndic && (
            <section data-zone="devis-indicatif" aria-label="Devis indicatif" style={{ display: 'grid', gap: 8, border: '1px solid var(--line)', borderRadius: 10, padding: 14, background: 'var(--surface)' }}>
              <span style={sectionLbl}>Estimation</span>
              <p data-prix="indicatif" style={{ margin: 0, fontSize: 15, color: 'var(--ink)' }}>
                <strong>{libelleUsd(devisIndic.usdMicros)}</strong> · {libelleCredits(devisIndic.credits)}
              </p>
              <ul data-lignes="indicatif" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                {devisIndic.lignes.map((l) => (
                  <li key={l.cle} data-ligne={l.cle} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13.5, color: 'var(--ink-2)' }}>
                    <span>{l.libelle}</span>
                    <span style={{ color: 'var(--ink)' }}>{libelleUsd(l.usdMicros)}</span>
                  </li>
                ))}
              </ul>
              <p style={{ ...note, fontSize: 12 }}>Estimation calculée sur ces paramètres · aucun débit. Le devis serveur ne la fige qu’une fois la consigne compilée et retenue ci-dessous (appel texte payant, annoncé à part).</p>
            </section>
          )}

          {vue && (
            <section data-zone="consigne-image" aria-label="Consigne image" style={{ display: 'grid', gap: 8, border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
              <span style={sectionLbl}>Consigne image</span>
              {consigneRetenue ? (
                <>
                  <p data-etat-consigne="retenue" role="status" style={note}>Consigne retenue ({consigneRetenue.libelleMode}) · le devis serveur est prêt, il ne débite rien.</p>
                </>
              ) : consigneEnAttente ? (
                <>
                  <p data-etat-consigne="a-retenir" style={note}>Consigne compilée · relis-la puis retiens-la pour atteindre le devis serveur.</p>
                  <p data-consigne-apercu style={{ ...note, fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{consigneEnAttente.generationInstruction.slice(0, 240)}</p>
                  <button type="button" data-bouton="retenir-consigne" onClick={() => void retenir()} disabled={occupe}
                    style={{ ...btn, minHeight: CIBLE_TACTILE_MIN, justifySelf: 'start', opacity: occupe ? 0.6 : 1 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check" size={14} />{occupe ? 'Enregistrement…' : 'Retenir la consigne'}</span>
                  </button>
                </>
              ) : compilationDispo && !compilationDispo.disponible ? (
                <p data-etat-consigne="indisponible" role="status" style={note}>{compilationDispo.raison}</p>
              ) : (
                <>
                  {vue.modes.filter((m) => m.pret).length > 1 && (
                    <div data-champ="mode-compilation" role="radiogroup" aria-label="Mode de la consigne" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {vue.modes.filter((m) => m.pret).map((m) => {
                        const choisi = m.mode === mode;
                        return (
                          <button key={m.mode} type="button" role="radio" aria-checked={choisi} data-mode={m.mode} onClick={() => setMode(m.mode)} disabled={occupe}
                            style={{ ...tuile, padding: '8px 12px', cursor: occupe ? 'default' : 'pointer', background: choisi ? teinte('accent', .12) : 'var(--bg)', borderColor: choisi ? 'var(--accent-strong)' : 'var(--line)', minHeight: CIBLE_TACTILE_MIN, fontSize: 13.5, color: 'var(--ink)' }}>
                            {m.libelle}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p style={{ ...note, fontSize: 12.5 }}>La consigne se compile par un appel texte · {libelleUsd(coutCompilationMicros)} au plus, annoncé avant le clic. C’est la seule étape payante avant le devis serveur.</p>
                  <button type="button" data-bouton="compiler-consigne" onClick={() => void compiler()} disabled={occupe || !mode}
                    style={{ ...btn, minHeight: CIBLE_TACTILE_MIN, justifySelf: 'start', opacity: (occupe || !mode) ? 0.6 : 1 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="spark" size={14} />{occupe ? 'Compilation…' : `Compiler la consigne · ${libelleUsd(coutCompilationMicros)} au plus`}</span>
                  </button>
                </>
              )}
            </section>
          )}

          <footer style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 4 }}>
            <button type="button" data-bouton="retour-direction" onClick={onRetour} disabled={occupe} style={{ ...btnGhost, minHeight: CIBLE_TACTILE_MIN, opacity: occupe ? 0.6 : 1 }}>‹ Direction</button>
            <button type="button" data-bouton="voir-devis" onClick={() => void demanderDevis()} disabled={occupe || !consigneRetenue}
              style={{ ...btn, minHeight: CIBLE_TACTILE_MIN, opacity: (occupe || !consigneRetenue) ? 0.6 : 1 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="file" size={14} />{occupe ? 'Calcul du devis…' : 'Voir le devis serveur'}</span>
            </button>
          </footer>
          <p style={{ ...note, fontSize: 12.5 }}>{consigneRetenue ? 'Le devis serveur fige le prix · il ne débite rien. La confirmation vient à l’étape suivante.' : 'Le devis serveur s’ouvrira une fois la consigne compilée et retenue · l’estimation ci-dessus reste gratuite.'}</p>
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
