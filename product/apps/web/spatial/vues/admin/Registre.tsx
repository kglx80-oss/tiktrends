import type { ReactNode } from 'react';
import { Lien, Vue } from '../../communs';
import { Pill, TeteAdmin, Vide, type BandeauAdmin, type ClassePill } from './base';
import type { VueBenchmark, VueCle, VueDetail, VueEvaluation, VueRelease, VueRun } from '../../../lib/studios/prompts/vues-registre';
import {
  BenchmarkApprouve, BudgetBenchmark, CommandeRegistre, EditeurVersion, FichesBenchmark, NouvelleRelease, RecetteManuelle, ReleaseConfirmee, RevoquerRelease,
} from './registre-client';

/**
 * « Registre IA » · l'éditeur du registre de prompts (ancien `/admin/ia-studios`
 * V5, « IA et Studios »), porté dans Spatial. PRÉSENTATIONNEL · la page pose la
 * garde plateforme (`prompt.read`) et lit les vues sérialisables
 * (`lib/studios/prompts/vues-registre`). Chaque geste passe par sa commande
 * serveur existante (garde reposée) · rien n'est actif tant qu'une release
 * n'est pas publiée. Composé avec les classes de la maquette (tuiles, tables
 * `.atable`, pastilles, `.seg`), sans fragment de référence.
 */

export const ONGLETS_REGISTRE = [
  { id: 'prompts', libelle: 'Prompts' },
  { id: 'releases', libelle: 'Releases' },
  { id: 'recettes', libelle: 'Recettes de style' },
  { id: 'evaluations', libelle: 'Évaluations' },
  { id: 'routage', libelle: 'Routage' },
  { id: 'executions', libelle: 'Exécutions' },
  { id: 'connaissances', libelle: 'Connaissances' },
] as const;
export type OngletRegistre = (typeof ONGLETS_REGISTRE)[number]['id'];

export const CHEMIN_REGISTRE = '/admin/prompts/registre';

const STATUT: Record<string, { libelle: string; c: ClassePill }> = {
  draft: { libelle: 'Brouillon', c: 'w' }, validated: { libelle: 'Validée', c: 'g' }, retired: { libelle: 'Retirée', c: '' }, staged: { libelle: 'En attente', c: 'c' }, active: { libelle: 'Publiée', c: 'g' },
  succeeded: { libelle: 'Réussie', c: 'g' }, failed: { libelle: 'Rejetée', c: 'r' }, blocked: { libelle: 'Bloquée avant appel', c: 'w' }, shadow: { libelle: 'Ombre', c: '' },
};
/** Le statut porte un MOT · la couleur l'accompagne. */
const Statut = ({ s, texte }: { s: string; texte?: string }) => <Pill c={STATUT[s]?.c ?? ''}>{texte ?? STATUT[s]?.libelle ?? s}</Pill>;
const libelleStatut = (s: string) => STATUT[s]?.libelle ?? s;

function Tuile({ titre, children, droite, id }: { titre: string; children: ReactNode; droite?: ReactNode; id?: string }) {
  return <section className="tile sec" id={id}><div className="sech"><h2>{titre}</h2>{droite}</div>{children}</section>;
}
function Texte({ children }: { children: string }) {
  return <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflow: 'auto', padding: '10px 12px', borderRadius: 14, background: '#0b122066', border: '1px solid var(--edge2)', lineHeight: 1.55 }}>{children}</pre>;
}
function Fiche({ lignes }: { lignes: ReadonlyArray<[string, ReactNode] | null | false> }) {
  return (
    <div className="atable">
      {lignes.filter((l): l is [string, ReactNode] => !!l).map(([k, v]) => <div className="atr" key={k} style={{ gridTemplateColumns: 'minmax(110px,.6fr) 2fr' }}><span className="faint">{k}</span><span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{v}</span></div>)}
    </div>
  );
}

export type ContenuRegistre =
  | { onglet: 'prompts' | 'recettes'; cles: VueCle[]; detail: VueDetail | null; peutEditer: boolean; plan: { aCreer: number; deja: number } | null; brouillonsImportes: number }
  | { onglet: 'releases'; releases: VueRelease[]; pointee: string | null; environnement: 'production' | 'test'; selection: Array<{ cle: string; version: string }>; peutPublier: boolean; peutRevenir: boolean; peutEvaluer: boolean; peutCreer: boolean }
  | { onglet: 'evaluations'; benchmark: VueBenchmark; evaluations: VueEvaluation[]; peutEvaluer: boolean }
  | { onglet: 'routage'; lignes: Array<{ profil: string; fournisseur: string; statut: string; note: string }> }
  | { onglet: 'executions'; autorise: boolean; runs: VueRun[]; detail: VueRun | null }
  | { onglet: 'connaissances'; publiees: number; retirees: number; brouillons: number };

/** `contenu` · l'onglet lu ; `erreur` · lecture impossible (dite, avec l'identifiant support). */
export interface PropsRegistre { bandeau: BandeauAdmin; onglet: OngletRegistre; contenu: ContenuRegistre | null; erreur?: { message: string; traceId: string } | null }

export function Registre({ bandeau, onglet, contenu, erreur }: PropsRegistre) {
  return (
    <Vue>
      <TeteAdmin titre="Registre IA" sous="registre de prompts" actif={CHEMIN_REGISTRE} bandeau={bandeau} />
      <div className="aitabs">
        <nav className="seg" aria-label="Registre IA">
          {ONGLETS_REGISTRE.map((o) => <Lien key={o.id} href={`${CHEMIN_REGISTRE}?onglet=${o.id}`} aria-current={o.id === onglet ? 'page' : undefined}>{o.libelle}</Lien>)}
        </nav>
        <small className="faint" style={{ fontSize: 12 }}>Le registre des prompts que Jarvis et les studios résolvent · versions, releases, évaluations et traces. Rien n’est actif tant qu’une release n’est pas publiée.</small>
      </div>
      {erreur || !contenu ? (
        <section className="tile" role="alert" data-etat="erreur"><b>{erreur?.message ?? 'Lecture du registre impossible pour le moment.'}</b>{erreur && <p className="faint" style={{ margin: '6px 0 0', fontSize: 12 }}>Recharge la page. Identifiant support · <code className="mono">{erreur.traceId}</code></p>}</section>
      ) : contenu.onglet === 'prompts' || contenu.onglet === 'recettes' ? <Versions {...contenu} />
        : contenu.onglet === 'releases' ? <Releases {...contenu} />
        : contenu.onglet === 'evaluations' ? <Evaluations {...contenu} />
        : contenu.onglet === 'routage' ? <Routage lignes={contenu.lignes} />
        : contenu.onglet === 'executions' ? <Executions {...contenu} />
        : contenu.onglet === 'connaissances' ? <Connaissances publiees={contenu.publiees} retirees={contenu.retirees} brouillons={contenu.brouillons} /> : null}
    </Vue>
  );
}

/* ─────────────────────────────── Prompts · recettes ─────────────────────────────── */

function Versions({ onglet, cles, detail, peutEditer, plan, brouillonsImportes }: Extract<ContenuRegistre, { onglet: 'prompts' | 'recettes'; cles: VueCle[] }>) {
  const lien = (q: string) => `${CHEMIN_REGISTRE}?onglet=${onglet}${q}`;
  return (
    <>
      {plan && peutEditer && (plan.aCreer > 0 || cles.length === 0) && (
        <Tuile titre="Importer le pack en brouillon">
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>{plan.aCreer} version(s) du pack embarqué ne sont pas encore au registre ({plan.deja} déjà présente(s) à l’identique). L’import crée des brouillons, n’active rien, et refuse tout conflit d’empreinte.</p>
          <CommandeRegistre commande="importer" principal libelle="Importer en brouillon" succes="Import terminé · rien n’est actif tant qu’une release n’est pas publiée." />
        </Tuile>
      )}
      {peutEditer && brouillonsImportes > 0 && (
        <Tuile titre="Valider les brouillons importés">
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>{brouillonsImportes} brouillon(s) viennent tels quels du pack embarqué. Les valider les fige · chacun passe les mêmes contrôles qu’une validation unitaire et entre au journal. Un brouillon que tu as modifié n’est jamais pris ici.</p>
          <CommandeRegistre commande="validerImports" principal libelle="Valider les brouillons importés" succes="Brouillons importés validés · tu peux créer la release." />
        </Tuile>
      )}
      {cles.length === 0 ? (
        <section className="tile sec" data-etat="vide"><b>Le registre est vide.</b><p className="muted" style={{ margin: '6px 0 0', fontSize: '12.5px' }}>Importe le pack pour créer les brouillons des templates, des recettes et de la politique de conversation Jarvis.</p></section>
      ) : (
        <div className="agrid2 sec" style={{ alignItems: 'start' }}>
          <section className="tile">
            <div className="sech"><h2>Clés du registre</h2><span className="faint" style={{ fontSize: '12.5px' }}>{cles.length}</span></div>
            <div className="atable">
              {cles.map((c) => {
                const actif = detail?.cle.cle === c.cle && detail.cle.type === c.type;
                const d = c.versions[0]!;
                return (
                  <div className="atr" key={`${c.type}:${c.cle}`} style={{ gridTemplateColumns: '1fr auto' }} data-cle={`${c.type}:${c.cle}`}>
                    <span><Lien href={lien(`&cle=${encodeURIComponent(`${c.type}:${c.cle}`)}`)} aria-current={actif ? 'page' : undefined}><b className="mono">{c.cle}</b></Lien><small className="faint" style={{ display: 'block' }}>{c.libelleType} · {c.titre}</small></span>
                    <span><Statut s={d.statut} texte={`${d.version} · ${libelleStatut(d.statut)}`} /></span>
                  </div>
                );
              })}
            </div>
          </section>
          {detail ? <DetailVersion onglet={onglet} d={detail} peutEditer={peutEditer} /> : <section className="tile"><p className="muted" style={{ margin: 0, fontSize: '12.5px' }}>Choisis une clé pour voir ses versions, son contenu et ses différences.</p></section>}
        </div>
      )}
    </>
  );
}

function DetailVersion({ onglet, d, peutEditer }: { onglet: string; d: VueDetail; peutEditer: boolean }) {
  const base = `${CHEMIN_REGISTRE}?onglet=${onglet}&cle=${encodeURIComponent(`${d.cle.type}:${d.cle.cle}`)}`;
  return (
    <div style={{ display: 'grid', gap: 16, minWidth: 0 }} data-detail-version={d.version.id}>
      <section className="tile">
        <div className="sech"><h2 className="mono">{d.cle.cle} · {d.version.version}</h2><Statut s={d.version.statut} />{d.version.horsSource && <Pill c="w">Hors pack source · à reporter</Pill>}</div>
        <Fiche lignes={[
          ['Type', `${d.cle.libelleType} · portée plateforme`],
          ['Empreinte', <code className="mono" key="e">{d.version.empreinte}</code>],
          ['Origine', d.version.origine],
          ['Motif', d.version.motif || '·'],
          ['Créée', `${d.version.creeLe}${d.version.valideeLe ? ` · validée ${d.version.valideeLe}` : ''}`],
          d.schemas && ['Modèle logique', <code className="mono" key="m">{d.schemas.profil}</code>],
          d.schemas && ['Schémas', <code className="mono" key="s">{d.schemas.entree} → {d.schemas.sortie}</code>],
          ['Variables', <code className="mono" key="v">{d.variables.length ? d.variables.map((v) => `{{${v}}}`).join(' · ') : 'aucune'}</code>],
          ['Coût de test', '0 $ · évaluation structurelle sans appel modèle'],
        ]} />
        <div className="kc" style={{ marginTop: 12 }} role="list" aria-label="Versions de cette clé">
          {d.cle.versions.map((v) => (
            <span role="listitem" key={v.id} className="kc">
              <Lien className="chip" href={`${base}&v=${v.id}`} aria-current={v.id === d.version.id ? 'true' : undefined}>{v.version} · {libelleStatut(v.statut)}</Lien>
              {v.id !== d.version.id && <Lien className="chip" href={`${base}&v=${d.version.id}&comparer=${v.id}`}>Comparer</Lien>}
            </span>
          ))}
        </div>
        {peutEditer && d.version.statut === 'draft' && <div style={{ marginTop: 12 }}><CommandeRegistre commande="valider" charge={{ id: d.version.id }} principal libelle="Valider cette version" succes="Version validée · elle est désormais figée." /></div>}
      </section>
      {d.diff && (
        <section className="tile">
          <div className="sech"><h2>Différences · {d.diff.avec.version} → {d.version.version}</h2></div>
          {d.diff.champs.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: '12.5px' }}>Contenus identiques.</p> : d.diff.champs.map((c) => (
            <div key={c.libelle} style={{ marginBottom: 10 }}>
              <b style={{ fontSize: 13 }}>{c.libelle}</b>
              <pre className="mono" style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto' }}>
                {c.lignes.map((l, i) => <span key={i} className={l.op === '+' ? 'up' : l.op === '-' ? 'dn' : 'faint'} style={{ display: 'block' }}>{l.op === '+' ? '+ ' : l.op === '-' ? '− ' : '  '}{l.texte}</span>)}
              </pre>
            </div>
          ))}
        </section>
      )}
      <section className="tile">
        <div className="sech"><h2>Contenu</h2></div>
        <div style={{ display: 'grid', gap: 12 }}>
          {d.champs.map((c) => <div key={c.champ} style={{ display: 'grid', gap: 6 }}><small className="faint">{c.libelle}{c.contrat ? ' · contrat, non modifiable ici' : ''}</small><Texte>{c.texte}</Texte></div>)}
        </div>
      </section>
      {d.exemples && (
        <section className="tile">
          <div className="sech"><h2>Exemples d’entrée et de sortie</h2></div>
          <details><summary className="btn sm">Afficher les exemples</summary><div style={{ marginTop: 10 }}><Texte>{d.exemples}</Texte></div></details>
        </section>
      )}
      {peutEditer && d.editables.length > 0 && (
        <section className="tile">
          <div className="sech"><h2>{d.version.statut === 'draft' ? 'Modifier ce brouillon' : 'Créer un brouillon à partir de cette version'}</h2></div>
          <EditeurVersion baseId={d.version.id} champs={d.editables} empreinteAttendue={d.version.empreinte} brouillon={d.version.statut === 'draft'} />
        </section>
      )}
    </div>
  );
}

/* ─────────────────────────────── Releases ─────────────────────────────── */

function Releases({ releases, pointee, environnement, selection, peutPublier, peutRevenir, peutEvaluer, peutCreer }: Extract<ContenuRegistre, { onglet: 'releases'; releases: VueRelease[] }>) {
  const regle = environnement === 'production'
    ? 'Production · une release ne devient active qu’avec un benchmark approuvé OU l’accord de recette manuelle sur son empreinte.'
    : 'Recette locale (drapeau serveur, base locale) · l’activation sans benchmark est permise pour prouver la chaîne. Jamais en production.';
  return (
    <>
      <p className={`banner ${environnement === 'production' ? '' : 'sec'}`} role="note" style={{ margin: 0 }}><b>Environnement</b> · {regle}</p>
      {peutCreer && (
        <Tuile titre="Nouvelle release">
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>Assemble la dernière version VALIDÉE de chaque clé ({selection.length} entrées). Refusée si une clé requise manque ou si un contrat diverge du code.</p>
          <details style={{ marginBottom: 10 }}><summary className="chip">Voir la sélection</summary>
            <ul className="mono" style={{ margin: '8px 0 0', paddingLeft: 18, columns: '16em' }}>{selection.map((s) => <li key={s.cle}>{s.cle} · {s.version}</li>)}</ul>
          </details>
          <NouvelleRelease />
        </Tuile>
      )}
      {releases.length === 0 ? (
        <section className="tile sec" data-etat="vide"><b>Aucune release.</b><p className="muted" style={{ margin: '6px 0 0', fontSize: '12.5px' }}>Valide les versions du registre, puis crée une release en attente. Tant qu’aucune release n’est publiée, les tâches des studios restent bloquées et Jarvis garde sa consigne d’origine (version 1.0.0, identique au code d’avant).</p></section>
      ) : (
        <div className="agrid2 sec">
          {releases.map((r) => (
            <article className="tile" key={r.id} aria-label={`Release ${r.empreinte.slice(0, 12)}`} data-release={r.id} style={r.pointee ? { borderColor: 'var(--acc)' } : undefined}>
              <div className="sech"><h2 className="mono" style={{ fontSize: 14 }}>{r.empreinte.slice(0, 12)}…</h2><Statut s={r.statut} />{r.pointee && <Pill c="g">{r.revocation ? 'Pointée · non servie' : 'Sert maintenant'}</Pill>}{r.revocation && <Pill c="r">Révoquée</Pill>}</div>
              {r.revocation && <p role="note" className="muted" style={{ margin: '0 0 8px', fontSize: '12.5px', overflowWrap: 'anywhere' }}>Révoquée · {r.revocation}. Aucune tâche ni nouveau devis ne l’utilise · Jarvis garde sa consigne 1.0.0.</p>}
              <Fiche lignes={[
                ['Créée', r.creeLe],
                ['Contenu', `${r.versions} versions${r.conversation ? ` · Jarvis ${r.conversation}` : ''}`],
                ['Motif', r.motif || '·'],
                ['Tests', r.tests === null ? 'Non évaluée' : r.tests ? 'Structurels réussis' : 'Structurels en échec'],
                ['Benchmark', r.benchmark ? 'Approuvé' : r.recetteManuelle ? 'Recette manuelle (sans benchmark) · accord du propriétaire' : 'Non exécuté · budget requis'],
              ]} />
              <div className="kc" style={{ marginTop: 12, alignItems: 'flex-start' }}>
                {r.statut === 'staged' && peutEvaluer && <CommandeRegistre commande="evaluer" charge={{ releaseId: r.id }} libelle="Évaluer" succes="Évaluation enregistrée · voir l’onglet Évaluations." />}
                {r.statut === 'staged' && peutPublier && !r.revocation && environnement === 'production' && r.tests === true && !r.benchmark && !r.recetteManuelle && <RecetteManuelle releaseId={r.id} />}
                {r.statut === 'staged' && peutPublier && !r.revocation && (
                  <ReleaseConfirmee geste="publier" releaseId={r.id} attendue={pointee} libelle="Publier la release" titre="Publier cette release ?"
                    explication={['Les prochaines conversations Jarvis et résolutions studio l’utiliseront.', 'Les jobs déjà devisés gardent leur release épinglée.', regle, 'Le geste est tracé dans l’audit.']} />
                )}
                {!r.revocation && peutRevenir && <RevoquerRelease releaseId={r.id} />}
                {r.statut === 'active' && !r.pointee && peutRevenir && !r.revocation && (
                  <ReleaseConfirmee geste="rollback" releaseId={r.id} attendue={pointee} principal={false} libelle="Revenir à cette release" titre="Revenir à cette release ?"
                    explication={['Seul le pointeur change · aucune version n’est modifiée.', 'Les prochaines résolutions utiliseront cette release, les traces passées restent inchangées.', 'Le geste est tracé dans l’audit.']} />
                )}
                {r.statut !== 'retired' && !r.pointee && peutPublier && <CommandeRegistre commande="retirer" charge={{ releaseId: r.id }} libelle="Retirer" succes="Release retirée." />}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────── Évaluations · benchmark ─────────────────────────────── */

function Evaluations({ benchmark: b, evaluations, peutEvaluer }: Extract<ContenuRegistre, { onglet: 'evaluations'; evaluations: VueEvaluation[] }>) {
  const d = b.devis;
  const evaluables = b.releases.filter((r) => !r.revoquee);
  const options = evaluables.map((r) => ({ id: r.id, libelle: `${r.statut === 'staged' ? 'En attente' : 'Publiée'} · ${r.empreinte.slice(0, 12)}…` }));
  return (
    <>
      <Tuile titre="Benchmark F01-F24 · devis" droite={<Pill c={d.chiffrable ? (d.qualification.maximum ? 'g' : 'w') : 'r'}>{d.chiffrable ? (d.qualification.maximum ? 'Maximum' : 'Estimation') : 'Non chiffrable'}</Pill>}>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>{d.qualification.maximum
          ? 'Ce que la campagne réelle coûterait AU PLUS, calculé par le serveur avant tout appel (bornes de jetons, images jointes en vision, barème des médias). Afficher ce devis ne dépense rien.'
          : 'Ce que la campagne réelle devrait coûter, ESTIMÉ par le serveur avant tout appel. Ce n’est pas un maximum garanti · chaque appel reste borné par la barrière de dépense. Afficher ce devis ne dépense rien.'}</p>
        {d.chiffrable ? (
          <div style={{ display: 'grid', gap: 4 }} data-qualification={d.qualification.maximum ? 'maximum' : 'estimation'}>
            <b style={{ font: '600 20px var(--sfd)' }}>Total · {d.totalLisible}</b>
            <small className="faint">{d.qualification.maximum ? 'Maximum · chaque ligne est une borne.' : `Estimation · maximum non garanti · ${d.qualification.raison ?? ''}`}</small>
            <small className="faint mono">empreinte du devis {d.empreinte?.slice(0, 16)}…</small>
          </div>
        ) : (
          <p role="alert" className="muted" style={{ margin: 0, fontSize: '12.5px' }}><b>Devis non chiffrable · aucun total.</b> Cas en cause · {d.nonChiffrables.join(', ') || 'aucun'}.{d.partielLisible ? ` Chiffrage partiel des autres cas, pour information · ${d.partielLisible} (ce n’est pas un total).` : ''}{d.refus.length ? ` ${d.refus.join(' · ')}` : ''}</p>
        )}
        <details style={{ marginTop: 10 }}><summary className="chip">Devis par cas ({d.cas.length})</summary>
          <div className="atable" style={{ marginTop: 8 }}>
            <div className="atr ath" style={{ gridTemplateColumns: '1fr .7fr .6fr 1.4fr' }}><span>Cas</span><span>Appels texte</span><span>Médias</span><span>Plafond</span></div>
            {d.cas.map((c) => <div className="atr" key={c.cas} style={{ gridTemplateColumns: '1fr .7fr .6fr 1.4fr' }}><span className="mono">{c.cas}</span><span>{c.appels}</span><span>{c.medias}</span><span>{c.chiffrable ? c.totalLisible : `non chiffrable · ${c.motif ?? ''}`}</span></div>)}
          </div>
        </details>
      </Tuile>
      <div className="agrid2 sec">
        <section className="tile">
          <div className="sech"><h2>Approuver un budget de benchmark</h2></div>
          {!peutEvaluer ? <p className="muted" style={{ margin: 0, fontSize: '12.5px' }}>Réservé à la permission prompt.evaluate (accès total d’équipe).</p>
            : !d.chiffrable || d.total === null ? <p role="note" className="muted" style={{ margin: 0, fontSize: '12.5px' }}>Aucune approbation possible tant que le devis n’est pas chiffrable.</p>
            : evaluables.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: '12.5px' }}>Aucune release en attente ou publiée à évaluer.</p>
            : <BudgetBenchmark releases={options} devisLisible={d.totalLisible} devisUsd={d.total / 1_000_000} devisMaximum={d.qualification.maximum} />}
          <small className="faint" style={{ display: 'block', marginTop: 10 }}>Nominative, valable 24 h, utilisable par UNE campagne. Elle ne lance rien · la campagne réelle part de la commande <code className="mono">bench:studios -- --reel --budget-usd X --release ID</code>, qui revérifie budget, devis, reste du plafond et approbation avant le premier appel.</small>
          {b.approbations.length > 0 && <ul className="muted" style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12 }}>{b.approbations.map((a) => <li key={a.id}>Release {a.release} · budget {a.budgetLisible} pour un devis de {a.devisLisible} · {a.le} → {a.expireLe} · {a.consommee ? 'utilisée par une campagne' : 'non utilisée'}</li>)}</ul>}
        </section>
        <section className="tile">
          <div className="sech"><h2>Fiches de revue humaine</h2></div>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>Le code ne note jamais. Après une campagne RÉELLE, les relecteurs remplissent les fiches (une note 0, 1 ou 2 par dimension, leur nom) · le serveur recalcule le verdict sur le rapport scellé et les traces relues en base.</p>
          {peutEvaluer && evaluables.length > 0 && <FichesBenchmark releases={options} />}
          {b.fiches.length > 0 && <ul className="muted" style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12 }}>{b.fiches.map((f) => <li key={f.id}>Release {f.release} · {f.fiches} fiche(s) · verdict {f.verdict} · {f.passe ? 'passée' : `non passée (${f.refus.join(', ')})`} · {f.le}</li>)}</ul>}
        </section>
      </div>
      <Tuile titre="Rapports de campagne joints">
        <div className="atable">
          {b.campagnes.map((c) => (
            <div className="atr" key={c.id} aria-label={`Rapport ${c.mode === 'simule' ? 'SIMULÉ' : 'RÉEL'} ${c.release}`} style={{ gridTemplateColumns: 'auto auto 1fr' }}>
              <span><Pill c={c.mode === 'simule' ? 'w' : 'g'}>{c.mode === 'simule' ? 'SIMULÉ' : 'RÉEL'}</Pill></span>
              <span><Pill c={c.passe ? 'g' : 'r'}>{c.passe ? 'Évaluation réelle passée' : 'Ne vaut pas évaluation'}</Pill></span>
              <span style={{ whiteSpace: 'normal' }}>release {c.release} · {c.le} · verdict {c.verdict} · invariants {c.invariants} · dépense {c.depenseLisible}{c.refus.length ? ` · motifs : ${c.refus.join(', ')}` : ''}{c.mode === 'simule' ? ` · ${c.banniere || 'SIMULÉ · aucune évaluation réelle de la qualité'}` : ''}</span>
            </div>
          ))}
          {b.campagnes.length === 0 && <Vide>Aucun rapport joint.</Vide>}
        </div>
      </Tuile>
      <Tuile titre="Benchmark approuvé">
        <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>Décision humaine, nominative. Exige une évaluation RÉELLE passée sur l’empreinte de la release et des fiches remplies. Ne publie rien · la publication reste un geste séparé.</p>
        {b.releases.filter((r) => r.statut === 'staged').length === 0 ? <p className="muted" style={{ margin: 0, fontSize: '12.5px' }}>Aucune release en attente.</p> : b.releases.filter((r) => r.statut === 'staged').map((r) => {
          const eligibles = b.fiches.filter((f) => f.releaseId === r.id && f.passe);
          return (
            <div key={r.id} style={{ padding: '10px 0', borderTop: '1px solid var(--edge2)' }}>
              <div className="kc" style={{ alignItems: 'center' }}><span className="mono">{r.empreinte.slice(0, 16)}…</span><Pill c={r.benchmarkApprouve ? 'g' : 'c'}>{r.benchmarkApprouve ? 'Benchmark approuvé' : 'Benchmark non approuvé'}</Pill></div>
              {!r.benchmarkApprouve && peutEvaluer && !r.revoquee && (eligibles.length === 0
                ? <p className="faint" style={{ margin: '8px 0 0', fontSize: 12 }}>Aucune évaluation réelle passée avec fiches remplies pour cette release · le geste est indisponible.</p>
                : <BenchmarkApprouve releaseId={r.id} evaluations={eligibles.map((f) => ({ id: f.id, libelle: `${f.le} · ${f.fiches} fiche(s)` }))} />)}
            </div>
          );
        })}
      </Tuile>
      <Tuile titre="Évaluations structurelles">
        {evaluations.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: '12.5px' }}>Aucune évaluation. Lance « Évaluer » sur une release en attente (onglet Releases) · structurelle, sur données synthétiques, sans appel modèle ni dépense.</p> : (
          <div className="atable">
            {evaluations.map((e) => (
              <div className="atr" key={e.id} aria-label={`Évaluation ${e.cible}`} style={{ gridTemplateColumns: 'auto 1fr' }}>
                <span><Pill c={e.passe ? 'g' : 'r'}>{e.passe ? 'Tests structurels réussis' : 'Tests structurels en échec'}</Pill></span>
                <span style={{ whiteSpace: 'normal' }}>{e.type} · {e.cible} · {e.creeLe}
                  {e.tests.length > 0 && <details><summary className="faint" style={{ cursor: 'pointer' }}>{e.tests.filter((t) => t.passe).length}/{e.tests.length} tests structurels</summary><ul className="muted" style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>{e.tests.map((t) => <li key={t.id}><b>{t.passe ? 'Réussi' : 'Échec'}</b> · <code className="mono">{t.id}</code> · {t.detail}</li>)}</ul></details>}
                  {e.benchmark.length > 0 && <details><summary className="faint" style={{ cursor: 'pointer' }}>Benchmark · {e.benchmark.length} cas non exécutés (budget requis)</summary><p className="muted" style={{ margin: '4px 0', fontSize: 12 }}>{e.benchmark[0]!.motif}</p><ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 12, columns: '18em' }}>{e.benchmark.map((x) => <li key={x.id}><code className="mono">{x.id}</code> · {x.titre}</li>)}</ul></details>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Tuile>
    </>
  );
}

/* ─────────────────────────────── Routage · exécutions · connaissances ─────────────────────────────── */

function Routage({ lignes }: { lignes: Array<{ profil: string; fournisseur: string; statut: string; note: string }> }) {
  return (
    <Tuile titre="Routage des profils" droite={<Pill>Lecture seule</Pill>}>
      <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>Le registre de capacités (profils logiques → fournisseurs configurés) n’existe pas encore. Ce tableau est déduit de l’adaptateur du résolveur. La configuration des fournisseurs viendra avec ce registre.</p>
      <div className="atable">
        {lignes.map((l) => (
          <div className="atr" key={l.profil} aria-label={`Profil ${l.profil}`} style={{ gridTemplateColumns: '.9fr auto 1.6fr' }}>
            <span className="mono">{l.profil}</span><span><Pill c={l.statut === 'configuré' ? 'g' : l.statut === 'absent' ? 'r' : ''}>{l.statut}</Pill></span>
            <span style={{ whiteSpace: 'normal' }}>{l.fournisseur}<small className="faint" style={{ display: 'block' }}>{l.note}</small></span>
          </div>
        ))}
      </div>
    </Tuile>
  );
}

function Executions({ autorise, runs, detail }: Extract<ContenuRegistre, { onglet: 'executions'; runs: VueRun[] }>) {
  if (!autorise) return <section className="tile" role="alert">Les traces d’exécution demandent la permission run.inspect_redacted.</section>;
  if (runs.length === 0) return <section className="tile" data-etat="vide"><b>Aucune exécution tracée.</b><p className="muted" style={{ margin: '6px 0 0', fontSize: '12.5px' }}>Chaque conversation Jarvis et chaque tâche studio résolue par le registre laisse ici une trace expurgée (empreintes, sources, modèle, coût).</p></section>;
  return (
    <div className="agrid2" style={{ alignItems: 'start' }}>
      <section className="tile">
        <div className="sech"><h2>Exécutions récentes</h2><span className="faint" style={{ fontSize: '12.5px' }}>{runs.length}</span></div>
        <div className="atable">
          {runs.map((r) => (
            <div className="atr" key={r.id} style={{ gridTemplateColumns: '1fr auto' }}>
              <span><Lien href={`${CHEMIN_REGISTRE}?onglet=executions&run=${r.id}`} aria-current={detail?.id === r.id ? 'page' : undefined}><b className="mono">{r.templateKey}</b></Lien><small className="faint" style={{ display: 'block' }}>{r.quand} · {r.modele}{r.sources.length ? ` · ${r.sources.length} source(s)` : ''}</small></span>
              <span><Statut s={r.statut} /></span>
            </div>
          ))}
        </div>
      </section>
      {detail ? (
        <section className="tile" data-run={detail.id}>
          <div className="sech"><h2 className="mono">{detail.templateKey}</h2><Statut s={detail.statut} /></div>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>Trace expurgée · ni le texte du prompt, ni la demande, ni la réponse ne sont conservés · leurs empreintes le sont.</p>
          <Fiche lignes={[
            ['Quand', detail.quand],
            ['Portée', <code className="mono" key="p">espace {detail.espace} · marque {detail.marque}</code>],
            ['Release', <code className="mono" key="r">{detail.releaseId ?? '·'} · {detail.releaseHash}</code>],
            ['Version', <code className="mono" key="v">{detail.version}</code>],
            ['Message compilé', <code className="mono" key="c">{detail.compiledHash}</code>],
            ['Snapshot de contexte', <code className="mono" key="s">{detail.contextSnapshotHash}</code>],
            ['Sortie', <code className="mono" key="o">{detail.outputHash ?? '·'}</code>],
            ['Modèle', detail.modele],
            ['Latence', detail.latenceMs === null ? '·' : `${detail.latenceMs} ms`],
            ['Coût', detail.coutUsd === null ? '·' : `${detail.coutUsd.toFixed(6)} $`],
            detail.budget !== null && ['Budget de contexte', detail.budget],
            detail.constats.length > 0 && ['Motifs', <code className="mono" key="m">{detail.constats.join(' · ')}</code>],
            detail.evaluation !== null && ['Évaluation', `Exécution d’évaluation · ${detail.evaluation.mode || '?'} · release ${detail.evaluation.releaseStatut || '?'} · approbation ${detail.evaluation.approbationId || '·'}`],
            ['Trace', <code className="mono" key="t">{detail.traceId ?? '·'}</code>],
          ]} />
          <b style={{ display: 'block', margin: '14px 0 6px', fontSize: 13 }}>Sources retenues</b>
          {detail.sources.length === 0 ? <p className="faint" style={{ margin: 0, fontSize: 12 }}>Aucune.</p> : <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>{detail.sources.map((s, i) => <li key={i}>{s.titre} · {s.type} · <code className="mono">{s.version}</code></li>)}</ul>}
          {detail.pieces.length > 0 && (<>
            <b style={{ display: 'block', margin: '14px 0 6px', fontSize: 13 }}>Pièces natives envoyées</b>
            <small className="faint">Chaque image a été lue par le serveur dans la portée de la tâche · la trace garde son empreinte, jamais ses octets ni son adresse.</small>
            <ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, display: 'grid', gap: 6 }}>{detail.pieces.map((p) => (
              <li key={`${p.nativeAttachmentIndex}-${p.bindingId}`} style={{ overflowWrap: 'anywhere' }}>index {p.nativeAttachmentIndex} · <code className="mono">{p.bindingId || '·'}</code> → <code className="mono">{p.assetId || '·'}</code>{p.assetVersion ? <> @ <code className="mono">{p.assetVersion}</code></> : null} · {p.mime || 'type ?'}{p.octets !== null ? ` · ${p.octets} octets` : ''}{p.largeur !== null && p.hauteur !== null ? ` · ${p.largeur}×${p.hauteur}` : ''}{p.jetonsMax !== null ? ` · au plus ${p.jetonsMax} jetons` : ''} · sha256 <code className="mono">{p.sha256 || '·'}</code></li>
            ))}</ul>
          </>)}
          {detail.couches.length > 0 && (<>
            <b style={{ display: 'block', margin: '14px 0 6px', fontSize: 13 }}>Couches de résolution</b>
            <ol className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>{detail.couches.map((c) => <li key={c.couche}>{c.couche} · <code className="mono">{c.empreinte.slice(0, 16)}…</code></li>)}</ol>
          </>)}
        </section>
      ) : <section className="tile"><p className="muted" style={{ margin: 0, fontSize: '12.5px' }}>Choisis une exécution pour l’expliquer.</p></section>}
    </div>
  );
}

function Connaissances({ publiees, retirees, brouillons }: { publiees: number; retirees: number; brouillons: number }) {
  return (
    <Tuile titre="Connaissances de l’équipe">
      <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>L’espace Connaissances reste la seule source · le résolveur y lit les versions PUBLIÉES et applicables à chaque marque, à chaque résolution. Une connaissance retirée sort du snapshot suivant.</p>
      <p style={{ margin: '0 0 12px', fontSize: 13 }}>{publiees} publiée(s) · {brouillons} brouillon(s) · {retirees} retirée(s)</p>
      <Lien className="btn sm pri" href="/admin/connaissances">Ouvrir les Connaissances</Lien>
    </Tuile>
  );
}
