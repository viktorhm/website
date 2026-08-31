// Email de restitution — Horlogerie Haratyk
// Envoyé automatiquement quand le ticket passe au statut "rendu"

import nodemailer from "nodemailer";
import { gabaritPremium, boutonPremium, P } from "./email-template.js";

// ⚠ Remplace par TON lien d'avis direct Google (Profil d'établissement
// → "Demander des avis") dès que tu l'as, format https://g.page/r/XXXX/review
const AVIS_URL = "https://www.google.com/maps/search/?api=1&query=Horlogerie+Haratyk+43+rue+du+Vieux+Four+Marcq-en-Barœul";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { email, nom, civilite, numero, objet, garantie, horaires } = JSON.parse(event.body || "{}");

    if (!email || !numero) {
      return { statusCode: 400, body: JSON.stringify({ error: "email et numero requis" }) };
    }

    const ech = s => String(s ?? "").replace(/</g, "&lt;");
    const objetSain = ech(objet || "objet");

    const corps = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:${P.CARTE};border-radius:14px;border-left:4px solid ${P.LAITON};margin-bottom:16px;">
        <tr><td style="padding:22px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border:1px solid ${P.LAITON};border-radius:8px;padding:8px 14px;font-family:${P.MONO};font-size:17px;font-weight:bold;color:${P.LAITON};letter-spacing:1px;white-space:nowrap;">N&deg; ${ech(numero)}</td>
          </tr></table>
          <div style="font-family:${P.POLICE};font-size:15px;color:${P.IVOIRE};margin-top:12px;line-height:1.6;">
            Votre <b>${objetSain}</b> vous a &eacute;t&eacute; restitu&eacute;${garantie ? `,<br>accompagn&eacute; de sa <b style="color:${P.LAITON};">garantie de r&eacute;vision d'un an</b>` : ""}.
          </div>
        </td></tr>
      </table>

      <div style="font-family:${P.POLICE};font-size:14px;color:${P.GRIS};text-align:center;line-height:1.7;margin:6px 0 16px;">
        Merci de votre confiance ! Si l'exp&eacute;rience vous a plu,<br>
        un avis sur Google aide &eacute;norm&eacute;ment un artisan ind&eacute;pendant :
      </div>
      ${boutonPremium("★ &nbsp;Laisser un avis sur Google", AVIS_URL, P.LAITON)}
      <div style="font-family:${P.POLICE};font-size:12px;color:${P.GRIS};text-align:center;margin-top:14px;line-height:1.7;">
        Deux minutes qui comptent beaucoup. Et pour tout besoin futur<br>
        (r&eacute;vision, pile, bracelet), l'atelier reste &agrave; votre service.
      </div>`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });

    await transporter.sendMail({
      from: `"Horlogerie Haratyk" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Merci de votre confiance — Ticket n° ${numero}`,
      html: gabaritPremium({ horaires,
        titre: "À bientôt !",
        intro: `Bonjour${nom ? " " + ech((civilite ? civilite + " " : "") + nom) : ""}, nous vous confirmons la restitution de votre objet ce jour.`,
        corps
      }),
      text:
`Bonjour${nom ? " " + (civilite ? civilite + " " : "") + nom : ""},

Nous vous confirmons la restitution de votre ${objet || "objet"} (ticket n° ${numero}) ce jour${garantie ? ", accompagné de sa garantie de révision d'un an" : ""}.

Merci de votre confiance ! Si l'expérience vous a plu, un avis sur Google aide énormément un artisan indépendant :
${AVIS_URL}

À bientôt,

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
