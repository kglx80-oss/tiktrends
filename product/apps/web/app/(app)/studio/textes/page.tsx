import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../../lib/rbac';
import { StudioClient } from './StudioClient';
import { PageInfo } from '../../../../components/PageInfo';
import { effectiveAccess } from '../../../../lib/access';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'studio')!;

/**
 * Textes IA · le studio qui écrit.
 *
 * Il vivait sur la racine `/studio`, c'est-à-dire à la place de la page qui
 * devait orienter. Quelqu'un qui ouvrait l'Atelier pour voir ce que l'outil
 * sait faire tombait sur « Produit / marque / offre * » · un formulaire qui
 * travaille avant d'avoir dit à quoi il sert.
 *
 * Il n'était pas inutile pour autant : c'est le seul studio qui rend du texte,
 * et le texte est ce qu'on écrit avant de composer une image. Ce n'était pas
 * une fonction en trop, c'était une fonction assise à l'accueil.
 */
export default async function TextesPage({ searchParams }: { searchParams: Promise<{ inspo?: string; brand?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');

  if (!canAccess(effectiveAccess(s), feature)) {
    const why = denyReason(effectiveAccess(s), feature);
    return (
      <main style={wrap}>
        <h1 style={h1}>Textes IA</h1>
        <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 14 }}>
          {why === 'plan'
            ? 'L’écriture de créatives est disponible à partir du plan Core.'
            : 'Ton rôle ne permet pas d’accéder au Studio.'}
        </p>
      </main>
    );
  }

  const sp = await searchParams;
  const hasKey = !!process.env.ANTHROPIC_API_KEY;

  return (
    <main style={wrap}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={h1}>Textes IA</h1>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>angles · accroches · script · légendes</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 22 }}>
        Ce qui se dit dans la créa, avant ce qu’on y voit. À utiliser quand tu cherches l’angle, pas encore l’image.
      </p>

      <PageInfo title="ce que ça produit">
        Remplis le brief à gauche (produit, cible, angle, ton, plateforme) et lance la génération : tu obtiens des
        <b> angles</b>, des <b>accroches</b>, un <b>script</b> seconde par seconde, des <b>textes d’annonce</b> et des
        <b> légendes</b>, chacun copiable. Un angle se transforme en pub complète d’un clic vers <b>Pubs IA</b>.
        Astuce : depuis la <b>Veille</b>, «&nbsp;✨ Générer&nbsp;» pré-remplit l’inspiration avec une créa gagnante
        repérée chez un concurrent.
      </PageInfo>

      <StudioClient hasKey={hasKey} prefillProduct={sp.brand} prefillInspiration={sp.inspo} />
    </main>
  );
}

const wrap = { padding: '30px 36px 60px', maxWidth: 1180, margin: '0 auto' } as const;
const h1 = { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' } as const;
