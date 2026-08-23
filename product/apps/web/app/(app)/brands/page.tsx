import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { roleAtLeast } from '../../../lib/rbac';
import { getActiveBrand } from '../../../lib/brands';
import { createBrandAction, renameBrandAction, deleteBrandAction } from '../../actions/brands';
import { input, btn, btnGhost, panel, Msg } from '../../../components/ui';
import { PageInfo } from '../../../components/PageInfo';

export const dynamic = 'force-dynamic';

const OK: Record<string, string> = { '1': 'Marque créée et sélectionnée.', renamed: 'Marque renommée.', deleted: 'Marque supprimée.' };
const ERR: Record<string, string> = { forbidden: 'Action réservée aux administrateurs.', name: 'Donne un nom à la marque.' };

export default async function BrandsPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const { ok, e } = await searchParams;
  const active = await getActiveBrand(s.workspaceId);

  const rows = db ? await db.select().from(schema.brands).where(eq(schema.brands.workspaceId, s.workspaceId)) : [];

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Marques</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>ESPACE ADMIN</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 14 }}>
        Gère les marques que tu pilotes. Chaque marque a son propre espace : sélectionne-la en haut du menu pour
        filtrer sauvegardes, suivis et analyses.
      </p>
      <PageInfo title="gérer tes marques">
        Ajoute une marque (nom, site, secteur) : elle devient <b>active</b> automatiquement. Le sélecteur en haut à
        gauche permet de basculer d'une marque à l'autre, ou de voir «&nbsp;Toutes les marques&nbsp;». Ce que tu
        sauvegardes ou suis dans l'Inspo est rattaché à la marque active.
      </PageInfo>

      {ok && OK[ok] && <Msg kind="ok">{OK[ok]}</Msg>}
      {e && ERR[e] && <Msg kind="err">{ERR[e]}</Msg>}

      <div style={panel}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Ajouter une marque</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0, marginBottom: 14 }}>Le nom suffit ; le reste est optionnel.</p>
        <form action={createBrandAction} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '2 1 200px' }}><label style={lbl}>Nom *</label><input name="name" required placeholder="Ex : Grüns" style={input} /></div>
          <div style={{ flex: '2 1 200px' }}><label style={lbl}>Site (optionnel)</label><input name="url" placeholder="gruns.co" style={input} /></div>
          <div style={{ flex: '1 1 140px' }}><label style={lbl}>Secteur</label><input name="industry" placeholder="Nutrition" style={input} /></div>
          <button type="submit" style={btn}>Créer la marque</button>
        </form>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '4px 0 12px' }}>Tes marques ({rows.length})</h2>
      {rows.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucune marque pour l'instant. Ajoute-en une ci-dessus.</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((b) => (
          <div key={b.id} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--grad-accent)', flexShrink: 0 }} />
            <form action={renameBrandAction} style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 200 }}>
              <input type="hidden" name="id" value={b.id} />
              <input name="name" defaultValue={b.name} style={{ ...input, padding: '7px 10px' }} />
              <button type="submit" style={btnGhost}>Renommer</button>
            </form>
            {active?.id === b.id && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-strong)' }}>● active</span>}
            {b.url && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{b.url}</span>}
            <form action={deleteBrandAction} style={{ margin: 0 }}>
              <input type="hidden" name="id" value={b.id} />
              <button type="submit" style={{ ...btnGhost, color: '#ff9db0', borderColor: 'rgba(255,77,109,.3)' }}>Supprimer</button>
            </form>
          </div>
        ))}
      </div>
    </main>
  );
}

const lbl = { fontSize: 13, color: 'var(--ink-2)', display: 'block', marginBottom: 6 } as const;
