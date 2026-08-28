'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  type Node, type Edge, type NodeProps,
} from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import '@xyflow/react/dist/style.css';
import { findGaps, iterationParentSet, countGraph, summarizeGaps, type Gap } from '@tiktrends/core';
import { graphAction, type Graph, type GraphNode } from '../../actions/adsmap-graph';
import { AdDrawer } from './AdDrawer';

/**
 * Canvas ADSMAP (§7).
 *
 * La vue Table répond à « où en est ce test ». Le canvas répond à autre chose,
 * que le tableur n'a jamais su poser : **d'où vient ce gagnant, et qu'est-ce
 * qu'on n'a pas encore essayé ?**
 *
 * Tout le fichier découle de là. Les branches mortes sont marquées en pointillé
 * plutôt que masquées, la filiation d'itération a son propre trait, et l'entête
 * nomme UNE priorité au lieu d'aligner quatre compteurs · un canvas qui signale
 * partout n'est plus lu nulle part.
 *
 * Les couleurs sortent des variables du produit (décision D8) et non du thème
 * par défaut de la bibliothèque : une carte qui ne ressemble pas au reste de
 * l'application se lit comme un widget importé.
 */

const elk = new ELK();

/** Hauteur/largeur fixes : ELK a besoin de dimensions avant le rendu. */
const TAILLE: Record<GraphNode['kind'], { w: number; h: number }> = {
  persona: { w: 200, h: 56 },
  desire: { w: 200, h: 56 },
  angle: { w: 210, h: 62 },
  concept: { w: 220, h: 62 },
  ad: { w: 132, h: 46 },
};

const KIND_LABEL: Record<GraphNode['kind'], string> = {
  persona: 'Avatar', desire: 'Désir', angle: 'Angle', concept: 'Concept', ad: 'Ad',
};

const VERDICT_TON: Record<string, { bd: string; fg: string; bg: string }> = {
  winner: { bd: 'rgba(126,232,191,.55)', fg: '#7ee8bf', bg: 'rgba(126,232,191,.10)' },
  baby_winner: { bd: 'rgba(245,166,35,.5)', fg: '#ffcf8f', bg: 'rgba(245,166,35,.09)' },
  relative_winner: { bd: 'rgba(245,166,35,.35)', fg: '#e0b980', bg: 'rgba(245,166,35,.05)' },
  loser: { bd: 'rgba(254,44,85,.45)', fg: '#ff8095', bg: 'rgba(254,44,85,.07)' },
  inconclusive: { bd: 'var(--line-2)', fg: 'var(--muted)', bg: 'transparent' },
  insufficient_delivery: { bd: 'var(--line-2)', fg: 'var(--muted)', bg: 'transparent' },
};

const VERDICT_LABEL: Record<string, string> = {
  winner: 'Gagnante', baby_winner: 'Gagnante naissante', relative_winner: 'Gagnante (relatif)',
  loser: 'Perdante', inconclusive: 'Non concluant', insufficient_delivery: 'Sous-diffusée',
};

/* -------------------------------------------------------------------------- */
/*  Nœud                                                                      */
/* -------------------------------------------------------------------------- */

interface DonneesNoeud extends Record<string, unknown> {
  n: GraphNode;
  gap: Gap | null;
}

function NoeudCarte({ data }: NodeProps<Node<DonneesNoeud>>) {
  const { n, gap } = data;
  const ton = n.kind === 'ad' && n.verdict ? VERDICT_TON[n.verdict] : null;
  const t = TAILLE[n.kind];

  return (
    <div
      title={gap ? gap.message : n.kind === 'ad' && n.verdict ? `${VERDICT_LABEL[n.verdict] ?? n.verdict}${n.comparable === false ? ' · comparaison relative' : ''}` : undefined}
      style={{
        width: t.w, minHeight: t.h, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
        padding: n.kind === 'ad' ? '7px 10px' : '9px 12px',
        borderRadius: n.kind === 'ad' ? 9 : 12,
        background: ton?.bg ?? 'var(--surface)',
        // Le pointillé dit « rien ne descend d'ici » sans rien masquer · c'est
        // exactement ce qu'on vient chercher sur un graphe.
        border: `1px ${gap ? 'dashed' : 'solid'} ${gap ? 'rgba(245,166,35,.55)' : ton?.bd ?? 'var(--line-2)'}`,
        color: 'var(--ink)', fontSize: 12,
      }}
    >
      <Handle type="target" position={Position.Left} style={poignee} />
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 800, color: 'var(--muted)' }}>
        {KIND_LABEL[n.kind]}
        {gap && <span style={{ color: '#ffcf8f' }}> · à travailler</span>}
      </div>
      <div style={{
        fontWeight: 700, lineHeight: 1.3, color: ton?.fg ?? 'var(--ink)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {n.label}
      </div>
      {n.kind === 'ad' && n.verdict && (
        <div style={{ fontSize: 9.5, color: 'var(--muted)' }}>
          {VERDICT_LABEL[n.verdict] ?? n.verdict}
          {n.comparable === false && <span title="Protocole non respecté">&nbsp;*</span>}
        </div>
      )}
      {n.kind === 'angle' && n.mechanism && (
        <div style={{ fontSize: 9.5, color: 'var(--muted)' }}>{n.mechanism.replace(/_/g, ' ')}</div>
      )}
      <Handle type="source" position={Position.Right} style={poignee} />
    </div>
  );
}

const poignee: CSSProperties = { width: 5, height: 5, background: 'var(--line-2)', border: 'none' };
const nodeTypes = { carte: NoeudCarte };

/* -------------------------------------------------------------------------- */
/*  Canvas                                                                    */
/* -------------------------------------------------------------------------- */

export function Canvas() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [nodes, setNodes] = useState<Node<DonneesNoeud>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [error, setError] = useState('');
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const charger = useCallback(async () => {
    const r = await graphAction();
    if (r.error) { setError(r.error); return; }
    setError('');
    setGraph(r.graph!);
  }, []);

  useEffect(() => { void charger(); }, [charger, version]);

  const lecture = useMemo(() => {
    if (!graph) return null;
    const parents = iterationParentSet(graph.edges);
    const gaps = findGaps(graph.nodes, parents);
    return { gaps, counts: countGraph(graph.nodes, gaps) };
  }, [graph]);

  // Mise en page ELK · asynchrone, donc dans un effet et non pendant le rendu.
  useEffect(() => {
    if (!graph || !lecture) return;
    let vivant = true;

    const parGap = new Map(lecture.gaps.map((g) => [g.nodeId, g]));

    (async () => {
      const res = await elk.layout({
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          'elk.layered.spacing.nodeNodeBetweenLayers': '70',
          'elk.spacing.nodeNode': '18',
          // Les arêtes de filiation reviennent en arrière · sans ce réglage,
          // ELK les fait traverser tout le graphe et le dessin devient illisible.
          'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
          'elk.edgeRouting': 'ORTHOGONAL',
        },
        children: graph.nodes.map((n) => ({ id: n.id, width: TAILLE[n.kind].w, height: TAILLE[n.kind].h })),
        edges: graph.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
      }).catch(() => null);
      if (!vivant) return;

      const pos = new Map((res?.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
      setNodes(graph.nodes.map((n) => ({
        id: n.id,
        type: 'carte',
        position: pos.get(n.id) ?? { x: 0, y: 0 },
        data: { n, gap: parGap.get(n.id) ?? null },
        // Seules les ads ouvrent une fiche · cliquer un angle n'aurait rien à montrer.
        style: { cursor: n.kind === 'ad' ? 'pointer' : 'default' },
      })));
      setEdges(graph.edges.map((e) => ({
        id: e.id, source: e.source, target: e.target, label: e.label,
        animated: e.kind === 'iteration',
        style: e.kind === 'iteration'
          ? { stroke: 'var(--accent-strong)', strokeWidth: 1.6 }
          : { stroke: 'var(--line-2)', strokeWidth: 1 },
        labelStyle: { fill: 'var(--muted)', fontSize: 9.5, fontWeight: 700 },
        labelBgStyle: { fill: 'var(--paper)' },
      })));
    })();

    return () => { vivant = false; };
  }, [graph, lecture]);

  if (error) return <p style={{ color: '#ff8095', fontSize: 13 }}>{error}</p>;
  if (!graph) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement de la carte…</p>;

  if (!graph.nodes.length) {
    return (
      <div style={{ border: '1px dashed var(--line-2)', borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 26 }}>🗺️</div>
        <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink)', fontWeight: 700 }}>Aucun avatar sur cette marque.</p>
        <p style={{ margin: '6px auto 0', fontSize: 12.5, color: 'var(--muted)', maxWidth: 460, lineHeight: 1.6 }}>
          La carte se lit de gauche à droite : avatar → désir → angle → concept → ad.
          Importe ton tableau, ou pars d’un avatar pour construire la première branche.
        </p>
      </div>
    );
  }

  const c = lecture!.counts;

  return (
    <div>
      {/* Une priorité, pas quatre compteurs. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12,
        padding: '11px 15px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)',
      }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 700, flex: '1 1 300px', lineHeight: 1.5 }}>
          {summarizeGaps(c)}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {c.personas} avatar(s) · {c.desires} désir(s) · {c.angles} angle(s) · {c.concepts} concept(s) · {c.ads} ad(s) · {c.winners} gagnante(s)
        </span>
      </div>

      {graph.truncated && (
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#ffcf8f' }}>
          Carte tronquée aux 800 ads les plus récentes · la vue Table les montre toutes, filtrées par lot.
        </p>
      )}

      <div style={{ height: '72vh', minHeight: 460, border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', background: 'var(--paper)' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => { if (node.data.n.kind === 'ad') setOuverte(node.id); }}
          fitView
          minZoom={0.08}
          proOptions={{ hideAttribution: false }}
          nodesDraggable={false}
          nodesConnectable={false}
        >
          <Background color="var(--line)" gap={22} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable zoomable
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
            maskColor="rgba(0,0,0,.35)"
            nodeColor={(nd) => {
              const n = (nd.data as DonneesNoeud).n;
              return n.kind === 'ad' && n.verdict ? (VERDICT_TON[n.verdict]?.fg ?? '#666') : '#4a4a52';
            }}
          />
        </ReactFlow>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55 }}>
        Trait plein · rattachement. Trait animé rose · itération, avec la variable changée.
        Contour pointillé · branche qui ne descend nulle part. Clique une ad pour l’arbitrer.
      </p>

      {ouverte && (
        <AdDrawer adId={ouverte} onClose={() => setOuverte(null)} onChanged={() => setVersion((v) => v + 1)} />
      )}
    </div>
  );
}
