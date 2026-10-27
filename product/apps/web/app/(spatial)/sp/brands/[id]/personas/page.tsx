import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { citationsPersona, initialeNom, listePropre, statutPersona, teinteAvatar } from '@tiktrends/core';
import { addPersonaAction, addScenarioAction } from '../../../../../actions/brand-detail';
import { Personas } from '../../../../../../spatial/vues/marque/Personas';
import { chargerMarque } from '../donnees';

export const dynamic = 'force-dynamic';

export default async function PersonasSpatiale({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await chargerMarque(id);
  const { b } = c;
  const [personas, scenarios] = await Promise.all([
    db!.select().from(schema.personas).where(eq(schema.personas.brandId, b.id)),
    db!.select().from(schema.scenarios).where(eq(schema.scenarios.brandId, b.id)),
  ]);

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
    />
  );
}
