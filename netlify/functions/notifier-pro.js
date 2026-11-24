// ============================================================
// Notifications push vers les PC / téléphones des clients pro
// Appelée par l'atelier (compte Viktor uniquement) quand :
//   - un devis est publié sur l'espace pro      (type "devis")
//   - une montre est prête à retirer            (type "pret")
//   - une pièce est commandée pour sa montre    (type "piece")
//
// Variables d'environnement Netlify :
//   FIREBASE_SERVICE_ACCOUNT  (déjà en place)
//   VAPID_PRIVATE_KEY         (clé privée des notifications — à ajouter)
// ============================================================
import admin from 'firebase-admin';
import webpush from 'web-push';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const EMAIL_ATELIER = 'haratykviktor@gmail.com';
// Clé publique (la même que dans pro/pro.js)
const VAPID_PUBLIC_KEY = 'BAmRdio-yTF6aRvXkJRTzmm5WnvONSAJpYMFsv3ZR5fDCdp-Pkui-H3kd2rJ3OSAVGKsc-Ecv35wCalQ34tZt7A';

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
  if (!process.env.VAPID_PRIVATE_KEY) return json(500, { error: 'VAPID_PRIVATE_KEY manquante dans Netlify' });

  // --- Seul le compte de l'atelier peut déclencher un envoi ---
  const authz = req.headers.get('authorization') || '';
  const idToken = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    if ((decoded.email || '').toLowerCase() !== EMAIL_ATELIER) return json(403, { error: 'Accès refusé' });
  } catch {
    return json(401, { error: 'Non authentifié' });
  }

  let corps;
  try { corps = await req.json(); } catch { return json(400, { error: 'Requête invalide' }); }
  const { ticketId, type } = corps || {};
  if (!ticketId || typeof ticketId !== 'string') return json(400, { error: 'ticketId manquant' });

  try {
    const snap = await db.collection('tickets').doc(ticketId).get();
    if (!snap.exists) return json(404, { error: 'Ticket introuvable' });
    const t = snap.data();
    if (!t.clientPro) return json(200, { envoyes: 0, total: 0, raison: 'client non pro' });

    const msg = messageDe(type, t);
    if (!msg) return json(400, { error: 'Type inconnu' });

    const emails = [...new Set([...(t.clientEmails || []), t.clientEmail]
      .filter(Boolean).map(e => String(e).toLowerCase()))].slice(0, 30);
    if (!emails.length) return json(200, { envoyes: 0, total: 0, raison: 'aucun email' });

    const abos = await db.collection('pushAbonnements').where('emailMin', 'in', emails).get();
    if (abos.empty) return json(200, { envoyes: 0, total: 0 });

    webpush.setVapidDetails('mailto:' + EMAIL_ATELIER, VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const payload = JSON.stringify({
      ...msg,
      url: `/pro/?t=${encodeURIComponent(ticketId)}`,
      tag: `ticket-${ticketId}-${type}`
    });

    let envoyes = 0;
    await Promise.all(abos.docs.map(async d => {
      const a = d.data();
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: a.keys },
          payload,
          { TTL: 60 * 60 * 24 * 7, urgency: 'high' } // conservée 7 jours si le PC est éteint
        );
        envoyes++;
      } catch (err) {
        // Abonnement expiré ou révoqué : on le supprime
        if (err.statusCode === 404 || err.statusCode === 410) await d.ref.delete();
        else console.error('Push échoué', err.statusCode, err.body);
      }
    }));

    return json(200, { envoyes, total: abos.size });
  } catch (err) {
    console.error('Erreur notifier-pro:', err);
    return json(500, { error: 'Erreur serveur' });
  }
};
