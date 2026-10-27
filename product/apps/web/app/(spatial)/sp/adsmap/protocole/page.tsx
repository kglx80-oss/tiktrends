import { DEFAULT_VERDICT_CONFIG, garantiesProtocole, sousNavResultats } from '@tiktrends/core';
import { getSettingsAction } from '../../../../actions/adsmap-protocol';
import { Protocole } from '../../../../../spatial/vues/resultats/Protocole';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { gardeResultats } from '../donnees';

export const dynamic = 'force-dynamic';

/** Protocole · mêmes gardes que la page V5 (`app/(app)/adsmap/protocole`) · lecture membre, écriture admin. */
export default async function ProtocoleSpatial() {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Protocole" raison={g.raison} />;

  const r = await getSettingsAction();
  if (!r.settings) return <RefusResultats titre="Protocole" raison="marque" />;
  // Un réglage enregistré partiellement retombe sur le défaut du moteur, champ par champ.
  const settings = { ...r.settings, verdict: { ...DEFAULT_VERDICT_CONFIG, ...r.settings.verdict } };

  return (
    <Protocole
      sousNav={sousNavResultats({ admin: g.admin })}
      initial={settings}
      garanties={garantiesProtocole({ structure: settings.protocol.structure, cibleCpa: settings.verdict.targetCpa, multiplePerdante: settings.verdict.loserMultiple })}
      peutModifier={g.admin}
    />
  );
}
