'use client';

import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { DisponibiliteJarvis } from '@tiktrends/core';
import type { CiblePresentee } from '../../../lib/studios/propositions/types';
import { boutonPrimaire, boutonSecondaire, champ, desactive, etiquette, mini, rangee, texte } from './styles';
import { tuile } from '../../ui';

/**
 * Demander une proposition · à Jarvis (appel texte PAYANT, coût maximal
 * annoncé avant le clic) ou à la main (aucun appel, aucun coût). Jarvis
 * indisponible : le bouton reste VISIBLE, désactivé, la raison écrite à côté,
 * avec un accès direct au chemin manuel. Rien n'est appliqué ici : la demande
 * crée une PROPOSITION, qu'il faudra encore appliquer.
 *
 * La saisie survit aux erreurs : elle n'est vidée qu'après un succès.
 */

export interface PropsFormulaire {
  cibles: CiblePresentee[];
  jarvis: DisponibiliteJarvis;
  peutProposer: boolean;
  enCours: boolean;
  onDemanderJarvis: (e: { cible: string; demande: string }) => Promise<boolean>;
  onProposerMain: (e: { cible: string; chemin: string; valeur: string; explication: string }) => Promise<boolean>;
}

export function FormulaireDemande({ cibles, jarvis, peutProposer, enCours, onDemanderJarvis, onProposerMain }: PropsFormulaire) {
  const id = useId();
  const [mode, setMode] = useState<'jarvis' | 'main'>('jarvis');
  const [cible, setCible] = useState(cibles[0]?.cible ?? '');
  const [demande, setDemande] = useState('');
  const champs = useMemo(() => cibles.find((c) => c.cible === cible)?.champs ?? [], [cibles, cible]);
  const [chemin, setChemin] = useState('');
  const champChoisi = champs.find((c) => c.chemin === chemin) ?? champs[0];
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const valeur = champChoisi ? (valeurs[champChoisi.chemin] ?? champChoisi.valeur) : '';
  const [explication, setExplication] = useState('');

  if (!peutProposer) return null;
  const jarvisBloque = !jarvis.disponible || enCours || demande.trim().length === 0;
  const mainBloque = enCours || !champChoisi || valeur === champChoisi.valeur;

  // L8-B · onglets ARIA complets : un seul arrêt de Tab (onglet actif), flèches, Début et Fin
  // pour passer de l'un à l'autre · le clic et Entrée restent l'alternative.
  const ORDRE = ['jarvis', 'main'] as const;
  const clavierOnglets = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = ORDRE.indexOf(mode);
    const j = e.key === 'ArrowRight' ? (i + 1) % ORDRE.length : e.key === 'ArrowLeft' ? (i + ORDRE.length - 1) % ORDRE.length : e.key === 'Home' ? 0 : e.key === 'End' ? ORDRE.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    setMode(ORDRE[j]!);
    e.currentTarget.ownerDocument.getElementById(`${id}-onglet-${ORDRE[j]}`)?.focus();
  };
  const onglet = (m: 'jarvis' | 'main', libelle: string) => (
    <button type="button" role="tab" aria-selected={mode === m} tabIndex={mode === m ? 0 : -1} onKeyDown={clavierOnglets} aria-controls={`${id}-${m}`} id={`${id}-onglet-${m}`} onClick={() => setMode(m)}
      style={{ ...boutonSecondaire, ...(mode === m ? { background: 'var(--accent-soft)', border: '1px solid var(--accent-strong)', color: 'var(--ink)' } : {}) }}>
      {libelle}
    </button>
  );

  return (
    <section aria-label="Demander une proposition" style={{ ...tuile, background: 'var(--bg)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div role="tablist" aria-label="Origine de la proposition" style={rangee}>
        {onglet('jarvis', 'Demander à Jarvis')}
        {onglet('main', 'Modifier à la main')}
      </div>

      <div>
        <label htmlFor={`${id}-cible`} style={etiquette}>Cible</label>
        <select id={`${id}-cible`} value={cible} onChange={(e) => { setCible(e.target.value); setChemin(''); }} style={champ}>
          {cibles.map((c) => <option key={c.cible} value={c.cible}>{c.libelle}</option>)}
        </select>
      </div>

      {mode === 'jarvis' ? (
        <div id={`${id}-jarvis`} role="tabpanel" aria-labelledby={`${id}-onglet-jarvis`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label htmlFor={`${id}-demande`} style={etiquette}>Ta demande</label>
            <textarea id={`${id}-demande`} value={demande} onChange={(e) => setDemande(e.target.value)} rows={3} maxLength={4000}
              placeholder="Ex. Corrige seulement le texte à l’écran, plus court" style={{ ...champ, resize: 'vertical' }} />
          </div>
          <p id={`${id}-cout`} style={mini}>{jarvis.mentionCout}</p>
          {!jarvis.disponible && (
            <div role="note" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <p id={`${id}-raison`} style={{ ...texte, color: 'var(--ink)', flex: '1 1 240px' }}><span style={{ color: 'var(--warn)', fontWeight: 600 }}>Indisponible · </span>{jarvis.raison}</p>
              <button type="button" style={boutonSecondaire} onClick={() => setMode('main')}>Modifier à la main</button>
            </div>
          )}
          <div>
            <button type="button" style={{ ...boutonPrimaire, ...(jarvisBloque ? desactive : {}) }} disabled={jarvisBloque} aria-busy={enCours}
              aria-describedby={`${id}-cout${!jarvis.disponible ? ` ${id}-raison` : ''}`}
              onClick={async () => { if (await onDemanderJarvis({ cible, demande })) setDemande(''); }}>
              {enCours ? 'Jarvis prépare…' : 'Demander à Jarvis'}
            </button>
          </div>
        </div>
      ) : (
        <div id={`${id}-main`} role="tabpanel" aria-labelledby={`${id}-onglet-main`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {champs.length === 0 ? (
            <p style={mini}>Cette cible n’a pas de champ texte modifiable à la main · choisis une autre cible.</p>
          ) : (
            <>
              <div>
                <label htmlFor={`${id}-champ`} style={etiquette}>Champ</label>
                <select id={`${id}-champ`} value={champChoisi?.chemin ?? ''} onChange={(e) => setChemin(e.target.value)} style={champ}>
                  {champs.map((c) => <option key={c.chemin} value={c.chemin}>{c.libelle}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-valeur`} style={etiquette}>Nouvelle valeur{champChoisi?.forme === 'lignes' ? ' (une ligne par élément)' : ''}</label>
                <textarea id={`${id}-valeur`} value={valeur} rows={3} onChange={(e) => champChoisi && setValeurs((v) => ({ ...v, [champChoisi.chemin]: e.target.value }))} style={{ ...champ, resize: 'vertical' }} />
              </div>
              <div>
                <label htmlFor={`${id}-explication`} style={etiquette}>Pourquoi (facultatif)</label>
                <input id={`${id}-explication`} value={explication} onChange={(e) => setExplication(e.target.value)} maxLength={500} style={champ} />
              </div>
              <p style={mini}>Aucun appel à Jarvis, aucun coût · la modification devient une proposition à appliquer.</p>
              <div>
                <button type="button" style={{ ...boutonPrimaire, ...(mainBloque ? desactive : {}) }} disabled={mainBloque} aria-busy={enCours}
                  onClick={async () => {
                    if (!champChoisi) return;
                    if (await onProposerMain({ cible, chemin: champChoisi.chemin, valeur, explication })) {
                      setValeurs((v) => { const n = { ...v }; delete n[champChoisi.chemin]; return n; });
                      setExplication('');
                    }
                  }}>
                  {enCours ? 'Enregistrement…' : 'Proposer cette modification'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
