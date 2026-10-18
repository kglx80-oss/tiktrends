'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  OPTIONS_FORMAT_ASSISTANT, saisieFormatDepuisBrief, changementFormatManuel, formatDejaEcrit, controleVisionDevis,
  capacitesDuRefus, libelleCaseControleVision, ALLOWED_PATHS_BRIEF, CIBLE_TACTILE_MIN, teinte,
  type SaisieFormat, type BriefCanonique, type FormatDocument, type ErreurStudio,
} from '@tiktrends/core';
import { lireParcoursImage, demanderDevisImage } from '../../../app/actions/studios/image';
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
 *  · « Voir le devis serveur » appelle `demanderDevisImage` · devis IMMUABLE,
 *    aucune dépense. Le devis réel (lignes, montant, échéance) est remonté au
 *    parent qui ouvre la confirmation. Rien n'est fabriqué : sans consigne image
 *    retenue, le serveur le DIT (message réel), aucun faux devis.
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

  // La relecture n'est cochable que si le serveur sait l'exécuter ici ; sinon on
  // la laisse décochée (aucune promesse) et on le dit.
  const relectureDisponible = !!vue?.controleVision?.disponible;
  const relecture = relectureDisponible && saisie.relectureAuto;

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

  async function demanderDevis() {
    setOccupe(true);
    setRetour(null);
    try {
      if (!(await ecrireFormatSiBesoin())) return;
      const d = await demanderDevisImage({ projectId, controleVision: controleVisionDevis({ ...saisie, relectureAuto: relecture }) });
      if (!d.ok) { setRetour({ ok: false, texte: messageErreur(d) }); return; }
      // Le devis vient d'être écrit · on relit l'état réel et on remonte le devis vu.
      const r = await lireParcoursImage({ projectId });
      if (r.ok && r.vue.devis) { setVue(r.vue); onDevisPret(r.vue.devis); return; }
      setRetour({ ok: false, texte: 'Le devis a été créé mais n’est pas lisible · recharge la page.' });
    } catch {
      setRetour({ ok: false, texte: 'Le serveur n’a pas répondu · rien n’a été deviser. Recharge avant de réessayer.' });
    } finally {
      setOccupe(false);
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
                    onClick={() => setSaisie((s) => ({ ...s, format: o.format }))}
                    style={{ ...tuile, textAlign: 'left', padding: 12, cursor: 'pointer', display: 'grid', gap: 2, minHeight: CIBLE_TACTILE_MIN, background: choisi ? teinte('accent', .12) : 'var(--bg)', borderColor: choisi ? 'var(--accent-strong)' : 'var(--line)' }}>
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
                <input type="checkbox" checked={saisie.relectureAuto} onChange={(e) => setSaisie((s) => ({ ...s, relectureAuto: e.target.checked }))} style={{ width: 20, height: 20 }} />
                <span>{libelleCaseControleVision(vue!.controleVision.borneParImageUsdMicros)}</span>
              </label>
            ) : (
              <p style={{ ...note, fontSize: 12.5 }} data-champ="relecture-indisponible">La relecture automatique n’est pas exécutable sur ce serveur · le devis n’en portera pas la ligne.</p>
            )}
            <p style={{ ...note, fontSize: 12 }}>Fidélité produit, texte, marges, allégations · relue à la génération. Pas de choix de moteur ni de score ici.</p>
          </section>

          <footer style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 4 }}>
            <button type="button" data-bouton="retour-direction" onClick={onRetour} style={{ ...btnGhost, minHeight: CIBLE_TACTILE_MIN }}>‹ Direction</button>
            <button type="button" data-bouton="voir-devis" onClick={() => void demanderDevis()} disabled={occupe}
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
