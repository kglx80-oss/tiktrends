import {
  categorieLot, categorieVariable, etatApprentissage, kpisBoucle, lienLotSpatial, moisCourt, niveauPreuveApprentissage,
  preparationLot, presentationLot, prochaineActionBoucle, sousNavResultats, syntheseLot, type FaitsApprentissage, type FaitsVerdictSpatial,
} from '@tiktrends/core';
import { iterationPlanAction } from '../../../../actions/adsmap-iterate';
import { Boucle, type PropsBoucle } from '../../../../../spatial/vues/resultats/Boucle';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { chargerApprentissages, chargerLots, gardeResultats, type AdLue, type LotLu } from '../donnees';

export const dynamic = 'force-dynamic';

const JOUR = 86_400_000;
const dateCourte = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : null);

/** Boucle d'itération · nouvelle adresse · mêmes gardes que l'Adsmap V5. */
export default async function BoucleSpatial() {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Boucle d’itération" raison={g.raison} />;

  const [d, appris, plan] = await Promise.all([
    chargerLots(g.s.workspaceId, g.marque.id), chargerApprentissages(g.s.workspaceId, g.marque.id), iterationPlanAction(),
  ]);
  const lus = d.lots.map((l) => ({ l, presentation: presentationLot(l, d.ctx), synthese: syntheseLot(l, d.config.targetCpa) }));
  const suites = plan.view?.rows ?? [];

  const parAd = new Map<string, { ad: AdLue; lot: LotLu | null }>();
  for (const l of d.lots) for (const a of l.ads) parAd.set(a.id, { ad: a, lot: l });
  for (const a of d.horsLot) parAd.set(a.id, { ad: a, lot: null });
  const faits: Array<FaitsApprentissage & { lanceLe: string | null }> = appris.map((a) => {
    const x = a.adId ? parAd.get(a.adId) : undefined;
    return {
      id: a.id, enonce: a.enonce, statut: a.statut, refute: a.refute, source: a.source, creeLe: a.creeLe, lanceLe: x?.lot?.lanceLe ?? null,
      ad: x ? { ...x.ad, lot: x.lot ? { id: x.lot.id, numero: x.lot.numero } : null } : null,
    };
  });
  const valides = faits.filter((f) => etatApprentissage(f) === 'valide');

  const toutes = [...d.lots.flatMap((l) => l.ads), ...d.horsLot];
  const verdicts = toutes.map((a) => a.verdict).filter((v): v is FaitsVerdictSpatial => !!v && !!(v.calcule ?? v.retenu));
  const lancements = d.lots.map((l) => l.lanceLe).filter((x): x is string => !!x).sort();
  const cycles = faits.filter((f) => f.source === 'arbitrage' && f.lanceLe)
    .map((f) => (Date.parse(f.creeLe) - Date.parse(f.lanceLe!)) / JOUR).filter((j) => Number.isFinite(j) && j >= 0);

  const idees: PropsBoucle['idees'] = [
    ...suites.slice(0, 3).map((r) => ({
      id: `suite-${r.adId}-${r.changedVariable}`, icone: 'loop', teinte: 'bleu' as const, origine: `Suite · ${r.label}`, texte: r.rationale,
      categorie: categorieVariable(r.changedVariable), action: { libelle: 'Formuler', href: '/adsmap/suites' },
    })),
    ...d.horsLot.filter((a) => a.hypothese?.trim() && (a.statut === 'draft' || a.statut === 'proposed' || a.statut === 'ready')).slice(0, 3).map((a) => ({
      id: a.id, icone: 'img', teinte: 'violet' as const, origine: `Variante hors lot · ${a.concept}`, texte: a.hypothese!.trim(),
      categorie: categorieVariable(a.variable), action: g.admin ? { libelle: 'Ranger dans un lot', href: '/adsmap/lots' } : { libelle: 'Voir', href: '/adsmap/hypotheses' },
    })),
  ];

  const de = (...e: string[]) => lus.filter((x) => e.includes(x.presentation.etat));
  return (
    <Boucle
      sousNav={sousNavResultats({ admin: g.admin })}
      kpis={kpisBoucle({ verdicts, premierLancement: lancements[0] ?? null, cyclesJours: cycles, apprentissages: { total: valides.length, mesures: valides.filter((f) => niveauPreuveApprentissage(f) === 3).length } })}
      prochaine={prochaineActionBoucle(lus, suites.length > 0)}
      idees={idees}
      ajouter="/adsmap/suites"
      preparation={de('composition', 'pret').map(({ l, presentation: p }) => ({
        id: l.id, titre: p.titre, categorie: categorieLot(l), action: { libelle: 'Compléter', href: lienLotSpatial(l.id) },
        ...preparationLot(l, l.ads.filter((a) => a.nomGenere).length),
      }))}
      diffusion={de('diffusion').map(({ l, presentation: p }) => ({
        id: l.id, titre: p.titre, categorie: categorieLot(l), action: { libelle: 'Suivre', href: lienLotSpatial(l.id) },
        image: l.ads[0]?.image ?? null, part: p.anneau.part, jour: `J${p.jour ?? 1} / ${p.fenetre}`,
        bilan: `Bilan le ${dateCourte(p.fin) ?? 'fin de fenêtre'} · rien à faire d’ici là`,
      }))}
      analyse={de('a_conclure', 'a_importer', 'non_concluant').map(({ l, presentation: p, synthese: s }) => ({
        id: l.id, titre: p.titre, categorie: categorieLot(l),
        pubs: [...l.ads].sort((a, b) => Number(b.id === s.gagnante) - Number(a.id === s.gagnante)).slice(0, 2).map((a) => ({ image: a.image, gagne: a.id === s.gagnante })),
        detail: p.etat === 'a_importer' ? `${p.fenetre} jours écoulés · mesures manquantes` : p.etat === 'a_conclure' ? `${s.titre} · prêt à conclure` : `${s.titre} · à arbitrer quand même`,
        statut: p.etat === 'a_conclure' ? { libelle: 'À conclure', classe: 'g' } : p.etat === 'a_importer' ? { libelle: 'À importer', classe: 'w' } : { libelle: 'Non concluant', classe: '' },
        action: p.etat === 'a_importer' && g.admin ? { libelle: 'Importer', href: '/adsmap/import' } : { libelle: p.etat === 'a_conclure' ? 'Conclure' : 'Voir le lot', href: lienLotSpatial(l.id) },
      }))}
      apprentissages={faits.slice(0, 4).map((f) => {
        const e = etatApprentissage(f);
        return {
          id: f.id, niveau: niveauPreuveApprentissage(f), texte: f.enonce,
          statut: e === 'valide' ? { libelle: 'Validé', classe: 'g' } : e === 'retester' ? { libelle: 'À retester', classe: '' } : { libelle: 'À valider', classe: 'w' },
          valide: e === 'valide' ? `Validé en ${moisCourt(f.creeLe)}` : null,
        };
      })}
      alimenter={[
        ...(g.jarvis ? [{ icone: 'chat', teinte: 'bleu' as const, titre: 'Demander à Jarvis', texte: 'Il lit tes lots et tes apprentissages avant de proposer une variante', action: { libelle: 'Ouvrir Jarvis', href: '/jarvis', primaire: true } }] : []),
        { icone: 'eye', teinte: 'ambre' as const, titre: 'Depuis la Veille', texte: 'Une pub qui dure chez un concurrent devient une hypothèse', action: { libelle: 'Explorer la Veille', href: '/veille' } },
        { icone: 'users', teinte: 'vert' as const, titre: 'Avis et personas', texte: 'Les mots de tes clients donnent les meilleures accroches', action: { libelle: 'Voir les personas', href: `/brands/${encodeURIComponent(g.marque.id)}?tab=audience` } },
        ...(g.admin ? [{ icone: 'down', teinte: 'rose' as const, titre: 'Importer des résultats', texte: 'Meta connecté, ou le tableau historique : c’est ce qui permet de conclure', action: { libelle: 'Importer', href: '/adsmap/import' } }] : []),
        { icone: 'bulb', teinte: 'violet' as const, titre: 'Une suite à un test', texte: 'Un test arbitré propose sa suite · une seule variable à la fois', action: { libelle: 'Voir les suites', href: '/adsmap/suites' } },
      ]}
    />
  );
}
