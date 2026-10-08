'use client';

import { useId, useState, type ReactNode } from 'react';
import {
  POLICES_EDITEUR, policeEditeur,
  type CalqueStudio, type DocumentStudio, type ModeAlignement, type ModificationTexte, type SensOrdre, type Transformation,
} from '@tiktrends/core';
import { Icon } from '../../Icon';
import { bloc, bouton, boutonInactif, champ, etiquette, LIBELLE_TYPE, legende, panneau, titrePanneau } from './styles';

/**
 * Les propriétés du calque choisi. Un champ s'applique quand on le quitte ou
 * sur Entrée (Échap rend la valeur d'avant) : une frappe n'est pas une étape
 * d'historique. Un calque verrouillé montre ses valeurs sans les laisser
 * changer, et dit comment le déverrouiller.
 */

export interface ActionsProprietes {
  renommer: (nom: string) => void;
  transformer: (t: Transformation) => void;
  partLargeur: (part: number) => void;
  aligner: (m: ModeAlignement) => void;
  ordonner: (s: SensOrdre) => void;
  texte: (m: ModificationTexte) => void;
  remplissage: (fill: string) => void;
  visibilite: (visible: boolean) => void;
  verrou: (locked: boolean) => void;
  dupliquer: () => void;
  supprimer: () => void;
}

function Champ({ label, children, id }: { label: string; id: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label htmlFor={id} style={etiquette}>{label}</label>
      {children}
    </div>
  );
}

/** Champ appliqué au départ du focus ou sur Entrée · Échap annule la saisie. */
function ChampSaisi({
  label, valeur, onValider, disabled, type = 'text', suffixe, pas,
}: {
  label: string;
  valeur: string;
  onValider: (v: string) => void;
  disabled: boolean;
  type?: 'text' | 'number';
  suffixe?: string;
  pas?: number;
}) {
  const id = useId();
  const [brouillon, setBrouillon] = useState(valeur);
  const [source, setSource] = useState(valeur);
  if (source !== valeur) { setSource(valeur); setBrouillon(valeur); }
  const valider = () => { if (brouillon !== valeur) onValider(brouillon); };
  return (
    <Champ label={suffixe ? `${label} (${suffixe})` : label} id={id}>
      <input
        id={id}
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        step={pas}
        value={brouillon}
        disabled={disabled}
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={valider}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); valider(); }
          if (e.key === 'Escape') { e.stopPropagation(); setBrouillon(valeur); }
        }}
        style={{ ...champ, ...(disabled ? boutonInactif : {}) }}
      />
    </Champ>
  );
}

const nombre = (s: string) => {
  const n = Number(s.replace(',', '.').trim());
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

const ALIGNEMENTS: Array<[ModeAlignement, string]> = [
  ['gauche', 'Gauche'], ['centre-horizontal', 'Centre horizontal'], ['droite', 'Droite'],
  ['haut', 'Haut'], ['centre-vertical', 'Centre vertical'], ['bas', 'Bas'],
];
const ORDRES: Array<[SensOrdre, string]> = [['monter', 'Monter'], ['descendre', 'Descendre'], ['premier-plan', 'Premier plan'], ['arriere-plan', 'Arrière-plan']];

export function PanneauProprietes({
  c, doc, editable, actions, onFermer, refus,
}: {
  c: CalqueStudio | null;
  doc: DocumentStudio;
  editable: boolean;
  actions: ActionsProprietes;
  /** Présent sur téléphone · le panneau est alors une fenêtre plein écran. */
  onFermer?: () => void;
  refus: string | null;
}) {
  const idTexte = useId();
  const idPolice = useId();
  const idCouleur = useId();
  const idRemplissage = useId();
  const [brouillonTexte, setBrouillonTexte] = useState<{ id: string; valeur: string } | null>(null);

  if (!c) {
    return (
      <section aria-labelledby="titre-proprietes" data-panneau="proprietes" style={{ ...panneau, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, alignContent: 'start' }}>
        <h2 id="titre-proprietes" style={titrePanneau}>Propriétés</h2>
        <p style={legende}>Choisis un calque dans la liste ou sur l’aperçu pour voir et changer ses propriétés.</p>
      </section>
    );
  }

  const fige = !editable || c.locked;
  const texteCourant = c.kind === 'text' ? (brouillonTexte?.id === c.id ? brouillonTexte.valeur : c.text) : '';
  const validerTexte = () => {
    if (c.kind === 'text' && brouillonTexte?.id === c.id && brouillonTexte.valeur !== c.text) actions.texte({ text: brouillonTexte.valeur });
    setBrouillonTexte(null);
  };
  const police = c.kind === 'text' ? policeEditeur(c.fontId) : null;
  const partActuelle = Math.round((c.width / doc.width) * 1000) / 10;

  return (
    <section aria-labelledby="titre-proprietes" data-panneau="proprietes" style={{ ...panneau, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, alignContent: 'start' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 id="titre-proprietes" style={{ ...titrePanneau, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>
          {LIBELLE_TYPE[c.kind]} · {c.name}
        </h2>
        {onFermer && (
          <button type="button" onClick={onFermer} aria-label="Fermer les propriétés" style={bouton}><Icon name="x" size={16} /></button>
        )}
      </div>

      {refus && <p role="alert" data-refus="operation" style={{ ...legende, color: 'var(--err)' }}>{refus}</p>}

      {editable && c.locked && (
        <div style={{ ...bloc, gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center' }}>
          <p style={{ ...legende, color: 'var(--ink-2)' }}><Icon name="lock" size={13} /> Calque verrouillé · il ne bouge pas et son contenu ne change pas.</p>
          <button type="button" onClick={() => actions.verrou(false)} style={bouton}>Déverrouiller</button>
        </div>
      )}

      <ChampSaisi label="Nom" valeur={c.name} disabled={!editable} onValider={(v) => actions.renommer(v)} />

      {c.kind === 'text' && (
        <div style={bloc}>
          <div>
            <label htmlFor={idTexte} style={etiquette}>Texte</label>
            <textarea
              id={idTexte}
              data-champ="texte"
              rows={3}
              value={texteCourant}
              disabled={fige}
              onChange={(e) => setBrouillonTexte({ id: c.id, valeur: e.target.value })}
              onBlur={validerTexte}
              style={{ ...champ, resize: 'vertical', fontFamily: 'inherit', ...(fige ? boutonInactif : {}) }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(120px, 100%), 1fr))', gap: 8 }}>
            <Champ label="Police" id={idPolice}>
              <select id={idPolice} value={c.fontId} disabled={fige} onChange={(e) => actions.texte({ fontId: e.target.value })} style={{ ...champ, cursor: 'pointer', ...(fige ? boutonInactif : {}) }}>
                {POLICES_EDITEUR.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
                {!police && <option value={c.fontId}>{doc.fonts[c.fontId]?.family ?? c.fontId} · aperçu approximatif</option>}
              </select>
            </Champ>
            <ChampSaisi label="Taille" suffixe="px" type="number" valeur={String(c.fontSizePx)} disabled={fige} onValider={(v) => { const n = nombre(v); if (n !== null) actions.texte({ fontSizePx: n }); }} />
            <Champ label="Couleur" id={idCouleur}>
              <input id={idCouleur} type="color" value={c.color} disabled={fige} onChange={(e) => actions.texte({ color: e.target.value })} style={{ ...champ, padding: 4, cursor: 'pointer', ...(fige ? boutonInactif : {}) }} />
            </Champ>
            <ChampSaisi label="Interligne" type="number" pas={0.05} valeur={String(c.lineHeight)} disabled={fige} onValider={(v) => { const n = nombre(v); if (n !== null) actions.texte({ lineHeight: n }); }} />
          </div>
          {!police && <p style={legende}>Cette police n’est pas fournie par l’éditeur · l’aperçu est approximatif. Choisis une police fournie pour un rendu identique.</p>}
          <div role="group" aria-label="Alignement du texte" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} type="button" aria-pressed={c.align === a} disabled={fige} onClick={() => actions.texte({ align: a })}
                style={{ ...bouton, ...(c.align === a ? { borderColor: 'var(--accent-strong)', color: 'var(--accent-strong)' } : {}), ...(fige ? boutonInactif : {}) }}>
                {{ left: 'Gauche', center: 'Centre', right: 'Droite' }[a]}
              </button>
            ))}
          </div>
        </div>
      )}

      {c.kind === 'shape' && (
        <div style={bloc}>
          <Champ label="Couleur de remplissage" id={idRemplissage}>
            <input id={idRemplissage} type="color" value={c.fill} disabled={fige} onChange={(e) => actions.remplissage(e.target.value)} style={{ ...champ, padding: 4, cursor: 'pointer', ...(fige ? boutonInactif : {}) }} />
          </Champ>
        </div>
      )}

      {(c.kind === 'image' || c.kind === 'logo') && (
        <div style={bloc}>
          <p style={legende}>
            {c.kind === 'image' ? `Source ${c.sourceWidth} × ${c.sourceHeight} px` : 'Logo'} · le fichier source n’est jamais modifié, seul son placement change.
            {c.kind === 'image' && c.mask ? ' Un masque de retouche est attaché à ce calque.' : ''}
          </p>
        </div>
      )}

      <fieldset style={{ ...bloc, margin: 0 }}>
        <legend style={{ ...etiquette, padding: 0, marginBottom: 0 }}>Position et taille (pixels du document)</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <ChampSaisi label="X" type="number" valeur={String(c.x)} disabled={fige} onValider={(v) => { const n = nombre(v); if (n !== null) actions.transformer({ x: n }); }} />
          <ChampSaisi label="Y" type="number" valeur={String(c.y)} disabled={fige} onValider={(v) => { const n = nombre(v); if (n !== null) actions.transformer({ y: n }); }} />
          <ChampSaisi label="Largeur" type="number" valeur={String(c.width)} disabled={fige} onValider={(v) => { const n = nombre(v); if (n !== null) actions.transformer({ width: n }); }} />
          <ChampSaisi label="Hauteur" type="number" valeur={String(c.height)} disabled={fige} onValider={(v) => { const n = nombre(v); if (n !== null) actions.transformer({ height: n }); }} />
          <ChampSaisi label="Rotation" suffixe="degrés" type="number" valeur={String(c.rotationDeg)} disabled={fige} onValider={(v) => { const n = nombre(v); if (n !== null) actions.transformer({ rotationDeg: n }); }} />
          <ChampSaisi label="Opacité" suffixe="%" type="number" valeur={String(Math.round(c.opacity * 100))} disabled={fige} onValider={(v) => { const n = nombre(v); if (n !== null) actions.transformer({ opacity: n / 100 }); }} />
        </div>
        <ChampSaisi label="Largeur selon le document" suffixe="% · proportions conservées" type="number" valeur={String(partActuelle)} disabled={fige} onValider={(v) => { const n = nombre(v); if (n !== null) actions.partLargeur(n / 100); }} />
      </fieldset>

      {editable && (
        <>
          <div role="group" aria-label="Aligner sur le document" style={{ display: 'grid', gap: 6 }}>
            <span style={etiquette}>Aligner sur le document</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ALIGNEMENTS.map(([m, l]) => (
                <button key={m} type="button" disabled={c.locked} onClick={() => actions.aligner(m)} style={{ ...bouton, ...(c.locked ? boutonInactif : {}) }}>{l}</button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Ordre d’empilement" style={{ display: 'grid', gap: 6 }}>
            <span style={etiquette}>Ordre d’empilement</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ORDRES.map(([s, l]) => (
                <button key={s} type="button" disabled={c.locked} onClick={() => actions.ordonner(s)} style={{ ...bouton, ...(c.locked ? boutonInactif : {}) }}>{l}</button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Actions sur le calque" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button type="button" onClick={() => actions.visibilite(!c.visible)} style={bouton}>{c.visible ? 'Masquer' : 'Afficher'}</button>
            <button type="button" onClick={() => actions.verrou(!c.locked)} style={bouton}><Icon name="lock" size={14} />{c.locked ? 'Déverrouiller' : 'Verrouiller'}</button>
            <button type="button" onClick={actions.dupliquer} style={bouton}>Dupliquer</button>
            <button type="button" disabled={c.locked} onClick={actions.supprimer} style={{ ...bouton, color: 'var(--err)', ...(c.locked ? boutonInactif : {}) }}>Supprimer</button>
          </div>
        </>
      )}
    </section>
  );
}
