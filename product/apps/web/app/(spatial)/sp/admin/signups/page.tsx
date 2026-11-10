import {
  LIMITE_DECLARATIONS, VALEUR_ABSENTE, adresseListeTour, dateDeclaration, declarationOnboarding, adminVariation, adminEuros, adminNombre, adminPluriel, adminPourcent,
  comptesARisque, etatExportTour, inscriptions, libellePuceSegment, lirePageTour, mrrARisque, parcoursInscription, tableComptesTour, textePage,
} from '@tiktrends/core';
import { Comptes } from '../../../../../spatial/vues/admin/Comptes';
import { bandeau, chargerDeclarations, chargerEspaces, chargerTarifs, porteAdmin, navAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

const UNITE = { un: 'compte', plusieurs: 'comptes' } as const;
const CHEMIN = '/admin/signups';

/**
 * « Inscriptions & comptes » · `/admin/signups`, écran EXCLUSIF (l'ancienne page
 * est retirée, ses déclarations d'onboarding vivent ici) · fondateur ET admin
 * de l'espace, la même porte que l'ancienne page.
 */
export default async function ComptesSpatial({ searchParams }: { searchParams?: Promise<{ q?: string; segment?: string; page?: string }> }) {
  await porteAdmin();
  const sp = (await searchParams) ?? {};
  const maintenant = new Date();
  const tarifs = await chargerTarifs();
  const [espaces, declarations] = await Promise.all([chargerEspaces(maintenant), chargerDeclarations(LIMITE_DECLARATIONS)]);
  const ins = inscriptions(espaces, tarifs, maintenant);
  const risque = comptesARisque(espaces, tarifs, maintenant);
  const variation = adminVariation(ins.variationPct, 'aucune le mois d’avant');
  const table = tableComptesTour(espaces, tarifs, maintenant, { q: sp.q, segment: sp.segment, page: lirePageTour(sp.page) });
  const definition = table.segments.find((x) => x.cle === table.segment)?.definition ?? '';

  return (
    <Comptes
      bandeau={bandeau(espaces, tarifs, await navAdmin())}
      kpis={[
        { lbl: 'Inscriptions · 30 j', v: adminNombre(ins.n30), d: variation.texte, c: variation.classe },
        { lbl: 'Essais en cours', v: adminNombre(ins.essaisEnCours), d: `Fin dans 7 j : ${adminNombre(ins.essaisFinDans7j)}` },
        { lbl: 'Conversion · inscrits 30 j', v: adminPourcent(ins.conversionPct), d: 'devenus payants' },
        { lbl: 'Comptes à risque', v: adminNombre(risque.length), d: 'au moins un signal', c: risque.length ? 'dn' : '' },
      ]}
      alerte={risque.length ? { comptes: `${adminPluriel(risque.length, 'compte')} à surveiller`, mrr: `${adminEuros(mrrARisque(risque))} de MRR` } : null}
      parcours={parcoursInscription(espaces, tarifs, maintenant).map((e) => ({ libelle: e.libelle, n: adminNombre(e.n), hauteur: e.hauteur, part: e.partPrecedente == null ? null : adminPourcent(e.partPrecedente, 0) }))}
      liste={{
        segments: table.segments.map((x) => ({ cle: x.cle, libelle: libellePuceSegment(x) })),
        segment: table.segment, q: table.q,
        comptes: table.page.lignes, inscrits: espaces.length,
        pagination: table.page.pages > 1 ? {
          texte: `${textePage(table.page, UNITE)} · page ${table.page.page} sur ${table.page.pages}`,
          precedente: table.page.page > 1 ? adresseListeTour(CHEMIN, { q: table.q, segment: table.segment, page: table.page.page - 1 }) : null,
          suivante: table.page.page < table.page.pages ? adresseListeTour(CHEMIN, { q: table.q, segment: table.segment, page: table.page.page + 1 }) : null,
        } : null,
        export: etatExportTour(table.filtrees.length, UNITE),
      }}
      declarations={{
        sous: `Chaque nouveau compte et son profil déclaré à l’onboarding · ${adminPluriel(declarations.length, 'espace')}${declarations.length >= LIMITE_DECLARATIONS ? ' (les plus récents)' : ''}`,
        lignes: declarations.map((d) => ({
          id: d.id, nom: d.nom, proprietaire: d.proprietaire ?? VALEUR_ABSENTE, ...declarationOnboarding(d.onboarding),
          forfait: tarifs.libelles[d.forfait] ?? d.forfait, inscrit: dateDeclaration(d.creeLe), onboarde: d.onboardeLe ? dateDeclaration(d.onboardeLe) : null,
        })),
      }}
      note={`${definition} ${adminPluriel(table.filtrees.length, 'compte')} dans ce filtre${table.q ? ` pour « ${table.q} »` : ''}, sur ${adminPluriel(espaces.length, 'espace inscrit', 'espaces inscrits')} · crédits utilisés = consommation sur 30 jours ÷ dotation de la formule · l’export reprend tout le filtre, toutes pages, colonnes de la table.`}
    />
  );
}
