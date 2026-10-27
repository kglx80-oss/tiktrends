import { EnTete, Ic, Vue } from '../../communs';

/**
 * « MCP TikTrends » · `docs/spatial/reference/mcp.html`, balisage à l'identique.
 *
 * AUCUN backend MCP n'existe · la page reprend la mise en page de la maquette
 * et dit honnêtement que c'est « bientôt » : aucune adresse, aucun jeton, aucun
 * outil, aucune activité. Les contrôles de la maquette (copier, afficher,
 * régénérer, client, mode, validation, plafond, outils) sont rendus DÉSACTIVÉS
 * avec leur raison · aucun ne simule un branchement. Le voyant « en ligne »
 * de la maquette n'est pas reproduit (il serait faux).
 */
const RAISON = 'Bientôt · le serveur MCP TikTrends n’est pas encore ouvert';
const CLIENTS = ['Claude', 'ChatGPT', 'Cursor', 'n8n / Make'];

export function Mcp() {
  return (
    <Vue>
      <EnTete titre="MCP TikTrends" sous="Bientôt · utiliser TikTrends depuis Claude, ChatGPT, Cursor ou tes automatisations" />
      <section className="tile mcphero">
        <div className="mcpst"><b>Bientôt disponible</b><span className="faint">· aucun serveur ouvert, aucun outil exposé</span></div>
        <div className="mcpurl">
          <div><span className="lbl" style={{ margin: 0 }}>Adresse du serveur</span><code>Pas encore attribuée</code></div>
          <button className="btn sm" type="button" disabled title={RAISON}><Ic n="copy" />Copier</button>
        </div>
        <div className="mcpurl">
          <div><span className="lbl" style={{ margin: 0 }}>Jeton d’accès</span><code>Aucun jeton émis</code></div>
          <div className="kc">
            <button className="btn sm" type="button" disabled title={RAISON}><Ic n="eye" />Afficher</button>
            <button className="btn sm" type="button" disabled title={RAISON}><Ic n="loop" />Régénérer</button>
          </div>
        </div>
      </section>
      <div className="agrid2 sec">
        <section className="tile">
          <div className="sech"><h2>Connecter un client</h2></div>
          <div className="seg" role="group" aria-label="Client" style={{ width: '100%', marginBottom: 12 }}>
            {CLIENTS.map((c) => <button key={c} type="button" aria-pressed="false" disabled title={RAISON} style={{ flex: 1 }}>{c}</button>)}
          </div>
          <ol className="mcpsteps">
            <li>Le serveur MCP TikTrends n’est pas encore ouvert.</li>
            <li>Aucune adresse ni aucun jeton n’est émis pour ton espace.</li>
            <li>À l’ouverture, cette page donnera la configuration à coller dans ton client.</li>
          </ol>
          <div className="mcpcode">
            <pre>Aucune configuration · le serveur n’est pas encore ouvert.</pre>
            <button className="btn sm" type="button" disabled title={RAISON}><Ic n="copy" />Copier</button>
          </div>
        </section>
        <section className="tile">
          <div className="sech"><h2>Permissions</h2></div>
          <div className="seg" role="group" aria-label="Mode" style={{ width: '100%', marginBottom: 12 }}>
            <button type="button" aria-pressed="false" disabled title={RAISON} style={{ flex: 1 }}>Lecture seule</button>
            <button type="button" aria-pressed="false" disabled title={RAISON} style={{ flex: 1 }}>Lecture et écriture</button>
          </div>
          <div className="npr">
            <div><strong>Validation humaine avant génération</strong><small>Réglable à l’ouverture du serveur</small></div>
            <button className="tg" type="button" role="switch" aria-checked="false" disabled title={RAISON} aria-label="Validation humaine"><i /></button>
          </div>
          <div className="npr" style={{ marginTop: 8 }}>
            <div><strong>Plafond par jour</strong><small>Aucun crédit ne peut être consommé via le MCP</small></div>
            <input type="range" min="0" max="1000" step="50" defaultValue={0} disabled title={RAISON} aria-label="Plafond de crédits par jour" style={{ width: 150, accentColor: 'var(--acc)' }} />
          </div>
        </section>
      </div>
      <section className="tile sec">
        <div className="sech"><h2>Outils exposés</h2><span className="faint" style={{ fontSize: '12.5px' }}>Aucun outil exposé</span></div>
        <div className="mtools">
          <div className="mtool">
            <div style={{ flex: 1, minWidth: 0 }}><small>Aucun outil n’est exposé tant que le serveur n’est pas ouvert.</small></div>
          </div>
        </div>
      </section>
      <section className="tile sec">
        <div className="sech"><h2>Activité récente</h2></div>
        <div className="atable">
          <p className="faint" style={{ fontSize: '12.5px', margin: 0 }}>Aucune activité · aucun client ne peut encore se connecter.</p>
        </div>
      </section>
    </Vue>
  );
}
