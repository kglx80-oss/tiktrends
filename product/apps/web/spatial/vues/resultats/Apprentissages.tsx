'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  FILTRES_ETAT_APPRENTISSAGE, LIBELLE_NIVEAU, dansFiltreEtatApprentissage,
  type DepartHypothese, type EtatApprentissage, type FiltreEtatApprentissage, type NiveauPreuve, type TiroirApprentissage,
} from '@tiktrends/core';
import { apprentissageVersReglesAction, rejeterApprentissageAction } from '../../../app/actions/adsmap-apprentissage';
import { creerHypotheseAction } from '../../../app/actions/adsmap-hypotheses';
import { BoutonHypothese } from './hypothese-client';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { FERME, pendantAction } from '../projet/focus';
import { Points, Pub, type SousNavResultats } from './communs';

/**
 * « Apprentissages » · `docs/spatial/reference/apprentissages.html`, balisage à
 * l'identique. Les apprentissages RÉELS de la marque (`adsmap_learnings`), leur
 * niveau de preuve lu par la règle du noyau (`niveauPreuveApprentissage`), et ·
 * « À valider » · les lots prêts à conclure, dont l'apprentissage reste à écrire
 * (la validation passe par la fiche du lot, `validateVerdictAction`).
 *
 * En plus de la maquette, et seulement quand la page les passe (la parité de
 * structure reste celle du fragment) · les filtres d'état de la V5 (« À
 * retester » est CALCULÉ par `etatApprentissage`), le tiroir « D'où ça vient ·
 * Limites · Vaut pour » (`tiroirApprentissage`), et deux gestes explicites ·
 * passer l'apprentissage dans les règles de la marque, le rejeter ou le rétablir.
 *
 * RJ A04 · « En tirer une hypothèse », sur la carte et dans le tiroir · le
 * formulaire d'hypothèse libre, prérempli par la règle du noyau
 * (`departDepuisApprentissage` · l'énoncé dans le « parce que », la variable de
 * la variante reprise) · `creerHypotheseAction` la range dans « À formuler »
 * avec la provenance « Apprentissage ». Un apprentissage rejeté sert à se
 * retester · sa phrase de départ le dit (voir la règle).
 */

export interface CarteApprentissage {
  id: string;
  niveau: NiveauPreuve;
  icone: string;
  etat: EtatApprentissage;
  titre: string;
  preuve: ReadonlyArray<{ texte: string; image: string | null; libelle: string; part: number; gagne: boolean }> | null;
  pied: string;
  /** Où le constat est réemployé · seule source aujourd'hui, son passage dans les règles de la marque · `null` sinon. */
  usage: string | null;
  /** `boucle` · l'icône d'itération · absente, celle d'un apprentissage validé. */
  action: { libelle: string; href: string; boucle?: boolean };
  /** Le tiroir « D'où ça vient · Limites · Vaut pour » · absent, rien n'est ajouté. */
  tiroir?: TiroirApprentissage;
  /** Les gestes sur un apprentissage écrit · absents (lot à valider, lecture), rien n'est ajouté. */
  gestes?: {
    learningId: string;
    /** Pourquoi « Ajouter aux règles » est fermé (déjà fait, à valider, droits) · `null` = ouvert. */
    regles: string | null;
    /** `true` · rejeté (on propose de le rétablir) · `null` · rien à rejeter (pas validé). */
    rejete: boolean | null;
    /** « En tirer une hypothèse » · le départ du formulaire (noyau) et sa ligne · absent, le geste n'est pas rendu. */
    hypothese?: { depart: DepartHypothese; note: string };
  };
}

export interface PropsApprentissages {
  sousNav: SousNavResultats;
  cartes: readonly CarteApprentissage[];
  /** Les filtres d'état de la V5 · absents, seule la maquette (niveau de preuve) est rendue. */
  filtresEtat?: boolean;
}

const LEGENDE: ReadonlyArray<[NiveauPreuve, string, string]> = [
  [3, 'Mesuré', 'Arbitré sur un verdict comparable et tranché'],
  [2, 'Observé', 'Rattaché à un verdict, sans comparaison au protocole'],
  [1, 'Non mesuré', 'Sans verdict derrière · à vérifier par un test'],
];
const FILTRES: ReadonlyArray<['tous' | NiveauPreuve, string]> = [['tous', 'Tous'], [3, 'Mesurés'], [2, 'Observés'], [1, 'À vérifier']];

export function Apprentissages(p: PropsApprentissages) {
  const [filtre, setFiltre] = useState<'tous' | NiveauPreuve>('tous');
  const [etat, setEtat] = useState<FiltreEtatApprentissage>('tous');
  const liste = p.cartes.filter((c) => (filtre === 'tous' || c.niveau === filtre) && dansFiltreEtatApprentissage(c.etat, etat));
  return (
    <Vue>
      <EnTete titre="Apprentissages" sous="Ce que tes tests ont montré, avec le niveau de preuve et ses limites" />
      <SousNav items={p.sousNav} actif="/adsmap/apprentissages" />
      <div className="grid3" style={{ marginBottom: 18 }}>
        {LEGENDE.map(([n, t, s]) => (
          <div className="tile" style={{ display: 'flex', gap: 12, alignItems: 'center' }} key={n}><Points n={n} /><div><strong>{t}</strong><p className="faint" style={{ fontSize: '11.5px' }}>{s}</p></div></div>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Filtrer par niveau de preuve">
        {FILTRES.map(([k, t]) => <button type="button" key={k} aria-pressed={filtre === k} onClick={() => setFiltre(k)}>{t}</button>)}
      </div>
      {p.filtresEtat && (
        <div className="seg" role="group" aria-label="Filtrer par état" style={{ marginLeft: 8 }}>
          {FILTRES_ETAT_APPRENTISSAGE.map((f) => {
            const n = f.cle === 'tous' ? p.cartes.length : p.cartes.filter((c) => c.etat === f.cle).length;
            return <button type="button" key={f.cle} aria-pressed={etat === f.cle} onClick={() => setEtat(f.cle)}>{f.libelle} · {n}</button>;
          })}
        </div>
      )}
      <div className="lgrid">
        {liste.map((c) => (
          <article className="tile lcard" key={c.id}>
            <div className="head">
              <span className="ico"><Ic n={c.icone} /></span><Points n={c.niveau} /><span className="faint" style={{ fontSize: '11.5px' }}>{LIBELLE_NIVEAU[c.niveau]}</span>
              <span style={{ marginLeft: 'auto' }}>
                {c.etat === 'valider' ? <span className="pill w">À valider</span> : c.etat === 'retester' ? <span className="pill">À retester</span> : <span className="pill g"><Ic n="check" />Validé</span>}
              </span>
            </div>
            <h3>{c.titre}</h3>
            {c.preuve && (
              <div className="proof">
                {c.preuve.map((x, i) => [
                  <Pub key={`a${i}`} texte={x.texte} image={x.image} classe={x.gagne ? 'won' : undefined} />,
                  <div key={`b${i}`} className={`bar ${x.gagne ? 'w' : ''}`} style={{ flex: 1 }}><i><b style={{ width: `${x.part}%` }} /></i><span>{x.libelle}</span></div>,
                ])}
              </div>
            )}
            <div className="foot">
              <span>{c.pied}</span>{c.usage && <span>· {c.usage}</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {c.etat === 'valider'
                  ? <Lien className="btn sm pri" href={c.action.href}>{c.action.libelle}</Lien>
                  : <Lien className="btn sm" href={c.action.href}>{(c.action.boucle ?? c.etat === 'valide') && <Ic n="loop" />}{c.action.libelle}</Lien>}
              </span>
            </div>
            {c.gestes && <Gestes g={c.gestes} />}
            {c.tiroir && <Tiroir t={c.tiroir} hypothese={c.gestes?.hypothese ? <EnTirerHypothese g={c.gestes} ou="tiroir" /> : null} />}
          </article>
        ))}
        {liste.length === 0 && <p className="faint">{p.cartes.length ? 'Aucun apprentissage pour ce filtre.' : 'Aucun apprentissage pour cette marque · il s’écrit en concluant un lot.'}</p>}
      </div>
    </Vue>
  );
}

/**
 * « En tirer une hypothèse » · ouvre le formulaire d'hypothèse (surcouche, focus
 * rendu au bouton) · le serveur relit l'apprentissage dans la marque active et
 * refuse sinon (`creerHypotheseAction`, `adsmapGuard` membre).
 */
function EnTirerHypothese({ g, ou }: { g: NonNullable<CarteApprentissage['gestes']>; ou: 'carte' | 'tiroir' }) {
  const h = g.hypothese!;
  return (
    <span data-geste={`hypothese-${ou}`} style={{ display: 'contents' }}>
      <BoutonHypothese className="btn sm" style={{ minHeight: 44 }} titre="En tirer une hypothèse" depart={h.depart} note={h.note}
        envoyer={(saisie) => creerHypotheseAction({ source: { type: 'apprentissage', learningId: g.learningId }, saisie })}>
        <Ic n="bulb" />En tirer une hypothèse
      </BoutonHypothese>
    </span>
  );
}

function Tiroir({ t, hypothese }: { t: TiroirApprentissage; hypothese?: ReactNode }) {
  const bloc = (titre: string, lignes: readonly string[]) => (
    <div style={{ display: 'grid', gap: 4 }}>
      <strong style={{ fontSize: '12.5px' }}>{titre}</strong>
      {lignes.map((l) => <span className="faint" key={l} style={{ fontSize: '12px' }}>{l}</span>)}
    </div>
  );
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontSize: '12.5px' }}>D’où ça vient · Limites · Vaut pour</summary>
      <div style={{ display: 'grid', gap: 10, paddingTop: 6 }}>
        {bloc('D’où ça vient', t.origine)}
        {bloc('Limites', t.limites)}
        {bloc('Vaut pour', [t.vautPour])}
        {hypothese && <div className="kc" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{hypothese}</div>}
      </div>
    </details>
  );
}

/**
 * « Ajouter aux règles de la marque » et « Rejeter » · chacun appelle l'action
 * serveur, qui garde (rôle, Jarvis, marque) · aucun succès sans retour positif.
 * Le bouton pressé garde le focus pendant l'action.
 */
function Gestes({ g }: { g: NonNullable<CarteApprentissage['gestes']> }) {
  const router = useRouter();
  const { toast } = useSpatial();
  const [occupe, setOccupe] = useState<string | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const lancer = async (cle: string, f: () => Promise<{ error?: string }>, reussi: string) => {
    if (occupe) return;
    setOccupe(cle); setMessage(null);
    try {
      const r = await f();
      if (r.error) { setMessage({ texte: r.error, erreur: true }); return; }
      setMessage({ texte: reussi, erreur: false }); toast(reussi); router.refresh();
    } catch {
      setMessage({ texte: 'L’action a échoué · réessaie.', erreur: true });
    } finally { setOccupe(null); }
  };
  const attrs = (cle: string, ferme = false) => {
    const a = pendantAction({ presse: occupe === cle, occupe: !!occupe, ferme });
    return { ...a, style: a['aria-disabled'] ? { ...FERME, minHeight: 44 } : { minHeight: 44 } };
  };
  const idRaison = `regles-ferme-${g.learningId}`;
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
      <div className="kc" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button className="btn sm" type="button" {...attrs('regles', !!g.regles)} disabled={!!g.regles || attrs('regles').disabled} aria-describedby={g.regles ? idRaison : undefined}
          onClick={() => { if (!g.regles) void lancer('regles', () => apprentissageVersReglesAction({ learningId: g.learningId }), 'Ajouté aux règles de la marque · Jarvis l’applique dès la prochaine génération'); }}>
          <Ic n="plus" />{occupe === 'regles' ? 'Ajout…' : 'Ajouter aux règles de la marque'}
        </button>
        {g.rejete !== null && (
          <button className="btn sm" type="button" {...attrs('rejet')}
            onClick={() => void lancer('rejet', () => rejeterApprentissageAction({ learningId: g.learningId, refute: !g.rejete }), g.rejete ? 'Apprentissage rétabli · Jarvis le relit de nouveau' : 'Apprentissage rejeté · Jarvis ne le relit plus')}>
            <Ic n={g.rejete ? 'loop' : 'x'} />{g.rejete ? 'Rétablir' : 'Rejeter'}
          </button>
        )}
        {g.hypothese && <EnTirerHypothese g={g} ou="carte" />}
      </div>
      {g.regles && <small className="faint" id={idRaison} style={{ fontSize: '11.5px' }}>{g.regles}</small>}
      {message && <small className="faint" role={message.erreur ? 'alert' : 'status'} style={{ fontSize: '11.5px' }}>{message.texte}</small>}
    </div>
  );
}
