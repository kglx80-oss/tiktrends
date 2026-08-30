import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { isFounder } from '../../../../lib/founder';
import { StripeDiagnostic } from './StripeDiagnostic';

export const dynamic = 'force-dynamic';

/** Une étape du test manuel : ce qu'on fait, et ce qu'on doit constater. */
const ETAPES: Array<{ faire: string; verifier: string }> = [
  {
    faire: 'Depuis un compte client (pas le compte fondateur), ouvrir « Abonnement & factures » et souscrire la formule Core.',
    verifier: 'Stripe Checkout s’ouvre en euros, au tarif affiché sur la carte.',
  },
  {
    faire: 'Payer avec la carte de test 4242 4242 4242 4242 · date future, CVC au hasard.',
    verifier: 'Retour sur /billing avec le bandeau « Abonnement activé ».',
  },
  {
    faire: 'Ouvrir « Utilisation des crédits ».',
    verifier: 'Le solde vaut l’allocation de la formule, et une ligne « Abonnement core · allocation » apparaît au journal.',
  },
  {
    faire: 'Acheter une recharge depuis la puce de crédits (menu en bas du rail).',
    verifier: 'Le solde augmente du montant acheté · une ligne « Recharge de crédits (Stripe) » s’ajoute.',
  },
  {
    faire: 'Dans Stripe (mode test), déclencher un renouvellement sur l’abonnement.',
    verifier: 'Le solde repart à l’allocation SANS effacer la recharge achetée juste avant. C’est le point le plus important.',
  },
  {
    faire: 'Cliquer « Gérer mon abonnement », puis résilier depuis le portail Stripe.',
    verifier: 'L’espace repasse en Starter, et les fonctionnalités Core se verrouillent.',
  },
  {
    faire: 'Dans Stripe > Développeurs > Webhooks, ouvrir l’endpoint et regarder les livraisons.',
    verifier: 'Tous les événements sont en 200. Un renvoi manuel du même événement répond « duplicate » sans re-créditer.',
  },
];

/**
 * Contrôle de la chaîne de paiement · fondateur uniquement.
 * Deux moitiés complémentaires : le diagnostic automatique (config, prix, webhook,
 * portail) et le test manuel à la carte, qui seul valide le parcours réel.
 */
export default async function PaiementPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  if (!isFounder(s.user.email)) redirect('/billing');

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Chaîne de paiement</h1>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>FONDATEUR</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 22, maxWidth: 720, lineHeight: 1.6 }}>
        À passer avant chaque bascule de mode, et après toute modification des prix ou du webhook.
      </p>

      <section style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '18px 20px' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>1 · Vérification automatique</h2>
        <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 14px', lineHeight: 1.6, maxWidth: 660 }}>
          Sans carte ni paiement. Contrôle la clé et son mode, chaque prix (existence, mode, tarif réellement facturé
          face à celui affiché), l'endpoint webhook et les événements qu'il envoie, puis le portail client.
        </p>
        <StripeDiagnostic />
      </section>

      <section style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '18px 20px', marginTop: 16 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>2 · Test manuel à la carte</h2>
        <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 16px', lineHeight: 1.6, maxWidth: 660 }}>
          La vérification ci-dessus valide la configuration · seul ce parcours valide l'expérience réelle.
          À faire en <b>mode test</b> (bandeau orange dans Stripe), depuis un compte client.
        </p>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10, counterReset: 'etape' }}>
          {ETAPES.map((e, i) => (
            <li key={i} style={{ display: 'flex', gap: 12, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 12 }}>
              <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 999, background: 'var(--paper)', color: 'var(--accent-strong)', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{e.faire}</div>
                <div style={{ fontSize: 12.5, color: '#7ee8bf', marginTop: 4, lineHeight: 1.5 }}>→ {e.verifier}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p style={{ marginTop: 20, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>
        Les clés se posent dans <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5, padding: '1px 5px', borderRadius: 5, background: 'var(--paper)' }}>.env.deploy</code> sur le serveur · jamais dans l'interface.
        Pour appliquer une formule sans passer par Stripe, voir <Link href="/admin/plans" style={{ color: 'var(--accent-strong)' }}>Formules & crédits</Link>.
      </p>
    </main>
  );
}
