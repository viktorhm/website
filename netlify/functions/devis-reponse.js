// Réponse au devis (lien Accepter/Refuser du mail) — Horlogerie Haratyk
// Utilise firebase-admin (variable FIREBASE_SERVICE_ACCOUNT déjà configurée
// sur Netlify pour la boutique) : met à jour le ticket puis affiche une
// page de confirmation au client.

import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}
const db = admin.firestore();

function page(titre, message, ok = true) {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre} — Horlogerie Haratyk</title></head>
<body style="margin:0;background:#F2F0EA;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="background:#fff;border-radius:10px;padding:40px 36px;max-width:440px;text-align:center;margin:16px;">
  <div style="font-weight:bold;letter-spacing:5px;border-top:3px solid #A8823C;border-bottom:3px solid #A8823C;padding:12px 0;margin-bottom:24px;">HORLOGERIE HARATYK</div>
  <div style="font-size:44px;margin-bottom:12px;">${ok ? "✓" : "✗"}</div>
  <h1 style="font-size:20px;margin:0 0 12px;color:#22282E;">${titre}</h1>
  <p style="color:#3A434B;line-height:1.6;margin:0;">${message}</p>
  <p style="margin-top:24px;font-size:13px;color:#8A8F94;">Horlogerie Haratyk · 07 85 85 10 80<br>
  Mercredi &amp; jeudi 10h–18h, samedi 10h–14h</p>
</div></body></html>`;
}

export async function handler(event) {
  const { token, reponse } = event.queryStringParameters || {};

  if (!token || !["accepte", "refuse"].includes(reponse)) {
    return { statusCode: 400, headers: { "Content-Type": "text/html; charset=utf-8" },
      body: page("Lien invalide", "Ce lien de réponse au devis est incomplet ou invalide.", false) };
  }

  try {
    const snap = await db.collection("tickets").where("devis.token", "==", token).limit(1).get();

    if (snap.empty) {
      return { statusCode: 404, headers: { "Content-Type": "text/html; charset=utf-8" },
        body: page("Devis introuvable", "Ce lien ne correspond à aucun devis en cours. Contactez-moi au 07 85 85 10 80.", false) };
    }

    const docRef = snap.docs[0].ref;
    const ticket = snap.docs[0].data();

    // Déjà répondu ? On n'écrase pas.
    if (["accepte", "refuse"].includes(ticket.devis?.statut)) {
      const deja = ticket.devis.statut === "accepte" ? "accepté" : "refusé";
      return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
        body: page("Réponse déjà enregistrée", `Ce devis a déjà été ${deja}. Si vous souhaitez modifier votre réponse, appelez-moi au 07 85 85 10 80.`) };
    }

    await docRef.update({
      "devis.statut": reponse,
      "devis.dateReponse": new Date().toISOString(),
      statut: reponse,
      historique: admin.firestore.FieldValue.arrayUnion({ statut: reponse, date: new Date().toISOString() }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (reponse === "accepte") {
      return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
        body: page("Devis accepté", `Merci ! Votre accord pour le ticket n° ${ticket.numero} est bien enregistré. Je commence les travaux et je vous préviens dès que c'est prêt.`) };
    }
    return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
      body: page("Devis refusé", `Votre refus pour le ticket n° ${ticket.numero} est bien enregistré. Votre objet reste disponible à l'atelier — passez le récupérer aux horaires d'ouverture.`) };

  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers: { "Content-Type": "text/html; charset=utf-8" },
      body: page("Erreur", "Une erreur est survenue. Réessayez ou contactez-moi au 07 85 85 10 80.", false) };
  }
}
