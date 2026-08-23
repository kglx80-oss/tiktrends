import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, desc } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { roleAtLeast } from '../../../lib/rbac';
import { createTicketAction } from '../../actions/support';
import { input, btn, panel, pageWrap, h1, h2, sub, lbl, Msg } from '../../../components/ui';
import { PageInfo } from '../../../components/PageInfo';

const OK: Record<string, string> = { '1': 'Message envoyé.', created: 'Ticket ouvert, on te répond vite.' };
const ERR: Record<string, string> = { title: 'Ajoute un titre.', forbidden: 'Action non autorisée.', notfound: 'Ticket introuvable.' };

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
    tickets = await db.select().from(schema.tickets)
      .where(isAdmin
        ? eq(schema.tickets.workspaceId, s.workspaceId)
        : and(eq(schema.tickets.workspaceId, s.workspaceId), eq(schema.tickets.userId, s.user.id)))
      .orderBy(desc(schema.tickets.updatedAt));
  }

  return (
    <main style={pageWrap}>
      <h1 style={h1}>Support &amp; communication</h1>
      <p style={sub}>{isAdmin ? "Tous les tickets de ton espace : réponds, change le statut, garde le fil." : 'Signale un bug, propose une idée, pose une question. On te répond dans le fil.'}</p>
      <PageInfo title="comment ça marche">
        Chaque message ouvre un <b>fil de discussion</b>. Tu reçois une <b>notification</b> (cloche en haut à droite)
        dès qu'on te répond ou que le statut change. Types : 🐞 bug, 💡 suggestion, ❓ question.
      </PageInfo>

      {ok && OK[ok] && <Msg kind="ok">{OK[ok]}</Msg>}
      {e && ERR[e] && <Msg kind="err">{ERR[e]}</Msg>}

      <div style={panel}>
        <h2 style={h2}>Nouveau message</h2>
        <form action={createTicketAction} style={{ display: 'grid', gap: 14, marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 180 }}>
              <label style={lbl}>Type</label>
              <select name="type" defaultValue="question" style={{ ...input, width: 'auto', minWidth: 180 }}>
                <option value="question">❓ Question</option>
                <option value="bug">🐞 Bug</option>
                <option value="suggestion">💡 Suggestion</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={lbl}>Titre</label>
              <input name="title" required style={input} placeholder="Ex : l'export PDF ne fonctionne pas" />
            </div>
          </div>
          <div>
            <label style={lbl}>Message</label>
            <textarea name="body" required style={{ ...input, minHeight: 90, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} placeholder="Décris le contexte, ce que tu attendais, ce qui s'est passé." />
          </div>
          <div><button type="submit" style={btn}>Envoyer</button></div>
        </form>
      </div>

      <h2 style={{ ...h2, marginBottom: 12 }}>{isAdmin ? 'Tickets de l’espace' : 'Tes tickets'} ({tickets.length})</h2>
      {tickets.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucun ticket pour l'instant.</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {tickets.map((t) => {
          const st = STATUS[t.status] ?? STATUS.open!;
          return (
            <Link key={t.id} href={`/support/${t.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '13px 16px', textDecoration: 'none', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5 }}>{TYPE_LABEL[t.type] ?? t.type}</span>
              <span style={{ flex: 1, minWidth: 180, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{t.title}</span>
              {isAdmin && t.authorName && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t.authorName}</span>}
              <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999, color: st.color, background: st.color + '22' }}>{st.label}</span>
              <span style={{ fontSize: 12, color: 'var(--accent-strong)', fontWeight: 700 }}>Ouvrir ›</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
