import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../lib/rbac';
import Link from 'next/link';
import { StudioClient } from './StudioClient';
import { higgsfieldConfigured, falConfigured } from '@tiktrends/integrations';
import { PageInfo } from '../../../components/PageInfo';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'studio')!;

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ inspo?: string; brand?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');

  if (!canAccess({ role: s.role, plan: s.plan }, feature)) {
    const why = denyReason({ role: s.role, plan: s.plan }, feature);
    return (
      <main style={wrap}>
        <h1 style={h1}>Studio IA</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <h2 style={{ margin: '10px 0 6px', fontSize: 18, color: 'var(--ink)' }}>{why === 'plan' ? "Inclus dès l'abonnement Core" : 'Accès réservé'}</h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '0 auto' }}>
            {why === 'plan' ? 'Le Studio IA (génération de créatives) est disponible à partir du plan Core.' : "Ton rôle ne permet pas d'accéder au Studio."}
          </p>
          {why === 'plan' && s.role === 'owner' && (
            <a href="/settings" style={{ display: 'inline-block', marginTop: 16, padding: '10px 18px', borderRadius: 999, background: 'var(--grad-accent)', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Gérer l'abonnement →</a>
          )}
        </div>
      </main>
    );
  }

  const sp = await searchParams;
  const hasKey = !!process.env.ANTHROPIC_API_KEY;

  return (
    <main style={wrap}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={h1}>Studio IA</h1>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>angles · hooks · script · textes</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 22 }}>
        Génère des créatives prêtes à tourner. Source les gagnantes dans l'<b>Inspo</b>, puis itère ici.
      </p>

      <PageInfo title="générer une créative">
        Remplis le brief à gauche (produit, cible, angle, ton, plateforme) et lance la génération : tu obtiens des
        <b> angles</b>, des <b>hooks</b>, un <b>script</b> seconde par seconde, des <b>textes d'annonce</b> et des
        <b> légendes</b>, chacun copiable. Astuce&nbsp;: depuis l'<b>Inspo</b>, «&nbsp;✨ Générer une variante&nbsp;»
        pré-remplit l'inspiration avec une créa gagnante repérée chez un concurrent.
      </PageInfo>
      <StudioClient hasKey={hasKey} prefillProduct={sp.brand} prefillInspiration={sp.inspo} />

      <Link href="/studio/ads" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 30, padding: '18px 20px', border: '1px solid var(--accent-strong)', borderRadius: 18, background: 'linear-gradient(180deg, rgba(230,0,126,.08), var(--surface))', textDecoration: 'none' }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--grad-accent)', color: '#0d070c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>✨</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b style={{ fontSize: 15, color: 'var(--ink)' }}>Pubs IA</b>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', padding: '2px 7px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>NOUVEAU</span>
            {!falConfigured() && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>· à activer</span>}
          </span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-2)', marginTop: 3 }}>Publicités complètes prêtes à poster : concept, scène avec ton produit, accroche, CTA et logo composés (problème/solution, avant/après, témoignage, bénéfices).</span>
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-strong)', whiteSpace: 'nowrap' }}>Ouvrir ›</span>
      </Link>

      <Link href="/studio/image" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, padding: '18px 20px', border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)', textDecoration: 'none' }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--grad-accent)', color: '#0d070c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🖼️</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b style={{ fontSize: 15, color: 'var(--ink)' }}>Image IA</b>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', padding: '2px 7px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>FAL</span>
            {!falConfigured() && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>· à activer</span>}
          </span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-2)', marginTop: 3 }}>Visuels pub : texte → image et mise en scène produit (Flux / Ideogram), avec texte lisible sur l'image.</span>
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-strong)', whiteSpace: 'nowrap' }}>Ouvrir ›</span>
      </Link>

      <Link href="/studio/video" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, padding: '18px 20px', border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)', textDecoration: 'none' }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--grad-accent)', color: '#0d070c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🎬</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b style={{ fontSize: 15, color: 'var(--ink)' }}>Vidéo IA</b>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', padding: '2px 7px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>KLING 2 · FAL</span>
            {!(falConfigured() || higgsfieldConfigured()) && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>· à activer</span>}
          </span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-2)', marginTop: 3 }}>Texte → vidéo et image → vidéo, verticales, prêtes pour TikTok. Avec galerie et historique.</span>
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-strong)', whiteSpace: 'nowrap' }}>Ouvrir ›</span>
      </Link>
    </main>
  );
}

const wrap = { padding: '30px 36px 60px', maxWidth: 1180, margin: '0 auto' } as const;
const h1 = { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' } as const;
