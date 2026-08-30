import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { FEATURES, canAccess, roleAtLeast } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { PageInfo } from '../../../../components/PageInfo';
import { Prompts } from './Prompts';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'studio')!;

/**
 * Tes prompts · ta direction artistique, écrite par toi.
 *
 * Le Studio ne proposait que huit univers visuels écrits en dur. On pouvait en
 * choisir un, jamais en écrire un · c'est plus grave qu'il n'y paraît, parce
 * qu'une agence qui a mis des années à trouver sa manière de filmer ne va pas
 * l'abandonner parce que notre menu ne la contient pas.
 */
export default async function PromptsPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!canAccess(effectiveAccess(s), feature)) redirect('/studio');
  if (!roleAtLeast(s.role, 'member')) redirect('/studio');

  const brand = await getActiveBrand(s.workspaceId);

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Tes prompts</h1>
        {brand && <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {brand.name}</span>}
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 20, maxWidth: 780, lineHeight: 1.6 }}>
        Écris ta direction artistique une fois, réutilise-la à chaque génération · et vois ce qu’elle donne.
      </p>

      <PageInfo title="pourquoi un prompt nommé plutôt qu’un champ de texte">
        Un prompt tapé une fois produit une image et disparaît. Ici il est <b>nommé, réutilisable et
        rattaché aux créas qu’il produit</b> · on finit donc par savoir combien de tests il a nourris
        et combien ont gagné. C’est ce qu’aucun générateur d’images ne sait dire : « mon univers
        sombre, 3 gagnantes sur 9 tests tranchés ». <b>Ton prompt cesse d’être un goût pour devenir
        une hypothèse</b>, et une hypothèse se compare.
        <br /><br />
        Le prompt dit <b>comment ça doit ressembler</b>, jamais ce qu’on montre · le sujet vient du
        concept, et l’inverser ferait dériver la publicité vers le style. Sous trois tests tranchés,
        on affiche l’usage et surtout pas un taux : le seuil est le même que pour toutes les
        dimensions de la mémoire.
      </PageInfo>

      <Prompts />
    </main>
  );
}
