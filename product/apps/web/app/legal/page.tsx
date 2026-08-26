import Link from 'next/link';
import { LEGAL_NAV } from '../../lib/legal';

export const dynamic = 'force-dynamic';

const DESC: Record<string, string> = {
  '/legal/mentions-legales': "Éditeur du site, hébergeur et informations légales de la société.",
  '/legal/cgu': "Règles d'utilisation de la plateforme TikTrends.",
  '/legal/cgv': "Conditions des abonnements et de la vente de crédits.",
  '/legal/confidentialite': "Traitement de tes données personnelles (RGPD).",
  '/legal/cookies': "Cookies et traceurs utilisés sur le site.",
};

export default function LegalIndex() {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 80px' }}>
      <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>Informations légales</h1>
      <p style={{ margin: '8px 0 26px', fontSize: 14, color: 'var(--ink-2)' }}>Les documents légaux de TikTrends.</p>
      <div style={{ display: 'grid', gap: 12 }}>
        {LEGAL_NAV.map((l) => (
          <Link key={l.href} href={l.href} style={{ display: 'block', border: '1px solid var(--line-2)', borderRadius: 14, background: 'var(--surface)', padding: '16px 18px', textDecoration: 'none' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{l.label}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{DESC[l.href]}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
