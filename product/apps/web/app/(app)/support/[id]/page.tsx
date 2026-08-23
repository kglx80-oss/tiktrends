import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { and, eq, asc } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { replyTicketAction, setTicketStatusAction } from '../../../actions/support';
import { input, Msg } from '../../../../components/ui';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = { bug: '🐞 Bug', suggestion: '💡 Suggestion', question: '❓ Question' };
const STATUS: Record<string, { label: string; color: string }> = {
  open: { label: 'Ouvert', color: '#f5a623' }, in_progress: { label: 'En cours', color: '#7aa2ff' }, resolved: { label: 'Résolu', color: '#18cc8c' },
};
const stat = (k: string) => STATUS[k] ?? STATUS.open!;
const OK: Record<string, string> = { created: 'Ticket ouvert.', reply: 'Réponse envoyée.', status: 'Statut mis à jour.' };
const ERR: Record<string, string> = { empty: 'Écris un message.', forbidden: 'Action non autorisée.' };

export default async function TicketThreadPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const { ok, e } = await searchParams;
  const isAdmin = roleAtLeast(s.role, 'admin');
  if (!db) notFound();

  const [tk] = await db.select().from(schema.tickets).where(and(eq(schema.tickets.id, id), eq(schema.tickets.workspaceId, s.workspaceId))).limit(1);
  if (!tk) notFound();
  if (!isAdmin && tk.userId !== s.user.id) redirect('/support?e=forbidden');

  const messages = await db.select().from(schema.ticketMessages).where(eq(schema.ticketMessages.ticketId, id)).orderBy(asc(schema.ticketMessages.createdAt));
  const st = stat(tk.status);

  // Message d'ouverture : si aucun message n'existe (ancien ticket), on affiche le corps du ticket.
  const thread = messages.length > 0
    ? messages.map((m) => ({ id: m.id, author: m.authorName ?? 'Utilisateur', body: m.body, isStaff: m.isStaff, at: m.createdAt as Date }))
    : (tk.body ? [{ id: 'seed', author: tk.authorName ?? 'Utilisateur', body: tk.body, isStaff: false, at: tk.createdAt as Date }] : []);

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 760, margin: '0 auto' }}>
      <Link href="/support" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>‹ Support</Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, margin: '10px 0 4px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5 }}>{TYPE_LABEL[tk.type] ?? tk.type}</span>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{tk.title}</h1>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>Ouvert par {tk.authorName} · {new Date(tk.createdAt as Date).toLocaleDateString('fr-FR')}</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, padding: '5px 12px', borderRadius: 999, color: st.color, background: st.color + '22' }}>{st.label}</span>
      </div>

      {ok && OK[ok] && <div style={{ marginTop: 12 }}><Msg kind="ok">{OK[ok]}</Msg></div>}
      {e && ERR[e] && <div style={{ marginTop: 12 }}><Msg kind="err">{ERR[e]}</Msg></div>}

      {/* Statut (staff) */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Changer le statut :</span>
          {(['open', 'in_progress', 'resolved'] as const).map((v) => (
            <form key={v} action={setTicketStatusAction}>
              <input type="hidden" name="ticketId" value={tk.id} />
              <input type="hidden" name="status" value={v} />
              <button type="submit" disabled={tk.status === v} style={{
                fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: tk.status === v ? 'default' : 'pointer',
                border: `1px solid ${tk.status === v ? 'transparent' : 'var(--line-2)'}`,
                background: tk.status === v ? stat(v).color + '22' : 'transparent',
                color: tk.status === v ? stat(v).color : 'var(--ink-2)',
              }}>{stat(v).label}</button>
            </form>
          ))}
        </div>
      )}

      {/* Fil */}
      <div style={{ display: 'grid', gap: 12, margin: '18px 0' }}>
        {thread.map((m) => (
          <div key={m.id} style={{
            border: '1px solid var(--line)', borderRadius: 14, padding: '13px 15px',
            background: m.isStaff ? 'rgba(122,162,255,.07)' : 'var(--surface)',
            borderColor: m.isStaff ? 'rgba(122,162,255,.3)' : 'var(--line)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{m.author}</span>
              {m.isStaff && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', padding: '2px 7px', borderRadius: 999, color: '#7aa2ff', background: 'rgba(122,162,255,.15)' }}>ÉQUIPE</span>}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{new Date(m.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.body}</p>
          </div>
        ))}
        {thread.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Aucun message dans ce fil.</p>}
      </div>

      {/* Répondre */}
      {tk.status === 'resolved' && !isAdmin ? (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 14, padding: 14, color: 'var(--muted)', fontSize: 13 }}>
          Ce ticket est résolu. Réponds ci-dessous pour le rouvrir si besoin.
        </div>
      ) : null}
      <form action={replyTicketAction} style={{ marginTop: 8 }}>
        <input type="hidden" name="ticketId" value={tk.id} />
        <textarea name="body" required placeholder={isAdmin ? 'Répondre au client…' : 'Ajouter un message…'} style={{ ...input, minHeight: 90, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
        <div style={{ marginTop: 10 }}>
          <button type="submit" style={{ padding: '10px 18px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}>Envoyer la réponse</button>
        </div>
      </form>
    </main>
  );
}
