import { EnTete, Ic, Lien, Vue } from '../../communs';
import { AnnonceRetour } from '../marque/interactifs';

/**
 * « Support » de l'espace · vague 4 · les écrans V5 `/support` et
 * `/support/[id]` n'ont pas de fragment de maquette · composés avec les
 * classes de la maquette (`.tile`, `.field`, `.npr`, `.pill`, et le fil du
 * poste SAV · `.savconv`, `.savmsg`, `.savbub`, `.savr`). PRÉSENTATIONNEL ·
 * les tickets viennent des tables `tickets` / `ticket_messages`, chaque geste
 * d'une action serveur EXISTANTE (`app/actions/support.ts`) passée en props.
 */

type Action = (fd: FormData) => Promise<void>;
type Pastille = { libelle: string; classe: string };

export interface LigneTicket { id: string; titre: string; type: Pastille; statut: Pastille; auteur: string | null; le: string }

export interface PropsSupport {
  admin: boolean;
  portee: string;
  types: ReadonlyArray<{ cle: string; libelle: string }>;
  ouvrir: Action | null;
  tickets: readonly LigneTicket[];
  retours: Record<string, string>;
}

export function Support(p: PropsSupport) {
  return (
    <Vue>
      <EnTete titre="Support" sous={p.admin ? 'Tous les tickets de ton espace · réponds, change le statut, garde le fil' : 'Signale un bug, propose une idée, pose une question'} />
      <p className="muted" data-geste="portee" style={{ fontSize: 13, margin: '0 0 16px', maxWidth: 760 }}>{p.portee}</p>
      <div className="grid2">
        <section className="tile" data-geste="nouveau-ticket" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <h2 style={{ margin: 0 }}>Nouveau message</h2>
          {p.ouvrir ? (
            <form action={p.ouvrir} style={{ display: 'grid', gap: 12 }}>
              <div className="fields" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))' }}>
                <label className="field">Type
                  <select name="type" defaultValue="question">{p.types.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}</select>
                </label>
                <label className="field" style={{ gridColumn: 'span 2' }}>Titre<input name="title" required placeholder="Ex : l’export PDF ne fonctionne pas" /></label>
              </div>
              <label className="field">Message<textarea className="ta" name="body" required placeholder="Décris le contexte, ce que tu attendais, ce qui s’est passé." /></label>
              <div><button className="btn pri" type="submit"><Ic n="arrow" />Envoyer le ticket</button></div>
            </form>
          ) : <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>L’ouverture d’un ticket est indisponible pour le moment.</p>}
        </section>
        <section className="tile" data-geste="tickets" style={{ alignContent: 'start' }}>
          <div className="sech"><h2>{p.admin ? 'Tickets de l’espace' : 'Tes tickets'}</h2><span className="faint" style={{ fontSize: 12.5 }}>{p.tickets.length}</span></div>
          {p.tickets.length === 0
            ? <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>Aucun ticket pour l’instant · tout roule. Écris dès que tu bloques · les admins de ton espace verront le fil.</p>
            : (
              <div className="nprefs">
                {p.tickets.map((t) => (
                  <Lien key={t.id} className="npr" href={`/support/${t.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    <span className={`pill ${t.type.classe}`}>{t.type.libelle}</span>
                    <div style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}><strong style={{ overflowWrap: 'anywhere' }}>{t.titre}</strong><small>{p.admin && t.auteur ? `${t.auteur} · ${t.le}` : t.le}</small></div>
                    <span className={`pill ${t.statut.classe}`}>{t.statut.libelle}</span>
                  </Lien>
                ))}
              </div>
            )}
        </section>
      </div>
      <AnnonceRetour messages={p.retours} />
    </Vue>
  );
}

export interface PropsTicket {
  admin: boolean;
  ticket: { id: string; titre: string; type: Pastille; statut: Pastille; statutCle: string; ouvertPar: string; ouvertLe: string };
  fil: ReadonlyArray<{ id: string; auteur: string; corps: string; equipe: boolean; le: string; initiales: string }>;
  statuts: ReadonlyArray<{ cle: string; libelle: string }>;
  /** `setTicketStatusAction` · `null` hors administrateur (la page décide, l'action re-vérifie). */
  changerStatut: Action | null;
  repondre: Action | null;
  retours: Record<string, string>;
}

export function Ticket(p: PropsTicket) {
  const t = p.ticket;
  return (
    <Vue>
      <EnTete titre={t.titre} sous={`Support · ouvert par ${t.ouvertPar} · ${t.ouvertLe}`} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <Lien className="btn sm" href="/support"><Ic n="back" />Tous les tickets</Lien>
        <span className={`pill ${t.type.classe}`}>{t.type.libelle}</span>
        <span className={`pill ${t.statut.classe}`} data-statut={t.statutCle}>{t.statut.libelle}</span>
      </div>
      <section className="tile savd">
        {p.changerStatut && (
          <div role="group" aria-labelledby="statut-ticket" data-geste="statut" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span id="statut-ticket" className="faint" style={{ fontSize: 12.5 }}>Changer le statut</span>
            {p.statuts.map((s) => (
              <form key={s.cle} action={p.changerStatut!}>
                <input type="hidden" name="ticketId" value={t.id} />
                <input type="hidden" name="status" value={s.cle} />
                <button className={`btn sm${t.statutCle === s.cle ? ' pri' : ''}`} type="submit" disabled={t.statutCle === s.cle} aria-pressed={t.statutCle === s.cle}>{s.libelle}</button>
              </form>
            ))}
          </div>
        )}
        <div className="savconv" data-geste="fil">
          <div className="savsys">Ticket ouvert par {t.ouvertPar} · {t.ouvertLe}</div>
          {p.fil.map((m) => m.equipe ? (
            <div className="savmsg a" key={m.id}><div className="savbub"><small>{m.auteur} · équipe · {m.le}</small><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.corps}</p></div><span className="savav sm" style={{ background: 'linear-gradient(135deg,var(--acc),var(--acc2))', color: 'var(--on)' }}>{m.initiales}</span></div>
          ) : (
            <div className="savmsg c" key={m.id}><span className="savav sm" style={{ background: 'var(--glass3)', color: 'var(--fg)' }}>{m.initiales}</span><div className="savbub"><small>{m.auteur} · {m.le}</small><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.corps}</p></div></div>
          ))}
          {p.fil.length === 0 && <div className="savsys">Aucun message dans ce fil pour l’instant.</div>}
          {t.statutCle === 'resolved' && <div className="savsys g"><Ic n="check" />Ticket résolu</div>}
        </div>
        {p.repondre ? (
          <form action={p.repondre} className="savr" data-geste="repondre">
            {t.statutCle === 'resolved' && !p.admin && <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>Ce ticket est résolu. Tu peux encore écrire ci-dessous · ton message s’ajoute au fil, et un admin de l’espace peut le rouvrir.</p>}
            <input type="hidden" name="ticketId" value={t.id} />
            <textarea name="body" required aria-label={p.admin ? 'Ta réponse dans le fil' : 'Ton message dans le fil'} placeholder={p.admin ? 'Répondre au membre…' : 'Ajouter un message…'} />
            <div className="kc"><button className="btn pri sm" type="submit" style={{ marginLeft: 'auto' }}><Ic n="arrow" />Envoyer la réponse</button></div>
          </form>
        ) : <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>La réponse est indisponible pour le moment.</p>}
      </section>
      <AnnonceRetour messages={p.retours} />
    </Vue>
  );
}
