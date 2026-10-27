import { redirect } from 'next/navigation';
import { aPermissionPlateforme } from '@tiktrends/core';
import { gardePlateforme } from '../../../../../../lib/studios/prompts/garde-prompts';
import { environnementPrompts } from '../../../../../../lib/studios/prompts/environnement';
import {
  vueBenchmark, vueConnaissances, vueEvaluations, vueExecutions, vueReleases, vueRoutage, vueVersions,
} from '../../../../../../lib/studios/prompts/vues-registre';
import { ONGLETS_REGISTRE, Registre, type ContenuRegistre, type OngletRegistre } from '../../../../../../spatial/vues/admin/Registre';
import { bandeauSeul } from '../../donnees';

export const dynamic = 'force-dynamic';

type Parametres = { onglet?: string; cle?: string; v?: string; comparer?: string; run?: string };

/**
 * « Registre IA » · NOUVELLE adresse de l'éditeur du registre de prompts
 * (l'ancien `/admin/ia-studios` V5 · cette adresse sert désormais « Modèles IA »
 * de la maquette). Même garde que l'écran V5 · `prompt.read` (accès total
 * d'équipe), AVANT toute lecture ; un compte sans la permission est renvoyé.
 * Chaque geste est permis par sa propre permission (`prompt.draft`,
 * `prompt.publish`, `prompt.rollback`, `prompt.evaluate`,
 * `run.inspect_redacted`) et la commande serveur la repose.
 */
export default async function RegistreSpatial({ searchParams }: { searchParams?: Promise<Parametres> } = {}) {
  const g = await gardePlateforme('prompt.read');
  if (!g.ok) redirect(g.code === 'AUTH_REQUIRED' ? '/login' : '/dashboard');
  const sp = (await searchParams) ?? {};
  const onglet: OngletRegistre = ONGLETS_REGISTRE.find((o) => o.id === sp.onglet)?.id ?? 'prompts';
  const peut = (p: Parameters<typeof aPermissionPlateforme>[1]) => aPermissionPlateforme(g.ctx.permissions, p);

  let contenu: ContenuRegistre | null = null;
  let erreur: { message: string; traceId: string } | null = null;
  try {
    if (onglet === 'prompts' || onglet === 'recettes') {
      const types = onglet === 'recettes' ? (['recette'] as const) : (['template', 'conversation', 'socle', 'rendu'] as const);
      const v = await vueVersions(types, sp.cle ?? null, sp.v ?? null, sp.comparer ?? null);
      contenu = { onglet, cles: v.cles, detail: v.detail, plan: v.plan, brouillonsImportes: v.brouillonsImportes, peutEditer: peut('prompt.draft') };
    } else if (onglet === 'releases') {
      const r = await vueReleases();
      contenu = {
        onglet, releases: r.releases, pointee: r.pointee, selection: r.selection, environnement: environnementPrompts(process.env),
        peutPublier: peut('prompt.publish'), peutRevenir: peut('prompt.rollback'), peutEvaluer: peut('prompt.evaluate'), peutCreer: peut('prompt.draft'),
      };
    } else if (onglet === 'evaluations') {
      const [benchmark, evaluations] = await Promise.all([vueBenchmark(), vueEvaluations()]);
      contenu = { onglet, benchmark, evaluations, peutEvaluer: peut('prompt.evaluate') };
    } else if (onglet === 'routage') {
      contenu = { onglet, lignes: vueRoutage() };
    } else if (onglet === 'executions') {
      const autorise = peut('run.inspect_redacted');
      const e = autorise ? await vueExecutions(sp.run ?? null) : { runs: [], detail: null };
      contenu = { onglet, autorise, runs: e.runs, detail: e.detail };
    } else {
      contenu = { onglet, ...(await vueConnaissances()) };
    }
  } catch (e) {
    console.error(`[registre] ${g.ctx.traceId}`, (e as Error).message);
    erreur = { message: 'Lecture du registre impossible pour le moment.', traceId: g.ctx.traceId };
  }

  return <Registre bandeau={await bandeauSeul()} onglet={onglet} contenu={contenu} erreur={erreur} />;
}
