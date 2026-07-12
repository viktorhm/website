// Envoi de devis par email — Horlogerie Haratyk
// Boutons Accepter / Refuser → devis-reponse.js met à jour Firestore

import nodemailer from "nodemailer";
import { gabaritEmail, boutonEmail } from "./email-template.js";

const SITE = "https://horlogerie-haratyk.fr";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { email, nom, numero, contremarque, objet, lignes, token } = JSON.parse(event.body || "{}");

    if (!email || !numero || !Array.isArray(lignes) || !lignes.length || !token) {
      return { statusCode: 400, body: JSON.stringify({ error: "Données incomplètes" }) };
    }

    const total = lignes.filter(l => !l.optionnelle).reduce((s, l) => s + (parseFloat(l.prix) || 0), 0);

    const lignesHtml = lignes.map(l => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #EFEDE7;">${String(l.designation).replace(/</g, "&lt;")}${l.optionnelle ? ' <em style="color:#A8823C;font-style:normal;font-size:.85em;">(en option)</em>' : ""}</td>
        <td style="padding:10px 0;border-bottom:1px solid #EFEDE7;text-align:right;white-space:nowrap;">${l.optionnelle ? "+ " : ""}${(parseFloat(l.prix) || 0).toFixed(2)} €</td>
      </tr>`).join("");

    const urlBase = `${SITE}/.netlify/functions/devis-reponse?token=${encodeURIComponent(token)}`;
    const aOptions = lignes.some(l => l.optionnelle);

    const corps = `
      <p style="margin:0 0 16px;">Bonjour${nom ? " " + String(nom).replace(/</g, "&lt;") : ""},</p>
      <p style="margin:0 0 20px;">Voici le devis pour votre <b>${String(objet || "objet").replace(/</g, "&lt;")}</b>
      (ticket de d&eacute;p&ocirc;t n&deg; <b>${numero}</b>${contremarque ? ", contremarque <b>" + String(contremarque).replace(/</g, "&lt;") + "</b>" : ""}).</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
        ${lignesHtml}
        <tr>
          <td style="padding:14px 0;font-weight:bold;border-top:2px solid #22282E;">Total</td>
          <td style="padding:14px 0;font-weight:bold;border-top:2px solid #22282E;text-align:right;">${total.toFixed(2)} €</td>
        </tr>
      </table>

      <p style="margin:24px 0 12px;text-align:center;color:#3A434B;">Pour donner suite &agrave; ce devis&nbsp;:</p>
      ${aOptions
        ? boutonEmail("▸ &nbsp;Voir le devis et choisir mes options", urlBase, "#A8823C")
        : boutonEmail("✓ &nbsp;J'accepte le devis", urlBase + "&reponse=accepte", "#3E7A4E")
          + boutonEmail("✗ &nbsp;Je refuse le devis", urlBase + "&reponse=refuse", "#8A8F94")}
      <p style="margin:20px 0 0;font-size:13px;color:#8A8F94;text-align:center;">
        Un simple clic suffit, aucune cr&eacute;ation de compte n&eacute;cessaire.<br>
        Vous pouvez aussi r&eacute;pondre &agrave; cet email ou m'appeler au 07&nbsp;85&nbsp;85&nbsp;10&nbsp;80.
      </p>`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });

    await transporter.sendMail({
      from: `"Horlogerie Haratyk" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Devis n° ${numero} — ${objet || "votre objet"} (${total.toFixed(2)} €)`,
      html: gabaritEmail({ titre: `Devis — ticket n° ${numero}`, corps }),
      text:
`Bonjour${nom ? " " + nom : ""},

Devis pour votre ${objet || "objet"} (ticket n° ${numero}${contremarque ? ", contremarque " + contremarque : ""}) :

${lignes.map(l => `- ${l.designation} : ${(parseFloat(l.prix) || 0).toFixed(2)} €`).join("\n")}

Total : ${total.toFixed(2)} € (TVA non applicable, art. 293 B CGI)

Accepter : ${urlBase}&reponse=accepte
Refuser : ${urlBase}&reponse=refuse

Viktor Haratyk — Horlogerie Haratyk
07 85 85 10 80 · horlogerie-haratyk.fr`
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: "Échec de l'envoi" }) };
  }
}
