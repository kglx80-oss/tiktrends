import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { roleAtLeast } from '../../../lib/rbac';
import { getActiveBrand } from '../../../lib/brands';
import { getConnectionState } from '../../actions/connections';
import { DataConnections } from './DataConnections';
import { PageInfo } from '../../../components/PageInfo';

export const dynamic = 'force-dynamic';

interface Connector { name: string; color: string; glyph: string; priority?: boolean }
const CATS: Array<{ cat: string; items: Connector[] }> = [
  { cat: 'Publicité', items: [
    { name: 'Meta Ads', color: '#0668E1', glyph: 'M', priority: true },
    { name: 'TikTok Ads', color: '#010101', glyph: 'T', priority: true },
    { name: 'Google Ads', color: '#4285F4', glyph: 'G' },
    { name: 'Snapchat Ads', color: '#FFFC00', glyph: 'S' },
    { name: 'Reddit Ads', color: '#FF4500', glyph: 'R' },
    { name: 'Pinterest Ads', color: '#E60023', glyph: 'P' },
    { name: 'LinkedIn Ads', color: '#0A66C2', glyph: 'in' },
  ] },
  { cat: 'Analytics & Data', items: [
    { name: 'Google Analytics', color: '#E37400', glyph: 'GA' },
    { name: 'Search Console', color: '#458CF5', glyph: 'SC' },
    { name: 'Google BigQuery', color: '#669DF6', glyph: 'BQ' },
    { name: 'Amplitude', color: '#1F6FFF', glyph: 'A' },
    { name: 'Snowflake', color: '#29B5E8', glyph: '❄' },
  ] },
  { cat: 'E-commerce & Paiement', items: [
    { name: 'Shopify', color: '#95BF47', glyph: 'S' },
    { name: 'Stripe', color: '#635BFF', glyph: 'S' },
    { name: 'Triple Whale', color: '#0EA5E9', glyph: 'TW' },
  ] },
  { cat: 'CRM', items: [
    { name: 'HubSpot', color: '#FF7A59', glyph: 'H' },
    { name: 'Salesforce', color: '#00A1E0', glyph: 'SF' },
    { name: 'Pipedrive', color: '#111827', glyph: 'P' },
  ] },
  { cat: 'Engagement client', items: [
    { name: 'Intercom', color: '#1F1F1F', glyph: 'I' },
    { name: 'Klaviyo', color: '#E9603E', glyph: 'K' },
    { name: 'Mailchimp', color: '#FFE01B', glyph: 'M' },
    { name: 'Zendesk', color: '#03363D', glyph: 'Z' },
  ] },
  { cat: 'Réseaux sociaux', items: [
    { name: 'Facebook', color: '#1877F2', glyph: 'f' },
    { name: 'Instagram', color: '#E4405F', glyph: 'ig' },
    { name: 'LinkedIn', color: '#0A66C2', glyph: 'in' },
    { name: 'X (Twitter)', color: '#000000', glyph: 'X' },
    { name: 'YouTube', color: '#FF0000', glyph: '▶' },
    { name: 'Snapchat', color: '#FFFC00', glyph: 'S' },
  ] },
  { cat: 'Créa & Design', items: [
    { name: 'Canva', color: '#00C4CC', glyph: 'C' },
    { name: 'Figma', color: '#A259FF', glyph: 'F' },
    { name: 'Higgsfield', color: '#7C3AED', glyph: 'H' },
  ] },
  { cat: 'Fichiers & Connaissance', items: [
    { name: 'Google Drive', color: '#1FA463', glyph: 'D' },
    { name: 'Notion', color: '#111827', glyph: 'N' },
    { name: 'Dropbox', color: '#0061FF', glyph: 'D' },
    { name: 'OneDrive', color: '#0364B8', glyph: 'O' },
    { name: 'SharePoint', color: '#038387', glyph: 'SP' },
    { name: 'Confluence', color: '#2684FF', glyph: 'C' },
  ] },
  { cat: 'Productivité', items: [
    { name: 'Gmail', color: '#EA4335', glyph: 'M' },
    { name: 'Outlook', color: '#0A2F61', glyph: 'O' },
    { name: 'Google Sheets', color: '#0F9D58', glyph: 'S' },
    { name: 'Google Docs', color: '#4285F4', glyph: 'D' },
    { name: 'Excel', color: '#217346', glyph: 'X' },
    { name: 'Slack', color: '#4A154B', glyph: '#' },
  ] },
];

const TOTAL = CATS.reduce((n, c) => n + c.items.length, 0);

function Tile({ c }: { c: Connector }) {
  const dark = ['#FFFC00', '#FFE01B'].includes(c.color);
  return (
    <span style={{ width: 34, height: 34, borderRadius: 9, background: c.color, color: dark ? '#111' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: c.glyph.length > 1 ? 12 : 15, flexShrink: 0 }}>{c.glyph}</span>
  );
}

export default async function ConnectionsPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const brand = await getActiveBrand(s.workspaceId);
  const connState = await getConnectionState();

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1040, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Connexions</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>ESPACE ADMIN</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 14 }}>
        Branche les comptes {brand ? <>de <b>{brand.name}</b></> : <>de tes marques</>} : régies publicitaires, analytics,
        e-commerce, CRM et outils. {TOTAL} intégrations disponibles.
      </p>
      <PageInfo title="brancher tes comptes">
        Chaque connecteur relie un compte externe (Meta, TikTok, Shopify…) à la <b>marque active</b> pour faire
        remonter les données en direct. La priorité : <b>Meta Ads</b> et <b>TikTok Ads</b> (analyse de tes vraies
        créas dans le Radar). La connexion se fait en OAuth sécurisé ; l'activation arrive marque par marque.
      </PageInfo>

      {/* Sources de données (réelles) · Shopify + Meta Ads pour la marque active */}
      <h2 style={h2}>Sources de données <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>· ventes & performance</span></h2>
      <p style={{ margin: '2px 0 12px', fontSize: 12.5, color: 'var(--muted)' }}>Branche ta boutique Shopify et ton compte Meta Ads : les vraies données remontent et nourrissent l'analyse et Jarvis.</p>
      <DataConnections initial={connState} brandName={brand?.name ?? null} />

      {/* Catalogue */}
      {CATS.map(({ cat, items }) => (
        <details key={cat} open style={{ marginBottom: 14 }}>
          <summary style={{ listStyle: 'none', cursor: 'pointer', ...h2, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>▾</span>{cat}
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>({items.length})</span>
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10, marginTop: 12 }}>
            {items.map((c) => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '12px 14px' }}>
                <Tile c={c} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
                  {c.priority && <div style={{ fontSize: 11, color: 'var(--accent-strong)', fontWeight: 600 }}>Prioritaire</div>}
                </div>
                <button type="button" disabled title="Connexion OAuth bientôt disponible" style={{
                  fontSize: 12, fontWeight: 700, padding: '7px 13px', borderRadius: 999, border: '1px solid var(--line-2)',
                  background: 'transparent', color: 'var(--muted)', cursor: 'default', whiteSpace: 'nowrap',
                }}>+ Connecter</button>
              </div>
            ))}
          </div>
        </details>
      ))}
    </main>
  );
}

const h2 = { margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--ink)' } as const;
