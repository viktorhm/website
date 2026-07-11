// Notification "objet prêt" — Horlogerie Haratyk
// Variables Netlify : GMAIL_USER et GMAIL_APP_PASSWORD (déjà configurées)

import nodemailer from "nodemailer";
import { gabaritEmail } from "./email-template.js";

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
      <p style="margin:0 0 16px;">Bonjour${nom ? " " + String(nom).replace(/</g, "&lt;") : ""},</p>
      <p style="margin:0 0 20px;">Bonne nouvelle : votre <b>${objetSain}</b> est pr&ecirc;t et vous attend &agrave; l'atelier.</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:#F2F0EA;border-radius:8px;font-size:15px;">
        <tr><td style="padding:18px 20px;">
          <div style="font-size:12px;color:#8A8F94;letter-spacing:1px;">TICKET DE D&Eacute;P&Ocirc;T</div>
          <div style="font-size:22px;font-weight:bold;margin-top:2px;">N&deg; ${numero}</div>
        </td></tr>
      </table>

      <p style="margin:20px 0 6px;"><b>Pour le retrait :</b></p>
      <ul style="margin:0 0 16px;padding-left:20px;color:#3A434B;">
        <li>Mercredi et jeudi : 10h &ndash; 18h</li>
        <li>Samedi : 10h &ndash; 14h</li>
      </ul>
      <p style="margin:0;color:#3A434B;">Merci de vous munir de votre ticket de d&eacute;p&ocirc;t.
      R&egrave;glement en <b>esp&egrave;ces ou par ch&egrave;que</b>.</p>`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });

    await transporter.sendMail({
      from: `"Horlogerie Haratyk" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Votre ${objet || "objet"} est prêt — Ticket n° ${numero}`,
      html: gabaritEmail({ titre: "Votre objet est prêt !", corps }),
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
