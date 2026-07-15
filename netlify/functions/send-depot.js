// Récapitulatif de dépôt par email — Horlogerie Haratyk
// Version "premium" : envoyé automatiquement à la création du/des ticket(s)

import nodemailer from "nodemailer";

const ENCRE = "#171D23";
const CARTE = "#222A32";
const LAITON = "#C9A55C";
const IVOIRE = "#F4F2EC";
const GRIS = "#8A939C";

const POLICE = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`;
const MONO = `'SF Mono',SFMono-Regular,Consolas,'Courier New',monospace`;

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { email, nom, civilite, tickets } = JSON.parse(event.body || "{}");

    if (!email || !Array.isArray(tickets) || !tickets.length) {
      return { statusCode: 400, body: JSON.stringify({ error: "Données incomplètes" }) };
    }

    const ech = s => String(s ?? "").replace(/</g, "&lt;");
    const pluriel = tickets.length > 1;

    const ligneInfo = (label, valeur) => valeur ? `
      <tr>
        <td style="padding:3px 0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${GRIS};width:110px;vertical-align:top;">${label}</td>
        <td style="padding:3px 0;font-size:14px;color:${IVOIRE};line-height:1.5;">${ech(valeur)}</td>
      </tr>` : "";

    const cartes = tickets.map(t => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:${CARTE};border-radius:14px;margin-bottom:14px;border-left:4px solid ${LAITON};">
        <tr><td style="padding:22px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border:1px solid ${LAITON};border-radius:8px;padding:8px 14px;
                       font-family:${MONO};font-size:17px;font-weight:bold;color:${LAITON};
                       letter-spacing:1px;white-space:nowrap;">N° ${ech(t.numero)}</td>
          </tr></table>
          <div style="height:14px;font-size:0;">&nbsp;</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${POLICE};">
            ${ligneInfo("Objet", t.objet)}
            ${ligneInfo("N° série", t.numSerie)}
            ${ligneInfo("État constaté", t.etat)}
            ${ligneInfo("Demande", t.demande)}
          </table>
        </td></tr>
      </table>`).join("");

    const etape = (nom, actif) => `
      <td align="center" style="font-family:${POLICE};font-size:11px;letter-spacing:.5px;
          color:${actif ? LAITON : GRIS};padding:0 2px;">
        <div style="width:10px;height:10px;border-radius:50%;margin:0 auto 6px;
             background:${actif ? LAITON : "transparent"};border:2px solid ${actif ? LAITON : GRIS};"></div>
        ${nom}
      </td>`;

    const html = `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#EBE8E1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EBE8E1;padding:32px 14px;">
    <tr><td align="center">
      <table role="presentation" width="580" cellpadding="0" cellspacing="0"
             style="max-width:580px;width:100%;background:${ENCRE};border-radius:18px;overflow:hidden;">

        <!-- En-tête -->
        <tr><td style="padding:34px 32px 26px;text-align:center;">
          <div style="font-family:${POLICE};font-size:19px;font-weight:800;letter-spacing:7px;color:${IVOIRE};">HORLOGERIE&nbsp;HARATYK</div>
          <div style="font-family:${POLICE};font-size:11px;letter-spacing:4px;color:${LAITON};margin-top:7px;">ARTISAN HORLOGER &middot; MARCQ-EN-BAR&OElig;UL</div>
        </td></tr>
        <tr><td style="padding:0 32px;"><div style="height:2px;background:linear-gradient(90deg,transparent,${LAITON},transparent);font-size:0;">&nbsp;</div></td></tr>

        <!-- Titre -->
        <tr><td style="padding:28px 32px 6px;font-family:${POLICE};">
          <div style="font-size:22px;font-weight:700;color:${IVOIRE};">Confirmation de d&eacute;p&ocirc;t</div>
          <div style="font-size:14px;color:${GRIS};margin-top:6px;line-height:1.6;">
            Bonjour${nom ? " " + ech((civilite ? civilite + " " : "") + nom) : ""}, nous vous confirmons la prise en charge de ${pluriel ? `vos <b style="color:${IVOIRE}">${tickets.length} objets</b>` : "votre objet"} ce jour.
          </div>
        </td></tr>

        <!-- Cartes tickets -->
        <tr><td style="padding:20px 32px 4px;">${cartes}</td></tr>

        <!-- Frise d'avancement -->
        <tr><td style="padding:10px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            ${etape("D&eacute;p&ocirc;t", true)}
            ${etape("Diagnostic", false)}
            ${etape("Devis", false)}
            ${etape("R&eacute;paration", false)}
            ${etape("Pr&ecirc;t", false)}
          </tr></table>
          <div style="font-family:${POLICE};font-size:12px;color:${GRIS};text-align:center;margin-top:12px;line-height:1.6;">
            Vous serez inform&eacute;(e) par email &agrave; chaque &eacute;tape.
          </div>
        </td></tr>

        <!-- Infos retrait -->
        <tr><td style="padding:22px 32px 6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="background:${CARTE};border-radius:12px;">
            <tr><td style="padding:18px 22px;font-family:${POLICE};font-size:13px;color:${GRIS};line-height:1.8;">
              <b style="color:${IVOIRE};">Retrait &agrave; l'atelier</b><br>
              Mercredi &amp; jeudi 10h&ndash;18h &middot; Samedi 10h&ndash;14h<br>
              R&egrave;glement en esp&egrave;ces ou par ch&egrave;que.<br>
              <span style="color:${LAITON};">Conservez cet email : le num&eacute;ro de ticket vous sera demand&eacute;.</span>
            </td></tr>
          </table>
        </td></tr>

        <!-- Pied -->
        <tr><td style="padding:24px 32px 30px;text-align:center;font-family:${POLICE};font-size:12px;color:${GRIS};line-height:1.8;">
          <b style="color:${IVOIRE};">Viktor Haratyk</b> &middot; Horlogerie Haratyk<br>
          43 rue du Vieux Four, 59700 Marcq-en-Bar&oelig;ul<br>
          07 85 85 10 80 &middot; <a href="https://horlogerie-haratyk.fr" style="color:${LAITON};text-decoration:none;">horlogerie-haratyk.fr</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });

    const numeros = tickets.map(t => "n° " + t.numero).join(", ");
    await transporter.sendMail({
      from: `"Horlogerie Haratyk" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: pluriel
        ? `Confirmation de dépôt — ${tickets.length} objets (${numeros})`
        : `Confirmation de dépôt — Ticket ${numeros}`,
      html,
      text:
`Bonjour${nom ? " " + (civilite ? civilite + " " : "") + nom : ""},

Nous vous confirmons la prise en charge de ${pluriel ? "vos " + tickets.length + " objets" : "votre objet"} ce jour.

${tickets.map(t => `Ticket n° ${t.numero} — ${t.objet}${t.demande ? " (" + t.demande + ")" : ""}`).join("\n")}

Vous serez informé(e) par email à chaque étape (diagnostic, devis, objet prêt).
Conservez ce message : le numéro de ticket vous sera demandé au retrait.

Horaires : mercredi et jeudi 10h-18h, samedi 10h-14h.
Règlement en espèces ou par chèque.

Viktor Haratyk — Horlogerie Haratyk
43 rue du Vieux Four, 59700 Marcq-en-Barœul
07 85 85 10 80 · horlogerie-haratyk.fr`
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: "Échec de l'envoi" }) };
  }
}
