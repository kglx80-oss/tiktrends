'use client';

import { useCallback, useEffect, useState, useTransition, type CSSProperties } from 'react';
import { KIND_LABEL, isTrivialMerge, type MergePlan, type NodeKind } from '@tiktrends/core';
import {
  curationViewAction, validateNodeAction, rejectNodeAction, validateManyAction,
  mergeCandidatesAction, mergePlanAction, mergePersonasAction,
  type CurationView, type MergeCandidate, type ProposedNode,
} from '../../../actions/adsmap-curation';
import { Empty } from '../../../../components/Empty';

/**
 * L'écran de tri.
 *
 * ── L'ordre n'est pas alphabétique ───────────────────────────────────────────
 *
 * Personas, puis désirs, puis angles, puis concepts. Valider un concept remonte
 * ses ancêtres · trier par le haut évite de valider vingt fois le même persona
 * sans s'en rendre compte, et de découvrir après coup qu'on a accepté une
 * branche qu'on aurait refusée.
 *
 * ── Le geste de masse est là où il sert ──────────────────────────────────────
 *
 * Trier trente concepts un par un, personne ne le fait deux fois. « Tout valider »
 * existe donc par type · et il ÉCARTE les noms provisoires plutôt que de les
 * laisser passer, en disant lesquels. Valider « À qualifier » en masse ferait
 * entrer le provisoire dans la carte définitive, ce qui est exactement le
 * problème qu'on règle.
 *
 * ── La fusion ne dépend pas de la file d'attente ─────────────────────────────
 *
 * Deux personas en double peuvent très bien avoir été validés tous les deux · le
 * doublon est alors définitif et plus rien ne le signale. Le panneau de fusion
 * est donc rendu MÊME quand il n'y a rien à trier : le renvoyer derrière l'état
 * vide reviendrait à cacher l'outil exactement le jour où on en a besoin.
 */

const carte: CSSProperties = {
  border: '1px solid var(--line)', borderRadius: 14, padding: '13px 16px',
  background: 'var(--surface)', display: 'grid', gap: 8,
};

const btn = (ton: 'oui' | 'non' | 'neutre'): CSSProperties => ({
  padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  border: ton === 'neutre' ? '1px solid var(--line-2)' : 'none',
  background: ton === 'oui' ? 'var(--grad-accent)' : 'transparent',
  color: ton === 'oui' ? '#0d070c' : ton === 'non' ? '#ff9db0' : 'var(--ink-2)',
});

const ORDRE: NodeKind[] = ['persona', 'desire', 'angle', 'concept'];

export function Curation() {
  const [view, setView] = useState<CurationView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, agir] = useTransition();

  const charger = useCallback(async () => {
    const r = await curationViewAction();
    if (r.error) setErr(r.error); else { setErr(null); setView(r.view ?? null); }
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  const toutValider = (kind: NodeKind) => agir(async () => {
    setNote(null);
    const ids = (view?.nodes ?? []).filter((n) => n.kind === kind && !n.rename).map((n) => n.id);
    if (!ids.length) { setNote('Rien à valider ici · tous ces noms demandent d’abord d’être précisés.'); return; }
    const r = await validateManyAction({ ids, kind });
    if (r.error) { setErr(r.error); return; }
    setNote(
      r.skipped?.length
        ? `${r.validated} validé(s) · ${r.skipped.length} écarté(s) faute d’un vrai nom : ${r.skipped.slice(0, 3).join(', ')}${r.skipped.length > 3 ? '…' : ''}`
        : `${r.validated} validé(s).`,
    );
    await charger();
  });

  if (err) return <div style={{ ...carte, borderColor: '#ff8095', color: '#ff8095', fontSize: 13 }}>{err}</div>;
  if (!view) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Lecture de la carte…</div>;

  const total = ORDRE.reduce((s, k) => s + view.counts[k], 0);
  if (total === 0) {
    return (
      <div style={{ display: 'grid', gap: 20 }}>
        <Empty
          tone="good" title="Rien n’attend d’être trié."
          why="Tout ce que le radar et les studios ont posé sur la carte a été accepté ou refusé · elle ne contient que ce que tu as validé."
        />
        <Fusion onFait={charger} />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {note && <p style={{ margin: 0, fontSize: 12.5, color: '#9fe6b3', lineHeight: 1.55 }}>{note}</p>}

      <Fusion onFait={charger} />

      {ORDRE.map((kind) => {
        const items = view.nodes.filter((n) => n.kind === kind);
        if (!items.length) return null;
        const reste = view.counts[kind] - items.length;

        return (
          <section key={kind} style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)', textTransform: 'capitalize' }}>
                {KIND_LABEL[kind]}s
              </h2>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {view.counts[kind]} proposé(s){reste > 0 ? ` · ${items.length} affichés` : ''}
              </span>
              <span style={{ flex: 1 }} />
              <button onClick={() => toutValider(kind)} disabled={busy} style={btn('neutre')}>
                {busy ? 'En cours…' : `Tout valider (${items.filter((n) => !n.rename).length})`}
              </button>
            </div>

            {items.map((n) => <Ligne key={n.id} node={n} onFait={charger} />)}
          </section>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const champ: CSSProperties = {
  flex: '1 1 220px', minWidth: 180, padding: '8px 11px', borderRadius: 10,
  border: '1px solid var(--line-2)', background: 'var(--bg)', color: 'var(--ink)',
  fontSize: 13.5, fontFamily: 'inherit',
};

/**
 * Rapprocher deux personas.
 *
 * ── Pourquoi le plan s'affiche avant le bouton ───────────────────────────────
 *
 * Une fusion déplace une branche entière · désirs, angles, concepts, et les
 * tests payés qui pendent dessous. Le geste est réversible en droit (rien n'est
 * supprimé, tout est archivé) mais pas en pratique : personne ne se souvient de
 * quel désir venait d'où trois semaines plus tard. On montre donc ce qui va
 * bouger, chiffres compris, et le bouton n'apparaît qu'après.
 *
 * ── Replié par défaut ────────────────────────────────────────────────────────
 *
 * On vient ici pour trier, pas pour fusionner. Deux sélecteurs ouverts en
 * permanence au-dessus de la file inviteraient au geste plutôt qu'à la file.
 */
function Fusion({ onFait }: { onFait: () => Promise<void> }) {
  const [ouvert, setOuvert] = useState(false);
  const [personas, setPersonas] = useState<MergeCandidate[] | null>(null);
  const [source, setSource] = useState('');
  const [cible, setCible] = useState('');
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const [busy, agir] = useTransition();

  const charger = useCallback(async () => {
    const r = await mergeCandidatesAction();
    if (r.error) setMsg(r.error); else { setMsg(null); setPersonas(r.personas ?? []); }
  }, []);

  useEffect(() => { if (ouvert && !personas) void charger(); }, [ouvert, personas, charger]);

  // Le plan est relu à chaque changement de couple. La garde de fraîcheur n'est
  // pas décorative · deux réponses lentes peuvent revenir dans le désordre, et
  // afficher le plan d'un couple qu'on ne regarde plus, c'est confirmer autre
  // chose que ce qu'on a lu.
  useEffect(() => {
    if (!source || !cible || source === cible) { setPlan(null); return; }
    let vivant = true;
    void (async () => {
      const r = await mergePlanAction({ sourceId: source, targetId: cible });
      if (!vivant) return;
      if (r.error) { setMsg(r.error); setPlan(null); } else { setMsg(null); setPlan(r.plan ?? null); }
    })();
    return () => { vivant = false; };
  }, [source, cible]);

  const fusionner = () => agir(async () => {
    setMsg(null);
    const r = await mergePersonasAction({ sourceId: source, targetId: cible });
    if (r.error) { setMsg(r.error); return; }
    const nomSource = personas?.find((p) => p.id === source)?.name ?? 'Le persona';
    setFait(`« ${nomSource} » a été archivé · ${r.moved ?? 0} désir(s) déplacé(s), ${r.folded ?? 0} replié(s) sur un homonyme.`);
    setSource(''); setCible(''); setPlan(null); setPersonas(null);
    await onFait();
  });

  if (!ouvert) {
    return (
      <div>
        <button onClick={() => setOuvert(true)} style={btn('neutre')}>Fusionner deux personas</button>
      </div>
    );
  }

  const nom = (p: MergeCandidate) => `${p.name} · ${p.desires} désir(s)${p.status === 'proposed' ? ' · proposé' : ''}`;

  return (
    <div style={{ ...carte, gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Fusionner deux personas</h2>
        <span style={{ flex: 1 }} />
        <button onClick={() => setOuvert(false)} style={btn('neutre')}>Fermer</button>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
        Le premier est archivé, le second reçoit ses désirs. Rien n’est supprimé · les tests déjà
        lancés suivent la branche.
      </p>

      {personas === null && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>Lecture des personas…</p>}

      {personas !== null && personas.length < 2 && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>
          Il faut au moins deux personas pour en fusionner deux.
        </p>
      )}

      {personas !== null && personas.length >= 2 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={source} onChange={(e) => setSource(e.target.value)} style={champ}>
            <option value="">Persona qui disparaît…</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{nom(p)}</option>)}
          </select>
          <span style={{ fontSize: 16, color: 'var(--muted)' }}>→</span>
          <select value={cible} onChange={(e) => setCible(e.target.value)} style={champ}>
            <option value="">Persona qui reçoit…</option>
            {personas.filter((p) => p.id !== source).map((p) => <option key={p.id} value={p.id}>{nom(p)}</option>)}
          </select>
        </div>
      )}

      {plan?.blocked && (
        <p style={{ margin: 0, fontSize: 12, color: '#f5b043', lineHeight: 1.55 }}>{plan.blocked}</p>
      )}

      {plan?.ok && (
        <div style={{ display: 'grid', gap: 6 }}>
          {plan.notes.map((n, i) => (
            <p key={i} style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55 }}>{n}</p>
          ))}
          {/* Un persona vide se fusionne sans conséquence · le dire évite
              l'hésitation devant un bouton qui a l'air lourd. */}
          {isTrivialMerge(plan) && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
              Rien ne pend sous ce persona · la fusion ne fait que le retirer de la carte.
            </p>
          )}
          <div>
            <button onClick={fusionner} disabled={busy} style={btn('oui')}>
              {busy ? 'Fusion…' : 'Fusionner'}
            </button>
          </div>
        </div>
      )}

      {fait && <p style={{ margin: 0, fontSize: 12.5, color: '#9fe6b3', lineHeight: 1.55 }}>{fait}</p>}
      {msg && <p style={{ margin: 0, fontSize: 12, color: '#ff9db0', lineHeight: 1.55 }}>{msg}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Ligne({ node, onFait }: { node: ProposedNode; onFait: () => Promise<void> }) {
  const [nom, setNom] = useState(node.label);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, agir] = useTransition();

  const valider = () => agir(async () => {
    setMsg(null);
    const r = await validateNodeAction({ id: node.id, kind: node.kind, rename: nom !== node.label ? nom : undefined });
    if (r.error) { setMsg(r.error); return; }
    await onFait();
  });

  const refuser = () => agir(async () => {
    setMsg(null);
    const r = await rejectNodeAction({ id: node.id, kind: node.kind });
    if (r.error) { setMsg(r.error); return; }
    await onFait();
  });

  return (
    <div style={{ ...carte, borderLeft: node.rename ? '3px solid #f5a623' : '3px solid var(--line-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Le nom est éditable en place · demander de renommer sur un autre
            écran ferait perdre le contexte qui permet justement de nommer. */}
        <input
          value={nom} onChange={(e) => setNom(e.target.value)}
          style={{
            flex: '1 1 260px', minWidth: 200, padding: '8px 11px', borderRadius: 10,
            border: `1px solid ${node.rename ? 'rgba(245,166,35,.5)' : 'var(--line-2)'}`,
            background: 'var(--bg)', color: 'var(--ink)', fontSize: 13.5, fontFamily: 'inherit',
          }}
        />
        <button onClick={valider} disabled={busy} style={btn('oui')}>{busy ? '…' : 'Valider'}</button>
        <button onClick={refuser} disabled={busy} style={btn('non')}>Refuser</button>
      </div>

      {/* Le chemin au-dessus · sans lui, « angle : Désordre » ne dit pas de quel
          persona il parle, et on valide à l'aveugle. */}
      {node.parents.length > 0 && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)' }}>
          {node.parents.map((p) => p.label).reverse().join(' › ')}
        </p>
      )}

      {node.rename && (
        <p style={{ margin: 0, fontSize: 11.5, color: '#f5b043', lineHeight: 1.5 }}>{node.rename}</p>
      )}
      {node.notice && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{node.notice}</p>
      )}
      {node.warning && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>Si tu refuses · {node.warning}</p>
      )}
      {msg && <p style={{ margin: 0, fontSize: 12, color: '#ff9db0', lineHeight: 1.5 }}>{msg}</p>}
    </div>
  );
}
