'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  ETAPES_RAIL, etatRail, etapeProjetPrecedente, saisieBriefVide, verifierCreationAssistant,
  OBJECTIFS_V5, PLATEFORMES_V5, LIBELLES_OBJECTIF_V5, LIBELLES_PLATEFORME_V5, LIBELLES_TYPE_PROJET,
  TYPES_NOUVEAU_PROJET, TITRE_NOUVEAU_PROJET_MAX, OBJECTIF_MAX, CIBLE_TACTILE_MIN, CHEMIN_PROJETS,
  contenuVide, messageHorsLigneStudio, teinte,
  type EtapeAssistant, type EtatNouveauProjet, type TypeNouveauProjet, type SaisieBriefV5,
  type ObjectifType, type PlateformeV5, type ReferenceAdsmap, type ContenuVersion,
} from '@tiktrends/core';
import { creerProjet } from '../../../app/actions/studios/projets';
import { Icon } from '../../Icon';
import { btn, btnGhost, input, lbl, surface, tuile } from '../../ui';

/**
 * L'assistant de création V5 (coquille `studioWizard`) porté sur les VRAIES
 * actions · deux étapes câblées (départ, brief), le reste du parcours en rail
 * « bientôt », SANS contrôle simulé. L'étape brief écrit le brief structuré V5
 * à la création (`creerProjet({contenu})`), chaque choix persisté revient à
 * l'écran après rechargement. Gratuit · aucune génération, aucun appel modèle.
 *
 * La règle (quelles étapes, transitions, complétude, contenu du brief) vit au
 * noyau (`studios/ux/assistant-projet`) ; ce composant n'en est que le rendu.
 */

const note: CSSProperties = { fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };
const champ: CSSProperties = { ...input, fontSize: 16 };
const sectionLbl: CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', margin: '4px 0 2px' };
const lien: CSSProperties = { color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN };

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

  async function creer() {
    const v = verifierCreationAssistant({ type, titre, saisie });
    if (!v.ok) { setErreur({ message: v.message }); return; }
    setEncours(true);
    setErreur(null);
    const contenu: ContenuVersion = { ...contenuVide(), brief: v.brief as unknown as ContenuVersion['brief'] };
    try {
      const r = await creerProjet({ brandId: marque.id, kind: v.type, title: v.titre, contenu });
      if (!r.ok) { setEncours(false); setErreur({ message: r.message, traceId: r.traceId }); return; }
      router.push(`/studio/projets/${r.projet.id}`);
    } catch {
      setEncours(false);
      setErreur({ message: messageHorsLigneStudio('creation') });
    }
  }

  return (
    <section data-zone="assistant-projet" data-etape={etape} style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <Rail etape={etape} onAller={setEtape} />

      <div style={{ flex: '1 1 480px', minWidth: 0, display: 'grid', gap: 16, ...surface, background: 'var(--surface)', padding: 20 }}>
        {etape === 'start' ? (
          <Depart
            marque={marque.nom}
            type={type}
            onType={setType}
            onContinuer={() => setEtape('brief')}
          />
        ) : (
          <Brief
            marque={marque.nom}
            type={type}
            titre={titre}
            onTitre={setTitre}
            saisie={saisie}
            maj={maj}
            personas={p.personas}
          />
        )}

        {erreur && <p role="alert" data-etat="erreur" style={{ margin: 0, color: 'var(--err-text)', fontSize: 13.5 }}>{erreur.message}{erreur.traceId ? ` · identifiant support : ${erreur.traceId}` : ''}</p>}

        <footer style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 4 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {etape === 'brief'
              ? <button type="button" data-bouton="retour" onClick={() => setEtape(etapeProjetPrecedente('brief') ?? 'start')} style={{ ...btnGhost, minHeight: CIBLE_TACTILE_MIN }}>‹ Retour</button>
              : <a href={CHEMIN_PROJETS} style={{ ...btnGhost, textDecoration: 'none' }}>Annuler</a>}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {etape === 'start'
              ? <button type="button" data-bouton="vers-brief" onClick={() => setEtape('brief')} style={{ ...btn, minHeight: CIBLE_TACTILE_MIN }}>Commencer le brief</button>
              : <button type="button" data-bouton="creer-projet" onClick={creer} disabled={encours} style={{ ...btn, minHeight: CIBLE_TACTILE_MIN, opacity: encours ? 0.6 : 1 }}>{encours ? 'Création…' : 'Créer le projet'}</button>}
          </div>
        </footer>
        {etape === 'brief' && <p style={{ ...note, fontSize: 12.5, margin: 0 }}>Gratuit · le brief est enregistré à la création, rien n’est généré tant que tu ne lances rien. Les étapes suivantes arrivent bientôt.</p>}
      </div>
    </section>
  );
}

/* ─────────────────────────────── Le rail ─────────────────────────────────── */

function Rail({ etape, onAller }: { etape: EtapeAssistant; onAller: (e: EtapeAssistant) => void }) {
  return (
    <nav data-zone="assistant-rail" aria-label="Étapes de l’assistant" style={{ flex: '0 0 220px', display: 'grid', gap: 10, ...surface, background: 'var(--surface)', padding: 16, alignContent: 'start' }}>
      <span style={sectionLbl}>Nouveau projet</span>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
        {ETAPES_RAIL.map((def, i) => {
          const st = etatRail(def.id, etape);
          const couleur = st === 'current' ? 'var(--ink)' : st === 'done' ? 'var(--ink-2)' : 'var(--muted)';
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
              {st === 'done'
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
        <p style={{ ...note, fontSize: 12 }}>Étape 2 sur 5 · Le brief</p>
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
