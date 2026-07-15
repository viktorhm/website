// Template email HTML — Horlogerie Haratyk
// Utilisé par notify-ready.js et send-devis.js

export function gabaritEmail({ titre, corps }) {
  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background-color:#F2F0EA;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F2F0EA;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:10px;overflow:hidden;">

        <!-- En-tête -->
        <tr><td style="background-color:#22282E;padding:28px 32px;text-align:center;">
          <div style="color:#FFFFFF;font-size:18px;letter-spacing:6px;font-weight:bold;">HORLOGERIE HARATYK</div>
          <div style="color:#C9A55C;font-size:12px;letter-spacing:3px;margin-top:6px;">ARTISAN HORLOGER · MARCQ-EN-BAR&#338;UL</div>
        </td></tr>

        <!-- Filet laiton -->
        <tr><td style="background-color:#A8823C;height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Corps -->
        <tr><td style="padding:32px;color:#22282E;font-size:15px;line-height:1.6;">
          <h1 style="margin:0 0 20px;font-size:20px;font-weight:bold;color:#22282E;">${titre}</h1>
          ${corps}
        </td></tr>

        <!-- Pied -->
        <tr><td style="background-color:#F2F0EA;padding:24px 32px;text-align:center;color:#8A8F94;font-size:12px;line-height:1.7;">
          <b style="color:#22282E;">Horlogerie Haratyk</b> — Viktor Haratyk<br>
          43 rue du Vieux Four, 59700 Marcq-en-Bar&oelig;ul<br>
          07 85 85 10 80 · <a href="https://horlogerie-haratyk.fr" style="color:#A8823C;text-decoration:none;">horlogerie-haratyk.fr</a><br>
          Ouvert mercredi &amp; jeudi 10h&ndash;18h, samedi 10h&ndash;14h<br>
          <span style="font-size:11px;">TVA non applicable, art. 293 B du CGI</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function boutonEmail(texte, url, couleur = "#A8823C") {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto;"><tr>
    <td style="background-color:${couleur};border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:14px 28px;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:15px;font-family:Georgia,serif;">${texte}</a>
    </td></tr></table>`;
}

// ============================================================
// Gabarit "premium" (sombre) — aligné sur l'email de dépôt
// ============================================================
export const P = {
  ENCRE: "#171D23", CARTE: "#222A32", LAITON: "#C9A55C",
  IVOIRE: "#F4F2EC", GRIS: "#8A939C",
  POLICE: `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`,
  MONO: `'SF Mono',SFMono-Regular,Consolas,'Courier New',monospace`
};

export function gabaritPremium({ titre, intro, corps }) {
  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#EBE8E1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EBE8E1;padding:32px 14px;">
    <tr><td align="center">
      <table role="presentation" width="580" cellpadding="0" cellspacing="0"
             style="max-width:580px;width:100%;background:${P.ENCRE};border-radius:18px;overflow:hidden;">

        <tr><td style="padding:34px 32px 26px;text-align:center;">
          <div style="font-family:${P.POLICE};font-size:19px;font-weight:800;letter-spacing:7px;color:${P.IVOIRE};">HORLOGERIE&nbsp;HARATYK</div>
          <div style="font-family:${P.POLICE};font-size:11px;letter-spacing:4px;color:${P.LAITON};margin-top:7px;">ARTISAN HORLOGER &middot; MARCQ-EN-BAR&OElig;UL</div>
        </td></tr>
        <tr><td style="padding:0 32px;"><div style="height:2px;background:linear-gradient(90deg,transparent,${P.LAITON},transparent);font-size:0;">&nbsp;</div></td></tr>

        <tr><td style="padding:28px 32px 6px;font-family:${P.POLICE};">
          <div style="font-size:22px;font-weight:700;color:${P.IVOIRE};">${titre}</div>
          ${intro ? `<div style="font-size:14px;color:${P.GRIS};margin-top:6px;line-height:1.6;">${intro}</div>` : ""}
        </td></tr>

        <tr><td style="padding:20px 32px 6px;">${corps}</td></tr>

        <tr><td style="padding:24px 32px 30px;text-align:center;font-family:${P.POLICE};font-size:12px;color:${P.GRIS};line-height:1.8;">
          <b style="color:${P.IVOIRE};">Viktor Haratyk</b> &middot; Horlogerie Haratyk<br>
          43 rue du Vieux Four, 59700 Marcq-en-Bar&oelig;ul<br>
          07 85 85 10 80 &middot; <a href="https://horlogerie-haratyk.fr" style="color:${P.LAITON};text-decoration:none;">horlogerie-haratyk.fr</a><br>
          <span style="font-size:11px;">Mercredi &amp; jeudi 10h&ndash;18h &middot; Samedi 10h&ndash;14h &middot; TVA non applicable, art. 293 B du CGI</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function boutonPremium(texte, url, fond = P.LAITON, texteCouleur = "#14100A") {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto;"><tr>
    <td style="background:${fond};border-radius:10px;">
      <a href="${url}" style="display:inline-block;padding:15px 30px;color:${texteCouleur};text-decoration:none;font-weight:bold;font-size:15px;font-family:${P.POLICE};">${texte}</a>
    </td></tr></table>`;
}

export function friseEtapes(etapeActive) {
  const etapes = ["Dépôt", "Diagnostic", "Devis", "Réparation", "Prêt"];
  const idx = etapes.indexOf(etapeActive);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;"><tr>
    ${etapes.map((e, i) => {
      const actif = i <= idx;
      return `<td align="center" style="font-family:${P.POLICE};font-size:11px;letter-spacing:.5px;color:${actif ? P.LAITON : P.GRIS};padding:0 2px;">
        <div style="width:10px;height:10px;border-radius:50%;margin:0 auto 6px;background:${actif ? P.LAITON : "transparent"};border:2px solid ${actif ? P.LAITON : P.GRIS};"></div>${e}</td>`;
    }).join("")}
  </tr></table>`;
}
