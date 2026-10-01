'use client';

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, MODE_LABEL, resultatParentSuite, videSuites, lienFicheAdsmap, lireFiltreSuites, ecrireFiltreSuites } from '@tiktrends/core';
import { iterationPlanAction, createIterationAction, type IterationPlanView, type IterationRow } from '../../../actions/adsmap-iterate';
import { Empty } from '../../../../components/Empty';
import { DraftCard } from '../../../../components/DraftCard';
import { draftConceptAction, type DraftView } from '../../../actions/adsmap-draft';
import { remplacerRecherche } from '../../../../lib/url-client';

/**
 * Le plan d'itération, et le geste qui le transforme en test.
 *
 * ── Ce qu'on affiche en premier ──────────────────────────────────────────────
 *
 * Le mode (décliner, corriger, repartir), la cible, et la variable à changer.
 * Ce qu'il ne faut pas toucher tient dans les chips « À conserver » · c'est le
 * seul endroit où l'outil apporte ce qu'un humain pressé ne fait pas seul :
 * quand une créa n'a pas converti, le réflexe est de tout refaire, et tout
 * refaire jette trois réponses déjà payées.
 *
 * ── Le paragraphe du moteur se replie, la réserve reste ──────────────────────
 *
 * La rationale du moteur — longue, et proche d'une carte à l'autre — noyait la
 * décision. Elle passe dans une révélation « Pourquoi cette suite ». Ce qui NE
 * se replie jamais, c'est la réserve qui change ce que fait l'action : quand le
 * parent n'a pas de victoire prouvée, la suite s'enregistre en nouveau concept,
 * pas en itération. La cacher ferait valider un geste mal compris.
 *
 * ── Le filtre ne recalcule rien ──────────────────────────────────────────────
 *
 * Tous / Décliner / Corriger / Repartir est un tri d'AFFICHAGE · il masque des
 * lignes déjà calculées, garde l'ordre de priorité du serveur, et ne relance
 * aucune lecture. Le recalcul reste strictement manuel (bouton Recalculer).
 */

const MODES = ['more', 'better', 'new'] as const;
type Mode = (typeof MODES)[number];
type Filtre = 'all' | Mode;

const TON: Record<Mode, string> = { more: '#7ee8bf', better: '#ffcf8f', new: '#9fb4ff' };

const carte: CSSProperties = {
  border: '1px solid var(--line)', borderRadius: 14, padding: '13px 15px',
  background: 'var(--surface)', display: 'grid', gap: 9,
};

export function Suites() {
  const [view, setView] = useState<IterationPlanView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [filtre, setFiltreEtat] = useState<Filtre>('all');
  const [charge, lance] = useTransition();
  // La suite qu'on vient de créer · tenue au niveau de la PAGE · le parent peut
  // quitter le plan au rechargement (déjà itéré), et sa carte avec lui · le
  // message et le lien vers la fiche disparaissaient (recette #106).
  const [creee, setCreee] = useState<{ adId: string; asIteration: boolean; label: string } | null>(null);
  // Le filtre vit dans l'URL (remplacement) · le Retour le retrouve.
  useEffect(() => { setFiltreEtat(lireFiltreSuites(window.location.search)); }, []);
  // `remplacerRecherche` synchronise le routeur Next · sans quoi la création
  // d'une suite (action qui revalide) effaçait `?mode=` (recette #106).
  const setFiltre = (f: Filtre) => { setFiltreEtat(f); remplacerRecherche(ecrireFiltreSuites(window.location.search, f)); };

  useEffect(() => {
    void (async () => {
      const r = await iterationPlanAction();
      if (r.error) setErr(r.error); else setView(r.view ?? null);
    })();
  }, []);

  const recharger = () => lance(async () => {
    const r = await iterationPlanAction();
    if (r.error) setErr(r.error); else { setErr(null); setView(r.view ?? null); }
  });

  // Compteurs calculés sur les lignes PRÉSENTES · jamais un chiffre posé à la main.
  const compte = useMemo(() => {
    const c: Record<Filtre, number> = { all: 0, more: 0, better: 0, new: 0 };
    for (const r of view?.rows ?? []) { c.all++; c[r.mode]++; }
    return c;
  }, [view]);

  if (err) {
    return <div style={{ ...carte, borderColor: '#ff8095', color: '#ff8095', fontSize: 13 }}>{err}</div>;
  }
  if (!view) {
    return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Lecture des verdicts arbitrés…</div>;
  }

  // Filtre d'affichage · l'ordre de priorité du serveur est conservé dans chaque mode.
  const visibles = filtre === 'all' ? view.rows : view.rows.filter((r) => r.mode === filtre);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', flex: 1, minWidth: 220, lineHeight: 1.55 }}>
          {view.summary}
        </p>
        <button
          onClick={recharger} disabled={charge}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '6px 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, cursor: charge ? 'wait' : 'pointer' }}
        >
          {charge ? 'Calcul…' : 'Recalculer'}
        </button>
      </div>

      {view.rows.length > 0 && (
        <div role="group" aria-label="Filtrer les suites par mode" style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <Onglet actif={filtre === 'all'} onClick={() => setFiltre('all')} libelle="Tous" n={compte.all} teinte="var(--ink)" />
          {MODES.map((m) => (
            <Onglet key={m} actif={filtre === m} onClick={() => setFiltre(m)} libelle={MODE_LABEL[m]} n={compte[m]} teinte={TON[m]} />
          ))}
        </div>
      )}

      {creee && (
        <div role="status" style={{ ...carte, borderColor: 'rgba(126,232,191,.45)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, overflowWrap: 'anywhere' }}>
            Suite de « {creee.label} » créée {creee.asIteration ? 'en itération · la filiation est enregistrée' : 'en nouveau concept · le parent n’a pas de victoire prouvée'}. Elle attend son brief.
          </span>
          <a href={lienFicheAdsmap(creee.adId)} style={{ display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, fontSize: 12.5, fontWeight: 800, color: 'var(--accent-strong)', textDecoration: 'none' }}>Ouvrir sa fiche dans Adsmap ›</a>
        </div>
      )}

      {!view.rows.length && (() => {
        const v = videSuites(view.examined);
        return <Empty tone="wait" title={v.titre} why={v.pourquoi} />;
      })()}

      {/* Aucun résultat dans CE mode · distinct de « la marque n'a aucun verdict ».
          Les autres modes en portent, le filtre le dit plutôt que d'imiter le vide. */}
      {view.rows.length > 0 && !visibles.length && (
        <div style={{ ...carte, borderStyle: 'dashed', color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.6, gap: 10 }}>
          <span>Aucune suite en « {MODE_LABEL[filtre as Mode]} » · {compte.all} suite(s) en tout, réparties sur les autres modes.</span>
          {/* Action isolée · cible tactile pleine, pas un lien noyé dans la phrase. */}
          <button
            type="button" onClick={() => setFiltre('all')}
            style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '6px 16px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
          >
            Tout revoir
          </button>
        </div>
      )}

      {/* Clé STABLE (ad + variable) · indexée sur la liste filtrée, changer de
          filtre ouvrait une autre carte et effaçait l'hypothèse en cours. */}
      {visibles.map((r) => {
        const cle = `${r.adId}-${r.changedVariable}`;
        return (
          <CarteSuite
            key={cle}
            row={r}
            ouvert={ouvert === cle}
            onToggle={() => setOuvert(ouvert === cle ? null : cle)}
            onCree={(c) => { setOuvert(null); setCreee({ ...c, label: r.label }); recharger(); }}
          />
        );
      })}
    </div>
  );
}

/** Un onglet de filtre · cible tactile pleine, état actif lisible. */
function Onglet({ actif, onClick, libelle, n, teinte }: {
  actif: boolean; onClick: () => void; libelle: string; n: number; teinte: string;
}) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={actif}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: CIBLE_TACTILE_MIN,
        padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
        border: `1px solid ${actif ? teinte : 'var(--line-2)'}`,
        background: actif ? 'var(--paper)' : 'transparent',
        color: actif ? 'var(--ink)' : 'var(--ink-2)',
      }}
    >
      {libelle}
      <span style={{ fontSize: 11, fontWeight: 800, color: actif ? teinte : 'var(--muted)' }}>{n}</span>
    </button>
  );
}

/**
 * Le sens du mode, aligné sur la preuve disponible.
 *
 * `MODE_HINT.more` affirme « Elle a gagné · on garde ce qui a gagné et on
 * multiplie » · vrai seulement quand le parent est une victoire PROUVÉE
 * (`edgeLegal`). Sur un parent non prouvé — une piste relative — cette phrase
 * contredit la réserve affichée juste au-dessus (« pas de victoire prouvée →
 * nouveau concept »). On la rend donc conditionnelle à la preuve, SANS toucher
 * le moteur, l'éligibilité ni la rationale : le `modeHint` du noyau est conservé
 * quand il dit vrai, neutralisé quand il affirmerait une victoire non démontrée.
 */
export function sensDuSuite(mode: Mode, modeHint: string, edgeLegal: boolean): string {
  if (mode === 'more' && !edgeLegal) {
    return 'On décline cette piste · le parent n’est pas une victoire prouvée, la suite part en nouveau concept.';
  }
  return modeHint;
}

/**
 * « Pourquoi cette suite » · la rationale du moteur, repliée.
 *
 * Native `<details>` pour le clavier · l'étiquette resterait figée sur
 * « déplier » une fois ouverte, on suit donc l'état (client) pour basculer
 * déplier ▾ ↔ replier ▴. Le contenu reste rendu, jamais réécrit.
 */
function Pourquoi({ hint, rationale }: { hint: string; rationale: string }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <details
      onToggle={(e) => setOuvert((e.currentTarget as HTMLDetailsElement).open)}
      style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}
    >
      <summary style={sommaire}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Pourquoi cette suite</span>
        <span aria-hidden style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>
          {ouvert ? 'replier ▴' : 'déplier ▾'}
        </span>
      </summary>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>{hint}</p>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.65 }}>{rationale}</p>
    </details>
  );
}

const sommaire: CSSProperties = {
  listStyle: 'none', cursor: 'pointer', userSelect: 'none',
  display: 'flex', alignItems: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN,
};

export function CarteSuite({ row, ouvert, onToggle, onCree }: {
  row: IterationRow; ouvert: boolean; onToggle: () => void; onCree: (c: { adId: string; asIteration: boolean }) => void;
}) {
  const ouvrirRef = useRef<HTMLButtonElement>(null);
  const champRef = useRef<HTMLTextAreaElement>(null);
  // Ouvert · le focus va au champ ; refermé (Annuler, Échap) · il revient au bouton.
  const dejaOuvert = useRef(ouvert);
  useEffect(() => {
    if (ouvert && !dejaOuvert.current) champRef.current?.focus();
    if (!ouvert && dejaOuvert.current) ouvrirRef.current?.focus();
    dejaOuvert.current = ouvert;
  }, [ouvert]);
  const [hypo, setHypo] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [envoi, lance] = useTransition();
  const [brouillon, setBrouillon] = useState<DraftView | null>(null);
  const [redige, ecrit] = useTransition();
  const ton = TON[row.mode] ?? 'var(--muted)';

  const ecrire = () => ecrit(async () => {
    setMsg(null);
    const r = await draftConceptAction({
      origin: 'suite',
      intent: row.rationale,
      freeze: row.freezeLabels,
      changedVariable: row.variableLabel,
    });
    if (r.error) { setMsg(r.error); return; }
    setBrouillon(r.view ?? null);
  });

  const creer = () => lance(async () => {
    const r = await createIterationAction({
      parentAdId: row.adId, mode: row.mode,
      changedVariable: row.changedVariable, stageTargeted: row.stageTargeted,
      hypothesis: hypo,
    });
    if (r.error || !r.adId) { setMsg(r.error ?? 'Création impossible · réessaie.'); return; }
    setHypo('');
    onCree({ adId: r.adId, asIteration: !!r.asIteration });
  });

  return (
    <div style={{ ...carte, borderLeft: `3px solid ${ton}` }}>
      {/* Ligne de tête · mode textuel + cible, la dépense engagée en discret. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: ton }}>{row.modeLabel}</span>
        <strong style={{ fontSize: 13.5, color: 'var(--ink)', minWidth: 0, overflowWrap: 'anywhere' }}>{row.label}</strong>
        {row.spend !== null && row.spend > 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>· {Math.round(row.spend)} € engagés</span>
        )}
      </div>

      {/* Le résultat du test d'origine · sans lui, « quoi changer » n'a pas de
          raison lisible (le verdict était lu, jamais affiché · recette #106). */}
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
        {resultatParentSuite({ verdict: row.parentVerdict, comparable: row.parentComparable, etapeLachee: row.parentEtapeLachee })}
      </div>

      {/* La variable à changer · mise en avant, c'est la décision de la carte. */}
      <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
        Changer&nbsp;: <b style={{ color: 'var(--ink)' }}>{row.variableLabel}</b>
      </div>

      {row.freezeLabels.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>À conserver :</span>
          {row.freezeLabels.map((f) => (
            <span key={f} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink-2)' }}>
              {f}
            </span>
          ))}
        </div>
      )}

      {/* Réserve INDISPENSABLE · elle change ce que fait l'action, jamais repliée. */}
      {!row.edgeLegal && (
        <p style={{ margin: 0, fontSize: 11.5, color: '#ffcf8f', lineHeight: 1.55 }}>
          Le parent n’a pas de victoire PROUVÉE au protocole · ce sera enregistré comme
          nouveau concept, pas comme itération. Une descendance attribuerait une performance
          non démontrée (une piste relative reste à confirmer, une perdante n’a rien prouvé).
        </p>
      )}

      <Pourquoi hint={sensDuSuite(row.mode, row.modeHint, row.edgeLegal)} rationale={row.rationale} />

      {brouillon && (
        <DraftCard view={brouillon}>
          <button
            onClick={() => { setHypo(brouillon.draft.hypothesis); if (!ouvert) onToggle(); }}
            style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '8px 15px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}
          >
            Créer la suite avec ce concept
          </button>
        </DraftCard>
      )}

      {!ouvert ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Action principale · pleine. */}
          <button
            ref={ouvrirRef} aria-expanded={false}
            onClick={onToggle}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '8px 16px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}
          >
            Créer la suite
          </button>
          {/* Action secondaire · fantôme. */}
          {!brouillon && (
            <button
              onClick={ecrire} disabled={redige}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '8px 15px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontWeight: 700, fontSize: 12.5, cursor: redige ? 'wait' : 'pointer' }}
            >
              {redige ? 'Jarvis écrit…' : 'Demander le concept à Jarvis'}
            </button>
          )}
          {/* L'erreur de Jarvis s'affiche AUSSI carte fermée · elle n'était
              rendue que dans le formulaire ouvert, donc jamais vue. */}
          {msg && <span role="alert" style={{ fontSize: 12, color: '#ff8095' }}>{msg}</span>}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onToggle(); } }}>
          <label htmlFor={`hypo-${row.adId}-${row.changedVariable}`} style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>
            Ce que ce test parie · sans hypothèse écrite, son résultat n’apprendra rien
          </label>
          <textarea
            id={`hypo-${row.adId}-${row.changedVariable}`} ref={champRef}
            value={hypo} onChange={(e) => setHypo(e.target.value)} rows={2}
            placeholder={`En changeant ${row.variableLabel}, j’attends…`}
            style={{ width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={creer} disabled={envoi || hypo.trim().length < 10}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '8px 16px', borderRadius: 999, border: 'none', background: hypo.trim().length < 10 ? 'var(--line-2)' : 'var(--grad-accent)', color: hypo.trim().length < 10 ? 'var(--muted)' : 'var(--on-accent)', fontWeight: 800, fontSize: 12.5, cursor: envoi ? 'wait' : 'pointer' }}
            >
              {envoi ? 'Création…' : 'Créer'}
            </button>
            <button
              onClick={onToggle}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--muted)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
            >
              Annuler
            </button>
            {msg && <span role="alert" style={{ fontSize: 12, color: '#ff8095' }}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
