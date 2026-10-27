import { Vue } from '../../communs';
import { Pill, TeteAdmin, Vide, type BandeauAdmin } from './base';
import { InviterMembre, MatriceDroitsSpatiale, type CaseDroit } from './droits-client';

/**
 * « Rôles & droits » · `docs/spatial/reference/a-droits.html`. PRÉSENTATIONNEL.
 *
 * Réel · la matrice des rôles d'équipe MATRICIELS (Admin+ et Admin ont l'accès
 * total, jamais réglable) × les rubriques (`roleVoitRubrique`), l'équipe
 * interne (`platform_staff`), le registre d'audit de la plateforme
 * (`studio_audit_events` de portée plateforme). Le modèle de droits est
 * binaire (accès ou aucun) · aucun niveau « lecture » ou « modification »
 * n'est inventé. Le retrait d'un membre reste dans l'écran V5.
 */
export interface PropsDroits {
  bandeau: BandeauAdmin;
  legende: string;
  roles: readonly string[];
  lignes: ReadonlyArray<{ rubrique: string; cases: readonly CaseDroit[] }>;
  verrouille: boolean;
  rolesInvitation: ReadonlyArray<{ cle: string; libelle: string }> | null;
  equipe: ReadonlyArray<{ email: string; initiales: string; role: string; total: boolean; depuis: string }>;
  audit: ReadonlyArray<{ id: string; initiales: string; acteur: string; texte: string; quand: string }>;
}

export function Droits(p: PropsDroits) {
  return (
    <Vue>
      <TeteAdmin titre="Rôles & droits" sous="droits" actif="/admin/equipe" bandeau={p.bandeau} />
      <section className="tile">
        <div className="sech"><h2>Matrice des droits</h2><span className="faint" style={{ fontSize: '12.5px' }}>{p.legende}</span></div>
        <MatriceDroitsSpatiale roles={p.roles} lignes={p.lignes} verrouille={p.verrouille} />
      </section>
      <div className="agrid2 sec">
        <section className="tile">
          <div className="sech"><h2>Équipe interne</h2>{p.rolesInvitation && <InviterMembre roles={p.rolesInvitation} />}</div>
          <div className="atable">
            {p.equipe.map((m) => (
              <div className="atr" key={m.email} style={{ gridTemplateColumns: 'auto 1.2fr 1fr 1fr' }}><span className="me" style={{ width: 30, height: 30, fontSize: '10.5px' }}>{m.initiales}</span><span><b>{m.email}</b></span><span><Pill c={m.total ? 'w' : ''}>{m.role}</Pill></span><span className="faint">{m.depuis}</span></div>
            ))}
            {p.equipe.length === 0 && <Vide>Aucun membre inscrit · les fondateurs ont l’accès total par le code.</Vide>}
          </div>
        </section>
        <section className="tile">
          <div className="sech"><h2>Registre d’audit</h2></div>
          <div className="afeed">
            {p.audit.map((a) => (
              <div className="afi" key={a.id}><span className="me" style={{ width: 28, height: 28, fontSize: '10px' }}>{a.initiales}</span><span style={{ flex: 1, minWidth: 0 }}><b>{a.acteur}</b> {a.texte}<small>{a.quand}</small></span></div>
            ))}
            {p.audit.length === 0 && <Vide>Aucun geste de plateforme enregistré (prompts, releases, interrupteurs).</Vide>}
          </div>
        </section>
      </div>
    </Vue>
  );
}
