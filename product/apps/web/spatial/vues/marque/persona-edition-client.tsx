'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  DESCRIPTION_PERSONA_MAX, ELEMENTS_PERSONA_MAX, ELEMENT_PERSONA_MAX, NOM_PERSONA_MAX, SEGMENT_PERSONA_MAX,
  choixRangPersona, type ChampPersona,
} from '@tiktrends/core';
import { Ic } from '../../communs';
import { boutonAction } from '../projet/action-serveur';
import { DialogueSpatial } from './interactifs';

/**
 * Lot 9 V5 · « Modifier » un persona (VB P12) et « Valider ce persona » (P08).
 * Les gestes passent par les actions EXISTANTES ou leurs voisines (mêmes
 * gardes) · `updatePersonaAction` (admin de l'espace, marque de l'espace) et
 * `validateNodeAction` (Adsmap, marque active). Les boutons suivent la brique
 * `boutonAction` · un second clic pendant l'envoi est ignoré, un bouton fermé
 * dit sa raison à côté. Rien ne change à l'écran avant le oui du serveur.
 */

export interface PersonaEditable {
  id: string; nom: string; description: string | null; segment: string | null; rang: number | null;
  desirs: readonly string[]; freins: readonly string[]; objections: readonly string[];
}

export type ResultatModification = { ok: true } | { error: string; erreurs?: Array<{ champ: ChampPersona; raison: string }> };
export type ModifierPersonaAction = (i: { brandId: string; id: string; saisie: unknown }) => Promise<ResultatModification>;

const CHAMP: CSSProperties = { boxSizing: 'border-box', width: '100%', padding: '10px 14px', minHeight: 44, borderRadius: 14, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)', outline: 0 };
const CIBLE: CSSProperties = { minHeight: 44 };

export function ModifierPersona({ brandId, persona, nombre, modifier, raison }: {
  brandId: string; persona: PersonaEditable;
  /** Personas de la marque · les rangs proposés vont de 1 à ce nombre. */
  nombre: number;
  modifier: ModifierPersonaAction | null;
  /** Pourquoi « Modifier » est fermé · écrit à côté du bouton. */
  raison: string | null;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [encours, setEncours] = useState(false);
  const [erreurs, setErreurs] = useState<Partial<Record<ChampPersona, string>> & { _?: string }>({});
  const v = {
    nom: persona.nom, description: persona.description ?? '', segment: persona.segment ?? '', rang: persona.rang != null ? String(persona.rang) : '',
    desirs: persona.desirs.join('\n'), freins: persona.freins.join('\n'), objections: persona.objections.join('\n'),
  };

  async function envoyer(form: HTMLFormElement) {
    if (!modifier || encours) return;
    const fd = new FormData(form);
    const lire = (k: string) => String(fd.get(k) ?? '');
    setEncours(true);
    setErreurs({});
    try {
      const r = await modifier({ brandId, id: persona.id, saisie: {
        nom: lire('nom'), description: lire('description'), segment: lire('segment'), rang: lire('rang'),
        desirs: lire('desirs'), freins: lire('freins'), objections: lire('objections'),
      } });
      if ('ok' in r) { setOuvert(false); router.refresh(); return; }
      const e: Partial<Record<ChampPersona, string>> & { _?: string } = {};
      for (const x of r.erreurs ?? []) e[x.champ] = e[x.champ] ? `${e[x.champ]} ${x.raison}` : x.raison;
      if (!r.erreurs?.length) e._ = r.error;
      setErreurs(e);
    } catch {
      setErreurs({ _: 'La modification n’a pas pu être enregistrée. Réessaie.' });
    } finally {
      setEncours(false);
    }
  }

  const champ = (nom: ChampPersona, libelle: string, aide: string, long = false, valeur = '') => (
    <label key={nom} style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
      <span className="faint">{libelle} · {aide}</span>
      {long
        ? <textarea name={nom} defaultValue={valeur} rows={3} aria-invalid={erreurs[nom] ? true : undefined} style={{ ...CHAMP, resize: 'vertical' }} />
        : <input name={nom} defaultValue={valeur} aria-invalid={erreurs[nom] ? true : undefined} style={CHAMP} />}
      {erreurs[nom] && <span role="alert" data-erreur-champ={nom} style={{ color: 'var(--bad)', fontSize: 12 }}>{erreurs[nom]}</span>}
    </label>
  );

  return (
    <span data-lot9="modifier" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <button className="btn sm" type="button" data-geste-persona="modifier" style={CIBLE}
        {...boutonAction({ ferme: !modifier, surClic: () => { setErreurs({}); setOuvert(true); } })}>
        <Ic n="text" />Modifier
      </button>
      {!modifier && raison && <small className="faint" style={{ fontSize: '11.5px' }}>{raison}</small>}
      <DialogueSpatial titre={`Modifier ${persona.nom}`} ouvert={ouvert} fermer={() => { if (!encours) setOuvert(false); }}>
        <form data-modifier-persona={persona.id} style={{ display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); void envoyer(e.currentTarget); }}>
          {champ('nom', 'Nom', `obligatoire, ${NOM_PERSONA_MAX} signes au plus`, false, v.nom)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,160px),1fr))', gap: 10 }}>
            {champ('segment', 'Segment', `facultatif, ${SEGMENT_PERSONA_MAX} signes`, false, v.segment)}
            <label style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
              <span className="faint">Rang · l’ordre de la marque, les autres se décalent</span>
              <select name="rang" defaultValue={v.rang} style={CHAMP}>
                {choixRangPersona(nombre).map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
              </select>
              {erreurs.rang && <span role="alert" data-erreur-champ="rang" style={{ color: 'var(--bad)', fontSize: 12 }}>{erreurs.rang}</span>}
            </label>
          </div>
          {champ('description', 'Qui c’est', `${DESCRIPTION_PERSONA_MAX} signes au plus`, true, v.description)}
          {champ('desirs', 'Désirs', `un par ligne, ${ELEMENTS_PERSONA_MAX} au plus, ${ELEMENT_PERSONA_MAX} signes chacun`, true, v.desirs)}
          {champ('freins', 'Freins', 'un par ligne', true, v.freins)}
          {champ('objections', 'Objections', 'un par ligne', true, v.objections)}
          {erreurs._ && <p role="alert" style={{ color: 'var(--bad)', fontSize: 12.5, margin: 0 }}>{erreurs._}</p>}
          <small className="faint" style={{ fontSize: '11.5px' }}>Gratuit · les extraits d’avis, les scénarios et les tests rattachés restent tels quels.</small>
          <div className="pbtns">
            <button className="btn" type="button" style={CIBLE} {...boutonAction({ occupe: encours, surClic: () => setOuvert(false) })}>Annuler</button>
            <button className="btn pri" type="submit" style={CIBLE} {...boutonAction({ presse: encours, occupe: encours })}>{encours ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </form>
      </DialogueSpatial>
    </span>
  );
}

export type ValiderPersonaAction = (i: { id: string; kind: 'persona' }) => Promise<{ ok?: true; error?: string }>;

/** « Valider ce persona » · `validateNodeAction` existant (Adsmap, marque active) · fermé avec sa raison à côté. */
export function ValiderPersona({ id, valider, raison }: { id: string; valider: ValiderPersonaAction | null; raison: string | null }) {
  const router = useRouter();
  const [encours, setEncours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  async function geste() {
    if (!valider) return;
    setEncours(true);
    setErreur(null);
    try {
      const r = await valider({ id, kind: 'persona' });
      if (r.ok) router.refresh(); else setErreur(r.error ?? 'La validation n’a pas abouti.');
    } catch { setErreur('La validation n’a pas abouti. Réessaie.'); }
    finally { setEncours(false); }
  }
  return (
    <span data-lot9="valider" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <button className="btn sm" type="button" data-geste-persona="valider" style={CIBLE} {...boutonAction({ presse: encours, occupe: encours, ferme: !valider, surClic: () => void geste() })}>
        <Ic n="check" />{encours ? 'Validation…' : 'Valider ce persona'}
      </button>
      {!valider && raison && <small className="faint" style={{ fontSize: '11.5px' }}>{raison}</small>}
      {erreur && <small role="alert" style={{ color: 'var(--bad)', fontSize: '11.5px' }}>{erreur}</small>}
    </span>
  );
}
