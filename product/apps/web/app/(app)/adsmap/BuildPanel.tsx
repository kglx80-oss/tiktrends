'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  proposePersonasAction, proposeDesiresAction, proposeAnglesAction, proposeConceptsAction,
  type ProposeResult,
} from '../../actions/adsmap-propose';
import { graphAction, type GraphNode } from '../../actions/adsmap-graph';

/**
 * Construction de la carte par agents (A1 à A3).
 *
 * L'écran descend l'arbre dans l'ordre : avatar → désir → angle → concept. On ne
 * propose de descendre qu'à partir d'un nœud choisi · un bouton « tout générer »
 * remplirait la carte de centaines de nœuds qu'aucun humain ne relirait, et une
 * carte non relue vaut moins qu'une carte vide.
 *
 * Le compte rendu dit ce qui a été ÉCARTÉ autant que ce qui a été créé. Un agent
 * relancé propose souvent les mêmes désirs · afficher « 4 propositions » dont 3
 * sont des jumeaux le ferait passer pour plus productif qu'il n'est.
 */

const NIVEAU: Array<{ kind: GraphNode['kind']; titre: string; enfant: string }> = [
  { kind: 'persona', titre: 'Avatars', enfant: 'désirs' },
  { kind: 'desire', titre: 'Désirs', enfant: 'angles' },
  { kind: 'angle', titre: 'Angles', enfant: 'concepts' },
];

export function BuildPanel() {
  const [nodes, setNodes] = useState<GraphNode[] | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [rejetes, setRejetes] = useState<string[]>([]);

  const charger = useCallback(async () => {
    const r = await graphAction();
    if (r.error) { setMsg({ texte: r.error, erreur: true }); return; }
    setNodes(r.graph?.nodes ?? []);
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  async function lancer(cle: string, work: () => Promise<ProposeResult>) {
    if (busy) return;
    setBusy(cle); setMsg(null); setRejetes([]);
    const r = await work();
    setBusy('');
    if (r.error) { setMsg({ texte: r.error, erreur: true }); return; }
    setMsg({ texte: r.summary ?? 'Terminé.', erreur: false });
    setRejetes(r.rejected ?? []);
    await charger();
  }

  const par = (k: GraphNode['kind']) => (nodes ?? []).filter((n) => n.kind === k);

  return (
    <section style={{ marginTop: 20, padding: '16px 18px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface)' }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Construire la carte</h2>
      <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 700 }}>
        Les agents descendent l’arbre : avatar → désir → angle → concept. Tout arrive en
        <b> « proposé »</b> · un agent ne décide pas de la taxonomie de la marque, il propose un
        rattachement que tu corriges. Ce qui a déjà été mesuré sur cette marque est injecté en tête
        de chaque demande.
      </p>

      {msg && (
        <p style={{ margin: '12px 0 0', fontSize: 12.5, lineHeight: 1.55, color: msg.erreur ? '#ff8095' : 'var(--ink-2)' }}>
          {msg.texte}
        </p>
      )}
      {rejetes.length > 0 && (
        <p style={{ margin: '5px 0 0', fontSize: 11.5, color: '#ffcf8f', lineHeight: 1.5 }}>
          Rejetés faute de mécanisme reconnu : {rejetes.join(' · ')}. Un angle sans mécanisme n’est
          pas comparable aux autres · il ne rentre pas.
        </p>
      )}

      {/* Racine · les avatars n'ont pas de parent à choisir */}
      <div style={{ marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={titre}>Avatars ({par('persona').length})</span>
          <button type="button" disabled={!!busy} onClick={() => lancer('personas', () => proposePersonasAction(3))} style={bouton}>
            {busy === 'personas' ? 'Proposition…' : 'Proposer 3 avatars'}
          </button>
        </div>
      </div>

      {NIVEAU.map(({ kind, titre: t, enfant }) => {
        const liste = par(kind);
        if (!liste.length) return null;
        return (
          <div key={kind} style={{ marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--line)' }}>
            <span style={titre}>Depuis un {t.toLowerCase().replace(/s$/, '')} · proposer des {enfant}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {liste.slice(0, 24).map((n) => {
                const cle = `${kind}:${n.id}`;
                const action = kind === 'persona'
                  ? () => proposeDesiresAction(n.id, 4)
                  : kind === 'desire'
                    ? () => proposeAnglesAction(n.id, 4)
                    : () => proposeConceptsAction(n.id, 3);
                return (
                  <button key={n.id} type="button" disabled={!!busy} onClick={() => lancer(cle, action)}
                    title={`${n.label} · ${n.childCount} enfant(s)`}
                    style={{
                      ...pastille,
                      // Une branche vide est ce qu'on vient remplir · elle se repère.
                      borderStyle: n.childCount === 0 ? 'dashed' : 'solid',
                      borderColor: n.childCount === 0 ? 'rgba(245,166,35,.5)' : 'var(--line-2)',
                      opacity: busy && busy !== cle ? 0.5 : 1,
                    }}>
                    {busy === cle ? '…' : n.label.slice(0, 40)}
                    <span style={{ color: 'var(--muted)', marginLeft: 5 }}>{n.childCount}</span>
                  </button>
                );
              })}
            </div>
            {liste.length > 24 && (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)' }}>
                24 premiers affichés · descends depuis la Carte pour les autres.
              </p>
            )}
          </div>
        );
      })}

      <p style={{ margin: '13px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
        5 crédits par proposition · remboursés quand l’agent ne rend rien. Les contours en pointillé
        sont les branches qui ne descendent nulle part.
      </p>
    </section>
  );
}

const titre: CSSProperties = {
  fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em',
  textTransform: 'uppercase', color: 'var(--muted)',
};

const bouton: CSSProperties = {
  padding: '7px 15px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)',
  color: '#0d070c', fontWeight: 800, fontSize: 12, cursor: 'pointer',
};

const pastille: CSSProperties = {
  padding: '5px 11px', borderRadius: 999, border: '1px solid var(--line-2)',
  background: 'var(--paper)', color: 'var(--ink-2)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
};
