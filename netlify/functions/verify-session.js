import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

export default async (req) => {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('id');

  if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
    return new Response(JSON.stringify({ error: 'Session invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const commandeSnap = await db.collection('commandes').doc(sessionId).get();

    if (!commandeSnap.exists) {
      return new Response(JSON.stringify({ statut: 'en_attente' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const commande = commandeSnap.data();

    return new Response(JSON.stringify({
      statut: commande.statut,
      montreNom: commande.montreNom,
      montreRef: commande.montreRef,
      montant: commande.montant,
      livraison: commande.livraison?.mode || 'retrait'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Erreur verify-session:', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  path: '/api/verify-session'
};
