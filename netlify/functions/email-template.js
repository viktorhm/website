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
