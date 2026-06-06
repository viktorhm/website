import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const ALLOWED_ORIGINS = [
  'https://horlogerie-haratyk.fr',
  'https://horlogerie-haratyk.netlify.app'
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin || '';
  const headers = corsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const sessionId = event.queryStringParameters?.id;

  if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Session invalide' })
    };
  }

  try {
    const commandeSnap = await db.collection('commandes').doc(sessionId).get();

    if (!commandeSnap.exists) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ statut: 'en_attente' })
      };
    }

    const commande = commandeSnap.data();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        statut: commande.statut,
        montreNom: commande.montreNom,
        montreRef: commande.montreRef,
        montant: commande.montant,
        livraison: commande.livraison?.mode || 'retrait'
      })
    };

  } catch (err) {
    console.error('Erreur verify-session:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erreur serveur' })
    };
  }
}
