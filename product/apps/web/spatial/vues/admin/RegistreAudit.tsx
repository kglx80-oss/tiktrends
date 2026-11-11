import { LARGEUR_MIN_TABLE_TELEPHONE, styleTableDefilante } from '@tiktrends/core';
import { Lien, Vue } from '../../communs';
import { TeteAdmin, Vide, type BandeauAdmin } from './base';
import { BoutonExportTour, PaginationTour, RechercheListeTour, type EtatExport, type PaginationListeTour } from './client';
import { CIBLE_44 } from './Taches';

/**
 * « Registre d'audit » · suivi opérationnel (RJ AR06, le « Journal → » de
 * Rôles & droits) · les gestes de la plateforme, les interrupteurs Studios,
 * les actions sensibles de tous les espaces et les rapprochements de dépense.
 * PRÉSENTATIONNEL · LECTURE SEULE · des liens (filtre, pages), la recherche
 * et l'export. La liste fermée des actions sensibles et les règles
 * d'affichage vivent au noyau (`spatial/admin/registre-audit.ts`).
 */
export const CHEMIN_REGISTRE_AUDIT = '/admin/audit';
export const COLONNES_GRILLE_REGISTRE = '.8fr minmax(0,.8fr) minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,1.1fr) minmax(0,1.4fr)';

export interface PropsRegistreAudit {
  bandeau: BandeauAdmin;
  colonnes: readonly string[];
  segments: ReadonlyArray<{ cle: string; libelle: string; href: string; actif: boolean }>;
  segment: string;
  definition: string;
  /** La liste fermée · chaque action sensible et pourquoi. */
  sensibles: ReadonlyArray<{ code: string; phrase: string; raison: string }>;
  q: string;
  lignes: ReadonlyArray<{ id: string; sensible: boolean; cellules: readonly string[] }>;
  total: number;
  pagination: PaginationListeTour | null;
  export: EtatExport;
  limite: string | null;
  note: string;
}

export function RegistreAudit(p: PropsRegistreAudit) {
  return (
    <Vue>
      <TeteAdmin titre="Registre d’audit" sous="audit" actif={CHEMIN_REGISTRE_AUDIT} bandeau={p.bandeau} />
      <section className="tile sec" data-section="registre">
        <div className="sech">
          <h2>Registre</h2>
          <RechercheListeTour chemin={CHEMIN_REGISTRE_AUDIT} q={p.q} segment={p.segment} id="audit-q" placeholder="Rechercher un acteur, une action, une cible" aria="Rechercher dans le registre (acteur, action, cible, espace)" style={{ minHeight: 44 }} />
          <BoutonExportTour entree={{ ecran: 'audit', q: p.q, segment: p.segment }} etat={p.export} unite={{ un: 'événement', plusieurs: 'événements' }} cible={CIBLE_44} />
        </div>
        <nav className="kc" aria-label="Filtre du registre" style={{ marginBottom: 8 }}>
          {p.segments.map((s) => <Lien key={s.cle} className="chip" href={s.href} aria-current={s.actif ? 'page' : undefined} data-segment-audit={s.cle} style={CIBLE_44}>{s.libelle}</Lien>)}
        </nav>
        <p className="faint" data-definition="" style={{ fontSize: '12.5px', margin: '0 0 10px' }}>{p.definition}</p>
        <details style={{ marginBottom: 10 }} data-liste-sensibles="">
          <summary className="btn sm" style={CIBLE_44}>Les actions tenues pour sensibles</summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4, fontSize: '12.5px' }}>
            {p.sensibles.map((a) => <li key={a.code} data-sensible={a.code}><b>{a.phrase}</b> <small className="faint">· {a.code} · {a.raison}</small></li>)}
          </ul>
        </details>
        <div className="atable" data-table="registre" style={styleTableDefilante(LARGEUR_MIN_TABLE_TELEPHONE.registre)}>
          <div className="atr ath" style={{ gridTemplateColumns: COLONNES_GRILLE_REGISTRE }}>{p.colonnes.map((c) => <span key={c}>{c}</span>)}</div>
          {p.lignes.map((l) => (
            <div className="atr" key={l.id} style={{ gridTemplateColumns: COLONNES_GRILLE_REGISTRE }} data-evenement={l.id} data-sensible-ligne={l.sensible ? 'oui' : 'non'}>
              {l.cellules.map((c, i) => (
                <span key={i} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                  {i === 1 ? <b>{c}</b> : i === 2 && l.sensible ? <span className="pill w" style={{ whiteSpace: 'normal' }}>{c}</span> : i === 3 || i === 7 ? <small className="faint">{c}</small> : c}
                </span>
              ))}
            </div>
          ))}
          {p.lignes.length === 0 && <Vide>{p.total ? 'Aucun événement ne correspond à ce filtre.' : 'Aucun geste de plateforme enregistré.'}</Vide>}
        </div>
        {p.pagination && <PaginationTour pagination={p.pagination} aria="Pages du registre" cle="registre" cible={CIBLE_44} />}
        {p.limite && <p className="faint" style={{ fontSize: '11.5px', margin: '10px 0 0' }}>{p.limite}</p>}
        <p className="faint" data-note="" style={{ fontSize: '11.5px', margin: '10px 0 0' }}>{p.note}</p>
      </section>
    </Vue>
  );
}
