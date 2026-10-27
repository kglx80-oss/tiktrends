'use client';

import { useState, type ReactNode } from 'react';
import { Ic, Lien } from '../../communs';
import { FormulaireSurcouche } from './interactifs';

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
}

type ActionFormulaire = (fd: FormData) => Promise<void>;

const boite = (contenu: ReactNode) => (
  <div style={{ display: 'grid', gap: 8, alignContent: 'start', padding: '14px 16px', borderRadius: 18, background: '#ffffff0a', border: '1px solid var(--edge2)' }}>{contenu}</div>
);
const titreBoite = (t: string, couleur = 'var(--fg2)') => <div className="lbl" style={{ margin: 0, color: couleur }}>{t}</div>;
const ligne = (t: string, i: number) => <span key={i} style={{ fontSize: 13 }}>{t}</span>;
const manque = (t: string) => <span className="faint" style={{ fontSize: 13 }}>{t}</span>;

export function ChoixPersona({ brandId, personas, scenarios, jarvis, creerPub, ajouterPersona, ajouterScenario }: {
  brandId: string; personas: readonly PersonaVue[]; scenarios: ReadonlyArray<{ titre: string; contexte: string | null }>;
  jarvis: string | null; creerPub: string | null; ajouterPersona: ActionFormulaire | null; ajouterScenario: ActionFormulaire | null;
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
              <span className="av" style={{ background: x.teinte, width: 22, height: 22, fontSize: '10.5px' }}>{x.initiale}</span>{prenom(x.nom)}<small className="faint" style={{ fontSize: 11 }}>{x.statut.libelle}</small>
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}><h2 style={{ margin: 0 }}>{P.nom}</h2><span className={`pill ${P.statut.classe}`.trim()}>{P.statut.libelle}</span></div>
              <span className="faint" style={{ fontSize: 13 }}>{P.description || 'Description à compléter'}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {creerPub
                ? <Lien className="btn pri sm" href={creerPub}><Ic n="brush" />Créer une pub</Lien>
                : <button className="btn pri sm" type="button" disabled title="Les Studios ne sont pas ouverts à ton rôle ou à ta formule"><Ic n="brush" />Créer une pub</button>}
              {jarvis
                ? <Lien className="btn sm" href={jarvis}><Ic n="chat" />Demander à Jarvis</Lien>
                : <button className="btn sm" type="button" disabled title="Jarvis n’est pas ouvert à ton rôle ou à ta formule"><Ic n="chat" />Demander à Jarvis</button>}
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
              : manque('Aucun extrait d’avis rattaché')}</>)}
            {boite(<>{titreBoite('Scénarios d’usage')}{scenarios.length
              ? scenarios.map((s, i) => <span key={i} style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'baseline' }}><b style={{ minWidth: 52 }}>{s.titre}</b><span className="faint">{s.contexte ?? ''}</span></span>)
              : manque('Aucun scénario')}
              {ajouterScenario && (
                <FormulaireSurcouche className="btn sm" action={ajouterScenario} cache={{ brandId }} titre="Nouveau scénario d’usage" envoyer="Ajouter le scénario"
                  champs={[{ nom: 'title', libelle: 'Titre', requis: true }, { nom: 'context', libelle: 'Contexte', aide: 'lieu, moment, situation' }]}>
                  <Ic n="plus" />Ajouter
                </FormulaireSurcouche>
              )}</>)}
            {boite(<>{titreBoite('Angles mesurés')}{manque('Aucun lot conclu ne cible encore ce persona')}<small className="faint" style={{ fontSize: 11 }}>Taux d’accroche moyen · lots conclus</small></>)}
          </div>
          <small className="faint" style={{ fontSize: '11.5px' }}>Persona {P.statut.libelle.toLowerCase()} · {P.sources} source{P.sources > 1 ? 's' : ''} rattachée{P.sources > 1 ? 's' : ''}</small>
        </section>
      )}
    </>
  );
}
