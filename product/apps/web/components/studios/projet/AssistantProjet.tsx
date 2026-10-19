'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  ETAPES_RAIL, etatRailProjet, etapeProjetPrecedente, etapeProjetSuivante, etapeRequiertProjet, etapeRail,
  etapeDisponible, saisieBriefVide, verifierCreationAssistant,
  OBJECTIFS_V5, PLATEFORMES_V5, LIBELLES_OBJECTIF_V5, LIBELLES_PLATEFORME_V5, LIBELLES_TYPE_PROJET,
  TYPES_NOUVEAU_PROJET, TITRE_NOUVEAU_PROJET_MAX, OBJECTIF_MAX, CIBLE_TACTILE_MIN, CHEMIN_PROJETS,
  contenuVide, messageHorsLigneStudio, teinte,
  type EtapeAssistant, type EtatNouveauProjet, type TypeNouveauProjet, type SaisieBriefV5,
  type ObjectifType, type PlateformeV5, type ReferenceAdsmap, type ContenuVersion, type BriefCanonique,
} from '@tiktrends/core';
import { creerProjet } from '../../../app/actions/studios/projets';
import { lireProjetDetail } from '../../../app/actions/studios/sources';
import type { DevisImageVue } from '../../../lib/studios/image/parcours';
import { Icon } from '../../Icon';
import { btn, btnGhost, input, lbl, surface, tuile } from '../../ui';
import { usePropositionsBrief } from './usePropositionsBrief';
import { EtapeStrategie } from './EtapeStrategie';
import { EtapeDirection } from './EtapeDirection';
import { EtapeFormatDevis } from './EtapeFormatDevis';
import { EtapeConfirmation } from './EtapeConfirmation';

/**
 * L'assistant de création V5 (coquille `studioWizard`) porté sur les VRAIES
 * actions. Quatre étapes câblées · départ, brief (écrit le brief structuré V5 à
 * la création), puis stratégie et direction, qui opèrent sur le projet CRÉÉ via
 * le vrai cycle de propositions (relecture avant application, aucune écriture
 * sans geste). Format & devis et création restent « bientôt », non navigables.
 *
 * La règle (quelles étapes, transitions, complétude, contenu du brief, forme
 * des changements) vit au noyau (`studios/ux/assistant-projet`) ; ce composant
 * n'en est que le rendu. Rien ici n'appelle de modèle ni ne dépense : seule la
 * proposition Jarvis (payante, sous plafond, annoncée) part d'une action serveur.
 */

const note: CSSProperties = { fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };
const champ: CSSProperties = { ...input, fontSize: 16 };
const sectionLbl: CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', margin: '4px 0 2px' };
const lien: CSSProperties = { color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN };

export interface ProjetCourant { id: string; versionCourante: { id: string; n: number } }

export interface ProprietesAssistantProjet {
  etat: EtatNouveauProjet;
  initial: { type: TypeNouveauProjet; titre: string; intention: string };
  /** Personas Adsmap de la marque active · lecture, portée. Vide = « Aucun persona » seul. */
  personas: ReferenceAdsmap[];
}

export function AssistantProjet(p: ProprietesAssistantProjet) {
  const router = useRouter();
  const [etape, setEtape] = useState<EtapeAssistant>('start');
  const [type, setType] = useState<TypeNouveauProjet>(p.initial.type);
  const [titre, setTitre] = useState(p.initial.titre);
  const [saisie, setSaisie] = useState<SaisieBriefV5>({ ...saisieBriefVide(), intention: p.initial.intention });
  const [encours, setEncours] = useState(false);
  const [erreur, setErreur] = useState<{ message: string; traceId?: string } | null>(null);
  const [projet, setProjet] = useState<ProjetCourant | null>(null);
  const [brief, setBrief] = useState<BriefCanonique | null>(null);
  // Lot 2c · le devis serveur réel, posé à l'étape format, confirmé à l'étape confirm.
  const [devis, setDevis] = useState<DevisImageVue | null>(null);

  if (p.etat.etat !== 'pret') {
    return (
      <section data-zone="assistant-projet" data-etat={p.etat.etat} style={{ ...surface, background: 'var(--surface)', padding: 20, display: 'grid', gap: 10, maxWidth: 720 }}>
        <p style={note}>{p.etat.message}{p.etat.etat === 'sans-marque' && <> <a href={p.etat.lien.href} style={lien}>{p.etat.lien.libelle}</a></>}</p>
        <a href={CHEMIN_PROJETS} style={lien}>Voir les projets</a>
      </section>
    );
  }
  const marque = p.etat.marque;
  const maj = (c: Partial<SaisieBriefV5>) => setSaisie((s) => ({ ...s, ...c }));

  async function rafraichir() {
    if (!projet) return;
    try {
      const r = await lireProjetDetail({ projectId: projet.id });
      if (r.ok && !r.detail.briefIllisible && r.detail.brief) {
        setBrief(r.detail.brief);
        setProjet({ id: projet.id, versionCourante: { id: r.detail.version.id, n: r.detail.version.n } });
      }
    } catch { /* lecture seule · un échec ne casse rien, l'écran garde l'état connu */ }
  }

  async function creer() {
    const v = verifierCreationAssistant({ type, titre, saisie });
    if (!v.ok) { setErreur({ message: v.message }); return; }
    setEncours(true);
    setErreur(null);
    const contenu: ContenuVersion = { ...contenuVide(), brief: v.brief as unknown as ContenuVersion['brief'] };
    try {
      const r = await creerProjet({ brandId: marque.id, kind: v.type, title: v.titre, contenu });
      if (!r.ok) { setEncours(false); setErreur({ message: r.message, traceId: r.traceId }); return; }
      setEncours(false);
      setProjet({ id: r.projet.id, versionCourante: { id: r.version.id, n: r.version.n } });
      setBrief(v.brief);
      setEtape('strategie');
    } catch {
      setEncours(false);
      setErreur({ message: messageHorsLigneStudio('creation') });
    }
  }

  // Navigation du rail · avant création, start/brief seulement ; après, les
  // étapes qui opèrent sur le projet (le brief est verrouillé une fois écrit).
  const peutAller = (id: EtapeAssistant): boolean =>
    projet ? (etapeRequiertProjet(id) && etapeDisponible(id)) : (etatRailProjet(id, etape, brief) === 'done');

  const ouvrirProjet = () => { if (projet) router.push(`/studio/projets/${projet.id}`); };

  return (
    <section data-zone="assistant-projet" data-etape={etape} style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <Rail etape={etape} brief={brief} peutAller={peutAller} onAller={setEtape} />

      <div style={{ flex: '1 1 480px', minWidth: 0, display: 'grid', gap: 16, ...surface, background: 'var(--surface)', padding: 20 }}>
        {etape === 'start' && (
          <Depart marque={marque.nom} type={type} onType={setType} onContinuer={() => setEtape('brief')} />
        )}
        {etape === 'brief' && (
          <Brief marque={marque.nom} type={type} titre={titre} onTitre={setTitre} saisie={saisie} maj={maj} personas={p.personas} />
        )}
        {etape === 'strategie' && projet && brief && (
          <AssistantPostCreation etape="strategie" projet={projet} brief={brief} marqueId={marque.id} onProjetChange={rafraichir} />
        )}
        {etape === 'direction' && projet && brief && (
          <AssistantPostCreation etape="direction" projet={projet} brief={brief} marqueId={marque.id} onProjetChange={rafraichir} />
        )}
        {etape === 'format' && projet && brief && (
          <EtapeFormatDevis
            projectId={projet.id} version={projet.versionCourante} brief={brief}
            onBriefChange={rafraichir}
            onDevisPret={(d) => { setDevis(d); setEtape('confirm'); }}
            onRetour={() => setEtape('direction')}
          />
        )}
        {etape === 'confirm' && projet && devis && (
          <EtapeConfirmation
            devis={devis}
            onModifier={() => { setDevis(null); setEtape('format'); }}
            onLance={() => { setDevis(null); ouvrirProjet(); }}
          />
        )}

        {erreur && etape !== 'format' && etape !== 'confirm' && <p role="alert" data-etat="erreur" style={{ margin: 0, color: 'var(--err-text)', fontSize: 13.5 }}>{erreur.message}{erreur.traceId ? ` · identifiant support : ${erreur.traceId}` : ''}</p>}

        {etape !== 'format' && etape !== 'confirm' && (
          <Pied
            etape={etape}
            encours={encours}
            aProjet={!!projet}
            onCreer={creer}
            onVersBrief={() => setEtape('brief')}
            onReculer={() => { const prec = etapeProjetPrecedente(etape); if (prec && peutAller(prec)) setEtape(prec); }}
            onAvancer={() => { const suiv = etapeProjetSuivante(etape); if (suiv) setEtape(suiv); }}
          />
        )}
      </div>
    </section>
  );
}

/* ─────────────────── Sous-arbre post-création (propositions) ─────────────── */

function AssistantPostCreation({ etape, projet, brief, marqueId, onProjetChange }: {
  etape: 'strategie' | 'direction';
  projet: ProjetCourant;
  brief: BriefCanonique;
  marqueId: string;
  onProjetChange: () => void;
}) {
  const cycle = usePropositionsBrief(projet.id, projet.versionCourante);
  const onApplied = () => { void onProjetChange(); };
  // La création depuis zéro n'attache aucune source · les suggestions
  // d'hypothèses (Veille) restent honnêtement inactives (pas de bouton mort).
  return etape === 'strategie'
    ? <EtapeStrategie brief={brief} cycle={cycle} onApplied={onApplied} sources={[]} marqueId={marqueId} />
    : <EtapeDirection brief={brief} cycle={cycle} onApplied={onApplied} />;
}

/* ─────────────────────────────── Le pied ────────────────────────────────── */

function Pied({ etape, encours, aProjet, onCreer, onVersBrief, onReculer, onAvancer }: {
  etape: EtapeAssistant; encours: boolean; aProjet: boolean;
  onCreer: () => void; onVersBrief: () => void; onReculer: () => void; onAvancer: () => void;
}) {
  return (
    <>
      <footer style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 4 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {etape === 'start' && <a href={CHEMIN_PROJETS} style={{ ...btnGhost, textDecoration: 'none' }}>Annuler</a>}
          {etape === 'brief' && <button type="button" data-bouton="retour" onClick={onReculer} style={{ ...btnGhost, minHeight: CIBLE_TACTILE_MIN }}>‹ Retour</button>}
          {etape === 'direction' && <button type="button" data-bouton="retour-strategie" onClick={onReculer} style={{ ...btnGhost, minHeight: CIBLE_TACTILE_MIN }}>‹ Stratégie</button>}
          {etape === 'strategie' && <a href={CHEMIN_PROJETS} style={{ ...btnGhost, textDecoration: 'none' }}>Voir les projets</a>}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {etape === 'start' && <button type="button" data-bouton="vers-brief" onClick={onVersBrief} style={{ ...btn, minHeight: CIBLE_TACTILE_MIN }}>Commencer le brief</button>}
          {etape === 'brief' && <button type="button" data-bouton="creer-projet" onClick={onCreer} disabled={encours} style={{ ...btn, minHeight: CIBLE_TACTILE_MIN, opacity: encours ? 0.6 : 1 }}>{encours ? 'Création…' : 'Créer le projet'}</button>}
          {etape === 'strategie' && aProjet && <button type="button" data-bouton="vers-direction" onClick={onAvancer} style={{ ...btn, minHeight: CIBLE_TACTILE_MIN }}>Continuer vers la direction</button>}
          {etape === 'direction' && aProjet && <button type="button" data-bouton="vers-format" onClick={onAvancer} style={{ ...btn, minHeight: CIBLE_TACTILE_MIN }}>Continuer vers le format</button>}
        </div>
      </footer>
      {etape === 'brief' && <p style={{ ...note, fontSize: 12.5, margin: 0 }}>Gratuit · le brief est enregistré à la création, rien n’est généré tant que tu ne lances rien.</p>}
      {(etape === 'strategie' || etape === 'direction') && <p data-zone="bientot-note" style={{ ...note, fontSize: 12.5, margin: 0 }}>Format &amp; devis prépare le devis serveur · la génération reste gratuite jusqu’à ta confirmation. L’étape Création (suivi des visuels) arrive bientôt.</p>}
    </>
  );
}

/* ─────────────────────────────── Le rail ─────────────────────────────────── */

function Rail({ etape, brief, peutAller, onAller }: {
  etape: EtapeAssistant; brief: BriefCanonique | null; peutAller: (e: EtapeAssistant) => boolean; onAller: (e: EtapeAssistant) => void;
}) {
  // `confirm` n'a pas de puce propre · elle allume « Format & devis » (etapeRail).
  const courante = etapeRail(etape);
  return (
    <nav data-zone="assistant-rail" aria-label="Étapes de l’assistant" style={{ flex: '0 0 220px', display: 'grid', gap: 10, ...surface, background: 'var(--surface)', padding: 16, alignContent: 'start' }}>
      <span style={sectionLbl}>Nouveau projet</span>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
        {ETAPES_RAIL.map((def, i) => {
          const st = etatRailProjet(def.id, courante, brief);
          const couleur = st === 'current' ? 'var(--ink)' : st === 'done' ? 'var(--ink-2)' : 'var(--muted)';
          const cliquable = peutAller(def.id) && st !== 'current';
          const contenu = (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN }}>
              <span aria-hidden style={{ width: 22, height: 22, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 999, fontSize: 12, fontWeight: 700, color: st === 'current' ? 'var(--on-accent)' : 'var(--ink-2)', background: st === 'current' ? 'var(--accent-strong)' : 'var(--bg)', border: '1px solid var(--line)' }}>
                {st === 'done' ? <Icon name="check" size={13} /> : i + 1}
              </span>
              <span style={{ display: 'grid' }}>
                <span style={{ fontSize: 13.5, fontWeight: st === 'current' ? 600 : 500, color: couleur }}>{def.libelle}</span>
                {st === 'bientot' && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>· bientôt</span>}
              </span>
            </span>
          );
          return (
            <li key={def.id} data-rail-etape={def.id} data-etat={st} aria-current={st === 'current' ? 'step' : undefined} {...(st === 'bientot' ? { 'data-bientot': 'true' } : {})}>
              {cliquable
                ? <button type="button" data-aller={def.id} onClick={() => onAller(def.id)} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>{contenu}</button>
                : contenu}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ───────────────────────────── Étape départ ──────────────────────────────── */

function Depart({ marque, type, onType, onContinuer }: { marque: string; type: TypeNouveauProjet; onType: (t: TypeNouveauProjet) => void; onContinuer: () => void }) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <p style={{ ...note, fontSize: 12 }}>Étape 1 · Départ</p>
        <h2 style={{ margin: '2px 0 0', fontSize: 19, fontWeight: 500, color: 'var(--ink)' }}>Que veux-tu créer ?</h2>
        <p style={note}>Un projet réunit le brief, les références, la direction et les créations. Marque : <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{marque}</b>.</p>
      </div>
      <span style={sectionLbl}>Livrable</span>
      <div data-champ="type" role="radiogroup" aria-label="Livrable" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {TYPES_NOUVEAU_PROJET.map((t) => {
          const choisi = t === type;
          return (
            <button key={t} type="button" role="radio" aria-checked={choisi} data-type={t} onClick={() => onType(t)}
              onDoubleClick={onContinuer}
              style={{ ...tuile, textAlign: 'left', padding: 14, cursor: 'pointer', background: choisi ? teinte('accent', .12) : 'var(--bg)', borderColor: choisi ? 'var(--accent-strong)' : 'var(--line)', display: 'grid', gap: 4, minHeight: CIBLE_TACTILE_MIN }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{LIBELLES_TYPE_PROJET[t]}</span>
            </button>
          );
        })}
      </div>
      <p style={{ ...note, fontSize: 12.5 }}>Tu écris le brief, Jarvis pourra aider plus tard. Pour partir d’une annonce de la Veille ou itérer sur un test, utilise les boutons dédiés de la Veille et d’Adsmap.</p>
    </div>
  );
}

/* ───────────────────────────── Étape brief ───────────────────────────────── */

function Brief({ marque, type, titre, onTitre, saisie, maj, personas }: {
  marque: string; type: TypeNouveauProjet; titre: string; onTitre: (v: string) => void;
  saisie: SaisieBriefV5; maj: (c: Partial<SaisieBriefV5>) => void; personas: ReferenceAdsmap[];
}) {
  const togglePlateforme = (pf: PlateformeV5) => {
    const set = new Set(saisie.plateformes);
    if (set.has(pf)) set.delete(pf); else set.add(pf);
    maj({ plateformes: PLATEFORMES_V5.filter((x) => set.has(x)) });
  };
  return (
    <div data-zone="assistant-brief" style={{ display: 'grid', gap: 14 }}>
      <div>
        <p style={{ ...note, fontSize: 12 }}>Étape 1 sur 5 · Le brief</p>
        <h2 style={{ margin: '2px 0 0', fontSize: 19, fontWeight: 500, color: 'var(--ink)' }}>Le brief</h2>
        <p style={note}>Décris l’objectif · {LIBELLES_TYPE_PROJET[type]?.toLowerCase() ?? ''} pour <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{marque}</b>. Ces éléments sont enregistrés avec le projet.</p>
      </div>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={lbl}>Nom du projet</span>
        <input data-champ="titre" value={titre} maxLength={TITRE_NOUVEAU_PROJET_MAX} onChange={(e) => onTitre(e.target.value)} style={champ} />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={lbl}>Votre intention</span>
        <textarea data-champ="intention" value={saisie.intention} maxLength={OBJECTIF_MAX} rows={4} onChange={(e) => maj({ intention: e.target.value })} placeholder="Ce que ce projet doit produire ou vérifier" style={{ ...champ, resize: 'vertical', lineHeight: 1.5 }} />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={lbl}>Audience</span>
        <input data-champ="audience" value={saisie.audience} maxLength={2000} onChange={(e) => maj({ audience: e.target.value })} placeholder="À qui s’adresse cette publicité · facultatif" style={champ} />
      </label>

      <fieldset data-champ="objectif-type" style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        <legend style={lbl}>Objectif · facultatif</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {OBJECTIFS_V5.map((o: ObjectifType) => {
            const choisi = saisie.objectifType === o;
            return (
              <label key={o} data-objectif={o} style={{ ...tuile, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', cursor: 'pointer', background: choisi ? teinte('accent', .12) : 'var(--bg)', borderColor: choisi ? 'var(--accent-strong)' : 'var(--line)', minHeight: CIBLE_TACTILE_MIN }}>
                <input type="radio" name="objectif-type" value={o} checked={choisi} onChange={() => maj({ objectifType: o })} />
                <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>{LIBELLES_OBJECTIF_V5[o]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset data-champ="plateformes" style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        <legend style={lbl}>Plateformes · facultatif</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PLATEFORMES_V5.map((pf: PlateformeV5) => {
            const coche = saisie.plateformes.includes(pf);
            return (
              <label key={pf} data-plateforme={pf} style={{ ...tuile, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', cursor: 'pointer', background: coche ? teinte('accent', .12) : 'var(--bg)', borderColor: coche ? 'var(--accent-strong)' : 'var(--line)', minHeight: CIBLE_TACTILE_MIN }}>
                <input type="checkbox" checked={coche} onChange={() => togglePlateforme(pf)} />
                <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>{LIBELLES_PLATEFORME_V5[pf]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={lbl}>Pour qui ? · persona facultatif</span>
        <select data-champ="persona" value={saisie.persona?.id ?? ''} onChange={(e) => maj({ persona: personas.find((x) => x.id === e.target.value) ?? null })} style={champ}>
          <option value="">Aucun persona</option>
          {personas.map((pr) => <option key={pr.id} value={pr.id}>{pr.label}</option>)}
        </select>
        {personas.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Aucun persona Adsmap pour cette marque · tu peux en créer depuis la fiche marque.</span>}
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={lbl}>Angle · facultatif</span>
        <input data-champ="angle" value={saisie.angle} maxLength={2000} onChange={(e) => maj({ angle: e.target.value })} placeholder="L’idée qui porte la publicité" style={champ} />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={lbl}>Concept · facultatif</span>
        <input data-champ="concept" value={saisie.concept} maxLength={2000} onChange={(e) => maj({ concept: e.target.value })} placeholder="La traduction visuelle de l’angle" style={champ} />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={lbl}>Contraintes et mentions obligatoires · facultatif</span>
        <textarea data-champ="contraintes" value={saisie.contraintes} maxLength={OBJECTIF_MAX} rows={3} onChange={(e) => maj({ contraintes: e.target.value })} placeholder="Une par ligne · chacune devient un invariant du brief" style={{ ...champ, resize: 'vertical', lineHeight: 1.5 }} />
      </label>
    </div>
  );
}
