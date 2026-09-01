import 'server-only';
import { appUrl } from './mailer';

/** Gabarit HTML commun · e-mail clair, sobre, accent magenta TikTrends. */
function layout(opts: { title: string; body: string; cta?: { label: string; href: string }; footer?: string }): string {
  const btn = opts.cta
    ? `<tr><td style="padding:8px 0 4px"><a href="${opts.cta.href}" style="display:inline-block;background:#fe2c55;color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:999px">${opts.cta.label}</a></td></tr>`
    : '';
  const link = opts.cta ? `<tr><td style="padding:14px 0 0;font-size:12px;color:#8a8a99;line-height:1.5">Ou copie ce lien : <br><span style="color:#fe2c55;word-break:break-all">${opts.cta.href}</span></td></tr>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:28px 12px"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #ececf0">
      <tr><td style="padding:22px 28px 0">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="width:30px;height:30px;background:linear-gradient(135deg,#fe2c55,#ff5c7a);border-radius:9px"></td>
          <td style="padding-left:10px;font-weight:800;font-size:17px;color:#0d070c">TikTrends</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:18px 28px 26px">
        <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#0d070c">${opts.title}</h1>
        <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#3a3a42;line-height:1.6">
          <tr><td>${opts.body}</td></tr>
          ${btn}
          ${link}
        </table>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #ececf0;font-size:11.5px;color:#9a9aa6;line-height:1.5">
        ${opts.footer || 'TikTrends · Creative Intelligence pour marques et agences.'}<br>
        <a href="${appUrl()}" style="color:#9a9aa6">app.tiktrends.co</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function welcomeEmail(name: string | null, workspaceName: string) {
  const hi = name ? name.split(/\s+/)[0] : 'toi';
  const html = layout({
    title: `Bienvenue, ${hi} 👋`,
    body: `Ton espace <b>${workspaceName}</b> est prêt. Connecte une marque, importe tes produits et génère tes premières créas IA en quelques minutes. Ton essai est déjà actif · aucune carte requise.`,
    cta: { label: 'Ouvrir mon espace', href: `${appUrl()}/dashboard` },
    footer: "Tu reçois cet e-mail car un espace vient d'être créé avec cette adresse.",
  });
  return { subject: 'Bienvenue sur TikTrends 🎬', html, text: strip(html) };
}

export function inviteEmail(opts: { inviterName: string | null; workspaceName: string; roleLabel: string; token: string }) {
  const inviter = opts.inviterName || 'Un membre';
  const href = `${appUrl()}/invite/${opts.token}`;
  const html = layout({
    title: `Rejoins ${opts.workspaceName}`,
    body: `${inviter} t'invite à rejoindre l'espace <b>${opts.workspaceName}</b> sur TikTrends en tant que <b>${opts.roleLabel}</b>. Clique pour définir ton mot de passe et accéder à l'espace.`,
    cta: { label: "Accepter l'invitation", href },
    footer: 'Cette invitation expire dans 7 jours.',
  });
  return { subject: `Invitation à rejoindre ${opts.workspaceName} sur TikTrends`, html, text: strip(html) };
}

export function resetEmail(token: string) {
  const href = `${appUrl()}/reset/${token}`;
  const html = layout({
    title: 'Réinitialise ton mot de passe',
    body: `Tu as demandé à réinitialiser ton mot de passe TikTrends. Ce lien est valable <b>1 heure</b>. Si tu n'es pas à l'origine de cette demande, ignore simplement cet e-mail.`,
    cta: { label: 'Choisir un nouveau mot de passe', href },
    footer: 'Pour ta sécurité, ce lien expire dans 1 heure et ne fonctionne qu\'une fois.',
  });
  return { subject: 'Réinitialiser ton mot de passe TikTrends', html, text: strip(html) };
}

/**
 * La lettre hebdomadaire.
 *
 * Elle ne porte qu'un geste · une lettre qui propose cinq choses ne fait rien
 * faire. Et elle n'est envoyée que quand la semaine a produit quelque chose,
 * c'est le noyau qui en décide (`worthSending`).
 */
export function digestEmail(opts: {
  brandName: string; headline: string; lines: string[];
  action: { label: string; href: string; why: string } | null;
}) {
  const lignes = opts.lines.map((l) => `<li style="margin:0 0 6px">${l}</li>`).join('');
  const pourquoi = opts.action
    ? `<p style="margin:14px 0 0;font-size:13px;color:#6a6a76;line-height:1.55">${opts.action.why}</p>`
    : '';
  const html = layout({
    title: opts.headline,
    body: `${lignes ? `<ul style="margin:0;padding-left:18px">${lignes}</ul>` : ''}${pourquoi}`,
    cta: opts.action ? { label: opts.action.label, href: `${appUrl()}${opts.action.href}` } : undefined,
    footer: `Récapitulatif hebdomadaire de ${opts.brandName} · envoyé uniquement les semaines où il s'est passé quelque chose.`,
  });
  return { subject: `${opts.brandName} · ${opts.headline}`, html, text: strip(html) };
}
