// Envoi de devis par email — Horlogerie Haratyk
// Boutons Accepter / Refuser → devis-reponse.js met à jour Firestore

import nodemailer from "nodemailer";
import { gabaritPremium, boutonPremium, friseEtapes, P } from "./email-template.js";

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
        <td style="padding:11px 0;border-bottom:1px solid #313B44;font-family:${P.POLICE};font-size:14px;color:${P.IVOIRE};">${String(l.designation).replace(/</g, "&lt;")}${l.optionnelle ? ` <em style="color:${P.LAITON};font-style:normal;font-size:.85em;">(en option)</em>` : ""}</td>
        <td style="padding:11px 0;border-bottom:1px solid #313B44;text-align:right;white-space:nowrap;font-family:${P.MONO};font-size:14px;color:${P.IVOIRE};">${l.optionnelle ? "+ " : ""}${(parseFloat(l.prix) || 0).toFixed(2)} €</td>
      </tr>`).join("");

    const urlBase = `${SITE}/.netlify/functions/devis-reponse?token=${encodeURIComponent(token)}`;
    const aOptions = lignes.some(l => l.optionnelle);

    const corps = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:${P.CARTE};border-radius:14px;border-left:4px solid ${P.LAITON};margin-bottom:16px;">
        <tr><td style="padding:22px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border:1px solid ${P.LAITON};border-radius:8px;padding:8px 14px;font-family:${P.MONO};font-size:17px;font-weight:bold;color:${P.LAITON};letter-spacing:1px;white-space:nowrap;">N&deg; ${numero}</td>
          </tr></table>
          <div style="font-family:${P.POLICE};font-size:14px;color:${P.GRIS};margin-top:12px;">
            <b style="color:${P.IVOIRE};">${String(objet || "objet").replace(/</g, "&lt;")}</b>${contremarque ? " &middot; Contremarque " + String(contremarque).replace(/</g, "&lt;") : ""}
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
            ${lignesHtml}
            <tr>
              <td style="padding:13px 0 0;font-family:${P.POLICE};font-weight:bold;font-size:15px;color:${P.LAITON};border-top:2px solid ${P.LAITON};">Total${aOptions ? " (hors options)" : ""}</td>
              <td style="padding:13px 0 0;text-align:right;font-family:${P.MONO};font-weight:bold;font-size:16px;color:${P.LAITON};border-top:2px solid ${P.LAITON};">${total.toFixed(2)} €</td>
            </tr>
          </table>
        </td></tr>
      </table>

      ${friseEtapes("Devis")}
      <div style="font-family:${P.POLICE};font-size:13px;color:${P.GRIS};text-align:center;margin:12px 0 18px;">Pour donner suite &agrave; ce devis :</div>
      ${aOptions
        ? boutonPremium("Voir le devis et choisir mes options", urlBase, P.LAITON)
        : boutonPremium("&#10003; &nbsp;J'accepte le devis", urlBase + "&reponse=accepte", "#3E7A4E", "#FFFFFF")
          + boutonPremium("&#10007; &nbsp;Je refuse le devis", urlBase + "&reponse=refuse", P.CARTE, P.GRIS)}
      <div style="font-family:${P.POLICE};font-size:12px;color:${P.GRIS};text-align:center;margin-top:14px;line-height:1.7;">
        Un simple clic suffit, aucune cr&eacute;ation de compte n&eacute;cessaire.<br>
        Vous pouvez aussi r&eacute;pondre &agrave; cet email ou m'appeler au 07&nbsp;85&nbsp;85&nbsp;10&nbsp;80.
      </div>`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });

    await transporter.sendMail({
      from: `"Horlogerie Haratyk" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Devis n° ${numero} — ${objet || "votre objet"} (${total.toFixed(2)} €)`,
      html: gabaritPremium({
        titre: "Votre devis est pr\u00eat",
        intro: `Bonjour${nom ? " " + String(nom).replace(/</g, "&lt;") : ""}, voici le devis pour votre objet d\u00e9pos\u00e9 \u00e0 l'atelier.`,
        corps
      }),
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
