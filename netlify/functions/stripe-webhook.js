import Stripe from 'stripe';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';

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

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

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

  let dejaTraitee = false;
  let commandeData = null;

  await db.runTransaction(async (tx) => {
    const existante = await tx.get(commandeRef);
    if (existante.exists) {
      console.log(`Commande ${session.id} déjà traitée — idempotence.`);
      dejaTraitee = true;
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

    commandeData = {
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
    };

    tx.set(commandeRef, commandeData);
  });

  console.log(`Commande ${session.id} enregistrée, montre ${montreId} marquée vendue`);

  if (!dejaTraitee && commandeData) {
    try {
      await Promise.all([
        envoyerEmailViktor(commandeData),
        envoyerEmailClient(commandeData)
      ]);
      console.log('Emails de confirmation envoyés');
    } catch (err) {
      console.error('Erreur envoi emails (commande sauvegardée néanmoins):', err);
    }
  }
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

function modeLivraisonLabel(mode) {
  return {
    retrait: 'Retrait à l\'atelier (Marcq-en-Barœul)',
    colissimo: 'Colissimo suivi (2-3 jours)',
    chronopost: 'Chronopost express (24h)'
  }[mode] || mode;
}

function adresseComplete(livraison) {
  if (livraison.mode === 'retrait') return 'Retrait sur place';
  return `${livraison.adresse}\n${livraison.cp} ${livraison.ville}`;
}

async function envoyerEmailViktor(c) {
  const sujet = `🔔 Nouvelle commande — ${c.montreNom}`;

  const txt = `
Nouvelle commande confirmée et payée.

━━━━━━━━━━━━━━━━━━━━━━━━━━
PIÈCE COMMANDÉE
━━━━━━━━━━━━━━━━━━━━━━━━━━
${c.montreNom}
Référence : ${c.montreRef || 'n/c'}
Montant total : ${c.montant.toFixed(2)} €
Paiement : Stripe (CB)

━━━━━━━━━━━━━━━━━━━━━━━━━━
CLIENT
━━━━━━━━━━━━━━━━━━━━━━━━━━
${c.client.prenom} ${c.client.nom}
Email : ${c.client.email}
Téléphone : ${c.client.tel || 'non renseigné'}

━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVRAISON
━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode : ${modeLivraisonLabel(c.livraison.mode)}
${c.livraison.mode !== 'retrait' ? `
Adresse :
${adresseComplete(c.livraison)}
` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━

Session Stripe : ${c.sessionId}

Horlogerie Haratyk — notification automatique
`.trim();

  const html = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f2ec;padding:24px;color:#1a1714">
<table style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e8e4dc">
  <tr><td style="background:#0a0a0a;color:#c9a84c;padding:24px;text-align:center">
    <h1 style="margin:0;font-size:22px;font-family:Georgia,serif">🔔 Nouvelle commande</h1>
    <p style="margin:8px 0 0;font-size:13px;color:#8a8580">Horlogerie Haratyk</p>
  </td></tr>
  <tr><td style="padding:24px">
    <h2 style="font-size:14px;color:#a07828;text-transform:uppercase;letter-spacing:2px;border-bottom:1px solid #c9a84c;padding-bottom:6px">Pièce commandée</h2>
    <p style="font-size:16px;font-weight:bold;margin:8px 0">${c.montreNom}</p>
    <p style="margin:4px 0;color:#6b6560">Référence : ${c.montreRef || 'n/c'}</p>
    <p style="margin:4px 0;font-size:18px;color:#a07828"><strong>${c.montant.toFixed(2)} €</strong></p>

    <h2 style="font-size:14px;color:#a07828;text-transform:uppercase;letter-spacing:2px;border-bottom:1px solid #c9a84c;padding-bottom:6px;margin-top:24px">Client</h2>
    <p style="margin:4px 0"><strong>${c.client.prenom} ${c.client.nom}</strong></p>
    <p style="margin:4px 0"><a href="mailto:${c.client.email}" style="color:#a07828">${c.client.email}</a></p>
    <p style="margin:4px 0">${c.client.tel ? `<a href="tel:${c.client.tel}" style="color:#a07828">${c.client.tel}</a>` : 'Téléphone non renseigné'}</p>

    <h2 style="font-size:14px;color:#a07828;text-transform:uppercase;letter-spacing:2px;border-bottom:1px solid #c9a84c;padding-bottom:6px;margin-top:24px">Livraison</h2>
    <p style="margin:4px 0"><strong>${modeLivraisonLabel(c.livraison.mode)}</strong></p>
    ${c.livraison.mode !== 'retrait' ? `
      <p style="margin:8px 0;padding:12px;background:#f5f2ec;border-left:3px solid #c9a84c;white-space:pre-line">${c.livraison.adresse}\n${c.livraison.cp} ${c.livraison.ville}</p>
    ` : ''}

    <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e8e4dc;font-size:11px;color:#8a8580">
      Session Stripe : ${c.sessionId}<br>
      Notification automatique — Horlogerie Haratyk
    </p>
  </td></tr>
</table>
</body></html>
`.trim();

  await transporter.sendMail({
    from: `"Horlogerie Haratyk" <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_USER,
    replyTo: c.client.email,
    subject: sujet,
    text: txt,
    html: html
  });
}

async function envoyerEmailClient(c) {
  const sujet = `Confirmation de votre commande — Horlogerie Haratyk`;

  const txt = `
Bonjour ${c.client.prenom},

Merci pour votre commande chez Horlogerie Haratyk.
Votre paiement a bien été reçu.

━━━━━━━━━━━━━━━━━━━━━━━━━━
RÉCAPITULATIF
━━━━━━━━━━━━━━━━━━━━━━━━━━
${c.montreNom}
Référence : ${c.montreRef || 'n/c'}
Montant total : ${c.montant.toFixed(2)} €

Livraison : ${modeLivraisonLabel(c.livraison.mode)}
${c.livraison.mode !== 'retrait' ? `\nAdresse :\n${c.livraison.adresse}\n${c.livraison.cp} ${c.livraison.ville}\n` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━

PROCHAINES ÉTAPES
${c.livraison.mode === 'retrait'
  ? `Je vous contacte sous 24h pour convenir d'un rendez-vous à l'atelier.
Ouverture : mercredi, jeudi 10h-18h et samedi 10h-14h, sans rendez-vous.`
  : `Votre pièce est expédiée sous 2 jours ouvrés, emballée avec soin.
Un numéro de suivi vous sera communiqué par email dès l'envoi.`}

GARANTIE
Garantie 1 an sur la révision, pièces et main d'œuvre.

CONTACT
Email : haratykviktor@gmail.com
Téléphone : 07 85 85 10 80
Atelier : 43 rue du Vieux Four, 59700 Marcq-en-Barœul

Merci de votre confiance,
Viktor Haratyk
Artisan horloger
`.trim();

  const html = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f2ec;padding:24px;color:#1a1714">
<table style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e8e4dc">
  <tr><td style="background:#0a0a0a;color:#c9a84c;padding:32px 24px;text-align:center">
    <h1 style="margin:0;font-size:26px;font-family:Georgia,serif">Commande confirmée</h1>
    <p style="margin:8px 0 0;font-size:13px;color:#8a8580;font-style:italic;font-family:Georgia,serif">Horlogerie Haratyk · Artisan horloger</p>
  </td></tr>
  <tr><td style="padding:32px 24px">
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px">
      Bonjour <strong>${c.client.prenom}</strong>,
    </p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 24px">
      Merci pour votre commande. Votre paiement a bien été reçu et votre pièce vous est désormais réservée.
    </p>

    <div style="background:#f5f2ec;border:1px solid #e8e4dc;padding:20px;margin:24px 0">
      <h2 style="font-size:13px;color:#a07828;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px">Récapitulatif</h2>
      <p style="margin:4px 0;font-size:17px"><strong>${c.montreNom}</strong></p>
      <p style="margin:4px 0;color:#6b6560;font-size:13px">Référence : ${c.montreRef || 'n/c'}</p>
      <p style="margin:12px 0 4px;font-size:20px;color:#a07828"><strong>${c.montant.toFixed(2)} €</strong></p>
    </div>

    <div style="background:#f5f2ec;border:1px solid #e8e4dc;padding:20px;margin:24px 0">
      <h2 style="font-size:13px;color:#a07828;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px">Livraison</h2>
      <p style="margin:4px 0"><strong>${modeLivraisonLabel(c.livraison.mode)}</strong></p>
      ${c.livraison.mode !== 'retrait' ? `
        <p style="margin:8px 0 0;white-space:pre-line;font-size:14px">${c.livraison.adresse}\n${c.livraison.cp} ${c.livraison.ville}</p>
      ` : ''}
    </div>

    <h2 style="font-size:13px;color:#a07828;text-transform:uppercase;letter-spacing:2px;margin:24px 0 8px;border-bottom:1px solid #c9a84c;padding-bottom:6px">Prochaines étapes</h2>
    ${c.livraison.mode === 'retrait' ? `
      <p style="font-size:14px;line-height:1.7;margin:8px 0">— Je vous contacte sous 24h pour convenir d'un rendez-vous à l'atelier.</p>
      <p style="font-size:14px;line-height:1.7;margin:8px 0">— Ouverture : mercredi, jeudi 10h-18h et samedi 10h-14h, sans rendez-vous.</p>
    ` : `
      <p style="font-size:14px;line-height:1.7;margin:8px 0">— Votre pièce est expédiée sous 2 jours ouvrés, emballée avec soin.</p>
      <p style="font-size:14px;line-height:1.7;margin:8px 0">— Un numéro de suivi vous sera communiqué par email dès l'envoi.</p>
    `}
    <p style="font-size:14px;line-height:1.7;margin:8px 0">— Garantie 1 an sur la révision, pièces et main d'œuvre.</p>

    <h2 style="font-size:13px;color:#a07828;text-transform:uppercase;letter-spacing:2px;margin:24px 0 8px;border-bottom:1px solid #c9a84c;padding-bottom:6px">Contact</h2>
    <p style="font-size:14px;line-height:1.7;margin:8px 0">
      📧 <a href="mailto:haratykviktor@gmail.com" style="color:#a07828">haratykviktor@gmail.com</a><br>
      📞 <a href="tel:+33785851080" style="color:#a07828">07 85 85 10 80</a><br>
      📍 43 rue du Vieux Four, 59700 Marcq-en-Barœul
    </p>

    <p style="margin:32px 0 0;padding-top:24px;border-top:1px solid #e8e4dc;font-family:Georgia,serif;font-style:italic;text-align:center;color:#6b6560">
      Merci de votre confiance,<br>
      Viktor Haratyk
    </p>
  </td></tr>
  <tr><td style="background:#0a0a0a;color:#8a8580;padding:16px;text-align:center;font-size:11px">
    Horlogerie Haratyk · SIRET 988 378 378<br>
    horlogerie-haratyk.fr
  </td></tr>
</table>
</body></html>
`.trim();

  await transporter.sendMail({
    from: `"Horlogerie Haratyk" <${process.env.GMAIL_USER}>`,
    to: c.client.email,
    replyTo: process.env.GMAIL_USER,
    subject: sujet,
    text: txt,
    html: html
  });
}
