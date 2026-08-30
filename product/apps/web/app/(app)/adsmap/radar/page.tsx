import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { canAccess, roleAtLeast, FEATURES } from '../../../../lib/rbac';
import { getActiveBrand } from '../../../../lib/brands';
import { PageInfo } from '../../../../components/PageInfo';
import { Radar } from './Radar';
import { effectiveAccess } from '../../../../lib/access';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * La veille qui vient à toi.
 *
 * Le suivi de marques signalait les NAISSANCES : « 4 nouvelles pubs chez tes
 * concurrents ». La plupart meurent en une semaine · l'alerte était quotidienne
 * et son taux d'information proche de zéro. Ici on signale les SURVIES.
 */
export default async function RadarPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!canAccess(effectiveAccess(s), feature)) redirect('/adsmap');
  // Armer une dépense récurrente n'est pas une préférence d'affichage.
  if (!roleAtLeast(s.role, 'admin')) redirect('/adsmap');

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) redirect('/adsmap');

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1000, margin: '0 auto' }}>
      <Link href="/adsmap" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>‹ ADSMAP</Link>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Radar</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {brand.name}</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 20, maxWidth: 800, lineHeight: 1.6 }}>
        Chaque nuit, le radar regarde ce que tes concurrents continuent de payer · et te le pose sur le bureau
        le matin, sans que tu aies à aller chercher.
      </p>

      <PageInfo title="ce que le radar surveille, et ce qu’il coûte">
        <b>La naissance d’une pub ne dit rien.</b> La plupart meurent en une semaine, et un annonceur qui
        lance dix créas n’a rien prouvé · il a dépensé. Le signal qui compte est la <b>survie</b> : une créa
        encore diffusée après trois semaines est une créa que son annonceur continue de payer, semaine après
        semaine, en connaissant ses chiffres. C’est le seul vote crédible observable de l’extérieur.
        <br /><br />
        <b>Détecter est gratuit, décrire coûte.</b> Repérer un franchissement de cap est de l’arithmétique
        sur des données déjà récupérées. Seule la description d’une créa demande un appel modèle · elle n’est
        déclenchée que sur ce qui a franchi un cap, dans la limite du plafond que tu fixes, et jamais deux
        fois sur la même créa. Un annonceur au-delà de trois créas décrites cède la place à un annonceur
        qu’on ne connaît pas encore : trois créas suffisent à connaître une manière, et le budget est mieux
        placé en largeur.
        <br /><br />
        <b>Le radar est éteint par défaut</b>, s’arme marque par marque, et s’arrête net si le plafond
        global de dépense est atteint.
      </PageInfo>

      <Radar />
    </main>
  );
}
