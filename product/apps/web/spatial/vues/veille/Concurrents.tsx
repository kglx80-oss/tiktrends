import { EnTete, Ic, Lien, Vue } from '../../communs';
import { EtatVide, SousNavVeille } from './base';
import { BoutonSuivi } from './client';

/**
 * « Concurrents » · `docs/spatial/reference/concurrents.html`. Les concurrents
 * de la MARQUE ACTIVE : ceux de sa fiche (`brands.competitors`) pas encore
 * scannés, et ceux dont un rapport existe (`agent_memory`, écrit par
 * `analyzeCompetitorAction`). Scanner = l'action existante · prix en crédits
 * affiché sur le bouton, avant le clic. Le rapport détaillé reste
 * `/brands/[id]/competitors/[nom]`.
 */
export interface SuggestionConcurrent { nom: string; initiale: string; fond: string; detail: string; cible: string }
export interface ConcurrentScanne {
  nom: string; initiale: string; fond: string; detail: string; nouveautes: string | null;
  stats: ReadonlyArray<[string, string]>;
  medias: ReadonlyArray<{ libelle: string; part: number }>;
  accroches: readonly string[];
  angle: string;
  voir: string; /** Le rapport détaillé (admin, comme la page V5) · `null` sinon. */ analyse: string | null; suivi: boolean;
}
export interface PropsConcurrents {
  pastilleRadar: string | null;
  marque: { id: string; nom: string } | null;
  /** L'action de scan (enveloppe de `analyzeCompetitorAction`) · `null` quand ce rôle ne peut pas scanner. */
  scanner: ((fd: FormData) => Promise<void>) | null;
  refus: string | null;
  cout: number;
  suggestions: ReadonlyArray<SuggestionConcurrent>;
  scannes: ReadonlyArray<ConcurrentScanne>;
}

export function Concurrents(p: PropsConcurrents) {
  const prix = `${p.cout} crédit${p.cout > 1 ? 's' : ''}`;
  if (!p.marque) {
    return (
      <Vue>
        <EnTete titre="Concurrents" sous="Les concurrents de ta marque active, et leurs pubs" />
        <SousNavVeille actif="/veille/concurrents" pastilleRadar={p.pastilleRadar} />
        <EtatVide icone="users" titre="Choisis d’abord une marque" texte="Les concurrents se rattachent à une marque · choisis-la dans le rail, ou crée-la." action={{ href: '/brands', libelle: 'Ouvrir les marques' }} />
      </Vue>
    );
  }
  return (
    <Vue>
      <EnTete titre="Concurrents" sous={`Les concurrents de ${p.marque.nom} et ce que leurs pubs montrent`} />
      <SousNavVeille actif="/veille/concurrents" pastilleRadar={p.pastilleRadar} />
      <form className="tile ccscan" id="ccform" autoComplete="off" action={p.scanner ?? undefined}>
        <div style={{ flex: 1, minWidth: '240px', display: 'grid', gap: '4px' }}>
          <h2 style={{ margin: 0 }}>Scanner un concurrent</h2>
          <p className="faint" style={{ margin: 0, fontSize: '12.5px' }}>Nom de la marque. Jarvis relève ses pubs dans la bibliothèque Meta, puis en analyse les angles · {prix} pour l’analyse, remboursés si elle échoue.</p>
        </div>
        <label className="ccin"><Ic n="search" /><input id="ccq" name="name" required maxLength={120} placeholder="ex. nom d’une marque concurrente" aria-label="Concurrent à scanner" disabled={!p.scanner} /></label>
        <button className="btn pri" type="submit" name="brandId" value={p.marque.id} disabled={!p.scanner} title={p.refus ?? undefined}><Ic n="spark" />Scanner · {prix}</button>
      </form>

      <section className="sec">
        <div className="sech"><h2>Dans ta fiche, pas encore scannés</h2><span className="faint" style={{ fontSize: '12.5px' }}>Les concurrents renseignés dans la fiche {p.marque.nom}</span></div>
        {p.suggestions.length > 0 ? (
          <div className="ccsug">
            {p.suggestions.map((s) => (
              <div className="tile ccs" key={s.nom}>
                <span className="av" style={{ background: s.fond }}>{s.initiale}</span>
                <div style={{ flex: 1, minWidth: 0 }}><strong>{s.nom}</strong><small className="faint">{s.detail}</small></div>
                <button className="btn sm" type="submit" form="ccform" formNoValidate name="cible" value={s.cible} disabled={!p.scanner} title={p.refus ?? `Scanner ${s.nom} · ${prix}`}>Scanner · {prix}</button>
              </div>
            ))}
          </div>
        ) : <p className="faint" style={{ fontSize: '12.5px' }}>Tous les concurrents de la fiche sont scannés · ajoute-en dans la <Lien href={`/brands/${p.marque.id}`}>fiche marque</Lien>.</p>}
      </section>

      <section className="sec">
        <div className="sech"><h2>Concurrents scannés · {p.scannes.length}</h2></div>
        {p.scannes.length > 0 ? (
          <div className="ccgrid">
            {p.scannes.map((c) => (
              <article className="tile ccc" key={c.nom}>
                <div className="cch">
                  <span className="av" style={{ background: c.fond, width: '46px', height: '46px' }}>{c.initiale}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><h3>{c.nom}</h3><small className="faint">{c.detail}</small></div>
                  {c.nouveautes && <span className="pill c">{c.nouveautes}</span>}
                </div>
                <div className="ccstats">{c.stats.map(([k, v]) => <span key={k}><small>{k}</small><b>{v}</b></span>)}</div>
                <div className="ccfm">{c.medias.map((m) => <div key={m.libelle}><span>{m.libelle}</span><i className="amar"><b style={{ width: `${m.part}%` }} /></i><b>{m.part} %</b></div>)}</div>
                <div className="cchk"><span className="lbl" style={{ margin: 0 }}>Accroches qui durent</span>{c.accroches.map((h) => <p key={h}>« {h} »</p>)}</div>
                <div className="ccang"><Ic n="bulb" /><span><b>Angle principal :</b> {c.angle}</span></div>
                <div className="kc">
                  <Lien className="btn sm pri" href={c.voir}>Voir ses pubs</Lien>
                  {c.analyse
                    ? <Lien className="btn sm" href={c.analyse}><Ic n="chat" />Analyse détaillée</Lien>
                    : <button className="btn sm" type="button" disabled title="Le rapport détaillé est réservé aux administrateurs"><Ic n="chat" />Analyse détaillée</button>}
                  <BoutonSuivi plateforme="meta" nom={c.nom} initial={c.suivi} />
                  <button className="btn sm" type="button" disabled aria-label={`Retirer ${c.nom} · depuis la fiche marque`} title="Les concurrents se gèrent dans la fiche de la marque" style={{ marginLeft: 'auto' }}><Ic n="x" /></button>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="faint" style={{ fontSize: '12.5px' }}>Aucun concurrent scanné pour l’instant · le scan relève ses pubs et les garde ici.</p>}
      </section>
    </Vue>
  );
}
