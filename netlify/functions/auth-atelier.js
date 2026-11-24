// Vérifie qu'un appel vient bien du compte de l'atelier (jeton Firebase)
// Utilisé par les fonctions d'envoi d'emails pour qu'on ne puisse pas
// envoyer de mails depuis le Gmail de l'atelier sans y être connecté.
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

// Compte de l'atelier = l'adresse Gmail configurée pour les emails (GMAIL_USER)
const emailAtelier = () => String(process.env.GMAIL_USER || "").toLowerCase();

// event : événement Netlify (handler(event)). Retourne null si OK, sinon une réponse d'erreur.
export async function refuserSiPasAtelier(event) {
  const h = event.headers || {};
  const authz = h.authorization || h.Authorization || "";
  const jeton = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!jeton) return { statusCode: 401, body: JSON.stringify({ error: "Non authentifié" }) };
  try {
    const d = await admin.auth().verifyIdToken(jeton);
    if (!emailAtelier() || String(d.email || "").toLowerCase() !== emailAtelier()) {
      return { statusCode: 403, body: JSON.stringify({ error: "Accès refusé" }) };
    }
    return null;
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: "Session expirée, reconnecte-toi" }) };
  }
}

// Destinataires : au plus 3 adresses valides (pas d'envoi en masse)
export function destinatairesValides(email) {
  const liste = String(email || "").split(/[,;]/).map(s => s.trim()).filter(Boolean);
  if (!liste.length || liste.length > 3) return null;
  return liste.every(e => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e)) ? liste.join(", ") : null;
}
