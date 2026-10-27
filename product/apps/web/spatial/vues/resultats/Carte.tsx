'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import {
  COUT_PROPOSITION_CARTE, decompteCarte, lienFicheTest, lireCarte,
  type AreteCarteFait, type NoeudArbre, type NoeudCarteFait,
} from '@tiktrends/core';
import { proposeAnglesAction, proposeConceptsAction, proposeDesiresAction, proposePersonasAction, type ProposeResult } from '../../../app/actions/adsmap-propose';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { useGeste, Retour } from './geste';
import type { SousNavResultats } from './communs';

/**
 * « Carte » · la carte de l'ancienne Adsmap (avatar → désir → angle → concept →
 * ad), lue comme un arbre dans le langage de la maquette. La même lecture que
 * l'ancien canvas (`graphAction`, manques du moteur `findGaps`) · une branche
 * morte ou une gagnante jamais itérée se voit là où elle est. Les ads sont
 * repliées sous leur angle (un angle porte son décompte), un filtre par avatar
 * isole un arbre. Une ad mène à sa fiche.
 *
 * Construire (admin) · les agents proposent des enfants à partir d'un nœud
 * choisi (`propose*Action`, barème annoncé AVANT le clic, remboursé quand
 * l'agent ne rend rien) · tout arrive « proposé », à trier.
 */

export interface PropsCarte {
  sousNav: SousNavResultats;
  sous: string;
  noeuds: readonly NoeudCarteFait[];
  aretes: readonly AreteCarteFait[];
  tronquee: boolean;
  erreur: string | null;
  /** Admin · construire la carte par agents (actions réservées). */
  construire: boolean;
}

const ENFANT: Partial<Record<NoeudArbre['kind'], string>> = { persona: 'des désirs', desire: 'des angles', angle: 'des concepts' };
const TYPE: Record<NoeudArbre['kind'], string> = { persona: 'Avatar', desire: 'Désir', angle: 'Angle', concept: 'Concept', ad: 'Ad' };

export function Carte(p: PropsCarte) {
  const [avatar, setAvatar] = useState<string | null>(null);
  const [ouverts, setOuverts] = useState<ReadonlySet<string>>(new Set());
  const { occupe, message, geste } = useGeste();
  const [rejetes, setRejetes] = useState<string[]>([]);
  const lecture = useMemo(() => lireCarte(p.noeuds, p.aretes, avatar), [p.noeuds, p.aretes, avatar]);
  const angles = p.noeuds.filter((n) => n.kind === 'angle').map((n) => n.id);

  async function proposer(cle: string, f: () => Promise<ProposeResult>) {
    setRejetes([]);
    const r = await geste(cle, f, (x) => x.summary ?? 'Propositions posées sur la carte · à trier.');
    if (r) setRejetes(r.rejected ?? []);
  }
  const action = (n: NoeudArbre) => (n.kind === 'persona' ? () => proposeDesiresAction(n.id, 4) : n.kind === 'desire' ? () => proposeAnglesAction(n.id, 4) : () => proposeConceptsAction(n.id, 3));

  const construire = (n: NoeudArbre) => (p.construire && ENFANT[n.kind] ? (
    <button type="button" className="btn sm" disabled={!!occupe} title={`Un agent propose ${ENFANT[n.kind]} · ${COUT_PROPOSITION_CARTE}, remboursés s’il ne rend rien`} onClick={() => { void proposer(`${n.kind}:${n.id}`, action(n)); }}>
      <Ic n="plus" />{occupe === `${n.kind}:${n.id}` ? 'Proposition…' : `Proposer ${ENFANT[n.kind]} · ${COUT_PROPOSITION_CARTE}`}
    </button>
  ) : null);

  const etiquette = (n: NoeudArbre) => (
    <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
      <span className="faint" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.06em' }}>{TYPE[n.kind]}</span>
      <strong>{n.label}</strong>
      {n.mechanism && <span className="faint" style={{ fontSize: '12px' }}>· {n.mechanism}</span>}
      {n.proposee && <span className="pill">Proposé</span>}
      {n.manque && <span className="pill w" title={n.manque}><Ic n="warn" />{n.manque}</span>}
    </span>
  );

  const branche = (n: NoeudArbre): ReactNode => {
    if (n.kind === 'angle') {
      const concepts = n.enfants;
      const ads = concepts.reduce((s, c) => s + c.enfants.length, 0);
      return (
        <details open={ouverts.has(n.id)} onToggle={(e) => {
          const o = (e.currentTarget as HTMLDetailsElement).open;
          setOuverts((s) => { const x = new Set(s); if (o) x.add(n.id); else x.delete(n.id); return x; });
        }} style={{ borderLeft: '1px solid var(--edge2)', paddingLeft: 14, margin: '8px 0' }}>
          <summary style={{ cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', listStyle: 'none' }}>
            {etiquette(n)}
            <span className="faint" style={{ fontSize: '12px' }}>{concepts.length} concept{concepts.length > 1 ? 's' : ''} · {ads} ad{ads > 1 ? 's' : ''}</span>
            {construire(n)}
          </summary>
          {concepts.map((c) => (
            <div key={c.id} style={{ borderLeft: '1px solid var(--edge2)', paddingLeft: 14, margin: '8px 0', display: 'grid', gap: 6 }}>
              {etiquette(c)}
              {c.enfants.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {c.enfants.map((a) => (
                    <Lien key={a.id} className="btn sm" href={lienFicheTest(a.id)} title={a.manque ?? undefined}>
                      {a.label}
                      {a.verdict && <span className={`pill ${a.verdict.classe}`}>{a.verdict.libelle}{a.verdict.relatif ? ' *' : ''}</span>}
                      {a.iteration && <span className="faint" style={{ fontSize: '11px' }}>itération · {a.iteration}</span>}
                      {a.manque && <Ic n="warn" />}
                    </Lien>
                  ))}
                </div>
              )}
            </div>
          ))}
        </details>
      );
    }
    return (
      <div style={{ borderLeft: n.kind === 'persona' ? undefined : '1px solid var(--edge2)', paddingLeft: n.kind === 'persona' ? 0 : 14, margin: '8px 0' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>{etiquette(n)}{construire(n)}</div>
        {n.enfants.map((e) => <Fragment key={e.id}>{branche(e)}</Fragment>)}
      </div>
    );
  };

  return (
    <Vue>
      <EnTete titre="Carte" sous={p.sous} />
      <SousNav items={p.sousNav} actif="/adsmap" />
      {p.erreur ? (
        <section className="tile"><p role="alert" className="muted">{p.erreur}</p></section>
      ) : p.noeuds.length === 0 ? (
        <section className="tile">
          <p className="muted">Aucun avatar sur cette marque. La carte se lit avatar → désir → angle → concept → ad · tout part d’un avatar.</p>
          {p.construire && (
            <div className="foot2" style={{ marginTop: 12 }}>
              <button type="button" className="btn sm pri" disabled={!!occupe} onClick={() => { void proposer('personas', () => proposePersonasAction(3)); }}><Ic n="plus" />{occupe === 'personas' ? 'Proposition…' : `Proposer 3 avatars · ${COUT_PROPOSITION_CARTE}`}</button>
              <Lien className="btn sm" href="/adsmap/import">Importer ton tableau</Lien>
            </div>
          )}
          <Retour message={message} />
        </section>
      ) : (
        <>
          <section className="tile" style={{ marginBottom: 14 }}>
            <strong>{lecture.resume}</strong>
            <span className="faint" style={{ fontSize: '12.5px' }}>{decompteCarte(lecture.compte)}</span>
          </section>
          <div className="toolbar">
            <div className="pcats" style={{ margin: 0 }}>
              <button type="button" className="chip" aria-pressed={avatar === null} onClick={() => setAvatar(null)}>Tous les avatars</button>
              {lecture.avatars.map((a) => <button type="button" className="chip" key={a.id} aria-pressed={avatar === a.id} onClick={() => setAvatar(a.id)}>{a.label}</button>)}
            </div>
            <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setOuverts(new Set(angles))}>Tout déplier</button>
            <button type="button" className="btn sm" onClick={() => setOuverts(new Set())}>Tout replier</button>
          </div>
          {p.tronquee && <p className="faint" style={{ fontSize: '12.5px', marginBottom: 10 }}>Carte tronquée aux 800 ads les plus récentes · « Tous les tests » les montre toutes, filtrées par lot.</p>}
          {p.construire && (
            <section className="tile" style={{ marginBottom: 14 }}>
              <div className="lbl">Construire la carte</div>
              <p className="muted" style={{ fontSize: '12.5px' }}>Les agents descendent l’arbre à partir d’un nœud choisi · tout arrive « proposé », à trier. Ce qui a déjà été mesuré sur la marque est injecté en tête de chaque demande. {COUT_PROPOSITION_CARTE} par proposition, remboursés quand l’agent ne rend rien.</p>
              <div className="foot2" style={{ marginTop: 8 }}>
                <button type="button" className="btn sm" disabled={!!occupe} onClick={() => { void proposer('personas', () => proposePersonasAction(3)); }}><Ic n="plus" />{occupe === 'personas' ? 'Proposition…' : `Proposer 3 avatars · ${COUT_PROPOSITION_CARTE}`}</button>
                <Lien className="btn sm" href="/adsmap/tri">Trier les propositions</Lien>
              </div>
              <Retour message={message} />
              {rejetes.length > 0 && <p className="faint" style={{ fontSize: '12px' }}>Rejetés faute de mécanisme reconnu · {rejetes.join(' · ')}. Un angle sans mécanisme n’est pas comparable aux autres.</p>}
            </section>
          )}
          {lecture.arbre.map((a) => (
            <section className="tile sec" key={a.id}>{branche(a)}</section>
          ))}
          <p className="faint" style={{ fontSize: '12px', marginTop: 10 }}>Les ads sont repliées sous leur angle · ouvre-le pour les voir. Une pastille jaune signale une branche qui ne descend nulle part, ou une gagnante jamais itérée. L’astérisque marque une comparaison relative (protocole non respecté). Une ad ouvre sa fiche.</p>
        </>
      )}
    </Vue>
  );
}
