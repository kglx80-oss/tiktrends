import { redirect } from 'next/navigation';
import { and, eq, desc } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { roleAtLeast } from '../../../lib/rbac';
import { createTicketAction, updateTicketStatusAction } from '../../actions/admin';
import { input, btn, btnGhost, panel, pageWrap, h1, h2, sub, lbl, Msg } from '../../../components/ui';

const OK: Record<string, string> = { '1': 'Merci ! Ton message a bien été envoyé.', status: 'Statut mis à jour.' };
const ERR: Record<string, string> = { title: 'Ajoute un titre.', forbidden: 'Réservé aux administrateurs.', notfound: 'Ticket introuvable.' };

const TYPE_LABEL: Record<string, string> = { bug: '🐞 Bug', suggestion: '💡 Suggestion', question: '❓ Question' };
const STATUS: Record<string, { label: string; color: string }> = {
  open: { label: 'Ouvert', color: '#f5a623' },
  in_progress: { label: 'En cours', color: '#7aa2ff' },
  resolved: { label: 'Résolu', color: '#18cc8c' },
};

export const dynamic = 'force-dynamic';

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { ok, e } = await searchParams;
  const isAdmin = roleAtLeast(s.role, 'admin');

  let tickets: Array<typeof schema.tickets.$inferSelect> = [];
  if (db) {
    tickets = await db
      .select()
      .from(schema.tickets)
      .where(isAdmin
        ? eq(schema.tickets.workspaceId, s.workspaceId)
        : and(eq(schema.tickets.workspaceId, s.workspaceId), eq(schema.tickets.userId, s.user.id)))
      .orderBy(desc(schema.tickets.createdAt));
  }

  return (
    <main style={pageWrap}>
      <h1 style={h1}>Support & suggestions</h1>
      <p style={sub}>{isAdmin ? 'Tous les tickets de ton espace. Change leur statut au fil du traitement.' : 'Signale un bug, propose une idée, pose une question. On te répond.'}</p>

      {ok && OK[ok] && <Msg kind="ok">{OK[ok]}</Msg>}
      {e && ERR[e] && <Msg kind="err">{ERR[e]}</Msg>}

      <div style={panel}>
        <h2 style={h2}>Nouveau message</h2>
        <form action={createTicketAction} style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 180 }}>
              <label style={lbl}>Type</label>
              <select name="type" defaultValue="suggestion" style={{ ...input, width: 'auto', minWidth: 180 }}>
                <option value="suggestion">💡 Suggestion</option>
                <option value="bug">🐞 Bug</option>
                <option value="question">❓ Question</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={lbl}>Titre</label>
              <input name="title" required style={input} placeholder="Ex : ajouter l'export PDF des rapports" />
            </div>
          </div>
          <div>
            <label style={lbl}>Détails (optionnel)</label>
            <textarea name="body" rows={4} style={{ ...input, resize: 'vertical' }} placeholder="Décris le contexte, les étapes, ce que tu attends…" />
          </div>
          <div><button type="submit" style={btn}>Envoyer</button></div>
        </form>
      </div>

      <h2 style={{ ...h2, marginBottom: 12 }}>{isAdmin ? `Tickets (${tickets.length})` : `Mes messages (${tickets.length})`}</h2>
      {tickets.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucun message pour l'instant.</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {tickets.map((t) => {
          const st = STATUS[t.status] || STATUS.open!;
          return (
            <div key={t.id} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{TYPE_LABEL[t.type]}</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 15, flex: 1 }}>{t.title}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, color: st.color, background: 'rgba(255,255,255,.06)' }}>{st.label}</span>
              </div>
              {t.body && <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{t.body}</p>}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {t.authorName || 'Anonyme'} · {new Date(t.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    {(['open', 'in_progress', 'resolved'] as const).filter((k) => k !== t.status).map((k) => (
                      <form key={k} action={updateTicketStatusAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="status" value={k} />
                        <button type="submit" style={btnGhost}>→ {STATUS[k]!.label}</button>
                      </form>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
