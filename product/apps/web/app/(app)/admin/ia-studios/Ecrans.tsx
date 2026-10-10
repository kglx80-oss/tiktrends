import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { BoutonCommande, BoutonConfirme, BoutonRevoquer, EditeurBrouillon, FormulaireRelease, FormulaireBudgetBenchmark, FormulaireFichesBenchmark, BoutonBenchmarkApprouve, BoutonRecetteManuelle, type ChampEditable } from './Commandes';

/**
 * Les onglets de « IA et Studios », rendus côté serveur à partir de données
 * déjà lues et SÉRIALISABLES (la page ne passe aucun objet du noyau ni de la
 * base aux composants client). Chaque onglet rend ses états : vide, rempli,
 * erreur ; l'accès refusé est rendu par la page avant toute lecture.
 */

export const surfaceBloc: CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '16px 18px', boxSizing: 'border-box', minWidth: 0 };
const tuile: CSSProperties = { background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 14px', boxSizing: 'border-box', minWidth: 0 };
const mono: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12.5, overflowWrap: 'anywhere' };
const titreBloc: CSSProperties = { margin: '0 0 10px', fontSize: 17, fontWeight: 600, color: 'var(--ink)' };
const grille = (min: number): CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`, gap: 12 });
const lienCarte: CSSProperties = { display: 'block', minHeight: 44, textDecoration: 'none', color: 'var(--ink)' };

const COULEUR_STATUT: Record<string, string> = {
  draft: 'var(--warn)', validated: 'var(--ok)', retired: 'var(--muted)', staged: 'var(--info)', active: 'var(--ok)',
  succeeded: 'var(--ok)', failed: 'var(--err)', blocked: 'var(--warn)', shadow: 'var(--muted)',
};
const LIBELLE_STATUT: Record<string, string> = {
  draft: 'Brouillon', validated: 'Validée', retired: 'Retirée', staged: 'En attente', active: 'Publiée',
  succeeded: 'Réussie', failed: 'Rejetée', blocked: 'Bloquée avant appel', shadow: 'Ombre',
};

/** Le statut porte un MOT, la couleur ne fait que l'accompagner. */
export function Pastille({ statut, texte }: { statut: string; texte?: string }) {
  const c = COULEUR_STATUT[statut] ?? 'var(--muted)';
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, border: `1px solid ${c}`, color: 'var(--ink)', whiteSpace: 'nowrap' }}><span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: c }} />{texte ?? LIBELLE_STATUT[statut] ?? statut}</span>;
}

export function Vide({ titre, children }: { titre: string; children?: ReactNode }) {
  return <div style={{ ...surfaceBloc, borderStyle: 'dashed', textAlign: 'left' }}><p style={{ margin: 0, fontWeight: 600 }}>{titre}</p>{children && <div style={{ marginTop: 8, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>{children}</div>}</div>;
}

export function Erreur({ message, traceId }: { message: string; traceId: string }) {
  return <div role="alert" style={{ ...surfaceBloc, borderColor: 'rgba(229,72,77,.45)' }}><p style={{ margin: 0, fontWeight: 700, color: 'var(--err)' }}>{message}</p><p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)' }}>Recharge la page. Identifiant support · <code>{traceId}</code></p></div>;
}

function Bloc({ titre, children, id }: { titre: string; children: ReactNode; id?: string }) {
  return <section aria-labelledby={id} style={{ ...surfaceBloc, marginBottom: 14 }}><h2 id={id} style={titreBloc}>{titre}</h2>{children}</section>;
}

function Texte({ children }: { children: string }) {
  return <pre style={{ ...mono, margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.55, color: 'var(--ink)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', maxHeight: 360, overflow: 'auto' }}>{children}</pre>;
}

/* ─────────────────────────────── Prompts ─────────────────────────────── */

export interface VueVersion {
  id: string; version: string; statut: string; empreinte: string; origine: string; motif: string; creeLe: string; valideeLe: string | null; horsSource: boolean;
}
export interface VueCle { type: string; libelleType: string; cle: string; titre: string; versions: VueVersion[] }
export interface VueDetail {
  cle: VueCle; version: VueVersion; champs: Array<{ champ: string; libelle: string; texte: string; contrat: boolean }>;
  variables: string[]; schemas: { entree: string; sortie: string; profil: string } | null; exemples: string | null;
  editables: ChampEditable[]; diff: { avec: VueVersion; champs: Array<{ libelle: string; lignes: Array<{ op: string; texte: string }> }> } | null;
}

export function EcranVersions({ onglet, cles, detail, peutEditer, plan, brouillonsImportes = 0 }: { onglet: string; cles: VueCle[]; detail: VueDetail | null; peutEditer: boolean; plan: { aCreer: number; deja: number } | null; brouillonsImportes?: number }) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {plan && peutEditer && (plan.aCreer > 0 || cles.length === 0) && (
        <Bloc titre="Importer le pack en brouillon" id="titre-import">
          <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            {plan.aCreer} version(s) du pack embarqué ne sont pas encore au registre ({plan.deja} déjà présente(s) à l’identique). L’import crée des brouillons, n’active rien, et refuse tout conflit d’empreinte.
          </p>
          <BoutonCommande commande="importer" libelle="Importer en brouillon" succes="Import terminé · rien n’est actif tant qu’une release n’est pas publiée." />
        </Bloc>
      )}
      {peutEditer && brouillonsImportes > 0 && (
        <Bloc titre="Valider les brouillons importés" id="titre-valider-imports">
          <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            {brouillonsImportes} brouillon(s) viennent tels quels du pack embarqué. Les valider les fige ; chacun passe les mêmes contrôles qu’une validation unitaire et entre au journal. Un brouillon que tu as modifié n’est jamais pris ici.
          </p>
          <BoutonCommande commande="validerImports" libelle="Valider les brouillons importés" succes="Brouillons importés validés · tu peux créer la release." />
        </Bloc>
      )}
      {cles.length === 0 ? (
        <Vide titre="Le registre est vide.">Importe le pack pour créer les brouillons des templates, des recettes et de la politique de conversation Jarvis.</Vide>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', alignItems: 'start' }}>
          <nav aria-label="Clés du registre" style={{ ...surfaceBloc, display: 'grid', gap: 8 }}>
            {cles.map((c) => {
              const actif = detail?.cle.cle === c.cle && detail.cle.type === c.type;
              const derniere = c.versions[0]!;
              return (
                <Link key={`${c.type}:${c.cle}`} href={`?onglet=${onglet}&cle=${encodeURIComponent(`${c.type}:${c.cle}`)}`} aria-current={actif ? 'page' : undefined}
                  style={{ ...lienCarte, ...tuile, borderColor: actif ? 'var(--accent)' : 'var(--line)' }}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <b style={{ ...mono, fontSize: 13.5 }}>{c.cle}</b>
                    <Pastille statut={derniere.statut} texte={`${derniere.version} · ${LIBELLE_STATUT[derniere.statut] ?? derniere.statut}`} />
                  </span>
                  <span style={{ display: 'block', marginTop: 4, fontSize: 13, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.titre}>{c.libelleType} · {c.titre}</span>
                </Link>
              );
            })}
          </nav>
          {detail ? <DetailVersion onglet={onglet} d={detail} peutEditer={peutEditer} /> : <Vide titre="Choisis une clé pour voir ses versions, son contenu et ses différences." />}
        </div>
      )}
    </div>
  );
}

function DetailVersion({ onglet, d, peutEditer }: { onglet: string; d: VueDetail; peutEditer: boolean }) {
  const base = `?onglet=${onglet}&cle=${encodeURIComponent(`${d.cle.type}:${d.cle.cle}`)}`;
  return (
    <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
      <section aria-labelledby="titre-version" style={surfaceBloc}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 id="titre-version" style={{ ...titreBloc, margin: 0, ...mono, fontSize: 17 }}>{d.cle.cle} · {d.version.version}</h2>
          <Pastille statut={d.version.statut} />
          {d.version.horsSource && <Pastille statut="draft" texte="Hors pack source · à reporter" />}
        </div>
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 12px', margin: '12px 0 0', fontSize: 13.5 }}>
          <dt style={{ color: 'var(--muted)' }}>Type</dt><dd style={{ margin: 0 }}>{d.cle.libelleType} · portée plateforme</dd>
          <dt style={{ color: 'var(--muted)' }}>Empreinte</dt><dd style={{ margin: 0, ...mono }}>{d.version.empreinte}</dd>
          <dt style={{ color: 'var(--muted)' }}>Origine</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{d.version.origine}</dd>
          <dt style={{ color: 'var(--muted)' }}>Motif</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{d.version.motif || '·'}</dd>
          <dt style={{ color: 'var(--muted)' }}>Créée</dt><dd style={{ margin: 0 }}>{d.version.creeLe}{d.version.valideeLe ? ` · validée ${d.version.valideeLe}` : ''}</dd>
          {d.schemas && <><dt style={{ color: 'var(--muted)' }}>Modèle logique</dt><dd style={{ margin: 0, ...mono }}>{d.schemas.profil}</dd></>}
          {d.schemas && <><dt style={{ color: 'var(--muted)' }}>Schémas</dt><dd style={{ margin: 0, ...mono }}>{d.schemas.entree} → {d.schemas.sortie}</dd></>}
          <dt style={{ color: 'var(--muted)' }}>Variables</dt><dd style={{ margin: 0, ...mono }}>{d.variables.length ? d.variables.map((v) => `{{${v}}}`).join(' · ') : 'aucune'}</dd>
          <dt style={{ color: 'var(--muted)' }}>Coût de test</dt><dd style={{ margin: 0 }}>0 $ · évaluation structurelle sans appel modèle</dd>
        </dl>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }} role="list" aria-label="Versions de cette clé">
          {d.cle.versions.map((v) => (
            <span role="listitem" key={v.id} style={{ display: 'inline-flex', gap: 6 }}>
              <Link href={`${base}&v=${v.id}`} aria-current={v.id === d.version.id ? 'true' : undefined} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 12px', borderRadius: 999, border: `1px solid ${v.id === d.version.id ? 'var(--accent)' : 'var(--line-2)'}`, color: 'var(--ink)', textDecoration: 'none', fontSize: 13 }}>{v.version} · {LIBELLE_STATUT[v.statut] ?? v.statut}</Link>
              {v.id !== d.version.id && <Link href={`${base}&v=${d.version.id}&comparer=${v.id}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 10px', color: 'var(--ink-2)', fontSize: 12.5 }}>Comparer</Link>}
            </span>
          ))}
        </div>
        {peutEditer && d.version.statut === 'draft' && (
          <div style={{ marginTop: 14 }}>
            <BoutonCommande commande="valider" charge={{ id: d.version.id }} libelle="Valider cette version" succes="Version validée · elle est désormais figée." />
          </div>
        )}
      </section>

      {d.diff && (
        <Bloc titre={`Différences · ${d.diff.avec.version} → ${d.version.version}`} id="titre-diff">
          {d.diff.champs.length === 0 ? <p style={{ margin: 0, fontSize: 14 }}>Contenus identiques.</p> : d.diff.champs.map((c) => (
            <div key={c.libelle} style={{ marginBottom: 10 }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600 }}>{c.libelle}</h3>
              <pre style={{ ...mono, margin: 0, whiteSpace: 'pre-wrap', background: 'var(--paper)', borderRadius: 12, padding: '8px 10px', maxHeight: 320, overflow: 'auto' }}>
                {c.lignes.map((l, i) => <span key={i} style={{ display: 'block', color: l.op === '+' ? 'var(--ok)' : l.op === '-' ? 'var(--err)' : 'var(--ink-2)' }}>{l.op === '+' ? '+ ' : l.op === '-' ? '− ' : '  '}{l.texte}</span>)}
              </pre>
            </div>
          ))}
        </Bloc>
      )}

      <Bloc titre="Contenu" id="titre-contenu">
        <div style={{ display: 'grid', gap: 12 }}>
          {d.champs.map((c) => (
            <div key={c.champ}>
              <h3 style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)' }}>{c.libelle}{c.contrat ? ' · contrat, non modifiable ici' : ''}</h3>
              <Texte>{c.texte}</Texte>
            </div>
          ))}
        </div>
      </Bloc>

      {d.exemples && (
        <Bloc titre="Exemples d’entrée et de sortie (formes, 08-EXEMPLES)" id="titre-exemples">
          <details><summary style={{ cursor: 'pointer', padding: '12px 0', fontSize: 14 }}>Afficher les exemples</summary><Texte>{d.exemples}</Texte></details>
        </Bloc>
      )}

      {peutEditer && d.editables.length > 0 && (
        <Bloc titre={d.version.statut === 'draft' ? 'Modifier ce brouillon' : 'Créer un brouillon à partir de cette version'} id="titre-edition">
          <EditeurBrouillon baseId={d.version.id} champs={d.editables} empreinteAttendue={d.version.empreinte} brouillon={d.version.statut === 'draft'} />
        </Bloc>
      )}
    </div>
  );
}

/* ─────────────────────────────── Releases ────────────────────────────── */

export interface VueRelease {
  id: string; statut: string; empreinte: string; packHash: string; creeLe: string; motif: string; pointee: boolean;
  tests: boolean | null; benchmark: boolean; recetteManuelle: boolean; versions: number; conversation: string | null;
  /** Motif de révocation · `null` si la release n'est pas révoquée. */
  revocation: string | null;
}

export function EcranReleases({ releases, pointee, environnement, peutPublier, peutRevenir, peutEvaluer, peutCreer, selection }: {
  releases: VueRelease[]; pointee: string | null; environnement: 'production' | 'test'; peutPublier: boolean; peutRevenir: boolean; peutEvaluer: boolean; peutCreer: boolean;
  selection: Array<{ cle: string; version: string }>;
}) {
  const regle = environnement === 'production'
    ? 'Production · une release ne devient active qu’avec un benchmark approuvé OU l’accord de recette manuelle sur son empreinte.'
    : 'Recette locale (drapeau serveur, base locale) · l’activation sans benchmark est permise pour prouver la chaîne. Jamais en production.';
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div role="note" style={{ ...surfaceBloc, borderColor: environnement === 'production' ? 'var(--line)' : 'var(--warn)', fontSize: 14 }}><b>Environnement</b> · {regle}</div>
      {peutCreer && (
        <Bloc titre="Nouvelle release" id="titre-nouvelle">
          <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>Assemble la dernière version VALIDÉE de chaque clé ({selection.length} entrées). Refusée si une clé requise manque ou si un contrat diverge du code.</p>
          <details style={{ marginBottom: 10 }}><summary style={{ cursor: 'pointer', padding: '12px 0', fontSize: 14 }}>Voir la sélection</summary>
            <ul style={{ ...mono, margin: '6px 0 0', paddingLeft: 18, columns: '16em', fontSize: 12.5 }}>{selection.map((s) => <li key={s.cle}>{s.cle} · {s.version}</li>)}</ul>
          </details>
          <FormulaireRelease />
        </Bloc>
      )}
      {releases.length === 0 ? <Vide titre="Aucune release.">Valide les versions du registre, puis crée une release en attente. Tant qu’aucune release n’est publiée, les tâches des studios restent bloquées et Jarvis garde sa consigne d’origine (version 1.0.0, identique au code d’avant).</Vide> : (
        <div style={grille(320)}>
          {releases.map((r) => (
            <article key={r.id} aria-label={`Release ${r.empreinte.slice(0, 12)}`} style={{ ...surfaceBloc, borderColor: r.pointee ? 'var(--accent)' : 'var(--line)' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Pastille statut={r.statut} />
                {r.pointee && <Pastille statut="active" texte={r.revocation ? 'Pointée · non servie' : 'Sert maintenant'} />}
                {r.revocation && <Pastille statut="retired" texte="Révoquée" />}
              </div>
              {r.revocation && <p role="note" style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink)', overflowWrap: 'anywhere' }}>Révoquée · {r.revocation}. Aucune tâche ni nouveau devis ne l’utilise ; Jarvis garde sa consigne 1.0.0.</p>}
              <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '5px 10px', margin: '10px 0 0', fontSize: 13 }}>
                <dt style={{ color: 'var(--muted)' }}>Empreinte</dt><dd style={{ margin: 0, ...mono }} title={r.empreinte}>{r.empreinte.slice(0, 20)}…</dd>
                <dt style={{ color: 'var(--muted)' }}>Créée</dt><dd style={{ margin: 0 }}>{r.creeLe}</dd>
                <dt style={{ color: 'var(--muted)' }}>Contenu</dt><dd style={{ margin: 0 }}>{r.versions} versions{r.conversation ? ` · Jarvis ${r.conversation}` : ''}</dd>
                <dt style={{ color: 'var(--muted)' }}>Motif</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{r.motif || '·'}</dd>
                <dt style={{ color: 'var(--muted)' }}>Tests</dt><dd style={{ margin: 0 }}>{r.tests === null ? 'Non évaluée' : r.tests ? 'Structurels réussis' : 'Structurels en échec'}</dd>
                <dt style={{ color: 'var(--muted)' }}>Benchmark</dt><dd style={{ margin: 0 }}>{r.benchmark ? 'Approuvé' : r.recetteManuelle ? 'Recette manuelle (sans benchmark) · accord du propriétaire' : 'Non exécuté · budget requis'}</dd>
              </dl>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {r.statut === 'staged' && peutEvaluer && <BoutonCommande commande="evaluer" charge={{ releaseId: r.id }} libelle="Évaluer" succes="Évaluation enregistrée · voir l’onglet Évaluations." secondaire />}
                {r.statut === 'staged' && peutPublier && !r.revocation && environnement === 'production' && r.tests === true && !r.benchmark && !r.recetteManuelle && (
                  <BoutonRecetteManuelle releaseId={r.id} />
                )}
                {r.statut === 'staged' && peutPublier && !r.revocation && (
                  <BoutonConfirme geste="publier" releaseId={r.id} attendue={pointee} libelle="Publier la release" titre="Publier cette release ?"
                    explication={['Les prochaines conversations Jarvis et résolutions studio l’utiliseront.', 'Les jobs déjà devisés gardent leur release épinglée.', regle, 'Le geste est tracé dans l’audit.']} />
                )}
                {!r.revocation && peutRevenir && <BoutonRevoquer releaseId={r.id} />}
                {r.statut === 'active' && !r.pointee && peutRevenir && !r.revocation && (
                  <BoutonConfirme geste="rollback" releaseId={r.id} attendue={pointee} libelle="Revenir à cette release" titre="Revenir à cette release ?" secondaire
                    explication={['Seul le pointeur change · aucune version n’est modifiée.', 'Les prochaines résolutions utiliseront cette release, les traces passées restent inchangées.', 'Le geste est tracé dans l’audit.']} />
                )}
                {r.statut !== 'retired' && !r.pointee && peutPublier && <BoutonCommande commande="retirer" charge={{ releaseId: r.id }} libelle="Retirer" succes="Release retirée." secondaire />}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── Évaluations ─────────────────────────── */

export interface VueEvaluation { id: string; cible: string; type: string; passe: boolean; creeLe: string; tests: Array<{ id: string; passe: boolean; detail: string }>; benchmark: Array<{ id: string; titre: string; motif: string }> }

export function EcranEvaluations({ evaluations }: { evaluations: VueEvaluation[] }) {
  if (evaluations.length === 0) return <Vide titre="Aucune évaluation.">Lance « Évaluer » sur une release en attente (onglet Releases). L’évaluation est structurelle, sur données synthétiques, sans appel modèle ni dépense.</Vide>;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {evaluations.map((e) => (
        <article key={e.id} style={surfaceBloc} aria-label={`Évaluation ${e.cible}`}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Pastille statut={e.passe ? 'succeeded' : 'failed'} texte={e.passe ? 'Tests structurels réussis' : 'Tests structurels en échec'} />
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{e.type} · {e.cible} · {e.creeLe}</span>
          </div>
          {e.tests.length > 0 && (
            <details style={{ marginTop: 8 }}><summary style={{ cursor: 'pointer', padding: '12px 0', fontSize: 14 }}>{e.tests.filter((t) => t.passe).length}/{e.tests.length} tests structurels</summary>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>{e.tests.map((t) => <li key={t.id} style={{ marginTop: 3 }}><b>{t.passe ? 'Réussi' : 'Échec'}</b> · <code style={mono}>{t.id}</code> · {t.detail}</li>)}</ul>
            </details>
          )}
          {e.benchmark.length > 0 && (
            <details style={{ marginTop: 4 }}><summary style={{ cursor: 'pointer', padding: '12px 0', fontSize: 14 }}>Benchmark · {e.benchmark.length} cas non exécutés (budget requis)</summary>
              <p style={{ margin: '4px 0 6px', fontSize: 13, color: 'var(--ink-2)' }}>{e.benchmark[0]!.motif}</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, columns: '18em' }}>{e.benchmark.map((b) => <li key={b.id}><code style={mono}>{b.id}</code> · {b.titre}</li>)}</ul>
            </details>
          )}
        </article>
      ))}
    </div>
  );
}

/* ─────────────────────────── Benchmark F01-F24 ───────────────────────── */

export interface VueBenchmark {
  devis: {
    chiffrable: boolean; total: number | null; totalLisible: string; partielLisible: string | null; nonChiffrables: string[]; empreinte: string | null; refus: string[];
    /** R3 · « maximum » seulement si toutes les lignes sont des bornes ; sinon estimation, avec la raison. */
    qualification: { maximum: boolean; libelle: string; raison: string | null };
    cas: Array<{ cas: string; appels: number; medias: number; totalLisible: string; chiffrable: boolean; motif: string | null }>;
  };
  releases: Array<{ id: string; statut: string; empreinte: string; revoquee: boolean; benchmarkApprouve: boolean }>;
  approbations: Array<{ id: string; release: string; budgetLisible: string; devisLisible: string; le: string; expireLe: string; consommee: boolean; par: string }>;
  campagnes: Array<{ id: string; releaseId: string; release: string; mode: 'reel' | 'simule'; banniere: string; passe: boolean; verdict: string; invariants: string; refus: string[]; depenseLisible: string; le: string; empreinteRapport: string }>;
  fiches: Array<{ id: string; releaseId: string; release: string; passe: boolean; verdict: string; refus: string[]; le: string; fiches: number }>;
}

/**
 * Benchmark F01-F24 · devis (par cas et total), approbation de budget,
 * rapports joints, fiches humaines, geste « Benchmark approuvé ». Rien ne part
 * d'ici : la campagne réelle reste une commande explicite qui revérifie tout.
 */
export function EcranBenchmark({ b, peutEvaluer }: { b: VueBenchmark; peutEvaluer: boolean }) {
  const d = b.devis;
  const evaluables = b.releases.filter((r) => !r.revoquee);
  return (
    <div style={{ display: 'grid', gap: 14, marginBottom: 14 }}>
      <Bloc titre="Benchmark F01-F24 · devis" id="titre-devis-benchmark">
        <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          {d.qualification.maximum
            ? 'Ce que la campagne réelle coûterait AU PLUS, calculé par le serveur avant tout appel (bornes de jetons, images jointes en vision, barème des médias). Afficher ce devis ne dépense rien.'
            : 'Ce que la campagne réelle devrait coûter, ESTIMÉ par le serveur avant tout appel (budget de jetons, images jointes en vision, barème des médias). Ce n’est pas un maximum garanti · chaque appel reste borné par la barrière de dépense. Afficher ce devis ne dépense rien.'}
        </p>
        {d.chiffrable ? (
          <>
            <p style={{ margin: '0 0 4px', fontSize: 16 }}><b>Total · {d.totalLisible}</b></p>
            <p style={{ margin: '0 0 4px', fontSize: 13.5, color: d.qualification.maximum ? 'var(--ink-2)' : 'var(--warn)' }} data-qualification={d.qualification.maximum ? 'maximum' : 'estimation'}>
              {d.qualification.maximum ? 'Maximum · chaque ligne est une borne.' : `Estimation · maximum non garanti · ${d.qualification.raison ?? ''}`}
            </p>
            <p style={{ ...mono, margin: '0 0 10px', color: 'var(--muted)' }}>empreinte du devis {d.empreinte?.slice(0, 16)}…</p>
          </>
        ) : (
          <div role="alert" style={{ ...tuile, borderColor: 'var(--warn)', marginBottom: 10 }}>
            <b>Devis non chiffrable · aucun total.</b> Cas en cause : {d.nonChiffrables.join(', ') || 'aucun'}.{d.partielLisible ? ` Chiffrage partiel des autres cas, pour information : ${d.partielLisible} (ce n’est pas un total).` : ''}
            {d.refus.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{d.refus.map((r) => <li key={r}>{r}</li>)}</ul>}
          </div>
        )}
        <details><summary style={{ cursor: 'pointer', padding: '12px 0', fontSize: 14 }}>Devis par cas ({d.cas.length})</summary>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Cas', 'Appels texte', 'Médias', 'Plafond'].map((h) => <th key={h} scope="col" style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>{d.cas.map((c) => (
                <tr key={c.cas}>
                  <td style={{ padding: '6px 8px', ...mono }}>{c.cas}</td><td style={{ padding: '6px 8px' }}>{c.appels}</td><td style={{ padding: '6px 8px' }}>{c.medias}</td>
                  <td style={{ padding: '6px 8px' }}>{c.chiffrable ? c.totalLisible : `non chiffrable · ${c.motif ?? ''}`}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      </Bloc>

      <Bloc titre="Approuver un budget de benchmark" id="titre-budget-benchmark">
        {!peutEvaluer ? <p style={{ margin: 0, fontSize: 14 }}>Réservé à la permission prompt.evaluate (accès total d’équipe).</p>
          : !d.chiffrable || d.total === null ? <p role="note" style={{ margin: 0, fontSize: 14 }}>Aucune approbation possible tant que le devis n’est pas chiffrable.</p>
          : evaluables.length === 0 ? <p style={{ margin: 0, fontSize: 14 }}>Aucune release en attente ou publiée à évaluer.</p>
          : <FormulaireBudgetBenchmark releases={evaluables.map((r) => ({ id: r.id, libelle: `${r.statut === 'staged' ? 'En attente' : 'Publiée'} · ${r.empreinte.slice(0, 12)}…` }))} devisLisible={d.totalLisible} devisUsd={d.total / 1_000_000} devisMaximum={d.qualification.maximum} />}
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          Nominative, valable 24 h, utilisable par UNE campagne. Elle ne lance rien : la campagne réelle part de la commande <code style={mono}>bench:studios -- --reel --budget-usd X --release ID</code>, qui revérifie budget, devis, reste du plafond et approbation avant le premier appel.
        </p>
        {b.approbations.length > 0 && (
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {b.approbations.map((a) => <li key={a.id} style={{ marginTop: 4 }}>Release {a.release} · budget {a.budgetLisible} pour un devis de {a.devisLisible} · {a.le} → {a.expireLe} · {a.consommee ? 'utilisée par une campagne' : 'non utilisée'}</li>)}
          </ul>
        )}
      </Bloc>

      <Bloc titre="Rapports de campagne joints" id="titre-rapports-benchmark">
        {b.campagnes.length === 0 ? <p style={{ margin: 0, fontSize: 14 }}>Aucun rapport joint.</p> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {b.campagnes.map((c) => (
              <article key={c.id} aria-label={`Rapport ${c.mode === 'simule' ? 'SIMULÉ' : 'RÉEL'} ${c.release}`} style={{ ...tuile, borderColor: c.mode === 'simule' ? 'var(--warn)' : 'var(--line)' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Pastille statut={c.mode === 'simule' ? 'draft' : 'active'} texte={c.mode === 'simule' ? 'SIMULÉ' : 'RÉEL'} />
                  <Pastille statut={c.passe ? 'succeeded' : 'failed'} texte={c.passe ? 'Évaluation réelle passée' : 'Ne vaut pas évaluation'} />
                  <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>release {c.release} · {c.le}</span>
                </div>
                {c.mode === 'simule' && <p role="note" style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600 }}>{c.banniere || 'SIMULÉ · aucune évaluation réelle de la qualité'}</p>}
                <p style={{ margin: '6px 0 0', fontSize: 13 }}>Verdict {c.verdict} · invariants {c.invariants} · dépense {c.depenseLisible}{c.refus.length ? ` · motifs : ${c.refus.join(', ')}` : ''}</p>
              </article>
            ))}
          </div>
        )}
      </Bloc>

      <Bloc titre="Fiches de revue humaine" id="titre-fiches-benchmark">
        <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>Le code ne note jamais. Après une campagne RÉELLE, les relecteurs remplissent les fiches (une note 0, 1 ou 2 par dimension, leur nom) ; le serveur recalcule le verdict sur le rapport scellé et les traces relues en base.</p>
        {peutEvaluer && evaluables.length > 0 && <FormulaireFichesBenchmark releases={evaluables.map((r) => ({ id: r.id, libelle: `${r.statut === 'staged' ? 'En attente' : 'Publiée'} · ${r.empreinte.slice(0, 12)}…` }))} />}
        {b.fiches.length > 0 && (
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {b.fiches.map((f) => <li key={f.id} style={{ marginTop: 4 }}>Release {f.release} · {f.fiches} fiche(s) · verdict {f.verdict} · {f.passe ? 'passée' : `non passée (${f.refus.join(', ')})`} · {f.le}</li>)}
          </ul>
        )}
      </Bloc>

      <Bloc titre="Benchmark approuvé" id="titre-benchmark-approuve">
        <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>Décision humaine, nominative. Exige une évaluation RÉELLE passée sur l’empreinte de la release et des fiches remplies. Ne publie rien : la publication reste un geste séparé.</p>
        {b.releases.filter((r) => r.statut === 'staged').length === 0 ? <p style={{ margin: 0, fontSize: 14 }}>Aucune release en attente.</p> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {b.releases.filter((r) => r.statut === 'staged').map((r) => {
              const eligibles = b.fiches.filter((f) => f.releaseId === r.id && f.passe);
              return (
                <div key={r.id} style={tuile}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={mono}>{r.empreinte.slice(0, 16)}…</span>
                    <Pastille statut={r.benchmarkApprouve ? 'succeeded' : 'staged'} texte={r.benchmarkApprouve ? 'Benchmark approuvé' : 'Benchmark non approuvé'} />
                  </div>
                  {!r.benchmarkApprouve && peutEvaluer && !r.revoquee && (
                    eligibles.length === 0
                      ? <p style={{ margin: '8px 0 0', fontSize: 13 }}>Aucune évaluation réelle passée avec fiches remplies pour cette release · le geste est indisponible.</p>
                      : <BoutonBenchmarkApprouve releaseId={r.id} evaluations={eligibles.map((f) => ({ id: f.id, libelle: `${f.le} · ${f.fiches} fiche(s)` }))} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Bloc>
    </div>
  );
}

/* ─────────────────────────────── Routage ─────────────────────────────── */

export function EcranRoutage({ lignes }: { lignes: Array<{ profil: string; fournisseur: string; statut: string; note: string }> }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div role="note" style={{ ...surfaceBloc, fontSize: 14, lineHeight: 1.55 }}>
        <b>Lecture seule.</b> Le registre de capacités (profils logiques → fournisseurs configurés) n’existe pas encore. Ce tableau est déduit de l’adaptateur du résolveur de ce lot. La configuration des fournisseurs (permission provider.configure) viendra avec ce registre.
      </div>
      <div style={grille(260)}>
        {lignes.map((l) => (
          <article key={l.profil} style={surfaceBloc} aria-label={`Profil ${l.profil}`}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><b style={mono}>{l.profil}</b><Pastille statut={l.statut === 'configuré' ? 'succeeded' : l.statut === 'absent' ? 'failed' : 'shadow'} texte={l.statut} /></div>
            <p style={{ margin: '8px 0 0', fontSize: 13.5 }}>{l.fournisseur}</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>{l.note}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────── Exécutions ──────────────────────────── */

export interface VueRun {
  id: string; quand: string; templateKey: string; statut: string; modele: string; releaseId: string | null; releaseHash: string; version: string;
  compiledHash: string; contextSnapshotHash: string; outputHash: string | null; latenceMs: number | null; coutUsd: number | null;
  sources: Array<{ type: string; titre: string; version: string }>; couches: Array<{ couche: string; empreinte: string }>; constats: string[];
  espace: string; marque: string; traceId: string | null; budget: string | null;
  /** Exécution d'évaluation (release staged dans une campagne de benchmark) · `null` sinon. */
  evaluation: { mode: string; approbationId: string; releaseStatut: string } | null;
  /** Pièces natives réellement envoyées (vision) · identifiants et empreintes, jamais les octets. */
  pieces: Array<{ bindingId: string; assetId: string; assetVersion: string; sha256: string; nativeAttachmentIndex: number; mime: string; octets: number | null; largeur: number | null; hauteur: number | null; jetonsMax: number | null }>;
}

export function EcranExecutions({ runs, detail }: { runs: VueRun[]; detail: VueRun | null }) {
  if (runs.length === 0) return <Vide titre="Aucune exécution tracée.">Chaque conversation Jarvis et chaque tâche studio résolue par le registre laisse ici une trace expurgée (empreintes, sources, modèle, coût).</Vide>;
  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', alignItems: 'start' }}>
      <nav aria-label="Exécutions récentes" style={{ ...surfaceBloc, display: 'grid', gap: 8 }}>
        {runs.map((r) => (
          <Link key={r.id} href={`?onglet=executions&run=${r.id}`} aria-current={detail?.id === r.id ? 'page' : undefined} style={{ ...lienCarte, ...tuile, borderColor: detail?.id === r.id ? 'var(--accent)' : 'var(--line)' }}>
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><b style={mono}>{r.templateKey}</b><Pastille statut={r.statut} /></span>
            <span style={{ display: 'block', marginTop: 4, fontSize: 12.5, color: 'var(--ink-2)' }}>{r.quand} · {r.modele}{r.sources.length ? ` · ${r.sources.length} source(s)` : ''}</span>
          </Link>
        ))}
      </nav>
      {detail ? (
        <section aria-labelledby="titre-run" style={surfaceBloc}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><h2 id="titre-run" style={{ ...titreBloc, margin: 0, ...mono }}>{detail.templateKey}</h2><Pastille statut={detail.statut} /></div>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>Trace expurgée · ni le texte du prompt, ni la demande, ni la réponse ne sont conservés ; leurs empreintes le sont.</p>
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '5px 10px', margin: '10px 0 0', fontSize: 13 }}>
            <dt style={{ color: 'var(--muted)' }}>Quand</dt><dd style={{ margin: 0 }}>{detail.quand}</dd>
            <dt style={{ color: 'var(--muted)' }}>Portée</dt><dd style={{ margin: 0, ...mono }}>espace {detail.espace} · marque {detail.marque}</dd>
            <dt style={{ color: 'var(--muted)' }}>Release</dt><dd style={{ margin: 0, ...mono }}>{detail.releaseId ?? '·'} · {detail.releaseHash}</dd>
            <dt style={{ color: 'var(--muted)' }}>Version</dt><dd style={{ margin: 0, ...mono }}>{detail.version}</dd>
            <dt style={{ color: 'var(--muted)' }}>Message compilé</dt><dd style={{ margin: 0, ...mono }}>{detail.compiledHash}</dd>
            <dt style={{ color: 'var(--muted)' }}>Snapshot de contexte</dt><dd style={{ margin: 0, ...mono }}>{detail.contextSnapshotHash}</dd>
            <dt style={{ color: 'var(--muted)' }}>Sortie</dt><dd style={{ margin: 0, ...mono }}>{detail.outputHash ?? '·'}</dd>
            <dt style={{ color: 'var(--muted)' }}>Modèle</dt><dd style={{ margin: 0 }}>{detail.modele}</dd>
            <dt style={{ color: 'var(--muted)' }}>Latence</dt><dd style={{ margin: 0 }}>{detail.latenceMs === null ? '·' : `${detail.latenceMs} ms`}</dd>
            <dt style={{ color: 'var(--muted)' }}>Coût</dt><dd style={{ margin: 0 }}>{detail.coutUsd === null ? '·' : `${detail.coutUsd.toFixed(6)} $`}</dd>
            {detail.budget && <><dt style={{ color: 'var(--muted)' }}>Budget de contexte</dt><dd style={{ margin: 0 }}>{detail.budget}</dd></>}
            {detail.constats.length > 0 && <><dt style={{ color: 'var(--muted)' }}>Motifs</dt><dd style={{ margin: 0, ...mono }}>{detail.constats.join(' · ')}</dd></>}
            {detail.evaluation && <><dt style={{ color: 'var(--muted)' }}>Évaluation</dt><dd style={{ margin: 0 }}>Exécution d’évaluation · {detail.evaluation.mode || '?'} · release {detail.evaluation.releaseStatut || '?'} · approbation <code style={mono}>{detail.evaluation.approbationId || '·'}</code></dd></>}
            <dt style={{ color: 'var(--muted)' }}>Trace</dt><dd style={{ margin: 0, ...mono }}>{detail.traceId ?? '·'}</dd>
          </dl>
          <h3 style={{ margin: '14px 0 6px', fontSize: 14, fontWeight: 600 }}>Sources retenues</h3>
          {detail.sources.length === 0 ? <p style={{ margin: 0, fontSize: 13 }}>Aucune.</p> : <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{detail.sources.map((s, i) => <li key={i}>{s.titre} <span style={{ color: 'var(--muted)' }}>· {s.type} · <code style={mono}>{s.version}</code></span></li>)}</ul>}
          {detail.pieces.length > 0 && (<>
            <h3 style={{ margin: '14px 0 6px', fontSize: 14, fontWeight: 600 }}>Pièces natives envoyées</h3>
            <p style={{ margin: '0 0 6px', fontSize: 12.5, color: 'var(--ink-2)' }}>Chaque image a été lue par le serveur dans la portée de la tâche ; la trace garde son empreinte, jamais ses octets ni son adresse.</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 8 }}>{detail.pieces.map((p) => (
              <li key={`${p.nativeAttachmentIndex}-${p.bindingId}`} style={{ overflowWrap: 'anywhere' }}>
                index {p.nativeAttachmentIndex} · <code style={mono}>{p.bindingId || '·'}</code> → <code style={mono}>{p.assetId || '·'}</code>{p.assetVersion ? <> @ <code style={mono}>{p.assetVersion}</code></> : null}
                <span style={{ color: 'var(--muted)' }}> · {p.mime || 'type ?'}{p.octets !== null ? ` · ${p.octets} octets` : ''}{p.largeur !== null && p.hauteur !== null ? ` · ${p.largeur}×${p.hauteur}` : ''}{p.jetonsMax !== null ? ` · au plus ${p.jetonsMax} jetons` : ''} · sha256 <code style={mono}>{p.sha256 || '·'}</code></span>
              </li>
            ))}</ul>
          </>)}
          {detail.couches.length > 0 && (<>
            <h3 style={{ margin: '14px 0 6px', fontSize: 14, fontWeight: 600 }}>Couches de résolution</h3>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{detail.couches.map((c) => <li key={c.couche}>{c.couche} · <code style={mono}>{c.empreinte.slice(0, 16)}…</code></li>)}</ol>
          </>)}
        </section>
      ) : <Vide titre="Choisis une exécution pour l’expliquer." />}
    </div>
  );
}

/* ─────────────────────────────── Connaissances ───────────────────────── */

export function EcranConnaissances({ publiees, retirees, brouillons }: { publiees: number; retirees: number; brouillons: number }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <section aria-labelledby="titre-connaissances" style={surfaceBloc}>
        <h2 id="titre-connaissances" style={titreBloc}>Connaissances de l’équipe</h2>
        <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          L’espace Connaissances existant reste la seule source : le résolveur y lit les versions PUBLIÉES et applicables à chaque marque, à chaque résolution. Une connaissance retirée sort du snapshot suivant.
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 14 }}>{publiees} publiée(s) · {brouillons} brouillon(s) · {retirees} retirée(s)</p>
        <Link href="/admin/connaissances" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 16px', borderRadius: 999, background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Ouvrir les Connaissances</Link>
      </section>
    </div>
  );
}
