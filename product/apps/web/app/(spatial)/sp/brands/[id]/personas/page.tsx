import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { accesHypothese, citationsPersona, imageModelByKey, initialeNom, listePropre, statutPersona, teinteAvatar } from '@tiktrends/core';
import { falConfigured } from '@tiktrends/integrations';
import { creerHypotheseAction } from '../../../../../actions/adsmap-hypotheses';
import { effectiveAccess } from '../../../../../../lib/access';
import { FEATURES, canAccess, denyReason } from '../../../../../../lib/rbac';
import { addPersonaAction, addScenarioAction, deletePersonaAction, deleteScenarioAction, generateScenarioImageAction } from '../../../../../actions/brand-detail';
import { Personas } from '../../../../../../spatial/vues/marque/Personas';
import { chargerMarque } from '../donnees';

export const dynamic = 'force-dynamic';

const RESULTATS = FEATURES.find((f) => f.key === 'adsmap')!;

export default async function PersonasSpatiale({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await chargerMarque(id);
  const { b } = c;
  const [personas, scenarios] = await Promise.all([
    db!.select().from(schema.personas).where(eq(schema.personas.brandId, b.id)),
    db!.select().from(schema.scenarios).where(eq(schema.scenarios.brandId, b.id)),
  ]);

  // « Tester une accroche » · même porte que `adsmapGuard` (formule, rôle) et la marque ACTIVE.
  const acces = effectiveAccess(c.s);
  const hypothese = accesHypothese({
    adsmap: canAccess(acces, RESULTATS) ? 'ok' : denyReason(acces, RESULTATS) === 'plan' ? 'plan' : 'role',
    marqueActive: c.estActive,
  });

  return (
    <Personas
      sousNav={c.sousNav} brandId={b.id} nom={b.name}
      personas={personas.map((x, i) => ({
        id: x.id, initiale: initialeNom(x.name), teinte: teinteAvatar(i), nom: x.name, statut: statutPersona(x.status),
        description: x.description, desirs: listePropre(x.desires, 6), freins: listePropre(x.pains, 6), objections: listePropre(x.objections, 6),
        citations: citationsPersona(x.sources), sources: Array.isArray(x.sources) ? x.sources.length : 0,
      }))}
      scenarios={scenarios.map((x) => ({ titre: x.title, contexte: x.context }))}
      jarvis={c.jarvis} creerPub={c.creerPub}
      ajouterPersona={addPersonaAction} ajouterScenario={addScenarioAction}
      retours={c.retours}
      hypothese={{ creer: hypothese.ouvert ? creerHypotheseAction : null, raison: hypothese.raison }}
      gestion={{
        retirerPersona: deletePersonaAction, retirerScenario: deleteScenarioAction,
        scenarios: scenarios.map((x) => ({ id: x.id, titre: x.title, contexte: x.context, image: x.imageUrl ?? null })),
        // Même moteur et même prix que l'écran V5 (`imageModelByKey('nano')`) · annoncé AVANT le clic.
        visuel: falConfigured()
          ? { appel: generateScenarioImageAction, cout: c.unlimited ? null : imageModelByKey('nano').credits, raison: null }
          : { appel: null, cout: null, raison: 'La génération d’image n’est pas activée' },
      }}
    />
  );
}
