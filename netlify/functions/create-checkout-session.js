import Stripe from 'stripe';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia'
});

const ALLOWED_ORIGINS = [
  'https://horlogerie-haratyk.fr',
  'https://horlogerie-haratyk.netlify.app'
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body || '{}');
    const { montreId, client, livraison } = data;

    if (!montreId || typeof montreId !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'montreId manquant ou invalide' })
      };
    }

    if (!client || !client.email || !client.prenom || !client.nom) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Coordonnées client incomplètes' })
      };
    }

    const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email);
    if (!emailValide) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email invalide' })
      };
    }

    if (!livraison || !['retrait', 'colissimo', 'chronopost'].includes(livraison)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Mode de livraison invalide' })
      };
    }

    const montreRef = db.collection('montres').doc(montreId);
    const montreSnap = await montreRef.get();

    if (!montreSnap.exists) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Cette montre n\'existe plus' })
      };
    }

    const montre = montreSnap.data();
    const statut = montre.statut || (montre.vendue ? 'vendue' : (montre.reservation ? 'reservee' : 'disponible'));

    if (statut !== 'disponible') {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'Cette pièce n\'est plus disponible' })
      };
    }

    const prixMontreCent = Math.round(montre.prix * 100);

    const fraisLivraisonCent = {
      retrait: 0,
      colissimo: 800,
      chronopost: 1500
    }[livraison];

    const lineItems = [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: montre.nom,
            description: `Réf. ${montre.ref || 'HH'} — révisée, garantie 1 an`,
            images: montre.images && montre.images[0] ? [montre.images[0]] : []
          },
          unit_amount: prixMontreCent
        },
        quantity: 1
      }
    ];

    if (fraisLivraisonCent > 0) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: livraison === 'colissimo' ? 'Livraison Colissimo suivi' : 'Livraison Chronopost 24h'
          },
          unit_amount: fraisLivraisonCent
        },
        quantity: 1
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      customer_email: client.email,
      locale: 'fr',

      metadata: {
        montreId,
        montreNom: montre.nom.substring(0, 100),
        montreRef: (montre.ref || '').substring(0, 50),
        clientPrenom: client.prenom.substring(0, 50),
        clientNom: client.nom.substring(0, 50),
        clientTel: (client.tel || '').substring(0, 30),
        livraison,
        adresse: livraison !== 'retrait' ? (client.adresse || '').substring(0, 300) : '',
        cp: livraison !== 'retrait' ? (client.cp || '').substring(0, 10) : '',
        ville: livraison !== 'retrait' ? (client.ville || '').substring(0, 100) : ''
      },

      success_url: `${origin || 'https://horlogerie-haratyk.fr'}/succes.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin || 'https://horlogerie-haratyk.fr'}/boutique.html`,

      expires_at: Math.floor(Date.now() / 1000) + 30 * 60
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: session.url, sessionId: session.id })
    };

  } catch (err) {
    console.error('Erreur create-checkout-session:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erreur serveur lors de la création du paiement' })
    };
  }
}
