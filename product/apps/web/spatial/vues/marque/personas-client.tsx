'use client';

import { useState, type ReactNode } from 'react';
import { departDepuisAccroche, libelleRangPersona, lienNouveauProjet, type LecturePersona, type SaisieHypotheseLibre } from '@tiktrends/core';
import type { ResultatHypothese, SourceHypothese } from '../../../app/actions/adsmap-hypotheses';
import { Ic, Lien } from '../../communs';
import { BoutonHypothese } from '../resultats/hypothese-client';
import { FormulaireSurcouche, SupprimerConfirme } from './interactifs';
import { ModifierPersona, ValiderPersona, type ModifierPersonaAction, type PersonaEditable, type ValiderPersonaAction } from './persona-edition-client';

/**
 * Le choix du persona affiché (`[data-pers]` de la maquette) et sa fiche ·
 * l'état « quel persona » est local, les données viennent de la page.
 */

export interface PersonaVue {
  id: string;
  initiale: string;
  teinte: string;
  nom: string;
  statut: { libelle: string; classe: '' | 'g' | 'w' };
  description: string | null;
  desirs: readonly string[];
  freins: readonly string[];
  objections: readonly string[];
  citations: readonly string[];
  sources: number;
  /** Lot 9 · rang dans la marque (`personas.rank`) · absent ou `null`, rien n'est ajouté à la maquette. */
  rang?: number | null;
  /** Lot 9 · segment en clair (`personas.segment`) · absent ou `null`, rien n'est ajouté. */
  segment?: string | null;
  /** Lot 9 · les valeurs COMPLÈTES de la fiche, pour « Modifier » (les listes affichées sont bornées). */
  editable?: PersonaEditable;
  /** Lot 9 · persona proposé (`status = proposed`) · « Valider ce persona » s'affiche. */
  aValider?: boolean;
  /** Lot 9 · « Dans les tests » (VB P06) · ce que les verdicts disent de CE persona, ou pourquoi c'est fermé. */
  tests?: TestsPersonaVue;
}

/** La case « Dans les tests » · lue par la page (`lecturePersonas`), jamais calculée ici. */
export type TestsPersonaVue =
  | { ferme: true; raison: string }
  | { ferme: false; tests: number; lots: number; lecture: LecturePersona | 'aucun'; phrase: string; regle: string };

/** Lot 9 · les gestes de modification · absents, aucun bouton n'est ajouté (écran de la maquette). */
export interface EditionPersonas {
  modifier: { action: ModifierPersonaAction | null; raison: string | null };
  /** « Valider ce persona » sur un persona proposé · `validateNodeAction`. */
  valider: { action: ValiderPersonaAction | null; raison: string | null };
}

type ActionFormulaire = (fd: FormData) => Promise<void>;

/** « Tester cette accroche » (lot 1 V5) · `creerHypotheseAction`, ou `null` avec la raison (`accesHypothese`). */
export interface HypothesePersona {
  creer: ((i: { source: SourceHypothese; saisie: SaisieHypotheseLibre }) => Promise<ResultatHypothese>) | null;
  raison: string | null;
}

const boite = (contenu: ReactNode) => (
  <div style={{ display: 'grid', gap: 8, alignContent: 'start', padding: '14px 16px', borderRadius: 18, background: '#ffffff0a', border: '1px solid var(--edge2)' }}>{contenu}</div>
);
const titreBoite = (t: string, couleur = 'var(--fg2)') => <div className="lbl" style={{ margin: 0, color: couleur }}>{t}</div>;
const ligne = (t: string, i: number) => <span key={i} style={{ fontSize: 13 }}>{t}</span>;
const manque = (t: string) => <span className="faint" style={{ fontSize: 13 }}>{t}</span>;

const TON_LECTURE: Record<LecturePersona | 'aucun', string> = {
  au_dessus: 'var(--good)', en_dessous: 'var(--bad)', dans_le_bruit: 'var(--fg2)', effectif: 'var(--fg3)', reference: 'var(--fg3)', trop_de_personas: 'var(--fg3)', aucun: 'var(--fg3)',
};

function CaseTests({ t }: { t: TestsPersonaVue }) {
  if (t.ferme) return <>{titreBoite('Dans les tests')}{manque(t.raison)}</>;
  return (
    <>
      {titreBoite('Dans les tests')}
      <span style={{ fontSize: 13 }} data-tests-persona={t.tests}>{t.tests === 0 ? 'Aucun test ne cible ce persona' : `${t.tests} test${t.tests > 1 ? 's' : ''} · ${t.lots} lot${t.lots > 1 ? 's' : ''}`}</span>
      <span data-lecture-persona={t.lecture} style={{ fontSize: 13, color: TON_LECTURE[t.lecture] }}>{t.phrase}</span>
      <small className="faint" style={{ fontSize: 11 }}>{t.regle}</small>
    </>
  );
}

export function ChoixPersona({ brandId, personas, scenarios, jarvis, creerPub, ajouterPersona, ajouterScenario, retirerPersona, hypothese, edition }: {
  brandId: string; personas: readonly PersonaVue[]; scenarios: ReadonlyArray<{ titre: string; contexte: string | null }>;
  jarvis: string | null; creerPub: string | null; ajouterPersona: ActionFormulaire | null; ajouterScenario: ActionFormulaire | null;
  /** Retirer le persona affiché · `deletePersonaAction` (geste de la fiche V5). Absent, le bouton n'est pas rendu. */
  retirerPersona?: ActionFormulaire | null;
  /** Tester une accroche du persona affiché · absent, le bouton n'est pas rendu. */
  hypothese?: HypothesePersona;
  /** Lot 9 · « Modifier » et « Valider ce persona » · absent, aucun bouton n'est ajouté. */
  edition?: EditionPersonas;
}) {
  const [k, setK] = useState(0);
  const P = personas[Math.min(k, personas.length - 1)];
  const prenom = (n: string) => n.split(',')[0]!.trim();
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <div className="seg" role="group" aria-label="Persona" style={{ flexWrap: 'wrap', maxWidth: '100%', height: 'auto' }}>
          {personas.map((x, j) => (
            <button key={x.id} type="button" aria-pressed={j === k} onClick={() => setK(j)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', flex: 'none' }}>
              <span className="av" style={{ background: x.teinte, width: 22, height: 22, fontSize: '10.5px' }}>{x.initiale}</span>{x.rang != null && <b data-lot9="rang" style={{ fontSize: 11 }}>{libelleRangPersona(x.rang)}</b>}{prenom(x.nom)}<small className="faint" style={{ fontSize: 11 }}>{x.statut.libelle}</small>
            </button>
          ))}
        </div>
        {jarvis
          ? <Lien className="btn sm" href={jarvis}><Ic n="spark" />Proposer un persona</Lien>
          : <button className="btn sm" type="button" disabled title="Jarvis n’est pas ouvert à ton rôle ou à ta formule"><Ic n="spark" />Proposer un persona</button>}
        <FormulaireSurcouche className="btn sm" href={`/brands/${brandId}/personas`} action={ajouterPersona} cache={{ brandId }} titre="Nouveau persona" envoyer="Ajouter le persona" raison="Réservé aux administrateurs de l’espace"
          champs={[{ nom: 'name', libelle: 'Nom', requis: true }, { nom: 'description', libelle: 'Qui c’est', long: true }, { nom: 'pains', libelle: 'Freins', aide: 'séparés par des virgules' }, { nom: 'desires', libelle: 'Désirs', aide: 'séparés par des virgules' }]}>
          <Ic n="plus" />Nouveau
        </FormulaireSurcouche>
      </div>
      {!P ? (
        <section className="tile"><p className="faint" style={{ margin: 0 }}>Aucun persona pour l’instant · ajoute le premier, ou laisse Jarvis remplir la fiche depuis le site.</p></section>
      ) : (
        <section className="tile" style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <span className="av" style={{ background: P.teinte, width: 64, height: 64, fontSize: '21.5px', flex: 'none' }}>{P.initiale}</span>
            <div style={{ flex: '1 1 260px', minWidth: 0, display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}><h2 style={{ margin: 0 }}>{P.nom}</h2><span className={`pill ${P.statut.classe}`.trim()}>{P.statut.libelle}</span>
                {P.rang != null && <span className="pill" data-lot9="rang" data-persona-rang={P.rang}>Persona {libelleRangPersona(P.rang)}</span>}
                {P.segment && <span className="pill" data-lot9="segment" data-persona-segment="">{P.segment}</span>}</div>
              <span className="faint" style={{ fontSize: 13 }}>{P.description || 'Description à compléter'}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {creerPub
                ? <Lien className="btn pri sm" href={lienNouveauProjet({ type: 'ads', persona: P.id })} data-creer-pour={P.id} title={`Ouvre Nouveau projet avec ${prenom(P.nom)} présélectionné dans « Pour qui ? »`}><Ic n="brush" />Créer une pub</Lien>
                : <button className="btn pri sm" type="button" disabled title="Les Studios ne sont pas ouverts à ton rôle ou à ta formule"><Ic n="brush" />Créer une pub</button>}
              {jarvis
                ? <Lien className="btn sm" href={jarvis}><Ic n="chat" />Demander à Jarvis</Lien>
                : <button className="btn sm" type="button" disabled title="Jarvis n’est pas ouvert à ton rôle ou à ta formule"><Ic n="chat" />Demander à Jarvis</button>}
              {edition && P.editable && <ModifierPersona key={`m-${P.id}`} brandId={brandId} persona={P.editable} nombre={personas.length} modifier={edition.modifier.action} raison={edition.modifier.raison} />}
              {edition && P.aValider && <ValiderPersona key={`v-${P.id}`} id={P.id} valider={edition.valider.action} raison={edition.valider.raison} />}
              {retirerPersona !== undefined && (
                <SupprimerConfirme action={retirerPersona} champs={{ brandId, id: P.id }} className="btn sm" libelle={`Retirer le persona ${P.nom}`} confirmation={`Retirer le persona « ${P.nom} » ?`}><Ic n="x" />Retirer</SupprimerConfirme>
              )}
            </div>
          </div>
          {P.citations[0] && (
            <blockquote style={{ margin: 0, padding: '14px 18px', borderRadius: 18, background: 'linear-gradient(120deg,color-mix(in srgb,var(--acc) 16%,transparent),transparent 70%)', font: '600 17.5px/1.35 var(--sfd)', textWrap: 'pretty' } as React.CSSProperties}>
              « {P.citations[0]} »<small className="faint" style={{ display: 'block', font: '500 11.5px var(--sf)', marginTop: 6 }}>Extrait rattaché à ce persona</small>
            </blockquote>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,190px),1fr))', gap: 12 }}>
            {boite(<>{titreBoite('Désirs', 'var(--good)')}{P.desirs.length ? P.desirs.map(ligne) : manque('Non renseignés')}</>)}
            {boite(<>{titreBoite('Freins', 'var(--warn)')}{P.freins.length ? P.freins.map(ligne) : manque('Non renseignés')}</>)}
            {boite(<>{titreBoite('Objections')}{P.objections.length ? P.objections.map(ligne) : manque('Non renseignées')}</>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,190px),1fr))', gap: 12 }}>
            {boite(<>{titreBoite('Ses mots, tirés des avis')}{P.citations.length
              ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{P.citations.map((c, i) => <span className="pill" key={i}>« {c} »</span>)}</div>
              : manque('Aucun extrait d’avis rattaché')}
              {hypothese && (
                <BoutonHypothese key={P.id} className="btn sm" style={{ justifySelf: 'start' }} titre={`Tester une accroche · ${prenom(P.nom)}`}
                  envoyer={hypothese.creer ? (saisie, accroche) => hypothese.creer!({ source: { type: 'persona', personaId: P.id, accroche }, saisie }) : null}
                  raison={hypothese.raison} depart={departDepuisAccroche(P.citations[0])}
                  choix={P.citations.length ? { libelle: 'Accroche à tester', options: P.citations.map((c) => ({ valeur: c, libelle: `« ${c} »`, depart: departDepuisAccroche(c) })) } : undefined}
                  note={P.citations.length ? 'Ses mots deviennent l’accroche à tester · l’hypothèse se range dans Résultats, « À formuler ».' : 'Aucun extrait d’avis · écris l’accroche à tester toi-même.'}>
                  <Ic n="bulb" />Tester une accroche
                </BoutonHypothese>
              )}</>)}
            {boite(<>{titreBoite('Scénarios d’usage')}{scenarios.length
              ? scenarios.map((s, i) => <span key={i} style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'baseline' }}><b style={{ minWidth: 52 }}>{s.titre}</b><span className="faint">{s.contexte ?? ''}</span></span>)
              : manque('Aucun scénario')}
              {ajouterScenario && (
                <FormulaireSurcouche className="btn sm" action={ajouterScenario} cache={{ brandId }} titre="Nouveau scénario d’usage" envoyer="Ajouter le scénario"
                  champs={[{ nom: 'title', libelle: 'Titre', requis: true }, { nom: 'context', libelle: 'Contexte', aide: 'lieu, moment, situation' }]}>
                  <Ic n="plus" />Ajouter
                </FormulaireSurcouche>
              )}</>)}
            {P.tests
              ? boite(<CaseTests t={P.tests} />)
              : boite(<>{titreBoite('Angles mesurés')}{manque('Aucun lot conclu ne cible encore ce persona')}<small className="faint" style={{ fontSize: 11 }}>Taux d’accroche moyen · lots conclus</small></>)}
          </div>
          <small className="faint" style={{ fontSize: '11.5px' }}>Persona {P.statut.libelle.toLowerCase()} · {P.sources} source{P.sources > 1 ? 's' : ''} rattachée{P.sources > 1 ? 's' : ''}</small>
        </section>
      )}
    </>
  );
}
