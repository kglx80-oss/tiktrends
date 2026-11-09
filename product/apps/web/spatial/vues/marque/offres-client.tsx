'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  CONDITIONS_OFFRE_MAX, INTITULE_OFFRE_MAX, LIBELLES_STATUT_ALLEGATION, LIBELLES_TYPE_OFFRE, PREUVE_ALLEGATION_MAX, STATUTS_ALLEGATION,
  TEXTE_ALLEGATION_MAX, TYPES_OFFRE,
} from '@tiktrends/core';
import { Ic } from '../../communs';
import { boutonAction } from '../projet/action-serveur';
import { DialogueSpatial } from './interactifs';

/**
 * Lot 9 bis V5 · les gestes de la fiche Offre (VB M07, PR04) · créer, modifier,
 * archiver ou réactiver une offre, et une allégation. Les gestes passent par
 * les actions de la fiche (`enregistrerOffreAction`, `archiverOffreAction`,
 * `enregistrerAllegationAction`, `archiverAllegationAction` · mêmes gardes que
 * les personas et les produits). Les boutons suivent la brique `boutonAction`
 * · un second clic pendant l'envoi est ignoré, un bouton fermé dit sa raison à
 * côté. Rien ne change à l'écran avant le oui du serveur. Aucune suppression.
 */

export type ResultatFiche = { ok: true; id: string } | { error: string; erreurs?: Array<{ champ: string; raison: string }> };
export type EnregistrerFicheAction = (i: { brandId: string; id?: string | null; saisie: unknown }) => Promise<ResultatFiche>;
export type ArchiverFicheAction = (i: { brandId: string; id: string; archive: boolean }) => Promise<ResultatFiche>;

export interface OffreEditable { id: string; intitule: string; type: string | null; conditions: string | null }
export interface AllegationEditable { id: string; texte: string; preuve: string | null; statut: string }

const CHAMP: CSSProperties = { boxSizing: 'border-box', width: '100%', padding: '10px 14px', minHeight: 44, borderRadius: 14, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)', outline: 0 };
const CIBLE: CSSProperties = { minHeight: 44 };

type Erreurs = Record<string, string> & { _?: string };

/** La fenêtre d'une fiche (offre ou allégation) · un bouton qui l'ouvre, un formulaire qui part au serveur. */
function FenetreFiche({ geste, libelle, icone, titre, raison, envoyer, champs, aide }: {
  geste: string; libelle: string; icone: string; titre: string;
  raison: string | null;
  /** `null` · fermé (la raison s'écrit à côté). */
  envoyer: ((fd: FormData) => Promise<ResultatFiche>) | null;
  champs: (erreurs: Erreurs) => ReactNode;
  aide: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [encours, setEncours] = useState(false);
  const [erreurs, setErreurs] = useState<Erreurs>({});
  async function soumettre(form: HTMLFormElement) {
    if (!envoyer || encours) return;
    setEncours(true);
    setErreurs({});
    try {
      const r = await envoyer(new FormData(form));
      if ('ok' in r) { setOuvert(false); router.refresh(); return; }
      const e: Erreurs = {};
      for (const x of r.erreurs ?? []) e[x.champ] = e[x.champ] ? `${e[x.champ]} ${x.raison}` : x.raison;
      if (!r.erreurs?.length) e._ = r.error;
      setErreurs(e);
    } catch {
      setErreurs({ _: 'L’enregistrement n’a pas abouti. Réessaie.' });
    } finally {
      setEncours(false);
    }
  }
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <button className="btn sm" type="button" data-geste-offre={geste} style={CIBLE}
        {...boutonAction({ ferme: !envoyer, surClic: () => { setErreurs({}); setOuvert(true); } })}>
        <Ic n={icone} />{libelle}
      </button>
      {!envoyer && raison && <small className="faint" style={{ fontSize: '11.5px' }}>{raison}</small>}
      <DialogueSpatial titre={titre} ouvert={ouvert} fermer={() => { if (!encours) setOuvert(false); }}>
        <form data-fiche-offre={geste} style={{ display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); void soumettre(e.currentTarget); }}>
          {champs(erreurs)}
          {erreurs._ && <p role="alert" style={{ color: 'var(--bad)', fontSize: 12.5, margin: 0 }}>{erreurs._}</p>}
          <small className="faint" style={{ fontSize: '11.5px' }}>{aide}</small>
          <div className="pbtns">
            <button className="btn" type="button" style={CIBLE} {...boutonAction({ occupe: encours, surClic: () => setOuvert(false) })}>Annuler</button>
            <button className="btn pri" type="submit" style={CIBLE} {...boutonAction({ presse: encours, occupe: encours })}>{encours ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </form>
      </DialogueSpatial>
    </span>
  );
}

const erreurChamp = (erreurs: Erreurs, nom: string) => erreurs[nom] ? <span role="alert" data-erreur-champ={nom} style={{ color: 'var(--bad)', fontSize: 12 }}>{erreurs[nom]}</span> : null;

function Texte({ nom, libelle, valeur, erreurs, long = false }: { nom: string; libelle: string; valeur: string; erreurs: Erreurs; long?: boolean }) {
  return (
    <label style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
      <span className="faint">{libelle}</span>
      {long
        ? <textarea name={nom} defaultValue={valeur} rows={3} aria-invalid={erreurs[nom] ? true : undefined} style={{ ...CHAMP, resize: 'vertical' }} />
        : <input name={nom} defaultValue={valeur} aria-invalid={erreurs[nom] ? true : undefined} style={CHAMP} />}
      {erreurChamp(erreurs, nom)}
    </label>
  );
}

const lire = (fd: FormData, k: string) => String(fd.get(k) ?? '');

/** « Nouvelle offre » (sans `offre`) ou « Modifier » une offre · intitulé, type, conditions. */
export function FicheOffre({ brandId, offre, enregistrer, raison }: { brandId: string; offre: OffreEditable | null; enregistrer: EnregistrerFicheAction | null; raison: string | null }) {
  return (
    <FenetreFiche
      geste={offre ? 'modifier' : 'nouvelle'} libelle={offre ? 'Modifier' : 'Nouvelle offre'} icone={offre ? 'text' : 'plus'}
      titre={offre ? `Modifier l’offre ${offre.intitule}` : 'Nouvelle offre'} raison={raison}
      envoyer={enregistrer ? (fd) => enregistrer({ brandId, id: offre?.id ?? null, saisie: { intitule: lire(fd, 'intitule'), type: lire(fd, 'type'), conditions: lire(fd, 'conditions') } }) : null}
      aide="Gratuit · une offre active se choisit au lancement d’un projet et entre dans son brief."
      champs={(e) => (
        <>
          <Texte nom="intitule" libelle={`Intitulé · obligatoire, ${INTITULE_OFFRE_MAX} signes au plus`} valeur={offre?.intitule ?? ''} erreurs={e} />
          <label style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
            <span className="faint">Type</span>
            <select name="type" defaultValue={offre?.type ?? ''} style={CHAMP}>
              <option value="">Choisir un type</option>
              {TYPES_OFFRE.map((t) => <option key={t} value={t}>{LIBELLES_TYPE_OFFRE[t]}</option>)}
            </select>
            {erreurChamp(e, 'type')}
          </label>
          <Texte nom="conditions" libelle={`Conditions · facultatif, ${CONDITIONS_OFFRE_MAX} signes au plus`} valeur={offre?.conditions ?? ''} erreurs={e} long />
        </>
      )}
    />
  );
}

/** « Nouvelle allégation » ou « Modifier » · texte, preuve ou source, statut. */
export function FicheAllegation({ brandId, allegation, enregistrer, raison }: { brandId: string; allegation: AllegationEditable | null; enregistrer: EnregistrerFicheAction | null; raison: string | null }) {
  return (
    <FenetreFiche
      geste={allegation ? 'modifier-allegation' : 'nouvelle-allegation'} libelle={allegation ? 'Modifier' : 'Nouvelle allégation'} icone={allegation ? 'text' : 'plus'}
      titre={allegation ? 'Modifier l’allégation' : 'Nouvelle allégation'} raison={raison}
      envoyer={enregistrer ? (fd) => enregistrer({ brandId, id: allegation?.id ?? null, saisie: { texte: lire(fd, 'texte'), preuve: lire(fd, 'preuve'), statut: lire(fd, 'statut') } }) : null}
      aide="Une allégation prouvée cite sa preuve ou sa source · sans elle, elle reste « à prouver » et le dit partout où elle est proposée."
      champs={(e) => (
        <>
          <Texte nom="texte" libelle={`Ce que la marque affirme · obligatoire, ${TEXTE_ALLEGATION_MAX} signes au plus`} valeur={allegation?.texte ?? ''} erreurs={e} />
          <Texte nom="preuve" libelle={`Preuve ou source · ${PREUVE_ALLEGATION_MAX} signes au plus`} valeur={allegation?.preuve ?? ''} erreurs={e} long />
          <label style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
            <span className="faint">Statut</span>
            <select name="statut" defaultValue={allegation?.statut ?? 'a_prouver'} style={CHAMP}>
              {STATUTS_ALLEGATION.map((s) => <option key={s} value={s}>{LIBELLES_STATUT_ALLEGATION[s]}</option>)}
            </select>
            {erreurChamp(e, 'statut')}
          </label>
        </>
      )}
    />
  );
}

/** « Archiver » ou « Réactiver » (offre) · « Archiver » ou « Rétablir » (allégation) · rien ne se supprime. */
export function ArchiverFiche({ brandId, id, archive, libelle, archiver, raison, geste }: {
  brandId: string; id: string; archive: boolean; libelle: string; geste: string;
  archiver: ArchiverFicheAction | null; raison: string | null;
}) {
  const router = useRouter();
  const [encours, setEncours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  async function clic() {
    if (!archiver) return;
    setEncours(true);
    setErreur(null);
    try {
      const r = await archiver({ brandId, id, archive });
      if ('ok' in r) router.refresh(); else setErreur(r.error);
    } catch { setErreur('Le changement n’a pas abouti. Réessaie.'); }
    finally { setEncours(false); }
  }
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <button className="btn sm" type="button" data-geste-offre={geste} style={CIBLE} {...boutonAction({ presse: encours, occupe: encours, ferme: !archiver, surClic: () => void clic() })}>
        <Ic n={archive ? 'folder' : 'loop'} />{encours ? 'Enregistrement…' : libelle}
      </button>
      {!archiver && raison && <small className="faint" style={{ fontSize: '11.5px' }}>{raison}</small>}
      {erreur && <small role="alert" style={{ color: 'var(--bad)', fontSize: '11.5px' }}>{erreur}</small>}
    </span>
  );
}
