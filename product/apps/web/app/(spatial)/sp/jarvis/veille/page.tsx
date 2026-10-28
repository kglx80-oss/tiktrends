import { redirect } from 'next/navigation';
import { getSession } from '../../../../../lib/auth';
import { getActiveBrand } from '../../../../../lib/brands';
import { refusJarvis, TEXTE_REFUS_JARVIS } from '../../../../../lib/jarvis-acces';
import { gardeSources } from '../../../../../lib/studios/sources/acces';
import { chargerSources } from '../../../../../lib/studios/sources/sources';
import { ACTIONS_JARVIS_VEILLE, brouillonJarvisVeille, COUT_CONVERSATION_JARVIS, lireEntreeJarvisVeille } from '../../../../../lib/veille-jarvis';
import { EnTete, Ic, Lien, Vue } from '../../../../../spatial/communs';
import { RefusJarvis } from '../../../../../spatial/vues/jarvis/RefusJarvis';
import { JarvisVeille } from '../../../../../spatial/vues/jarvis/JarvisVeille';

export const dynamic = 'force-dynamic';

/** Un état sans source · le motif d'état vide de la maquette (`.dempty`), un seul geste de retour. */
function Indisponible({ titre, texte, href, libelle }: { titre: string; texte: string; href: string; libelle: string }) {
  return (
    <Vue>
      <EnTete titre="Jarvis" sous="Depuis la Veille" outils="credits" />
      <section className="tile"><div className="dempty">
        <span className="ico"><Ic n="warn" s={false} /></span>
        <h3>{titre}</h3><p className="muted">{texte}</p>
        <Lien className="btn sm" href={href}>{libelle}</Lien>
      </div></section>
    </Vue>
  );
}

/**
 * « Jarvis · depuis la Veille » (Spatial) · mêmes gardes que l'écran V5
 * `/jarvis/veille` : la feature `jarvis`, puis la lecture des sources
 * (`gardeSources('studio.read')`, `chargerSources` · portée de l'espace), puis
 * une marque active DANS la portée. Lecture seule · la demande est un brouillon
 * visible, aucun appel IA à l'ouverture.
 */
export default async function JarvisVeilleSpatial({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const refus = refusJarvis(s);
  if (refus) return <RefusJarvis raison={TEXTE_REFUS_JARVIS[refus]} plan={refus === 'plan'} proprietaire={s.role === 'owner'} />;
  const params = await searchParams;
  const entree = lireEntreeJarvisVeille(params);
  const g = await gardeSources('studio.read');
  if (!entree || !g.ok) return <Indisponible titre="Source indisponible" texte="Rouvre cette annonce depuis la Veille ou tes sauvegardes." href="/veille" libelle="Revenir à la Veille" />;
  const r = await chargerSources(g.ctx, [entree.source], { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
  if (!r.ok || !r.sources[0]) return <Indisponible titre="Source indisponible" texte="Cette source n’est pas accessible dans ton espace." href="/veille" libelle="Revenir à la Veille" />;
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand || !g.ctx.marques.includes(brand.id)) return <Indisponible titre="Choisis ta marque" texte="Jarvis a besoin de ta marque cible pour adapter cette source." href="/brands" libelle="Ouvrir les marques" />;
  const source = r.sources[0];
  const transmis = Object.fromEntries(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === 'string'));
  return (
    <JarvisVeille
      key={`${source.sourceId}:${entree.action}`}
      marque={{ id: brand.id, nom: brand.name }}
      action={entree.action}
      libelleAction={ACTIONS_JARVIS_VEILLE[entree.action]}
      source={{ annonceur: source.annonceur, extrait: source.extraitAutorise }}
      params={transmis}
      retour={entree.retour ?? '/veille'}
      brouillon={brouillonJarvisVeille(entree.action, source, brand.name)}
      cout={COUT_CONVERSATION_JARVIS}
    />
  );
}
