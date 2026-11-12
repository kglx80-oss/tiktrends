import { LARGEUR_MIN_TABLE_TELEPHONE, styleTableDefilante, type LigneDureesMesurees, type LigneTacheAdmin } from '@tiktrends/core';
import { Ic, Lien, Vue } from '../../communs';
import { Kpis, TeteAdmin, Vide, type BandeauAdmin, type KpiAdmin } from './base';
import { BoutonExportTour, PaginationTour, RechercheListeTour, type EtatExport, type PaginationListeTour } from './client';

/**
 * « Tâches de génération » · suivi opérationnel (RJ JB01) · les tâches de
 * TOUTE la plateforme (`studio_jobs`), relues au serveur. PRÉSENTATIONNEL ·
 * LECTURE SEULE · des liens (segments, pages, « Déclarer un incident », le
 * rapprochement existant), la recherche et l'export · aucune relance, aucune
 * annulation d'ici. Les règles (segments, seuil « bloquée », coût lu, erreur
 * bornée) vivent au noyau (`spatial/admin/taches-admin.ts`) · « Durées
 * mesurées » et le seuil appliqué de chaque tâche aussi
 * (`spatial/admin/durees-taches.ts`).
 */
export const CHEMIN_TACHES_ADMIN = '/admin/taches';
export const COLONNES_GRILLE_TACHES = 'minmax(0,1.1fr) .9fr minmax(0,1fr) minmax(0,.9fr) .55fr 1fr minmax(0,1.6fr) auto';
export const COLONNES_GRILLE_DUREES = 'minmax(0,1.3fr) .55fr .55fr .75fr .75fr .8fr minmax(0,2.2fr)';
export const COLONNES_GRILLE_PHASES = '.55fr .9fr .55fr .7fr .7fr minmax(0,2fr)';
/** Les cibles de la page · 44 px au moins (doigt). */
export const CIBLE_44 = { minHeight: 44, display: 'inline-flex', alignItems: 'center' } as const;

export interface PropsTaches {
  bandeau: BandeauAdmin;
  kpis: readonly KpiAdmin[];
  colonnes: readonly string[];
  segments: ReadonlyArray<{ cle: string; libelle: string; href: string; actif: boolean }>;
  segment: string;
  definition: string;
  q: string;
  lignes: ReadonlyArray<LigneTacheAdmin & { cellules: readonly string[]; declarer: boolean; hrefIncident: string | null; hrefRapprocher: string | null }>;
  /** Tâches lues, tous filtres confondus · pour dire pourquoi la liste est vide. */
  total: number;
  pagination: PaginationListeTour | null;
  export: EtatExport;
  /** La lecture bornée, dite · `null` quand tout est lu. */
  limite: string | null;
  note: string;
  /** « Durées mesurées » · ce que le propriétaire lit et rapporte. */
  durees: {
    colonnes: readonly string[];
    lignes: readonly LigneDureesMesurees[];
    colonnesPhases: readonly string[];
    phases: ReadonlyArray<{ cle: string; cellules: readonly string[] }>;
    lecture: string;
    methode: string;
    limite: string | null;
  };
}

export function Taches(p: PropsTaches) {
  return (
    <Vue>
      <TeteAdmin titre="Tâches de génération" sous="tâches" actif={CHEMIN_TACHES_ADMIN} bandeau={p.bandeau} />
      <Kpis items={p.kpis} />
      <section className="tile sec" data-section="taches">
        <div className="sech">
          <h2>Tâches</h2>
          <RechercheListeTour chemin={CHEMIN_TACHES_ADMIN} q={p.q} segment={p.segment} id="tache-q" placeholder="Rechercher une tâche" aria="Rechercher une tâche (opération, état, projet, espace, erreur, identifiant)" style={{ minHeight: 44 }} />
          <BoutonExportTour entree={{ ecran: 'taches', q: p.q, segment: p.segment }} etat={p.export} unite={{ un: 'tâche', plusieurs: 'tâches' }} cible={CIBLE_44} />
        </div>
        <nav className="kc" aria-label="Segments des tâches" style={{ marginBottom: 8 }}>
          {p.segments.map((s) => <Lien key={s.cle} className="chip" href={s.href} aria-current={s.actif ? 'page' : undefined} data-segment-tache={s.cle} style={CIBLE_44}>{s.libelle}</Lien>)}
        </nav>
        <p className="faint" data-definition="" style={{ fontSize: '12.5px', margin: '0 0 10px' }}>{p.definition}</p>
        <div className="atable" data-table="taches" style={styleTableDefilante(LARGEUR_MIN_TABLE_TELEPHONE.taches)}>
          <div className="atr ath" style={{ gridTemplateColumns: COLONNES_GRILLE_TACHES }}>{p.colonnes.map((c) => <span key={c}>{c}</span>)}<span /></div>
          {p.lignes.map((l) => (
            <div className="atr" key={l.id} style={{ gridTemplateColumns: COLONNES_GRILLE_TACHES }} data-tache={l.id} data-segment={l.segment ?? ''} data-seuil-ms={l.seuil.ms} data-seuil-source={l.seuil.source}>
              {l.cellules.map((c, i) => (
                <span key={i} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                  {i === 0 ? <b>{c}</b> : i === 1 ? <span className={`pill ${l.etat.classe}`} style={{ whiteSpace: 'normal' }}>{c}</span> : i === 6 ? <span className="faint">{c}</span> : c}
                </span>
              ))}
              <span data-gestes="">
                {l.hrefIncident && <Lien className="btn sm" href={l.hrefIncident} style={CIBLE_44} data-declarer={l.id}><Ic n="warn" />Déclarer un incident</Lien>}
                {l.hrefRapprocher && <Lien className="btn sm" href={l.hrefRapprocher} style={CIBLE_44} data-rapprocher={l.id}>Rapprocher le coût</Lien>}
              </span>
            </div>
          ))}
          {p.lignes.length === 0 && <Vide>{p.total ? 'Aucune tâche ne correspond à ce filtre.' : 'Aucune tâche de génération lancée sur la plateforme.'}</Vide>}
        </div>
        {p.pagination && <PaginationTour pagination={p.pagination} aria="Pages de la liste des tâches" cle="taches" cible={CIBLE_44} />}
        {p.limite && <p className="faint" style={{ fontSize: '11.5px', margin: '10px 0 0' }}>{p.limite}</p>}
        <p className="faint" data-note="" style={{ fontSize: '11.5px', margin: '10px 0 0' }}>{p.note}</p>
      </section>
      <section className="tile sec" data-section="durees" aria-labelledby="durees-titre">
        <div className="sech"><h2 id="durees-titre">Durées mesurées</h2></div>
        <p className="faint" data-lecture="" style={{ fontSize: '12.5px', margin: '0 0 10px' }}>{p.durees.lecture}</p>
        <div className="atable" data-table="durees" style={styleTableDefilante(LARGEUR_MIN_TABLE_TELEPHONE.durees)}>
          <div className="atr ath" style={{ gridTemplateColumns: COLONNES_GRILLE_DUREES }}>{p.durees.colonnes.map((c) => <span key={c}>{c}</span>)}</div>
          {p.durees.lignes.map((l) => (
            <div className="atr" key={l.cle} style={{ gridTemplateColumns: COLONNES_GRILLE_DUREES }} data-duree={l.cle} data-source={l.source} data-seuil-ms={l.seuilMs}>
              {l.cellules.map((c, i) => (
                <span key={i} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                  {i === 0 ? (l.tous ? <b>{c}</b> : c) : i === 5 ? <b>{c}</b> : i === 6 ? <span className={`pill ${l.source === 'derive' ? 'w' : 'g'}`} style={{ whiteSpace: 'normal' }}>{c}</span> : c}
                </span>
              ))}
            </div>
          ))}
        </div>
        <h3 style={{ fontSize: 13, margin: '16px 0 8px' }}>Phases · tous modèles</h3>
        <div className="atable" data-table="phases" style={styleTableDefilante(LARGEUR_MIN_TABLE_TELEPHONE.phases)}>
          <div className="atr ath" style={{ gridTemplateColumns: COLONNES_GRILLE_PHASES }}>{p.durees.colonnesPhases.map((c) => <span key={c}>{c}</span>)}</div>
          {p.durees.phases.map((l) => (
            <div className="atr" key={l.cle} style={{ gridTemplateColumns: COLONNES_GRILLE_PHASES }} data-phase={l.cle}>
              {l.cellules.map((c, i) => <span key={i} className={i === 5 ? 'faint' : undefined} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{c}</span>)}
            </div>
          ))}
        </div>
        {p.durees.limite && <p className="faint" style={{ fontSize: '11.5px', margin: '10px 0 0' }}>{p.durees.limite}</p>}
        <p className="faint" data-methode="" style={{ fontSize: '11.5px', margin: '10px 0 0' }}>{p.durees.methode}</p>
      </section>
    </Vue>
  );
}
