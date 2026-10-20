import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { getActiveBrand } from '../../../../lib/brands';
import { refusJarvis } from '../../../../lib/jarvis-acces';
import { ficheMarqueLue } from '../../../../lib/jarvis-fiche';
import { projetsPourColonneJarvis } from '../../../../lib/studios/jarvis-projets';
import { gardeSources } from '../../../../lib/studios/sources/acces';
import { chargerSources } from '../../../../lib/studios/sources/sources';
import { ACTIONS_JARVIS_VEILLE, brouillonJarvisVeille, lireEntreeJarvisVeille } from '../../../../lib/veille-jarvis';
import { cadrePage } from '../../../../components/ui';
import { JarvisChat } from '../JarvisChat';
import { RefusJarvis } from '../RefusJarvis';

export const dynamic = 'force-dynamic';

/** Lecture seule. La demande est un brouillon visible, aucun appel IA à l'ouverture. */
export default async function JarvisVeillePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const refus = refusJarvis(s);
  if (refus) return <RefusJarvis titre="Jarvis" why={refus} owner={s.role === 'owner'} />;
  const entree = lireEntreeJarvisVeille(await searchParams);
  const g = await gardeSources('studio.read');
  if (!entree || !g.ok) return <main style={cadrePage}><h1>Source indisponible</h1><p>Rouvre cette annonce depuis la Veille ou tes sauvegardes.</p><Link href="/veille">Revenir à la Veille</Link></main>;
  const r = await chargerSources(g.ctx, [entree.source], { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
  if (!r.ok || !r.sources[0]) return <main style={cadrePage}><h1>Source indisponible</h1><p>Cette source n’est pas accessible dans ton espace.</p><Link href="/veille">Revenir à la Veille</Link></main>;
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand || !g.ctx.marques.includes(brand.id)) return <main style={cadrePage}><h1>Choisis ta marque</h1><p>Jarvis a besoin de ta marque cible pour adapter cette source.</p><Link href="/brands">Ouvrir les marques</Link></main>;
  const [fiche, projets] = await Promise.all([ficheMarqueLue(brand.id), projetsPourColonneJarvis(brand.id)]);
  const source = r.sources[0];
  return <main style={cadrePage}>
    <Link href={entree.retour ?? '/veille'} style={{ color: 'var(--muted)', fontSize: 13 }}>Retour à la Veille</Link>
    <section aria-label="Source de la demande" style={{ padding: 16, margin: '12px 0 20px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12 }}>
      <strong>{ACTIONS_JARVIS_VEILLE[entree.action]} · {source.annonceur || 'Annonceur'}</strong>
      <p style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{source.extraitAutorise || 'Cette source ne contient pas de texte publicitaire.'}</p>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 0 }}>Texte publicitaire, pas une transcription audio. Relis et adapte la demande ci-dessous avant de l’envoyer à Jarvis.</p>
    </section>
    <JarvisChat key={`${source.sourceId}:${entree.action}`} fiche={fiche} brandId={brand.id} brandName={brand.name} kpiSource={null} projets={projets} brouillonInitial={brouillonJarvisVeille(entree.action, source, brand.name)} />
  </main>;
}
