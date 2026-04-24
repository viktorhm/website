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

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const config = {
  path: '/.netlify/functions/stripe-webhook'
};

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  if (!signature) {
    console.warn('Webhook sans signature Stripe — requête rejetée');
    return { statusCode: 400, body: 'Signature manquante' };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Signature webhook invalide:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        await handlePaiementConfirme(session);
        break;
      }

      case 'checkout.session.expired': {
        console.log('Session expirée:', stripeEvent.data.object.id);
        break;
      }

      case 'charge.refunded': {
        const charge = stripeEvent.data.object;
        await handleRemboursement(charge);
        break;
      }

      default:
        console.log(`Événement non traité: ${stripeEvent.type}`);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };

  } catch (err) {
    console.error('Erreur traitement webhook:', err);
    return { statusCode: 500, body: 'Erreur interne' };
  }
}

async function handlePaiementConfirme(session) {
  if (session.payment_status !== 'paid') {
    console.log(`Session ${session.id} non payée (statut: ${session.payment_status})`);
    return;
  }

  const meta = session.metadata || {};
  const montreId = meta.montreId;

  if (!montreId) {
    console.error('Session sans montreId dans metadata:', session.id);
    return;
  }

  const montreRef = db.collection('montres').doc(montreId);
  const commandeRef = db.collection('commandes').doc(session.id);

  await db.runTransaction(async (tx) => {
    const existante = await tx.get(commandeRef);
    if (existante.exists) {
      console.log(`Commande ${session.id} déjà traitée — idempotence.`);
      return;
    }

    const montreSnap = await tx.get(montreRef);
    if (!montreSnap.exists) {
      console.error(`Montre ${montreId} introuvable au moment du paiement`);
      return;
    }

    const montre = montreSnap.data();

    tx.update(montreRef, {
      statut: 'vendue',
      vendue: true,
      reservation: null,
      vendueAt: admin.firestore.FieldValue.serverTimestamp()
    });

    tx.set(commandeRef, {
      sessionId: session.id,
      paymentIntent: session.payment_intent,
      montreId,
      montreNom: meta.montreNom || montre.nom,
      montreRef: meta.montreRef || montre.ref || '',
      montant: session.amount_total / 100,
      devise: session.currency,
      client: {
        prenom: meta.clientPrenom || '',
        nom: meta.clientNom || '',
        email: session.customer_email,
        tel: meta.clientTel || ''
      },
      livraison: {
        mode: meta.livraison || '',
        adresse: meta.adresse || '',
        cp: meta.cp || '',
        ville: meta.ville || ''
      },
      statut: 'payee',
      moyenPaiement: 'stripe',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  console.log(`Commande ${session.id} enregistrée, montre ${montreId} marquée vendue`);
}

async function handleRemboursement(charge) {
  const paymentIntent = charge.payment_intent;
  if (!paymentIntent) return;

  const commandes = await db.collection('commandes')
    .where('paymentIntent', '==', paymentIntent)
    .limit(1)
    .get();

  if (commandes.empty) {
    console.log(`Aucune commande trouvée pour PaymentIntent ${paymentIntent}`);
    return;
  }

  const commande = commandes.docs[0];
  await commande.ref.update({
    statut: 'remboursee',
    rembourseAt: admin.firestore.FieldValue.serverTimestamp(),
    montantRembourse: charge.amount_refunded / 100
  });

  console.log(`Commande ${commande.id} marquée remboursée`);
}
