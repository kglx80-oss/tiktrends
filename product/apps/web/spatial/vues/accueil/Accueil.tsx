import type { CSSProperties } from 'react';
import type {
  AFaireMaintenant, ChiffresClesMeta, KpiAccueil, CarteConfiguration, CarteQuoiIterer, EtapeBoucleAccueil, LigneReprendre, NouveauteAccueil,
  PeriodeReporting, RaccourciAccueil, SyntheseReporting, TonVariation,
} from '@tiktrends/core';
import { CREA_ENTIERE, EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { BarreJarvis, CarteConfigurationAccueil, ChoixPeriode } from './interactifs';
import { AssistantAccueil } from './assistant';
import type { OngletAccueil } from './Analytics';
import { ChiffresCles } from './ChiffresCles';

/**
 * L'Accueil Spatial (« Bonjour … ») · `docs/spatial/reference/accueil.html`,
 * balisage à l'identique. PRÉSENTATIONNEL · tout arrive en props, la page
 * (`app/(spatial)/sp/dashboard`) lit les sources réelles sous leurs droits.
 * Un bloc sans source est ABSENT (`null`) ou dit son état vide · jamais les
 * exemples de la maquette.
 */

export interface LienSimple { libelle: string; href: string }

/**
 * Le Reporting Meta · `chiffres` · LES chiffres clés (`chiffresClesMeta`, les
 * mêmes qu'Analytics, Jarvis et le Radar · D2), hors maquette · absents, rien
 * ne s'affiche (la parité avec la maquette n'en dépend pas). Sous eux, le
 * détail des annonces suivies sur la période choisie (`mesures` / `vide`).
 */
export type EtatReporting = { chiffres?: ChiffresClesMeta } & (
  | { etat: 'mesures'; sous: string; periode: PeriodeReporting; rapides: ReadonlyArray<{ libelle: string; du: string; au: string }>; synthese: SyntheseReporting }
  | { etat: 'vide'; sous: string; periode: PeriodeReporting; rapides: ReadonlyArray<{ libelle: string; du: string; au: string }>; message: string; lien: LienSimple | null }
  | { etat: 'connecter'; sous: string; message: string; lien: LienSimple | null });

export type EtatQuoiIterer =
  | { etat: 'liste'; cartes: CarteQuoiIterer[]; suite: { texte: string; detail: string } | null }
  | { etat: 'message'; message: string; lien: LienSimple | null };

export interface PropsAccueil {
  surtitre: string;
  salutation: string;
  jarvis: { titre: string; sources: readonly string[]; pastilles: ReadonlyArray<{ libelle: string; question: string }> } | null;
  raccourcis: readonly RaccourciAccueil[];
  attente: string | null;
  maintenant: AFaireMaintenant | null;
  configuration: { carte: CarteConfiguration; questionnaire: string; fiche: string | null } | null;
  reporting: EtatReporting | null;
  iterer: EtatQuoiIterer | null;
  boucle: { etapes: readonly EtapeBoucleAccueil[]; href: string } | null;
  nouveautes: readonly NouveauteAccueil[] | null;
  /** `tous` · `null` quand la liste des projets ne s'ouvrirait pas (capacité coupée) · aucun geste mort. `etat` · un état dégradé dit (`role="status"`). */
  reprendre: { lignes: readonly LigneReprendre[]; tous: string | null; vide: { message: string; lien: LienSimple | null; etat?: 'coupee' | 'erreur' } | null } | null;
  /*
   * Hors maquette · gestes de l'ancien Accueil portés (vague 2 Spatial v4).
   * Absents, rien ne s'affiche (la parité avec la maquette n'en dépend pas).
   */
  /** Accueil · Analytics · seulement si le rôle ouvre Analytics (`resoudreAccueil`). */
  onglets?: readonly OngletAccueil[];
  /** Ce que le rôle n'ouvre pas, et pourquoi (`noteAccesAccueil`). */
  note?: string | null;
  /** Les KPI de l'Accueil (`kpiAccueil`) · chaque source lue sous son droit, une source fermée se tait. */
  kpi?: readonly KpiAccueil[];
  /** L'assistant · quand Jarvis est fermé mais que l'action `askAssistant` admet le rôle. */
  assistant?: { pret: boolean; prix: string; suggestions: readonly string[] } | null;
}

/** Une vignette de publicité (`div.ad` de la maquette) · le média réel, ou un cadre vide. */
function Pub({ url, r916 = false, classe = '', bande = ' ' }: { url: string | null; r916?: boolean; classe?: string; bande?: string }) {
  return (
    <div className={`ad ${r916 ? 'r916' : ''}  ${classe}`}>
      <div className="ph">{url && <img src={url} alt="" loading="lazy" style={CREA_ENTIERE} />}</div>
      <div className="band">{bande}</div>
    </div>
  );
}

const COULEUR_TON: Readonly<Record<TonVariation, string>> = { neutre: 'var(--fg2)', bon: 'var(--good)', mauvais: 'var(--clair-baisse,#ffb0bd)' };
const petit = (taille: string, plus: CSSProperties = {}): CSSProperties => ({ fontSize: taille, ...plus });

function Reporting({ r }: { r: EtatReporting }) {
  return (
    <section className="sec" id="reporting">
      <div className="sech">
        <span className="logo2" style={{ background: '#0467df', width: 34, height: 34, fontSize: 13 }}>M</span>
        <div><h2>Reporting Meta</h2><p className="faint" style={petit('12.5px')}>{r.sous}</p></div>
        {r.etat !== 'connecter' && <ChoixPeriode periode={r.periode} rapides={r.rapides} />}
      </div>
      {r.chiffres && <div style={{ margin: '4px 0 16px' }}><ChiffresCles c={r.chiffres} /></div>}
      {/* La période choisie ne règle que le détail des annonces suivies · les chiffres clés ont leur fenêtre, dite dans leur phrase de source. */}
      {r.etat !== 'connecter' && <p className="dperl faint">{r.chiffres ? `Détail de tes annonces suivies · ${r.periode.libelle}` : r.periode.libelle}</p>}
      {r.etat === 'mesures' ? (
        <>
          <div className="dkpis">
            {r.synthese.kpis.map((k) => (
              <div className="tile dk" key={k.libelle}>
                <span className="lbl">{k.libelle}</span>
                <span className="v num">{k.valeur}</span>
                <span className="d" style={{ color: COULEUR_TON[k.ton] }}>{k.variation}</span>
                <svg className={`kspk ${k.ton === 'mauvais' ? 'bad' : ''}`} viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><polyline points={k.courbe} /></svg>
              </div>
            ))}
          </div>
          <div className="tile" style={{ marginTop: 14 }}>
            <div className="sech" style={{ margin: '0 0 6px' }}><div className="lbl">Dépense par jour et ROAS</div><span className="lg"><i className="b" />Dépense <i className="l" />ROAS</span></div>
            <div className="dcw">
              <svg className="dchart" viewBox="0 0 1200 300" role="img" aria-label={r.synthese.graphique.libelle}>
                <g className="grid">{r.synthese.graphique.grille.map((y, i) => <line key={i} x1="64" x2="1148" y1={y} y2={y} />)}</g>
                <g className="axl">{r.synthese.graphique.gauche.map((t, i) => <text key={i} x="56" y={t.y} textAnchor="end">{t.texte}</text>)}</g>
                <g className="axr">{r.synthese.graphique.droite.map((t, i) => <text key={i} x="1156" y={t.y}>{t.texte}</text>)}</g>
                <g className="bars">{r.synthese.graphique.barres.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.largeur} height={b.hauteur} rx="3"><title>{b.titre}</title></rect>)}</g>
                {r.synthese.graphique.ligne && <polyline className="rl" points={r.synthese.graphique.ligne} />}
                {r.synthese.graphique.dernier && <circle className="rp" cx={r.synthese.graphique.dernier.cx} cy={r.synthese.graphique.dernier.cy} r="4.5" />}
                <g className="axb">{r.synthese.graphique.bas.map((t, i) => <text key={i} x={t.x} y="292" textAnchor="middle">{t.texte}</text>)}</g>
              </svg>
            </div>
          </div>
        </>
      ) : (
        <div className="tile" style={{ marginTop: 14 }}>
          <p className="muted" style={petit('13px')}>{r.message}</p>
          {r.lien && <Lien className="btn sm pri" href={r.lien.href} style={{ marginTop: 10 }}>{r.lien.libelle}</Lien>}
        </div>
      )}
    </section>
  );
}

function QuoiIterer({ q }: { q: EtatQuoiIterer }) {
  return (
    <section className="sec" id="suggestions">
      <div className="sech">
        <span className="ico"><Ic n="spark" /></span>
        <div><h2>Quoi itérer, d’après tes performances</h2><p className="faint" style={petit('12.5px')}>Une ligne par gagnante prouvée, dans l’ordre du plan d’itération. Une seule variable change à chaque fois.</p></div>
      </div>
      {q.etat === 'liste' ? (
        <>
          <div className="qis">
            {q.cartes.map((c) => (
              <article className={`tile qi ${c.recommande ? 'rec' : ''}`} key={c.adId}>
                <div className="qv"><span className="qn">{c.rang}</span><Pub url={c.vignette} r916={c.vertical} /></div>
                <div className="qp">
                  <span className={`pill ${c.etiquette.classe}`} style={{ justifySelf: 'start' }}>{c.etiquette.texte}</span>
                  <strong>{c.nom}</strong>
                  {/* Mini-tuiles · 72 px minimum, la troisième passe à la ligne en mobile
                      plutôt que de rogner leurs libellés (« RO… », « Dép… », G12). */}
                  <div className="qk" style={{ flexWrap: 'wrap' }}>{c.indicateurs.map((i) => <div key={i.libelle} style={{ flex: '1 1 72px' }}><small>{i.libelle}</small><b className={i.classe}>{i.valeur}</b></div>)}</div>
                </div>
                <div className="qb">
                  {c.recommande && <span className="pill g" style={{ justifySelf: 'start' }}>Recommandé</span>}
                  <h3>{c.titre}</h3>
                  <p className="muted" style={petit('13px')}>{c.raison}</p>
                  {/* Pastilles · `white-space:nowrap` dans la maquette · « Garde · l’accroche,
                      le visuel d’ouverture et le format » élargissait la carte au-delà de
                      l’écran en mobile, titre et texte avec elle (G12). */}
                  <div className="kc">
                    {c.signaux.map((s) => <span className={`pill ${s.classe}`} key={s.texte} style={{ whiteSpace: 'normal' }}>{s.texte}</span>)}
                    {c.garde && <span className="pill" style={{ whiteSpace: 'normal' }}><Ic n="lock" />{c.garde}</span>}
                  </div>
                  <div className="kc" style={{ alignItems: 'center' }}>
                    <span className="dots" aria-label={c.preuve.libelle}>{[0, 1, 2].map((i) => <b key={i} className={i < c.preuve.niveau ? '' : 'o'} />)}</span>
                    <span className="faint" style={petit('11.5px')}>{c.note}</span>
                  </div>
                </div>
                <div className="qa">
                  {c.action
                    ? <><Lien className="btn pri sm" href={c.action.href}><Ic n="loop" />{c.action.libelle}</Lien><small>Le devis s’affiche avant toute génération</small></>
                    : <small>La création est réservée aux rôles qui créent des projets</small>}
                </div>
              </article>
            ))}
          </div>
          {q.suite && <div className="qok"><Ic n="check" /><span><b>{q.suite.texte}</b> · {q.suite.detail}</span></div>}
        </>
      ) : (
        <div className="tile"><p className="muted" style={petit('13px')}>{q.message}</p>{q.lien && <Lien className="btn sm" href={q.lien.href} style={{ marginTop: 10 }}>{q.lien.libelle}</Lien>}</div>
      )}
    </section>
  );
}

function Boucle({ b }: { b: NonNullable<PropsAccueil['boucle']> }) {
  return (
    <section className="sec">
      <div className="sech">
        <span className="ico"><Ic n="loop" /></span>
        <div><h2>Ta boucle d’itération</h2><p className="faint" style={petit('12.5px')}>Où en est chaque test, et ce qui attend ton action</p></div>
        <Lien className="btn sm pri" href={b.href} style={{ marginLeft: 'auto' }}><Ic n="loop" />Ouvrir la boucle</Lien>
      </div>
      <div className="pipe">
        {b.etapes.map((e) => (
          <Lien className={`tile stage ${e.alerte ? 'alert' : ''}`} href={e.href} key={e.cle}>
            <div className="sh">
              <span className="ico"><Ic n={e.icone} /></span><span className="big3 num">{e.n}</span>
              {e.vignettes.length > 0 && <span className="stack">{e.vignettes.map((v, i) => <Pub key={i} url={v.url} r916={v.vertical} classe={v.gagnante ? 'won' : ''} />)}</span>}
            </div>
            <strong>{e.titre}</strong><span className="muted" style={petit('12.5px')}>{e.sous}</span>
            {e.progression && <><div className="bar"><i><b style={{ width: `${e.progression.part}%` }} /></i><span>{e.progression.texte}</span></div><span className="faint" style={petit('11.5px')}>{e.progression.note}</span></>}
            {e.action
              // Le libellé (« Conclure le lot #3 ») débordait du bouton `nowrap` dans une étape de ~160 px (G14).
              ? <span className={`btn sm ${e.alerte ? 'pri' : ''}`} style={{ marginTop: 'auto', alignSelf: 'flex-start', whiteSpace: 'normal', maxWidth: '100%' }}>{e.alerte && <span className="pulse" style={{ width: 7, height: 7 }} />}{e.action}</span>
              : <span className="faint" style={petit('11.5px', { marginTop: 'auto' })} />}
          </Lien>
        ))}
      </div>
    </section>
  );
}

export function Accueil(p: PropsAccueil) {
  return (
    <Vue>
      <EnTete titre={p.salutation} sous={p.surtitre} />
      {p.onglets && p.onglets.length > 0 && <SousNav items={p.onglets} actif={p.onglets.find((o) => o.actif)?.href ?? ''} />}
      {p.note && <p className="faint" role="note" style={petit('12.5px', { margin: '6px 0 0' })}>{p.note}</p>}
      {p.jarvis && <BarreJarvis titre={p.jarvis.titre} sources={p.jarvis.sources} pastilles={p.jarvis.pastilles} />}
      {p.assistant && <AssistantAccueil {...p.assistant} />}
      {p.raccourcis.length > 0 && (
        <nav className="qrow" aria-label="Raccourcis">
          {p.raccourcis.map((r) => (
            <Lien className="qa2 qa3" href={r.href} data-route={r.route} key={r.cle} style={r.pastille ? { position: 'relative' } : undefined}>
              <span className="ico"><Ic n={r.icone} /></span>
              {/* Titre et détail passent à la ligne · tronqués à ~100 px sur cinq colonnes
                  (« Nouveau pro… », « Formats & V… », 1280 px, G13). */}
              <span className="qt"><strong style={{ whiteSpace: 'normal' }}>{r.titre}</strong><small style={{ whiteSpace: 'normal' }}>{r.sous}</small></span>
              {r.pastille && <span className="qbadge" title={r.pastille.titre}>{r.pastille.valeur}</span>}
            </Lien>
          ))}
        </nav>
      )}
      {p.attente && <p className="lead2" style={{ marginTop: 18 }}>{p.attente}</p>}
      {p.kpi && p.kpi.length > 0 && (
        <section className="sec" data-section="kpi" aria-label="Indicateurs de l’Accueil">
          <div className="dkpis">
            {p.kpi.map((k) => (
              <Lien className="tile dk" href={k.href} key={k.cle} data-kpi={k.cle} title={`Source : ${k.source}`}>
                <span className="lbl">{k.libelle}</span>
                <span className="v num">{k.valeur}</span>
                <span className="d faint">{k.detail} · {k.periode}</span>
              </Lien>
            ))}
          </div>
        </section>
      )}
      {p.maintenant && (
        <Lien className="tile nowbar" href={p.maintenant.href}>
          <span className="pulse" />
          <div style={{ flex: 1, minWidth: 220 }}><strong>{p.maintenant.titre}</strong><p className="muted" style={petit('13px')}>{p.maintenant.detail}</p></div>
          <span className="btn pri sm">{p.maintenant.action}</span>
        </Lien>
      )}
      {p.configuration && <CarteConfigurationAccueil carte={p.configuration.carte} questionnaire={p.configuration.questionnaire} fiche={p.configuration.fiche} />}
      {p.reporting && <Reporting r={p.reporting} />}
      {p.iterer && <QuoiIterer q={p.iterer} />}
      {p.boucle && <Boucle b={p.boucle} />}
      {(p.nouveautes || p.reprendre) && (
        <section className="sec grid2">
          <div style={{ display: 'contents' }}>
            {p.nouveautes && (
              <div className="tile">
                <div className="lbl">Quoi de neuf</div>
                {p.nouveautes.length > 0 ? (
                  <div className="feed">
                    {p.nouveautes.map((n) => (
                      <div className="it" key={n.id}>
                        <span className="ico" style={n.couleur ? { color: `var(--${n.couleur})` } : undefined}><Ic n={n.icone} /></span>
                        <div><p style={{ color: 'var(--fg)' }}>{n.texte}</p><small>{n.quand}</small></div>
                        {n.action && <Lien className="btn sm" href={n.action.href}>{n.action.libelle}</Lien>}
                      </div>
                    ))}
                  </div>
                ) : <p className="muted" style={petit('13px', { marginTop: 8 })}>Rien de neuf pour l’instant · tes notifications apparaîtront ici.</p>}
              </div>
            )}
            {p.reprendre && (
              <div className="tile">
                <div className="sech" style={{ margin: '0 0 10px' }}><div className="lbl">Reprendre</div>{p.reprendre.tous && <Lien className="more" href={p.reprendre.tous}>Tous les projets <Ic n="arrow" /></Lien>}</div>
                {p.reprendre.lignes.length > 0 ? (
                  <div className="grid2">
                    {p.reprendre.lignes.map((l) => (
                      <Lien href={l.href} className="prow" key={l.id}>
                        <span style={{ width: 44, flexShrink: 0 }}><Pub url={l.vignette} /></span>
                        <div className="t"><strong style={{ fontSize: '12.5px', display: 'block' }}>{l.titre}</strong><small className="faint" style={petit('10.5px')}>{l.detail}</small></div>
                      </Lien>
                    ))}
                  </div>
                ) : p.reprendre.vide && (
                  <>
                    <p className="muted" style={petit('13px')} role={p.reprendre.vide.etat ? 'status' : undefined} data-reprendre-etat={p.reprendre.vide.etat}>{p.reprendre.vide.message}</p>
                    {p.reprendre.vide.lien && <Lien className="btn sm pri" href={p.reprendre.vide.lien.href} style={{ marginTop: 10 }}>{p.reprendre.vide.lien.libelle}</Lien>}
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </Vue>
  );
}
