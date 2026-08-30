import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { anthropicConfigured } from '../../../../lib/ai-status';
import { BrandWizard } from '../../../../components/BrandWizard';
import { costFor } from '@tiktrends/core';
import { PageInfo } from '../../../../components/PageInfo';
import { createBrandFromShopifyAction } from '../../../actions/brands';

export const dynamic = 'force-dynamic';

const SHOP_ERR: Record<string, string> = {
  shopify_domain: 'Indique le domaine de ta boutique Shopify.',
  shopify_notfound: "Catalogue Shopify introuvable sur ce domaine. Vérifie l'adresse, ou essaie le domaine .myshopify.com.",
};

export default async function NewBrandPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const { e } = await searchParams;

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 0' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Créer une marque</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>ESPACE ADMIN</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 12 }}>
        Cinq étapes pour un profil de marque complet. L'IA peut tout pré-remplir depuis le site&nbsp;: tu vérifies, ajustes, valides.
      </p>
      <PageInfo title="créer une marque">
        Chaque marque a son propre espace (sauvegardes, suivis, analyses). Le profil, la charte, l'audience et les
        concurrents nourrissent le Studio IA et le Radar. Tout reste modifiable ensuite depuis la fiche de la marque.
      </PageInfo>

      {/* Raccourci Shopify : crée la marque + importe produits, images et DA en un clic. */}
      <form action={createBrandFromShopifyAction} style={{ marginTop: 18, border: '1px solid var(--accent-strong)', borderRadius: 16, background: 'linear-gradient(180deg, rgba(150,220,170,.06), var(--surface))', padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>🛍️</span>
          <b style={{ fontSize: 15, color: 'var(--ink)' }}>Connecter une boutique Shopify</b>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', padding: '2px 7px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>LE PLUS RAPIDE</span>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          Crée la marque et importe automatiquement <b>tous tes produits (avec images et prix)</b> et ta <b>charte (logo, couleurs, polices)</b>. Il suffit du domaine de ta boutique.
        </p>
        {e && SHOP_ERR[e] && <div style={{ margin: '0 0 12px', padding: '10px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(255,77,109,.4)', background: 'rgba(255,77,109,.10)', color: '#ff9db0' }}>{SHOP_ERR[e]}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input name="domain" required placeholder="ta-boutique.com ou ta-boutique.myshopify.com"
            style={{ flex: '1 1 300px', minWidth: 240, padding: '11px 13px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 14, outline: 'none' }} />
          <button type="submit" style={{ padding: '11px 20px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', background: 'var(--grad-accent)', color: '#0d070c', whiteSpace: 'nowrap' }}>🔗 Connecter et créer</button>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>Tu pourras compléter le profil (audience, ton, concurrents) ensuite, ou via le parcours guidé ci-dessous.</p>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0 10px' }}>
        <span style={{ height: 1, flex: 1, background: 'var(--line)' }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>ou créer manuellement</span>
        <span style={{ height: 1, flex: 1, background: 'var(--line)' }} />
      </div>

      <div style={{ marginTop: 4 }}>
        <BrandWizard aiReady={anthropicConfigured()} draftCost={costFor('brief')} />
      </div>
    </main>
  );
}
