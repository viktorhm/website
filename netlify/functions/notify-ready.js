// Notification "objet prêt" — Horlogerie Haratyk
// Utilise les mêmes variables d'environnement Gmail que la boutique :
// GMAIL_USER et GMAIL_APP_PASSWORD (déjà configurées sur Netlify)

import nodemailer from "nodemailer";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { email, nom, numero, objet } = JSON.parse(event.body || "{}");

    if (!email || !numero) {
      return { statusCode: 400, body: JSON.stringify({ error: "email et numero requis" }) };
    }
    const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailValide) {
      return { statusCode: 400, body: JSON.stringify({ error: "Email invalide" }) };
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `"Horlogerie Haratyk" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Votre ${objet || "objet"} est prêt — Ticket n° ${numero}`,
      text:
`Bonjour${nom ? " " + nom : ""},

Votre ${objet || "objet"} (ticket de dépôt n° ${numero}) est prêt et vous attend à l'atelier.

Horaires d'ouverture :
Mercredi et jeudi : 10h – 18h
Samedi : 10h – 14h

Merci de vous munir de votre ticket de dépôt lors du retrait.
Règlement possible en espèces ou par chèque.

À bientôt,

Viktor Haratyk
Horlogerie Haratyk
43 rue du Vieux Four, 59700 Marcq-en-Barœul
07 85 85 10 80
horlogerie-haratyk.fr`
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: "Échec de l'envoi" }) };
  }
}
