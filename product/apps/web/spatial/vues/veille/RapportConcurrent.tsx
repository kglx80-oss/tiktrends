import type { DefOngletRapport } from '@tiktrends/core';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { AnnonceRetour, BoutonServeur } from '../marque/interactifs';
import { EtatVide, Vignette } from './base';

/**
 * « Rapport d'un concurrent » · `/brands/[id]/competitors/[nom]` (repris de
 * l'écran V5, sans fragment de maquette · vague 2). Composé avec le langage de
 * l'écran Concurrents de la maquette (`.ccstats`, `.ccfm`, `.vfeed`, `.todo`).
 * PRÉSENTATIONNEL · le rapport conservé vient de `getCompetitorReport` ;
 * l'analyse part par `analyzeCompetitorAction` (prix annoncé avant le clic,
 * barrière de dépense de l'action). Consulter ne relance jamais l'IA.
 */

type ActionFormulaire = (fd: FormData) => Promise<void>;

export interface PropsRapportConcurrent {
  brandId: string;
  marque: string;
  nom: string;
  initiale: string;
  /** « 0 crédit débité · … » ou « N crédits » · écrit sur le bouton. */
  prix: string;
  analyser: ActionFormulaire | null;
  /** `null` · concurrent pas encore analysé. */
  rapport: null | {
    detail: string;
    note: string | null;
    onglets: ReadonlyArray<{ href: string; libelle: string; cle: string }>;
    actif: DefOngletRapport;
    synthese: string | null;
    stats: ReadonlyArray<[string, string]>;
    medias: ReadonlyArray<{ libelle: string; part: number }>;
    ctas: ReadonlyArray<{ libelle: string; n: number }>;
    pages: ReadonlyArray<{ libelle: string; n: number }>;
    creas: ReadonlyArray<{ id: string; image: string | null; texte: string | null; cta: string | null; jours: number | null }>;
    /** Les insights de l'onglet actif · `tester` = l'amorce d'un projet Studios. */
    insights: ReadonlyArray<{ texte: string; tester: string | null }>;
  };
  retours: Record<string, string>;
}

const liste = (titre: string, xs: ReadonlyArray<{ libelle: string; n: number }>) => (
  <section className="tile" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
    <h2 style={{ margin: 0 }}>{titre}</h2>
    {xs.length === 0 ? <p className="faint" style={{ fontSize: 13, margin: 0 }}>Non renseigné.</p> : (
      <div className="ccfm">{xs.map((x) => <div key={x.libelle}><span style={{ overflowWrap: 'anywhere' }}>{x.libelle}</span><i className="amar"><b style={{ width: `${Math.round((x.n / Math.max(...xs.map((y) => y.n))) * 100)}%` }} /></i><b>{x.n}</b></div>)}</div>
    )}
  </section>
);

export function RapportConcurrent(p: PropsRapportConcurrent) {
  const r = p.rapport;
  const bouton = (libelle: string) => (
    <BoutonServeur className="btn sm pri" action={p.analyser} champs={{ brandId: p.brandId, name: p.nom }} raison="Réservé aux administrateurs de l’espace" attente="Analyse en cours…">
      <Ic n="spark" />{libelle} · {p.prix}
    </BoutonServeur>
  );
  return (
    <Vue>
      <EnTete titre={p.nom} sous={r ? r.detail : 'Concurrent non encore analysé'} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <Lien className="btn sm" href="/veille/concurrents"><Ic n="back" />Concurrents de {p.marque}</Lien>
        {r && <span style={{ marginLeft: 'auto' }}>{bouton('Rafraîchir l’analyse')}</span>}
      </div>
      {r?.note && <div className="banner"><Ic n="warn" /><span>{r.note}</span></div>}
      {!r ? (
        <section className="tile" data-geste="analyser" style={{ display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center', padding: 28 }}>
          <span className="av" style={{ width: 54, height: 54, fontSize: 20 }}>{p.initiale}</span>
          <h2 style={{ margin: 0 }}>Analyser {p.nom}</h2>
          <p className="muted" style={{ margin: 0, maxWidth: 470, fontSize: 13.5 }}>Jarvis étudie les textes de ses annonces disponibles pour proposer des accroches et des angles à tester. Une annonce active ne prouve pas sa rentabilité.</p>
          <div className="chips" style={{ justifyContent: 'center' }}>{['Hooks', 'Angles', 'USP', 'Désirs', 'Émotions', 'Thèmes'].map((c) => <span className="pill" key={c}>{c}</span>)}</div>
          {bouton('Analyser ce concurrent')}
          <small className="faint">Coût annoncé avant le lancement · le résultat est conservé, consulter ce rapport ne relance pas l’IA.</small>
        </section>
      ) : (
        <>
          <SousNav items={r.onglets} actif={r.onglets.find((o) => o.cle === r.actif.cle)!.href} />
          {r.actif.cle === 'overview' && (
            <div style={{ display: 'grid', gap: 16 }} data-geste="apercu">
              {r.synthese && <section className="tile"><div className="lbl">Synthèse</div><p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{r.synthese}</p></section>}
              <section className="tile"><div className="ccstats">{r.stats.map(([k, v]) => <span key={k}><small>{k}</small><b>{v}</b></span>)}</div></section>
              <section className="tile" style={{ display: 'grid', gap: 10 }}>
                <h2 style={{ margin: 0 }}>Formats</h2>
                {r.medias.length === 0 ? <p className="faint" style={{ fontSize: 13, margin: 0 }}>Non renseigné.</p>
                  : <div className="ccfm">{r.medias.map((m) => <div key={m.libelle}><span>{m.libelle}</span><i className="amar"><b style={{ width: `${m.part}%` }} /></i><b>{m.part} %</b></div>)}</div>}
              </section>
              <div className="grid2">{liste('CTA les plus utilisés', r.ctas)}{liste('Pages d’atterrissage', r.pages)}</div>
            </div>
          )}
          {r.actif.cle === 'creatives' && (
            r.creas.length === 0 ? <EtatVide titre="Aucune créative conservée" texte="Rafraîchis l’analyse pour relever ses annonces." /> : (
              <div className="vfeed" data-geste="creatives">
                {r.creas.map((c) => (
                  <article className="vitem" key={c.id}>
                    <div style={{ position: 'relative' }}><Vignette image={c.image} />{c.jours ? <span className="scale">{c.jours} j</span> : null}</div>
                    {c.texte && <p className="muted" style={{ margin: 0, fontSize: 12.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.texte}</p>}
                    {c.cta && <div className="row"><span className="pill c">{c.cta}</span></div>}
                  </article>
                ))}
              </div>
            )
          )}
          {r.actif.champ && (
            r.insights.length === 0 ? (
              <EtatVide titre="Rien de notable sur cette dimension" texte="Relance « Rafraîchir l’analyse » en haut de page pour (re)générer les insights." />
            ) : (
              <section className="tile" data-geste="insights" style={{ display: 'grid', gap: 10 }}>
                <div className="sech" style={{ margin: 0 }}><h2>{r.actif.titre}</h2><span className="faint" style={{ fontSize: '12.5px' }}>{r.insights.length}</span></div>
                {r.actif.pastilles ? (
                  <div className="chips" style={{ marginTop: 0 }}>{r.insights.map((x) => <span className="pill" key={x.texte}>{x.texte}</span>)}</div>
                ) : (
                  <div className="todo">
                    {r.insights.map((x, i) => (
                      <div className="row" key={`${i}-${x.texte}`}>
                        <span className="ico"><b style={{ fontSize: 12 }}>{String(i + 1).padStart(2, '0')}</b></span>
                        <div className="t"><span style={{ fontSize: 13.5 }}>{x.texte}</span></div>
                        {x.tester && <Lien className="btn sm" href={x.tester} title="Tester cet angle dans un projet Studios"><Ic n="spark" />Tester</Lien>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          )}
        </>
      )}
      <AnnonceRetour messages={p.retours} />
    </Vue>
  );
}
