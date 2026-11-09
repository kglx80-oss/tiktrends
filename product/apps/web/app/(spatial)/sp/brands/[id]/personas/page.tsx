import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  accesHypothese, accesTestsPersona, bilanTestsPersona, citationsPersona, entreesLecturePersonas, imageModelByKey, initialeNom, lecturePersonas, listePropre,
  ordonnerPersonas, regleLecturePersonas, statutPersona, teinteAvatar, testsDuPersona, type LecturePersonas,
  choixIterationSpatial, gestesLectureGroupe, lotsDuGroupe, noteGestesSilenceFiche, NOTE_GESTES_FICHE_PERSONA,
} from '@tiktrends/core';
import { iterationPlanAction } from '../../../../../actions/adsmap-iterate';
import { falConfigured } from '@tiktrends/integrations';
import { creerHypotheseAction } from '../../../../../actions/adsmap-hypotheses';
import { effectiveAccess } from '../../../../../../lib/access';
import { FEATURES, canAccess, denyReason } from '../../../../../../lib/rbac';
import { addPersonaAction, addScenarioAction, deletePersonaAction, deleteScenarioAction, generateScenarioImageAction, updatePersonaAction } from '../../../../../actions/brand-detail';
import { validateNodeAction } from '../../../../../actions/adsmap-curation';
import { personasEtTests } from '../../../../../../lib/personas-tests';
import { chargerLots, type DonneesLots } from '../../../adsmap/donnees';
import { Personas } from '../../../../../../spatial/vues/marque/Personas';
import { chargerMarque } from '../donnees';

export const dynamic = 'force-dynamic';

const RESULTATS = FEATURES.find((f) => f.key === 'adsmap')!;

export default async function PersonasSpatiale({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await chargerMarque(id);
  const { b } = c;
  const [lignes, scenarios] = await Promise.all([
    db!.select().from(schema.personas).where(eq(schema.personas.brandId, b.id)),
    db!.select().from(schema.scenarios).where(eq(schema.scenarios.brandId, b.id)),
  ]);
  // Lot 9 · l'ordre de la marque (rang, puis nom) · le même que le sélecteur « Pour qui ? » du brief.
  const personas = ordonnerPersonas(lignes.map((x) => ({ ...x, rang: x.rank, nom: x.name })));

  // « Tester une accroche » · même porte que `adsmapGuard` (formule, rôle) et la marque ACTIVE.
  const acces = effectiveAccess(c.s);
  const hypothese = accesHypothese({
    adsmap: canAccess(acces, RESULTATS) ? 'ok' : denyReason(acces, RESULTATS) === 'plan' ? 'plan' : 'role',
    marqueActive: c.estActive,
  });

  // Lot 9 · « Dans les tests » · les verdicts de la marque lus par persona (`lecturePersonas`), mêmes portes qu'Adsmap et la marque active.
  const portes = accesTestsPersona({ adsmap: canAccess(acces, RESULTATS) ? 'ok' : denyReason(acces, RESULTATS) === 'plan' ? 'plan' : 'role', marqueActive: c.estActive });
  let lus: { d: DonneesLots; lecture: LecturePersonas; persona: (adId: string) => { id: string; nom: string } | null; planIds: ReadonlySet<string> } | null = null;
  if (!portes.lecture) {
    const [d, pt] = await Promise.all([chargerLots(c.s.workspaceId, b.id), personasEtTests(c.s.workspaceId, b.id)]);
    const persona = (adId: string) => pt.parAd.get(adId)?.persona ?? null;
    const lecture = lecturePersonas(entreesLecturePersonas(d.lots, persona), pt.personas);
    // VB P06 · le plan d'itération n'est lu que si un persona SE DÉTACHE · les pubs retenues sont celles que
    // l'écran Itérer proposera, sélectionnables (`choixIterationSpatial`, la même règle que la fiche d'un lot).
    const detache = lecture.groupes.some((x) => x.lecture === 'au_dessus' || x.lecture === 'en_dessous');
    const planIds = detache
      ? new Set(choixIterationSpatial((await iterationPlanAction()).view?.rows ?? [], () => undefined, { peutIterer: true }).filter((x) => x.selectionnable).map((x) => x.adId))
      : new Set<string>();
    lus = { d, persona, lecture, planIds };
  }
  /** « Dans les tests » d'un persona · son compte, sa lecture, ses lots, et ses gestes s'il se détache (rien n'est écrit ici). */
  const dansLesTests = (personaId: string) => {
    if (!lus) return { ferme: true as const, raison: portes.lecture! };
    const t = testsDuPersona(lus.lecture, personaId);
    const g = lus.lecture.groupes.find((x) => x.persona.id === personaId);
    const tests = lus.d.lots.flatMap((l) => l.ads).filter((a) => lus!.persona(a.id)?.id === personaId).map((a) => a.id);
    const gestes = g ? gestesLectureGroupe({ ref: g.persona, lecture: g.lecture, k: g.k, n: g.n, reference: g.reference },
      { groupe: 'persona', note: NOTE_GESTES_FICHE_PERSONA, prioritaires: [], testsDeLaMarque: tests, planIds: lus.planIds }) : null;
    return {
      ferme: false as const, ...bilanTestsPersona(lus.d.lots, lus.persona, personaId), ...t, regle: regleLecturePersonas(),
      lotsDeTest: lotsDuGroupe(lus.d.lots, lus.persona, personaId),
      gestes, silence: !gestes && t.lecture !== 'aucun' ? noteGestesSilenceFiche('Ce persona') : null,
      raisonHypothese: hypothese.ouvert ? null : hypothese.raison,
    };
  };

  return (
    <Personas
      sousNav={c.sousNav} brandId={b.id} nom={b.name}
      personas={personas.map((x, i) => ({
        id: x.id, initiale: initialeNom(x.name), teinte: teinteAvatar(i), nom: x.name, statut: statutPersona(x.status),
        description: x.description, desirs: listePropre(x.desires, 6), freins: listePropre(x.pains, 6), objections: listePropre(x.objections, 6),
        citations: citationsPersona(x.sources), sources: Array.isArray(x.sources) ? x.sources.length : 0,
        rang: x.rank, segment: x.segment, aValider: x.status === 'proposed',
        editable: { id: x.id, nom: x.name, description: x.description, segment: x.segment, rang: x.rank, desirs: x.desires ?? [], freins: x.pains ?? [], objections: x.objections ?? [] },
        tests: dansLesTests(x.id),
      }))}
      edition={{
        modifier: { action: updatePersonaAction, raison: null },
        valider: { action: portes.validation ? null : validateNodeAction, raison: portes.validation },
      }}
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
