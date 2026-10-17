import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { canAccess, denyReason, FEATURES, roleAtLeast } from '../../../lib/rbac';
import { SyncButton } from './SyncButton';
import { ShareButton } from './ShareButton';
import { getActiveBrand } from '../../../lib/brands';
import { listBatchesAction } from '../../actions/adsmap';
import { PageInfo } from '../../../components/PageInfo';
import { Views } from './Views';
import { effectiveAccess } from '../../../lib/access';
import { Empty } from '../../../components/Empty';
import { Icon } from '../../../components/Icon';
import { CIBLE_TACTILE_MIN, lireLienProfondAdsmap, parcoursResultats, ongletsResultats } from '@tiktrends/core';
import { compterBoucle } from '../../../lib/boucle-resultats';
import { ParcoursBoucle } from '../../../components/ParcoursBoucle';
import { BarreOnglets } from '../../../components/BarreOnglets';
import { BlocJarvisResultats } from './BlocJarvisResultats';
import { ApercuLots } from './ApercuLots';
import { adsDeLaMarque } from '../../../lib/adsmap-marque';
import { SectionEssais } from '../jarvis/sections/SectionEssais';
import { cadrePage, colonneLecture, surface, h1 } from '../../../components/ui';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'adsmap')!;

/**
 * ADSMAP · deux lectures du même graphe.
 *
 * La Table répond à « où en est ce test » et porte la compatibilité descendante
 * avec le tableur. La Carte répond à ce qu'aucune ligne ne dira jamais : d'où
 * vient ce gagnant, et qu'est-ce qu'on n'a pas encore essayé.
 */
export default async function AdsMapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');

  if (!canAccess(effectiveAccess(s), feature)) {
    const why = denyReason(effectiveAccess(s), feature);
    return (
      <main style={cadrePage}><div style={colonneLecture('fil')}>
        <h1 style={h1}>Résultats</h1>
        <div style={{ marginTop: 20, padding: 28, ...surface, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ color: 'var(--muted)' }}><Icon name="lock" size={34} /></div>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '10px auto 0', lineHeight: 1.6 }}>
            {why === 'plan'
              ? 'Adsmap est disponible à partir de l’offre Plus.'
              : 'Ton rôle ne permet pas d’accéder à Adsmap.'}
          </p>
          {why === 'plan' && (
            <Link href="/billing" style={{ display: 'inline-block', marginTop: 16, padding: '9px 18px', borderRadius: 999, background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>
              Voir les formules ›
            </Link>
          )}
        </div>
      </div></main>
    );
  }

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) {
    return (
      <main style={cadrePage}><div style={colonneLecture('fil')}>
        <h1 style={h1}>Résultats</h1>
        <div style={{ marginTop: 20 }}>
          <Empty
            tone="todo" title="Sélectionne une marque active."
            why="Adsmap travaille marque par marque · chacune a sa carte, ses lots et ses seuils."
            action={{ label: 'Choisir une marque', href: '/brands' }}
          />
        </div>
      </div></main>
    );
  }

  const batches = await listBatchesAction();
  // Date de dernière mesure · un verdict de la semaine dernière présenté sans
  // date se lit comme un verdict d'aujourd'hui.
  const [row] = db
    ? await db.select({ at: schema.brands.adsmapSyncedAt }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1)
    : [];
  const peutMesurer = roleAtLeast(s.role, 'admin');

  // Les onglets de section (V5) · un onglet n'est PROPOSÉ que si la fonction de
  // sa page est accessible au rôle et à la formule courants · on lit l'accès
  // réel (`canAccess`), on ne décide rien ici. `lots` et `import` sont réservés
  // aux admins · un membre ne les voit pas, comme dans le rail.
  const acces = effectiveAccess(s);
  const fonctionsOnglets = new Set(['adsmap', 'tri', 'lots', 'protocole', 'import', 'suites']);
  const accessibles = new Set(
    FEATURES.filter((f) => fonctionsOnglets.has(f.key) && canAccess(acces, f)).map((f) => f.key),
  );
  const onglets = ongletsResultats(accessibles, '/adsmap');
  // Jarvis a sa propre porte (`refusJarvis`, formule Core et rôle member) · on
  // ne propose l'invite que si Jarvis est réellement ouvert.
  const jarvisFeature = FEATURES.find((f) => f.key === 'jarvis');
  const jarvisOuvert = !!jarvisFeature && canAccess(acces, jarvisFeature);

  // Le lien profond d'une carte du Studio (I1) · `?ad=<id>&depuis=studio` ouvre
  // le panneau de CE test. Lecture seule · l'ouvrir n'écrit rien. On ne l'ouvre
  // que si l'ad appartient à la marque active · sinon on le dit, sans afficher
  // le test d'une autre marque sous le nom de celle-ci.
  const profond = lireLienProfondAdsmap(await searchParams);
  const testProfond = profond.adId
    ? { adId: profond.adId, depuisStudio: profond.depuisStudio, introuvable: !(await adsDeLaMarque(s.workspaceId, brand.id, [profond.adId])).has(profond.adId) }
    : null;

  // La boucle · comptes réels de la marque active, lecture seule (aucune
  // écriture, aucun appel externe). Sans base, pas de parcours (pas de zéros).
  const compte = await compterBoucle({ workspaceId: s.workspaceId, brandId: brand.id, lots: batches, derniereMesure: row?.at ? row.at.toISOString() : null });
  const parcours = compte ? parcoursResultats(compte, { peutAgir: peutMesurer }) : null;

  return (
    <main style={cadrePage}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={h1}>Résultats</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {brand.name}</span>
        <span style={{ flex: 1, minWidth: 12 }} />
        {/* L'en-tête porte les ACTIONS · importer, partager, mesurer. La
            navigation entre les six écrans du module vit dans la barre d'onglets
            sous le sous-titre (V5), plus le rail · pas une rangée de boutons
            d'action mêlée à la navigation. */}
        {accessibles.has('import') && (
          <Link href="/adsmap/import" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN, padding: '0 16px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
            <Icon name="upload" size={16} /> Importer des résultats
          </Link>
        )}
        {peutMesurer && <ShareButton />}
        {peutMesurer && <SyncButton syncedAt={row?.at ? row.at.toISOString() : null} />}
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 3, marginBottom: 12, maxWidth: 720, lineHeight: 1.5 }}>
        De la création au prochain test, sans perdre le contexte.
      </p>

      {/* Les onglets de section (V5) · routes réelles, libellés de la maquette,
          filtrés par les droits. Purement navigation · chaque page garde sa garde. */}
      <BarreOnglets zone="resultats" libelle="Sections des résultats" onglets={onglets} />

      {/* L'invite Jarvis · ouvre le vrai Jarvis de la marque, rien de simulé. */}
      {jarvisOuvert && <BlocJarvisResultats />}

      {/* Les lots de test de la marque, en cartes · données réelles, aucune
          performance affichée (une carte de lot n'est pas une mesure). */}
      <ApercuLots lots={batches} peutVoirLots={accessibles.has('lots')} />

      {/* UX V2 · lot 4a · la boucle hypothèse → lot → mesures → apprentissage,
          lue sur les comptes RÉELS de la marque (`compterBoucle`, lecture seule)
          et présentée par le noyau (`parcoursResultats`) · une étape sans
          donnée le dit, avec le chemin qui la remplit (selon le rôle). Les
          anciens raccourcis (Préparer un test, Voir les suites, Apprentissages)
          doublonnaient les onglets de section · leurs destinations vivent
          dans les étapes. */}
      {parcours && (
        <section aria-label="La boucle de test" style={{ margin: '0 0 14px' }}>
          {parcours.avertissement && (
            <p role="status" data-avertissement-boucle style={{ margin: '0 0 8px', padding: '9px 12px', ...surface, background: 'var(--surface)', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {parcours.avertissement}
            </p>
          )}
          <ParcoursBoucle titre="Boucle de test · hypothèse, lot, mesures, apprentissage" etapes={parcours.etapes} prochaine={parcours.prochaine} />
        </section>
      )}

      {/* La mention honnête de la maquette · le principe de l'écran, dit en clair.
          Aucune perf n'est fabriquée · tant que rien n'est importé, rien n'est montré. */}
      <p data-mention-mesure style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
        <Icon name="info" size={15} /> Aucune performance n’est affichée sans mesure importée.
      </p>

      <div style={{ margin: '0 0 10px' }}>
        <PageInfo title="lire cette carte" mb={0} minHeight={CIBLE_TACTILE_MIN}>
          Une ad n’entre en test qu’avec une <b>hypothèse</b> et <b>une seule variable</b> modifiée : c’est ce qui permet
          d’attribuer un résultat à une cause. Le verdict est <b>calculé</b>, pas saisi · un astérisque signale un test
          hors protocole, dont la conclusion ne vaut que par comparaison au sein du lot. Le <b>CPA</b> est suivi de sa
          borne haute : avec peu d’achats, l’écart entre les deux dit à quel point le chiffre est encore incertain.
          L’onglet <b>Carte</b> montre la même chose autrement : avatar → désir → angle → concept → ad, avec les
          <b> branches mortes</b> en pointillé · un angle jamais décliné ou une gagnante jamais itérée ne se voient
          que là.
        </PageInfo>
      </div>

      {/* Les tests eux-mêmes · ancre des étapes « Voir les tests » et « Arbitrer ». */}
      <div id="tests" style={{ scrollMarginTop: 80 }}>
        <Views batches={batches} canBuild={peutMesurer} testProfond={testProfond} marque={brand.name} />
      </div>

      {/* Ce que Jarvis a appris de ces tests · essais, Score Jarvis, relectures.
          Le cumul vit là où on lit les tests, plus sous la conversation. Self-porté
          (offre Plus, marque active) · l'écran Adsmap est déjà derrière la même
          porte, la section double la garde par sûreté et rend null sinon. */}
      <SectionEssais />
    </main>
  );
}
