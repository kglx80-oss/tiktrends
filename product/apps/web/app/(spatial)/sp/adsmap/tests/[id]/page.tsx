import {
  LIBELLE_ETAPE_TEST, LIBELLE_VERDICT, REGLE_ITERATION, RETOUR_STUDIO, VALEUR_ABSENTE, briefDepuisTest, estGagnanteValidee,
  libellePorteeTest, libelleVariableTest, lienFicheTest, lienIterationStudio, lienNouveauProjet, lienSourceVeille,
  lireLienProfondAdsmap, pastilleVerdict, pourcentFr, presentationTest, verdictEffectif,
  type VerdictValue,
} from '@tiktrends/core';
import { adDetailAction } from '../../../../../actions/adsmap-verdict';
import { adsDeLaMarque } from '../../../../../../lib/adsmap-marque';
import { FicheTest } from '../../../../../../spatial/vues/resultats/FicheTest';
import { ActionsFiche, type PropsActionsFiche } from '../../../../../../spatial/vues/resultats/ActionsFiche';
import { RefusResultats } from '../../../../../../spatial/vues/resultats/communs';
import { EnTete, Lien, Vue } from '../../../../../../spatial/communs';
import { gardeResultats } from '../../donnees';

export const dynamic = 'force-dynamic';

const pct = (v: number | null) => pourcentFr(v, VALEUR_ABSENTE);
const eur = (v: number | null) => (v === null ? VALEUR_ABSENTE : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €`);

/**
 * La fiche d'un test · ce qu'ouvrait l'ancien panneau d'arbitrage (lien profond
 * `/adsmap?ad=` des Studios, ligne de la table, file de décisions, carte).
 * Mêmes gardes que l'Adsmap V5 · le test doit appartenir à la marque active
 * (`adsDeLaMarque`), sinon on le dit, sans afficher le test d'une autre marque.
 */
export default async function FicheTestSpatial({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id: brut }, sp] = await Promise.all([params, searchParams]);
  // Un identifiant d'ad est un UUID · le reste est introuvable, jamais transmis à la base.
  const id = lireLienProfondAdsmap({ ad: brut }).adId;
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Fiche du test" raison={g.raison} />;

  const depuisStudio = lireLienProfondAdsmap(sp).depuisStudio;
  const retour = depuisStudio ? { ...RETOUR_STUDIO } : null;
  const dansLaMarque = !!id && (await adsDeLaMarque(g.s.workspaceId, g.marque.id, [id])).has(id);
  const r = id && dansLaMarque ? await adDetailAction(id) : null;
  const d = r?.detail;
  if (!d) {
    return (
      <Vue>
        <EnTete titre="Fiche du test" sous={`Résultats · ${g.marque.nom}`} />
        <section className="tile">
          <p className="muted">{r?.error ?? `Ce test est introuvable dans Adsmap pour ${g.marque.nom} · il a pu être supprimé, ou appartient à une autre marque.`}</p>
          <Lien className="btn sm" href={retour?.href ?? '/adsmap/tests'} style={{ marginTop: 12, justifySelf: 'start' }}>{retour?.libelle ?? 'Tous les tests'}</Lien>
        </section>
      </Vue>
    );
  }

  const pres = presentationTest(
    { status: d.status, launchedAt: d.launchedAt, computed: d.computed, verdictStatus: d.verdictStatus, batchNumber: d.batchNumber, apprentissages: d.learnings.length, manques: d.manques },
    { peutPreparer: g.admin, peutMesurer: g.admin },
  );
  const libelle = (v: string | null | undefined) => {
    const eff = verdictEffectif(v as VerdictValue | null, d.comparable);
    return eff ? LIBELLE_VERDICT[eff].court : null;
  };
  const arbitre = d.verdictStatus === 'validated';
  const gagnante = estGagnanteValidee((d.validated ?? d.computed) as VerdictValue, d.comparable);
  const studio = briefDepuisTest({
    adId: d.id, variantCode: d.variantCode, concept: d.concept, angle: d.angle, persona: d.persona, personaId: d.personaId,
    verdictStatus: d.verdictStatus, validated: d.validated, comparable: d.comparable,
    testedVariable: d.testedVariable, variableValue: d.variableValue,
    metrics: { cpa: d.metrics.cpa, hookRate: d.metrics.hookRate, ctr: d.metrics.ctr },
    learnings: d.learnings,
  }).eligible ? lienIterationStudio(d.id) : null;
  const pastille = pastilleVerdict(d.computed, d.comparable);
  const source = d.sourceVeille;
  const lienSource = source ? lienSourceVeille(source) : null;

  const suite: PropsActionsFiche['suite'] = !pres.suiteApresVerdict
    ? { type: 'attente', texte: pres.suiteAttente ?? 'L’itération se décide sur le verdict.' }
    : !gagnante
      ? { type: 'perdante', texte: `${REGLE_ITERATION} Reprends l’angle dans un projet pour ouvrir une piste neuve.`, lien: lienNouveauProjet({ type: 'ads', angle: d.angle ?? d.concept ?? '' }) }
      : { type: 'gagnante', studio, etapeCiblee: d.failedStage };

  return (
    <FicheTest
      titre={d.concept}
      sous={[d.variantCode, d.batchNumber !== null ? `lot ${d.batchNumber}` : 'hors lot', d.angle].filter(Boolean).join(' · ')}
      provenance={source ? { nom: source.annonceur || null, url: lienSource?.url ?? null } : null}
      retour={retour}
      resultat={d.computed && pastille ? {
        type: 'mesure',
        verdict: { libelle: pastille.libelle, classe: pastille.classe },
        relatif: !d.comparable,
        etape: d.failedStage ? LIBELLE_ETAPE_TEST[d.failedStage] ?? d.failedStage : null,
        raison: d.reason,
        chiffres: [
          { l: 'Dépense', v: eur(d.metrics.spend) },
          { l: 'Achats', v: d.metrics.purchases === null ? VALEUR_ABSENTE : String(d.metrics.purchases) },
          { l: 'Coût par achat', v: eur(d.metrics.cpa), ...(d.metrics.cpaHi !== null && Number.isFinite(d.metrics.cpaHi) ? { sub: `jusqu’à ${eur(d.metrics.cpaHi)} au haut de l’intervalle` } : {}) },
          { l: 'Accroche · rétention · clic', v: pct(d.metrics.hookRate), sub: `rétention ${pct(d.metrics.holdRate)} · clic ${pct(d.metrics.ctr)}` },
        ],
        protocole: d.protocolSummary,
      } : { type: 'vide', texte: pres.resultatVide ?? 'Aucun chiffre à lire pour l’instant.', prochaine: pres.prochaineEtape }}
      hypothese={d.hypothesis}
      arbitre={arbitre ? { libelle: libelle(d.validated) ?? '', ecart: d.validated !== d.computed } : null}
      apprentissages={d.learnings.map((l) => ({ id: l.id, texte: l.statement, detail: `${libellePorteeTest(l.scope)} · confiance ${l.confidence}/5` }))}
      filiation={{
        parent: d.parent ? { href: lienFicheTest(d.parent.adId), texte: `Vient de ${d.parent.variantCode} · ${libelleVariableTest(d.parent.changedVariable) ?? d.parent.changedVariable} modifié` } : null,
        enfants: d.children.map((c) => ({ href: lienFicheTest(c.adId), texte: `${c.variantCode} · ${libelleVariableTest(c.changedVariable) ?? c.changedVariable}`, verdict: c.verdict ? LIBELLE_VERDICT[c.verdict as VerdictValue]?.court ?? null : null })),
      }}
      actions={<ActionsFiche adId={d.id} arbitrage={!arbitre && d.computed ? { calcule: d.computed } : null} suite={suite} partage={gagnante && g.admin} />}
    />
  );
}
