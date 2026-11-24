// ============================================================
// Notifications push — Horlogerie Haratyk
// Appelée par l'atelier (compte de l'atelier uniquement) :
//   - devis publié sur l'espace pro         (type "devis")  → appareils du pro
//   - montre prête à retirer                (type "pret")   → appareils du pro
//   - pièce commandée pour sa montre        (type "piece")  → appareils du pro
//   - notification de test                  (type "test")   → appareils de l'atelier
//
// Variables d'environnement Netlify :
//   FIREBASE_SERVICE_ACCOUNT  (déjà en place)
//   GMAIL_USER                (déjà en place — identifie le compte de l'atelier)
//   VAPID_PRIVATE_KEY         (clé privée des notifications)
// ============================================================
import admin from 'firebase-admin';
import { envoyerPush, emailAtelier } from './push-util.js';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const json = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' }
});

function messageDe(type, t) {
  const objet = [t.marque, t.modele].filter(Boolean).join(' ') || t.typeObjet || 'votre dépôt';
  const ref = t.contremarque ? ` (réf. ${t.contremarque})` : '';
  switch (type) {
    case 'devis':
      return { title: `Devis à valider — n° ${t.numero}`, body: `${objet}${ref} : le devis est prêt. Touchez pour le consulter et le valider.` };
    case 'pret':
      return { title: `Montre prête — n° ${t.numero}`, body: `${objet}${ref} est prête à retirer à l'atelier.` };
    case 'piece':
      return { title: `Pièce en commande — n° ${t.numero}`, body: `${objet}${ref} : une pièce a été commandée, la réparation reprendra à sa réception.` };
    default:
      return null;
  }
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });
  if (!process.env.VAPID_PRIVATE_KEY) return json(500, { error: 'VAPID_PRIVATE_KEY manquante dans Netlify (ajoute-la puis redéploie)' });

  // --- Seul le compte de l'atelier peut déclencher un envoi ---
  const authz = req.headers.get('authorization') || '';
  const idToken = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (!emailAtelier() || (decoded.email || '').toLowerCase() !== emailAtelier()) return json(403, { error: 'Accès refusé' });
  } catch {
    return json(401, { error: 'Non authentifié' });
  }

  let corps;
  try { corps = await req.json(); } catch { return json(400, { error: 'Requête invalide' }); }
  const { ticketId, type } = corps || {};

  // Notification de test vers les appareils de l'atelier (bouton dans Réglages)
  if (type === 'test') {
    try {
      return json(200, await envoyerPush(db, [emailAtelier()], {
        title: 'Test — Horlogerie Haratyk',
        body: 'Les notifications fonctionnent sur cet appareil ✓',
        url: '/atelier/', tag: 'test'
      }));
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  if (!ticketId || typeof ticketId !== 'string') return json(400, { error: 'ticketId manquant' });

  try {
    const snap = await db.collection('tickets').doc(ticketId).get();
    if (!snap.exists) return json(404, { error: 'Ticket introuvable' });
    const t = snap.data();
    if (!t.clientPro) return json(200, { envoyes: 0, total: 0, raison: 'client non pro' });

    const msg = messageDe(type, t);
    if (!msg) return json(400, { error: 'Type inconnu' });

    const emails = [...(t.clientEmails || []), t.clientEmail].filter(Boolean);
    if (!emails.length) return json(200, { envoyes: 0, total: 0, raison: 'aucun email' });

    return json(200, await envoyerPush(db, emails, {
      ...msg,
      url: `/pro/?t=${encodeURIComponent(ticketId)}`,
      tag: `ticket-${ticketId}-${type}`
    }));
  } catch (err) {
    console.error('Erreur notifier-pro:', err);
    return json(500, { error: 'Erreur serveur' });
  }
};
