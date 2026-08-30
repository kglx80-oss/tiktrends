'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, useReactFlow,
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
 * ── Pourquoi il était inexploitable, et ce qui a changé ──────────────────────
 *
 * Il dessinait TOUT d'un coup. Sur un compte réel — vingt-neuf lots — cela fait
 * plusieurs centaines de nœuds, que `fitView` écrasait à huit pour cent de zoom.
 * **Une carte de cinq cents nœuds ajustée à l'écran n'est pas une carte, c'est
 * une texture.** On voyait qu'il y avait quelque chose, sans pouvoir rien lire.
 *
 * Le réflexe serait d'améliorer le zoom. C'est traiter le symptôme : zoomer dans
 * une texture donne un fragment de texture, sans savoir où l'on est. Le vrai
 * remède est de **montrer moins par défaut**.
 *
 * Trois décisions en découlent :
 *
 * 1. **Les ads sont repliées.** L'ossature stratégique — avatar, désir, angle —
 *    tient en quelques dizaines de nœuds ; ce sont les ads qui font le nombre.
 *    Un angle replié porte son décompte, donc rien n'est caché : on sait ce
 *    qu'il y a derrière avant de l'ouvrir.
 * 2. **Un filtre par avatar.** Le graphe est une forêt, un arbre par avatar ·
 *    les lire ensemble n'apporte rien qu'aucun des deux ne dise mieux seul.
 * 3. **Le cadrage suit ce qu'on ouvre.** Déplier une branche sans recadrer
 *    laisse le contenu hors de l'écran, et donne l'impression que le clic n'a
 *    rien fait.
 *
 * Le zoom minimal est remonté de 0,08 à 0,3 : en dessous, plus rien n'est
 * lisible, et laisser descendre plus bas n'offre que la possibilité de se perdre.
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
  angle: { w: 210, h: 72 },
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

const GAGNANTS = new Set(['winner', 'baby_winner', 'relative_winner']);

/* -------------------------------------------------------------------------- */
/*  Nœud                                                                      */
/* -------------------------------------------------------------------------- */

interface Repli { concepts: number; ads: number; winners: number; ouvert: boolean }

interface DonneesNoeud extends Record<string, unknown> {
  n: GraphNode;
  gap: Gap | null;
  /** Angles seulement · ce qui dort derrière quand la branche est repliée. */
  repli: Repli | null;
}

const poignee: CSSProperties = { width: 5, height: 5, background: 'var(--line-2)', border: 'none' };

function NoeudCarte({ data }: NodeProps<Node<DonneesNoeud>>) {
  const { n, gap, repli } = data;
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
      </div>
      <div style={{ fontSize: n.kind === 'ad' ? 11 : 12, fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {n.label}
      </div>
      {n.kind === 'ad' && n.verdict && (
        <div style={{ fontSize: 9.5, fontWeight: 700, color: ton?.fg ?? 'var(--muted)' }}>
          {VERDICT_LABEL[n.verdict] ?? n.verdict}{n.comparable === false ? ' *' : ''}
        </div>
      )}
      {/* Un angle replié dit ce qu'il contient · sinon replier serait cacher. */}
      {repli && (
        <div style={{
          fontSize: 9.5, fontWeight: 700, marginTop: 1,
          color: repli.winners > 0 ? '#7ee8bf' : 'var(--muted)',
        }}>
          {repli.ouvert
            ? '▾ ouvert · clique pour replier'
            : repli.ads === 0
              ? `▸ ${repli.concepts} concept(s), aucune ad`
              : `▸ ${repli.concepts} concept(s) · ${repli.ads} ad(s)${repli.winners > 0 ? ` · ${repli.winners} gagnante(s)` : ''}`}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={poignee} />
    </div>
  );
}

const nodeTypes = { carte: NoeudCarte };

/* -------------------------------------------------------------------------- */
/*  Recadrage                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Recadre quand ce qui est affiché change.
 *
 * Déplier une branche sans recadrer laisse le nouveau contenu hors de l'écran ·
 * l'utilisateur clique, rien ne bouge visiblement, et il conclut que le clic
 * n'a pas marché.
 */
function Recadrer({ cle }: { cle: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    // Le temps que la mise en page soit posée · sans ce délai, on cadre sur
    // les positions précédentes.
    const t = setTimeout(() => { void fitView({ duration: 350, padding: 0.15 }); }, 60);
    return () => clearTimeout(t);
  }, [cle, fitView]);
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Canvas                                                                    */
/* -------------------------------------------------------------------------- */

export function Canvas() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState('');
  const [nodes, setNodes] = useState<Node<DonneesNoeud>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Avatar affiché · `null` = tous. Les ads restent repliées dans les deux cas.
  const [avatar, setAvatar] = useState<string | null>(null);
  // Angles dépliés · c'est le seul endroit où le nombre de nœuds peut exploser.
  const [deplies, setDeplies] = useState<Set<string>>(new Set());

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

  /**
   * Ce que chaque angle contient, et à quel avatar chaque nœud appartient.
   *
   * Calculé une fois sur le graphe complet · les décomptes d'une branche repliée
   * doivent rester exacts, ils ne peuvent donc pas se déduire de ce qui est
   * affiché.
   */
  const index = useMemo(() => {
    if (!graph) return null;
    const parDeId = new Map(graph.nodes.map((n) => [n.id, n]));

    // Avatar racine de chaque nœud · remontée bornée, sûre même sur cycle.
    const racine = new Map<string, string>();
    const remonte = (id: string): string | null => {
      const vus = new Set<string>();
      let cur: string | undefined = id;
      while (cur && !vus.has(cur)) {
        vus.add(cur);
        const n = parDeId.get(cur);
        if (!n) return null;
        if (n.kind === 'persona') return n.id;
        cur = n.parentId ?? undefined;
      }
      return null;
    };
    for (const n of graph.nodes) {
      const r = remonte(n.id);
      if (r) racine.set(n.id, r);
    }

    // Contenu de chaque angle · concepts directs, puis ads sous ces concepts.
    const conceptsDe = new Map<string, string[]>();
    for (const n of graph.nodes) {
      if (n.kind === 'concept' && n.parentId) {
        conceptsDe.set(n.parentId, [...(conceptsDe.get(n.parentId) ?? []), n.id]);
      }
    }
    const adsDe = new Map<string, GraphNode[]>();
    for (const n of graph.nodes) {
      if (n.kind === 'ad' && n.parentId) {
        adsDe.set(n.parentId, [...(adsDe.get(n.parentId) ?? []), n]);
      }
    }
    const replis = new Map<string, { concepts: number; ads: number; winners: number }>();
    for (const n of graph.nodes) {
      if (n.kind !== 'angle') continue;
      const cs = conceptsDe.get(n.id) ?? [];
      const ads = cs.flatMap((c) => adsDe.get(c) ?? []);
      replis.set(n.id, {
        concepts: cs.length,
        ads: ads.length,
        winners: ads.filter((a) => a.verdict && GAGNANTS.has(a.verdict)).length,
      });
    }

    const avatars = graph.nodes.filter((n) => n.kind === 'persona');
    return { racine, replis, avatars };
  }, [graph]);

  /** Les nœuds réellement dessinés · c'est ici que la lisibilité se joue. */
  const visibles = useMemo(() => {
    if (!graph || !index) return [];
    return graph.nodes.filter((n) => {
      if (avatar && index.racine.get(n.id) !== avatar) return false;
      // L'ossature stratégique est toujours là · c'est elle qu'on vient lire.
      if (n.kind === 'persona' || n.kind === 'desire' || n.kind === 'angle') return true;
      if (n.kind === 'concept') return n.parentId ? deplies.has(n.parentId) : false;
      // Une ad suit son concept, qui suit son angle.
      if (n.kind === 'ad') {
        const c = graph.nodes.find((x) => x.id === n.parentId);
        return !!(c?.parentId && deplies.has(c.parentId));
      }
      return true;
    });
  }, [graph, index, avatar, deplies]);

  const cleVue = `${avatar ?? 'tous'}|${visibles.length}|${[...deplies].sort().join(',')}`;

  // Mise en page ELK · asynchrone, donc dans un effet et non pendant le rendu.
  useEffect(() => {
    if (!graph || !lecture || !index || !visibles.length) return;
    let vivant = true;

    const parGap = new Map(lecture.gaps.map((g) => [g.nodeId, g]));
    const ids = new Set(visibles.map((n) => n.id));
    const aretes = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));

    (async () => {
      const res = await elk.layout({
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          'elk.layered.spacing.nodeNodeBetweenLayers': '70',
          'elk.spacing.nodeNode': '22',
          // Les arêtes de filiation reviennent en arrière · sans ce réglage,
          // ELK les fait traverser tout le graphe et le dessin devient illisible.
          'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
          'elk.edgeRouting': 'ORTHOGONAL',
        },
        children: visibles.map((n) => ({ id: n.id, width: TAILLE[n.kind].w, height: TAILLE[n.kind].h })),
        edges: aretes.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
      }).catch(() => null);
      if (!vivant) return;

      const pos = new Map((res?.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
      setNodes(visibles.map((n) => {
        const r = index.replis.get(n.id);
        return {
          id: n.id,
          type: 'carte',
          position: pos.get(n.id) ?? { x: 0, y: 0 },
          data: {
            n, gap: parGap.get(n.id) ?? null,
            repli: n.kind === 'angle' && r ? { ...r, ouvert: deplies.has(n.id) } : null,
          },
          // Une ad ouvre sa fiche, un angle se déplie · le reste ne réagit pas,
          // et le curseur le dit avant le clic.
          style: { cursor: n.kind === 'ad' || (n.kind === 'angle' && r && r.concepts > 0) ? 'pointer' : 'default' },
        };
      }));
      setEdges(aretes.map((e) => ({
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
  }, [graph, lecture, index, visibles, deplies]);

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
  const avatars = index?.avatars ?? [];
  const toutDeplie = () => setDeplies(new Set(graph.nodes.filter((n) => n.kind === 'angle').map((n) => n.id)));

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10,
        padding: '11px 15px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)',
      }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 700, flex: '1 1 300px', lineHeight: 1.5 }}>
          {summarizeGaps(c)}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {c.personas} avatar(s) · {c.desires} désir(s) · {c.angles} angle(s) · {c.concepts} concept(s) · {c.ads} ad(s) · {c.winners} gagnante(s)
        </span>
      </div>

      {/* Navigation · l'ossature est visible, on choisit ce qu'on ouvre. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>Avatar :</span>
        <Puce actif={avatar === null} onClick={() => setAvatar(null)}>Tous</Puce>
        {avatars.map((p) => (
          <Puce key={p.id} actif={avatar === p.id} onClick={() => setAvatar(p.id)}>{p.label}</Puce>
        ))}
        <span style={{ flex: 1 }} />
        <Puce actif={false} onClick={toutDeplie}>Tout déplier</Puce>
        <Puce actif={false} onClick={() => setDeplies(new Set())}>Tout replier</Puce>
      </div>

      {graph.truncated && (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#ffcf8f' }}>
          Carte tronquée aux 800 ads les plus récentes · la vue Table les montre toutes, filtrées par lot.
        </p>
      )}

      <div style={{ height: '72vh', minHeight: 460, border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', background: 'var(--paper)' }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => {
              const k = node.data.n.kind;
              if (k === 'ad') { setOuverte(node.id); return; }
              if (k === 'angle') {
                setDeplies((s) => {
                  const n = new Set(s);
                  if (n.has(node.id)) n.delete(node.id); else n.add(node.id);
                  return n;
                });
              }
            }}
            fitView
            // En dessous de 0,3 plus rien n'est lisible · descendre plus bas
            // n'offre que la possibilité de se perdre dans une texture.
            minZoom={0.3}
            maxZoom={1.8}
            proOptions={{ hideAttribution: false }}
            nodesDraggable={false}
            nodesConnectable={false}
          >
            <Recadrer cle={cleVue} />
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
        </ReactFlowProvider>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55 }}>
        Les ads sont <b>repliées</b> par défaut · un angle porte son décompte, clique-le pour l’ouvrir.
        Trait plein · rattachement. Trait animé rose · itération, avec la variable changée.
        Contour pointillé · branche qui ne descend nulle part. Clique une ad pour l’arbitrer.
      </p>

      {ouverte && (
        <AdDrawer adId={ouverte} onClose={() => setOuverte(null)} onChanged={() => setVersion((v) => v + 1)} />
      )}
    </div>
  );
}

function Puce({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
        border: `1px solid ${actif ? 'var(--accent-strong)' : 'var(--line-2)'}`,
        background: actif ? 'var(--accent-soft)' : 'transparent',
        color: actif ? 'var(--accent-strong)' : 'var(--ink-2)',
        maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}
