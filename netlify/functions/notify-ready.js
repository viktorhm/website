// Notification "objet prêt" — Horlogerie Haratyk
// Variables Netlify : GMAIL_USER et GMAIL_APP_PASSWORD (déjà configurées)

import nodemailer from "nodemailer";
import { gabaritPremium, friseEtapes, P } from "./email-template.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { email, nom, numero, objet } = JSON.parse(event.body || "{}");

    if (!email || !numero) {
      return { statusCode: 400, body: JSON.stringify({ error: "email et numero requis" }) };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Email invalide" }) };
    }

    const objetSain = String(objet || "objet").replace(/</g, "&lt;");
    const corps = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:${P.CARTE};border-radius:14px;border-left:4px solid #4CAF77;margin-bottom:16px;">
        <tr><td style="padding:22px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border:1px solid ${P.LAITON};border-radius:8px;padding:8px 14px;font-family:${P.MONO};font-size:17px;font-weight:bold;color:${P.LAITON};letter-spacing:1px;white-space:nowrap;">N&deg; ${numero}</td>
          </tr></table>
          <div style="font-family:${P.POLICE};font-size:15px;color:${P.IVOIRE};margin-top:12px;line-height:1.6;">
            Votre <b>${objetSain}</b> est pr&ecirc;t et vous attend &agrave; l'atelier.
          </div>
        </td></tr>
      </table>

      ${friseEtapes("Prêt")}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:${P.CARTE};border-radius:12px;margin-top:16px;">
        <tr><td style="padding:18px 22px;font-family:${P.POLICE};font-size:13px;color:${P.GRIS};line-height:1.8;">
          <b style="color:${P.IVOIRE};">Retrait &agrave; l'atelier</b><br>
          Mercredi &amp; jeudi 10h&ndash;18h &middot; Samedi 10h&ndash;14h<br>
          R&egrave;glement en esp&egrave;ces ou par ch&egrave;que.<br>
          <span style="color:${P.LAITON};">Merci de vous munir de votre num&eacute;ro de ticket.</span>
        </td></tr>
      </table>`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });

    await transporter.sendMail({
      from: `"Horlogerie Haratyk" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Votre ${objet || "objet"} est prêt — Ticket n° ${numero}`,
      html: gabaritPremium({
        titre: "Votre objet est pr\u00eat !",
        intro: `Bonjour${nom ? " " + String(nom).replace(/</g, "&lt;") : ""}, bonne nouvelle : les travaux sont termin\u00e9s.`,
        corps
      }),
      text:
`Bonjour${nom ? " " + nom : ""},

Votre ${objet || "objet"} (ticket de dépôt n° ${numero}) est prêt et vous attend à l'atelier.

Horaires : mercredi et jeudi 10h-18h, samedi 10h-14h.
Merci de vous munir de votre ticket de dépôt. Règlement en espèces ou par chèque.

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
