'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KIND_LABEL, isTrivialMerge, type MergePlan, type NodeKind } from '@tiktrends/core';
import {
  mergeCandidatesAction, mergePersonasAction, mergePlanAction, rejectNodeAction, validateManyAction, validateNodeAction,
  type CurationView, type MergeCandidate, type ProposedNode,
} from '../../../app/actions/adsmap-curation';
import { EnTete, Ic, SousNav, Vue } from '../../communs';
import { useGeste, Retour } from './geste';
import type { SousNavResultats } from './communs';

/**
 * « Tri des propositions » · l'écran de tri de l'ancienne Adsmap. Ce que le
 * radar, les studios, l'import et les agents ont posé sur la carte sans décider
 * à ta place · lu par `curationViewAction` (recherche et borne dans l'adresse),
 * trié par `validateNodeAction` (renommer en place), `rejectNodeAction`,
 * `validateManyAction` (écarte les noms provisoires et le dit). La fusion de deux
 * personas montre son plan (`mergePlanAction`) AVANT le bouton (`mergePersonasAction`,
 * admin). Ordre · personas, désirs, angles, concepts · valider un concept remonte
 * ses ancêtres.
 */

export interface PropsTri {
  sousNav: SousNavResultats;
  sous: string;
  vue: CurationView | null;
  erreur: string | null;
  /** Admin · la fusion de personas (action réservée). */
  fusion: boolean;
}

const ORDRE: NodeKind[] = ['persona', 'desire', 'angle', 'concept'];
const pluriel = (k: NodeKind) => `${KIND_LABEL[k].charAt(0).toUpperCase()}${KIND_LABEL[k].slice(1)}s`;

export function Tri(p: PropsTri) {
  const router = useRouter();
  const { occupe, message, geste } = useGeste();
  const v = p.vue;
  const [saisie, setSaisie] = useState(v?.q ?? '');
  const adresse = (q: string, n: number) => {
    const s = new URLSearchParams();
    if (q) s.set('q', q);
    if (n !== 20) s.set('n', String(n));
    const x = s.toString();
    return x ? `/adsmap/tri?${x}` : '/adsmap/tri';
  };
  const total = v ? ORDRE.reduce((s, k) => s + v.counts[k], 0) : 0;
  return (
    <Vue>
      <EnTete titre="Tri des propositions" sous={p.sous} />
      <SousNav items={p.sousNav} actif="/adsmap/hypotheses" />
      <p className="muted" style={{ fontSize: '13px', marginBottom: 14, maxWidth: 760 }}>
        Tant que ça reste « proposé », ça encombre la carte sans rien y ajouter. <b>Valider</b> fait entrer le nœud dans la carte définitive et remonte ses parents encore proposés · <b>Refuser</b> ne casse jamais rien en dessous · <b>Renommer</b> est exigé sur les noms provisoires.
      </p>
      {p.erreur || !v ? (
        <section className="tile"><p role="alert" className="muted">{p.erreur ?? 'Lecture impossible.'}</p></section>
      ) : (
        <>
          <form className="toolbar" onSubmit={(e) => { e.preventDefault(); router.push(adresse(saisie.trim(), 20)); }}>
            <label className="field" style={{ flex: '1 1 260px' }}>Rechercher un nom
              <input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Ex : Parent pressé" />
            </label>
            <button type="submit" className="btn sm" disabled={saisie.trim() === v.q} style={{ alignSelf: 'end' }}><Ic n="search" />Rechercher</button>
            {v.q && <button type="button" className="btn sm" style={{ alignSelf: 'end' }} onClick={() => { setSaisie(''); router.push(adresse('', 20)); }}>Réinitialiser</button>}
          </form>
          <Retour message={message} />
          {p.fusion && <Fusion />}
          {total === 0 && (
            <section className="tile"><strong>Rien n’attend d’être trié.</strong><p className="muted" style={{ fontSize: '13px' }}>Tout ce que le radar, les studios et l’import ont posé sur la carte a été accepté ou refusé · elle ne contient que ce que tu as validé.</p></section>
          )}
          {v.q && total > 0 && v.nodes.length === 0 && <section className="tile"><p className="muted">Aucun résultat pour « {v.q} ».</p></section>}
          {ORDRE.map((kind) => {
            const items = v.nodes.filter((n) => n.kind === kind);
            if (!items.length) return null;
            const caches = v.matched[kind] - items.length;
            const valides = items.filter((n) => !n.rename);
            return (
              <section className="sec" key={kind} style={{ display: 'grid', gap: 10 }}>
                <div className="sech">
                  <h2>{pluriel(kind)}</h2>
                  <span className="faint" style={{ fontSize: '12.5px' }}>{v.q ? `${v.matched[kind]} sur ${v.counts[kind]}` : `${v.counts[kind]} proposé${v.counts[kind] > 1 ? 's' : ''}`}{caches > 0 ? ` · ${items.length} affichés` : ''}</span>
                  <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} disabled={!!occupe || valides.length === 0} onClick={() => {
                    void geste(`tout-${kind}`, () => validateManyAction({ ids: valides.map((n) => n.id), kind }), (r) => (r.skipped?.length
                      ? `${r.validated ?? 0} validé(s) · ${r.skipped.length} écarté(s) faute d’un vrai nom : ${r.skipped.slice(0, 3).join(', ')}${r.skipped.length > 3 ? '…' : ''}`
                      : `${r.validated ?? 0} validé(s)`));
                  }}>{occupe === `tout-${kind}` ? 'En cours…' : `Tout valider (${valides.length})`}</button>
                </div>
                {items.map((n) => <Ligne key={n.id} n={n} />)}
                {caches > 0 && <button type="button" className="btn sm" style={{ justifySelf: 'start' }} onClick={() => router.push(adresse(v.q, v.limit + 20))}>Voir plus ({caches} de plus)</button>}
              </section>
            );
          })}
        </>
      )}
    </Vue>
  );
}

function Ligne({ n }: { n: ProposedNode }) {
  const { occupe, message, geste } = useGeste();
  const [nom, setNom] = useState(n.label);
  const libelle = KIND_LABEL[n.kind];
  return (
    <div className="tile" style={{ borderColor: n.rename ? '#ffd48a40' : undefined }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
        <label className="field" style={{ flex: '1 1 260px' }}>{libelle.charAt(0).toUpperCase() + libelle.slice(1)} · modifiable avant de valider
          <input value={nom} onChange={(e) => setNom(e.target.value)} />
        </label>
        <button type="button" className="btn sm pri" disabled={!!occupe} onClick={() => { void geste('valider', () => validateNodeAction({ id: n.id, kind: n.kind, rename: nom !== n.label ? nom : undefined }), () => `${libelle.charAt(0).toUpperCase() + libelle.slice(1)} validé`); }}>{occupe === 'valider' ? '…' : 'Valider'}</button>
        <button type="button" className="btn sm" disabled={!!occupe} onClick={() => { void geste('refuser', () => rejectNodeAction({ id: n.id, kind: n.kind }), () => 'Proposition écartée'); }}>Refuser</button>
      </div>
      {n.parents.length > 0 && <span className="faint" style={{ fontSize: '11.5px' }}>{n.parents.map((x) => x.label).reverse().join(' › ')}</span>}
      {n.rename && <span style={{ fontSize: '12px', color: 'var(--warn)' }}>{n.rename}</span>}
      {n.notice && <span className="muted" style={{ fontSize: '12px' }}>{n.notice}</span>}
      {n.warning && <span className="faint" style={{ fontSize: '12px' }}>Si tu refuses · {n.warning}</span>}
      <Retour message={message} />
    </div>
  );
}

/** La fusion de deux personas · le plan (ce qui bouge, chiffres compris) s'affiche AVANT le bouton. */
function Fusion() {
  const { occupe, message, setMessage, geste } = useGeste();
  const [ouvert, setOuvert] = useState(false);
  const [personas, setPersonas] = useState<MergeCandidate[] | null>(null);
  const [source, setSource] = useState('');
  const [cible, setCible] = useState('');
  const [plan, setPlan] = useState<MergePlan | null>(null);

  useEffect(() => {
    if (!ouvert || personas) return;
    void mergeCandidatesAction().then((r) => (r.error ? setMessage({ texte: r.error, erreur: true }) : setPersonas(r.personas ?? [])));
  }, [ouvert, personas, setMessage]);
  useEffect(() => {
    if (!source || !cible || source === cible) { setPlan(null); return; }
    let vivant = true;
    void mergePlanAction({ sourceId: source, targetId: cible }).then((r) => {
      if (!vivant) return;
      if (r.error) { setMessage({ texte: r.error, erreur: true }); setPlan(null); } else setPlan(r.plan ?? null);
    });
    return () => { vivant = false; };
  }, [source, cible, setMessage]);

  if (!ouvert) return <div style={{ marginBottom: 14 }}><button type="button" className="btn sm" onClick={() => setOuvert(true)}><Ic n="users" />Fusionner deux personas</button></div>;
  const nom = (x: MergeCandidate) => `${x.name} · ${x.desires} désir(s)${x.status === 'proposed' ? ' · proposé' : ''}`;
  return (
    <section className="tile" style={{ marginBottom: 14 }} aria-label="Fusionner deux personas">
      <div className="sech"><h2>Fusionner deux personas</h2><button type="button" className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setOuvert(false)}>Fermer</button></div>
      <p className="muted" style={{ fontSize: '12.5px' }}>Le premier est archivé, le second reçoit ses désirs. Rien n’est supprimé · les tests déjà lancés suivent la branche.</p>
      {personas === null ? <p className="faint">Lecture des personas…</p> : personas.length < 2 ? <p className="muted" style={{ fontSize: '13px' }}>Il faut au moins deux personas pour en fusionner deux.</p> : (
        <div className="fields">
          <label className="field">Persona qui disparaît (archivé)
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Choisir…</option>
              {personas.map((x) => <option key={x.id} value={x.id}>{nom(x)}</option>)}
            </select>
          </label>
          <label className="field">Persona qui reçoit ses désirs
            <select value={cible} onChange={(e) => setCible(e.target.value)}>
              <option value="">Choisir…</option>
              {personas.filter((x) => x.id !== source).map((x) => <option key={x.id} value={x.id}>{nom(x)}</option>)}
            </select>
          </label>
        </div>
      )}
      {plan?.blocked && <p style={{ fontSize: '12.5px', color: 'var(--warn)' }}>{plan.blocked}</p>}
      {plan?.ok && (
        <>
          {plan.notes.map((x, i) => <p key={i} style={{ fontSize: '12.5px' }}>{x}</p>)}
          {isTrivialMerge(plan) && <p className="faint" style={{ fontSize: '12px' }}>Rien ne pend sous ce persona · la fusion ne fait que le retirer de la carte.</p>}
          <button type="button" className="btn sm pri" style={{ justifySelf: 'start' }} disabled={!!occupe} onClick={() => {
            const nomSource = personas?.find((x) => x.id === source)?.name ?? 'Le persona';
            void geste('fusion', () => mergePersonasAction({ sourceId: source, targetId: cible }), (r) => {
              setSource(''); setCible(''); setPlan(null); setPersonas(null);
              return `« ${nomSource} » a été archivé · ${r.moved ?? 0} désir(s) déplacé(s), ${r.folded ?? 0} replié(s) sur un homonyme.`;
            });
          }}>{occupe === 'fusion' ? 'Fusion…' : 'Fusionner'}</button>
        </>
      )}
      <Retour message={message} />
    </section>
  );
}
