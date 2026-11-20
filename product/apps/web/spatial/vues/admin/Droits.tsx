import type { AdmissibiliteMembre } from '@tiktrends/core';
import { EnTete, Ic, Lien, Vue } from '../../communs';
import { Pill, TeteAdmin, Vide, type BandeauAdmin } from './base';
import { GererMembre, InviterMembre, MatriceDroitsSpatiale, type CaseDroit } from './droits-client';

/**
 * « Rôles & droits » · `docs/spatial/reference/a-droits.html`. PRÉSENTATIONNEL.
 *
 * Réel · la matrice des rôles d'équipe MATRICIELS (Admin+ et Admin ont l'accès
 * total, jamais réglable) × les rubriques (`roleVoitRubrique`), l'équipe
 * interne (`platform_staff`), le registre d'audit de la plateforme
 * (`studio_audit_events` de portée plateforme). Le modèle de droits est
 * binaire (accès ou aucun) · aucun niveau « lecture » ou « modification »
 * n'est inventé. Vague 3 · chaque membre se gère d'ici (changer de rôle,
 * retirer · actions de l'équipe) quand le compte peut écrire (`gestion`).
 */
export interface PropsDroits {
  bandeau: BandeauAdmin;
  legende: string;
  roles: readonly string[];
  lignes: ReadonlyArray<{ rubrique: string; cases: readonly CaseDroit[] }>;
  verrouille: boolean;
  rolesInvitation: ReadonlyArray<{ cle: string; libelle: string }> | null;
  equipe: ReadonlyArray<{ email: string; initiales: string; role: string; total: boolean; depuis: string; cleRole?: string; moi?: boolean; admissibilite?: AdmissibiliteMembre }>;
  /** Les gestes par membre (rôle, retrait) · absent en lecture seule. */
  gestion?: boolean;
  audit: ReadonlyArray<{ id: string; initiales: string; acteur: string; texte: string; quand: string }>;
  /** « Journal complet » · le registre d'audit (`/admin/audit`), seulement quand la session en ouvre la porte (SEC-10). */
  journal?: string | null;
}

/**
 * « Rôles & droits » pour un compte d'équipe NON admissible (`vueEquipeAdmin`
 * → `message`) · son message, rien d'autre · ni bandeau de la plateforme, ni
 * sous-navigation du Tour, ni matrice, ni liste de l'équipe, ni audit.
 */
export function DroitsNonAdmissible({ message }: { message: string }) {
  return (
    <Vue>
      <EnTete titre="Rôles & droits" sous="Équipe plateforme" />
      <section className="tile" role="status" data-non-admissible="" style={{ borderLeft: '3px solid var(--bad)', fontSize: '13.5px', lineHeight: 1.5 }}>{message}</section>
    </Vue>
  );
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
              <div className="atr" key={m.email} data-membre={m.email} data-admissibilite={m.admissibilite?.statut} style={{ gridTemplateColumns: p.gestion && p.rolesInvitation ? 'auto 1.2fr 1fr 1fr auto' : 'auto 1.2fr 1fr 1fr' }}>
                <span className="me" style={{ width: 30, height: 30, fontSize: '10.5px' }}>{m.initiales}</span><span><b>{m.email}</b></span>
                <span><Pill c={m.total ? 'w' : ''}>{m.role}</Pill>{m.admissibilite && <> <span className={`pill ${m.admissibilite.admissible ? 'g' : 'r'}`} style={{ whiteSpace: 'normal', maxWidth: '100%' }}>{m.admissibilite.libelle}</span></>}</span>
                <span className="faint">{m.admissibilite ? `${m.depuis} · ${m.admissibilite.compte}` : m.depuis}</span>
                {p.gestion && p.rolesInvitation && <span><GererMembre email={m.email} role={m.cleRole ?? ''} moi={!!m.moi} roles={p.rolesInvitation} /></span>}
                {m.admissibilite?.consigne && <p data-consigne="" className="faint" style={{ gridColumn: '1 / -1', margin: 0, fontSize: '12.5px', lineHeight: 1.45 }}>{m.admissibilite.consigne}</p>}
              </div>
            ))}
            {p.equipe.length === 0 && <Vide>Aucun membre inscrit · les fondateurs ont l’accès total par le code.</Vide>}
          </div>
        </section>
        <section className="tile">
          <div className="sech"><h2>Registre d’audit</h2>{p.journal && <Lien className="btn sm" href={p.journal} style={{ marginLeft: 'auto', minHeight: 44, display: 'inline-flex', alignItems: 'center' }} data-journal="">Journal complet<Ic n="arrow" /></Lien>}</div>
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
