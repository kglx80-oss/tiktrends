import { redirect } from 'next/navigation';
import { capacitesDuRefus, refusStudiosSpatial, VIDE_PROMPTS_SPATIAL, CHEMIN_NOUVEAU_PROJET } from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { effectiveAccess } from '../../../../../lib/access';
import { FEATURES, denyReason } from '../../../../../lib/rbac';
import { gardeSources } from '../../../../../lib/studios/sources/acces';
import { refusCapacite } from '../../../../../lib/studios/interrupteurs';
import { Lien } from '../../../../../spatial/communs';
import { Prompts } from '../../../../../spatial/vues/studios/Prompts';
import { RefusStudios } from '../../../../../spatial/vues/studios/Refus';
import { SOUS_NAV_STUDIOS } from '../../../../../spatial/vues/studios/sous-nav';

export const dynamic = 'force-dynamic';

const FEATURE_STUDIO = FEATURES.find((f) => f.key === 'studio')!;
const TITRE = 'Prompts conseillés';
const SOUS = 'Des points de départ testés pour tes projets';

/**
 * « Prompts conseillés » (Spatial, nouvelle adresse) · même garde que les
 * Studios (`studio.read`, capacité `projets`). Aucune source de prompts
 * DESTINÉS AUX CLIENTS n'existe (le registre ne porte que les consignes
 * internes, voir `VIDE_PROMPTS_SPATIAL`) · l'écran rend l'état vide honnête,
 * sans catégorie, contexte ni prompt d'exemple. Aucune lecture, aucune dépense.
 */
export default async function PromptsSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  const g = await gardeSources('studio.read');
  const refus = !g.ok ? g : await refusCapacite(g.ctx, ['projets']);
  if (refus) {
    return <RefusStudios titre={TITRE} sous={SOUS} sousNav={SOUS_NAV_STUDIOS} actif="/studio/prompts"
      refus={refusStudiosSpatial({ capacites: capacitesDuRefus(refus), code: refus.code, plan: denyReason(effectiveAccess(s), FEATURE_STUDIO) === 'plan', message: refus.message, traceId: refus.traceId })} />;
  }
  return (
    <Prompts
      sousNav={SOUS_NAV_STUDIOS}
      categories={[]}
      contexte={null}
      prompts={[]}
      vide={{
        titre: VIDE_PROMPTS_SPATIAL.titre,
        texte: <>{VIDE_PROMPTS_SPATIAL.texte}<br /><Lien className="btn sm" href="/studio/iterer" style={{ marginTop: 12 }}>Itérer sur une gagnante</Lien>{' '}<Lien className="btn sm" href={CHEMIN_NOUVEAU_PROJET} style={{ marginTop: 12 }}>Nouveau projet</Lien></>,
      }}
    />
  );
}
