import { EnTete, SousNav, Vue } from '../../communs';
import { ReglesMarque } from './regles-client';

/**
 * « Règles » · `docs/spatial/reference/regles.html` (maquette : `vRegles`).
 * Les règles sont les lignes de `brands.creative_rules` (noyau
 * `lireReglesMarque`), écrites par `saveJarvisRulesAction`. Les sources sont ce
 * que la base porte RÉELLEMENT pour la marque (noyau `sourcesJarvisMarque`).
 */
export interface PropsRegles {
  sousNav: ReadonlyArray<{ href: string; libelle: string }>;
  brandId: string;
  texte: string;
  enregistrer: Parameters<typeof ReglesMarque>[0]['enregistrer'];
  raison: string | null;
  jarvis: string | null;
  sources: Parameters<typeof ReglesMarque>[0]['sources'];
}

export function Regles(p: PropsRegles) {
  return (
    <Vue>
      <EnTete titre="Règles" sous="Ce que Jarvis ne doit jamais faire, et ce qu’il sait" />
      <SousNav items={p.sousNav} actif={`/brands/${p.brandId}/regles`} />
      <ReglesMarque texte={p.texte} enregistrer={p.enregistrer} raison={p.raison} jarvis={p.jarvis} sources={p.sources} />
    </Vue>
  );
}
