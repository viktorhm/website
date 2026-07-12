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

const LOGO_HTML = `<img src="https://horlogerie-haratyk.fr/logo.svg" alt="Horlogerie Haratyk"
  style="height:120px;display:block;margin:-10px auto 4px;">`;

function page(titre, message, icone = "ok") {
  const symboles = {
    ok:     '<div style="font-size:46px;margin-bottom:12px;color:#3E7A4E;">✓</div>',
    refus:  '<div style="font-size:46px;margin-bottom:12px;color:#C0392B;font-weight:bold;">✗</div>',
    erreur: '<div style="font-size:46px;margin-bottom:12px;color:#C0392B;font-weight:bold;">✗</div>'
  };
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre} — Horlogerie Haratyk</title></head>
<body style="margin:0;background:#F2F0EA;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="background:#fff;border-radius:10px;padding:32px 36px 40px;max-width:460px;text-align:center;margin:16px;">
  ${LOGO_HTML}
  <div style="font-weight:bold;letter-spacing:5px;border-top:3px solid #A8823C;border-bottom:3px solid #A8823C;padding:12px 0;margin-bottom:24px;">HORLOGERIE HARATYK</div>
  ${symboles[icone] || symboles.ok}
  <h1 style="font-size:20px;margin:0 0 12px;color:#22282E;">${titre}</h1>
  <p style="color:#3A434B;line-height:1.7;margin:0;">${message}</p>
  <p style="margin-top:26px;font-size:13px;color:#8A8F94;">Horlogerie Haratyk — Viktor Haratyk, artisan horloger<br>
  43 rue du Vieux Four, 59700 Marcq-en-Barœul · 07 85 85 10 80<br>
  Mercredi &amp; jeudi 10h–18h, samedi 10h–14h</p>
</div></body></html>`;
}

async function pageChoix(token) {
  const snap = await db.collection("tickets").where("devis.token", "==", token).limit(1).get();
  if (snap.empty) {
    return { statusCode: 404, headers: { "Content-Type": "text/html; charset=utf-8" },
      body: page("Devis introuvable", "Ce lien ne correspond à aucun devis en cours. Contactez-moi au 07 85 85 10 80.", "erreur") };
  }
  const t = snap.docs[0].data();
  if (["accepte", "refuse"].includes(t.devis?.statut)) {
    const deja = t.devis.statut === "accepte" ? "accepté" : "refusé";
    return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
      body: page("Réponse déjà enregistrée", `Ce devis a déjà été ${deja}. Pour modifier votre réponse, nous vous invitons à contacter l'atelier au 07 85 85 10 80.`) };
  }

  const lignes = t.devis?.lignes || [];
  const ech = s => String(s ?? "").replace(/</g, "&lt;");
  const base = lignes.filter(l => !l.optionnelle);
  const totalBase = base.reduce((s, l) => s + (parseFloat(l.prix) || 0), 0);

  const lignesHtml = lignes.map((l, i) => {
    const prix = (parseFloat(l.prix) || 0).toFixed(2);
    if (!l.optionnelle) {
      return `<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #E5E2DA;">
        <span>${ech(l.designation)}</span><b style="white-space:nowrap">${prix} €</b></div>`;
    }
    return `<label style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #E5E2DA;cursor:pointer;align-items:center;">
      <span style="display:flex;gap:10px;align-items:center;">
        <input type="checkbox" class="opt" data-i="${i}" data-prix="${parseFloat(l.prix) || 0}" style="width:20px;height:20px;accent-color:#A8823C;">
        <span>${ech(l.designation)} <em style="color:#A8823C;font-style:normal;font-size:.85em;">(en option)</em></span>
      </span><b style="white-space:nowrap">+ ${prix} €</b></label>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Devis n° ${t.numero} — Horlogerie Haratyk</title></head>
<body style="margin:0;background:#F2F0EA;font-family:Georgia,serif;padding:24px 12px;">
<div style="background:#fff;border-radius:10px;padding:26px 28px 32px;max-width:520px;margin:0 auto;">
  ${LOGO_HTML}
  <div style="font-weight:bold;letter-spacing:5px;border-top:3px solid #A8823C;border-bottom:3px solid #A8823C;padding:12px 0;margin-bottom:20px;text-align:center;">HORLOGERIE HARATYK</div>
  <h1 style="font-size:19px;color:#22282E;margin:0 0 6px;">Devis — ticket n° ${t.numero}</h1>
  <p style="color:#3A434B;margin:0 0 18px;">${ech([t.typeObjet, t.marque, t.modele].filter(Boolean).join(" · "))}</p>
  ${lignesHtml}
  <div style="display:flex;justify-content:space-between;padding:14px 0;font-weight:bold;border-top:2px solid #22282E;font-size:1.1em;">
    <span>Total</span><b><span id="total">${totalBase.toFixed(2)}</span> €</b>
  </div>
  <p style="font-size:12px;color:#8A8F94;margin:4px 0 20px;">TVA non applicable, art. 293 B du CGI. Cochez les options souhaitées.</p>
  <button id="ok" style="width:100%;padding:15px;background:#3E7A4E;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:bold;font-family:Georgia,serif;cursor:pointer;">✓ J'accepte le devis</button>
  <button id="non" style="width:100%;padding:13px;background:none;color:#8A8F94;border:1px solid #D8D5CD;border-radius:8px;font-size:14px;font-family:Georgia,serif;cursor:pointer;margin-top:10px;">✗ Je refuse le devis</button>
  <p style="text-align:center;font-size:12px;color:#8A8F94;margin-top:18px;">Une question ? 07 85 85 10 80</p>
</div>
<script>
  var base = ${totalBase};
  function maj(){var t=base;document.querySelectorAll(".opt:checked").forEach(function(c){t+=parseFloat(c.dataset.prix)||0});document.getElementById("total").textContent=t.toFixed(2)}
  document.querySelectorAll(".opt").forEach(function(c){c.addEventListener("change",maj)});
  document.getElementById("ok").addEventListener("click",function(){
    var ids=[].map.call(document.querySelectorAll(".opt:checked"),function(c){return c.dataset.i}).join(",");
    location.href="?token=${encodeURIComponent(token)}&reponse=accepte&opts="+ids;
  });
  document.getElementById("non").addEventListener("click",function(){
    if(confirm("Confirmer le refus du devis ?"))location.href="?token=${encodeURIComponent(token)}&reponse=refuse";
  });
</script>
</body></html>`;
  return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
}

export async function handler(event) {
  const { token, reponse, opts } = event.queryStringParameters || {};

  if (!token) {
    return { statusCode: 400, headers: { "Content-Type": "text/html; charset=utf-8" },
      body: page("Lien invalide", "Ce lien de réponse au devis est incomplet ou invalide.", "erreur") };
  }

  // Sans paramètre "reponse" : afficher la page de choix (options cochables)
  if (!reponse) {
    return pageChoix(token);
  }

  if (!["accepte", "refuse"].includes(reponse)) {
    return { statusCode: 400, headers: { "Content-Type": "text/html; charset=utf-8" },
      body: page("Lien invalide", "Ce lien de réponse au devis est invalide.", "erreur") };
  }

  try {
    const snap = await db.collection("tickets").where("devis.token", "==", token).limit(1).get();

    if (snap.empty) {
      return { statusCode: 404, headers: { "Content-Type": "text/html; charset=utf-8" },
        body: page("Devis introuvable", "Ce lien ne correspond à aucun devis en cours. Contactez-moi au 07 85 85 10 80.", "erreur") };
    }

    const docRef = snap.docs[0].ref;
    const ticket = snap.docs[0].data();

    // Déjà répondu ? On n'écrase pas.
    if (["accepte", "refuse"].includes(ticket.devis?.statut)) {
      const deja = ticket.devis.statut === "accepte" ? "accepté" : "refusé";
      return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
        body: page("Réponse déjà enregistrée", `Ce devis a déjà été ${deja}. Si vous souhaitez modifier votre réponse, nous vous invitons à contacter l'atelier au 07 85 85 10 80.`) };
    }

    // Options : marquer refusées celles non cochées
    const misesAJour = {
      "devis.statut": reponse,
      "devis.dateReponse": new Date().toISOString(),
      statut: reponse,
      historique: admin.firestore.FieldValue.arrayUnion({ statut: reponse, date: new Date().toISOString() }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (reponse === "accepte" && Array.isArray(ticket.devis?.lignes)) {
      const acceptees = new Set((opts || "").split(",").filter(Boolean).map(Number));
      misesAJour["devis.lignes"] = ticket.devis.lignes.map((l, i) => {
        if (!l.optionnelle) return l;
        return acceptees.has(i) ? { ...l, refusee: false } : { ...l, refusee: true };
      });
    }
    await docRef.update(misesAJour);

    if (reponse === "accepte") {
      return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
        body: page("Accord enregistré",
          `Nous vous remercions de votre confiance.<br><br>Votre accord concernant le devis du ticket n° <b>${ticket.numero}</b> a bien été enregistré ce jour. Les travaux seront réalisés dans les meilleurs délais, et vous serez informé(e) dès que votre objet sera prêt à être retiré.`, "ok") };
    }
    return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
      body: page("Refus enregistré",
        `Votre refus concernant le devis du ticket n° <b>${ticket.numero}</b> a bien été enregistré.<br><br>Votre objet reste à votre disposition à l'atelier ; nous vous invitons à le récupérer aux horaires d'ouverture. Nous restons à votre écoute pour toute question.`, "refus") };

  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers: { "Content-Type": "text/html; charset=utf-8" },
      body: page("Erreur", "Une erreur est survenue. Réessayez ou contactez-moi au 07 85 85 10 80.", "erreur") };
  }
}
