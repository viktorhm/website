# Installation du paiement Stripe — Guide pas à pas

## Vue d'ensemble

Ce backend ajoute à ton site la capacité d'accepter des paiements CB sécurisés via Stripe. Il tourne sur Netlify Functions (gratuit) et utilise Firebase Admin SDK côté serveur pour écrire dans Firestore après confirmation de paiement.

**Architecture :**
- Le client clique "Acquérir" → `create-checkout-session.js` crée une session Stripe
- Client redirigé sur page Stripe sécurisée → il paie
- Stripe notifie `stripe-webhook.js` → commande enregistrée + montre marquée vendue
- Client redirigé vers `succes.html` → `verify-session.js` confirme le paiement

## Prérequis

- Compte Stripe créé (peu importe test ou prod pour commencer)
- Node.js 20 installé localement (`node --version` pour vérifier)
- Ton repo GitHub déjà connecté à Netlify (✓ déjà fait)
- La clé privée Firebase Admin téléchargée (fichier JSON)

## Étape 1 — Installer les fichiers dans ton repo

Copie ces fichiers depuis le zip à la racine de ton projet :

```
horlogerie-haratyk/
├── package.json              ← NOUVEAU
├── netlify.toml              ← NOUVEAU
├── .gitignore                ← NOUVEAU (ou à fusionner)
├── succes.html               ← NOUVEAU
├── netlify/
│   └── functions/
│       ├── create-checkout-session.js   ← NOUVEAU
│       ├── stripe-webhook.js            ← NOUVEAU
│       └── verify-session.js            ← NOUVEAU
├── index.html                ← (existant)
├── boutique.html             ← (existant, sera mis à jour ensuite)
├── admin.html                ← (existant)
└── assets/                   ← (existant)
```

## Étape 2 — Installer les dépendances en local

Ouvre un terminal (PowerShell sur Windows), va dans ton dossier de projet :

```bash
cd chemin/vers/horlogerie-haratyk
npm install
```

Ça va créer un dossier `node_modules/` (déjà dans .gitignore, ne le commit pas) et un fichier `package-lock.json` (celui-ci tu dois le commit).

## Étape 3 — Récupérer tes 3 secrets

### Secret 1 — Clé secrète Stripe

1. Va sur [dashboard.stripe.com](https://dashboard.stripe.com)
2. **Bascule en mode Test** avec le switch en haut à droite (important !)
3. Developers → API keys
4. Copie la **Secret key** (elle commence par `sk_test_51...`)

### Secret 2 — Clé privée Firebase Admin

Tu l'as déjà téléchargée. C'est le fichier JSON qui ressemble à :

```json
{
  "type": "service_account",
  "project_id": "horlogerie-haratyk",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  ...
}
```

**Tu vas copier le contenu ENTIER de ce fichier (le JSON complet)** — pas juste la clé, tout.

### Secret 3 — Signature du webhook Stripe

Ce secret n'existe pas encore, on le crée à l'étape 5.

## Étape 4 — Configurer les variables d'environnement Netlify

1. Va sur [app.netlify.com](https://app.netlify.com) → ton site horlogerie-haratyk
2. **Site configuration** → **Environment variables**
3. Clique **Add a variable** pour chacune :

**Variable 1 — STRIPE_SECRET_KEY**
- Key : `STRIPE_SECRET_KEY`
- Value : `sk_test_51...` (ta clé secrète Stripe)
- Scopes : laisse par défaut (toutes)

**Variable 2 — FIREBASE_SERVICE_ACCOUNT**
- Key : `FIREBASE_SERVICE_ACCOUNT`
- Value : **colle le JSON entier du fichier Firebase** (Ctrl+A sur le contenu du fichier, Ctrl+C, puis Ctrl+V ici)
- ⚠️ Netlify accepte les valeurs multi-lignes, ne t'inquiète pas
- Scopes : laisse par défaut

**Variable 3 — STRIPE_WEBHOOK_SECRET**
- Key : `STRIPE_WEBHOOK_SECRET`
- Value : laisse vide pour l'instant, on la remplit à l'étape 5 bis

## Étape 5 — Push initial + configurer le webhook Stripe

### 5a — Push sur GitHub

```bash
git add .
git commit -m "Backend paiement Stripe — Netlify Functions"
git push
```

Netlify détecte le push, installe `stripe` et `firebase-admin`, déploie les fonctions. Attends 1-2 minutes.

Vérifie dans Netlify → Deploys → le dernier déploiement est ✓ en vert.

### 5b — Créer le webhook sur Stripe

1. Stripe Dashboard (en mode Test) → Developers → **Webhooks**
2. Clique **Add endpoint**
3. Endpoint URL : `https://horlogerie-haratyk.fr/.netlify/functions/stripe-webhook`
4. Description : `Webhook paiement Horlogerie Haratyk`
5. Events to send → sélectionne ces 3 événements :
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `charge.refunded`
6. Clique **Add endpoint**

### 5c — Récupérer le webhook secret

Sur la page du webhook que tu viens de créer :
1. Dans la section **Signing secret**, clique **Reveal**
2. Copie la valeur (commence par `whsec_...`)
3. Retourne dans Netlify → Environment variables → `STRIPE_WEBHOOK_SECRET` → colle la valeur
4. Clique **Trigger deploy** → **Deploy site** pour que la nouvelle variable soit prise en compte

## Étape 6 — Tester avec une carte de test Stripe

En mode test, tu peux payer avec ces cartes bidon fournies par Stripe :

| Numéro carte | Résultat |
|---|---|
| `4242 4242 4242 4242` | Paiement réussi |
| `4000 0025 0000 3155` | Demande authentification 3DS |
| `4000 0000 0000 9995` | Paiement refusé (fonds insuffisants) |

Date d'expiration : n'importe quelle date future (ex : 12/34).
CVC : n'importe quels 3 chiffres (ex : 123).
Code postal : n'importe quel (ex : 59700).

**Procédure de test :**

1. Va sur ta boutique, clique sur une montre, clique "Acquérir"
2. Remplis le formulaire avec tes vraies coordonnées (c'est en test, rien n'est envoyé)
3. Tu es redirigé sur une page Stripe Checkout
4. Utilise `4242 4242 4242 4242`
5. Tu es redirigé vers `succes.html`
6. Dans Firebase Console → Firestore → `commandes` : ta commande est là
7. Dans Firestore → `montres` → la montre a `statut: "vendue"` et `vendue: true`
8. Dans Stripe Dashboard → Payments : le paiement test est listé

**Si ça ne fonctionne pas :**
- Netlify → Functions → Logs : regarde les erreurs
- Stripe Dashboard → Webhooks → ton webhook → onglet "Events" : tu vois si Stripe a bien envoyé la notif et si ton backend a répondu 200

## Étape 7 — Intégrer dans boutique.html

La fonction JS actuelle de ta boutique (qui utilise Stripe côté client) doit être remplacée par un appel vers `/api/create-checkout-session`.

**Je te le ferai dans la prochaine étape** — pas encore touché à `boutique.html` pour que tu valides d'abord le backend.

## Étape 8 — Passage en production

Quand tu es prêt à accepter des vrais paiements :

1. Stripe Dashboard → bascule en mode **Live** (switch en haut à droite)
2. Active ton compte Stripe (pièce d'identité, RIB, SIRET) — délai 24-48h
3. Developers → API keys → récupère la clé `sk_live_...`
4. Netlify → Environment variables → `STRIPE_SECRET_KEY` → remplace par la clé live
5. Refais un webhook en mode Live (étape 5b) avec la même URL
6. Récupère le nouveau `whsec_...` et remplace dans Netlify
7. Redéploie

## Coût

- Netlify Functions : **gratuit** (jusqu'à 125k invocations/mois, largement suffisant)
- Stripe : **1.5% + 0.25 €** par transaction européenne réussie
- Firebase Firestore : **gratuit** (jusqu'à 50k lectures/jour)
- Pas d'abonnement mensuel

## Sécurité — ce qui est protégé

- ✅ Clé secrète Stripe jamais exposée (variable d'env Netlify)
- ✅ Clé Firebase Admin jamais exposée (variable d'env Netlify)
- ✅ Prix de la montre relu en Firestore côté serveur (anti-fraude URL manipulation)
- ✅ Statut disponibilité vérifié côté serveur (évite de vendre 2× la même)
- ✅ Webhook signé cryptographiquement (personne ne peut simuler un paiement)
- ✅ Transaction Firestore atomique (idempotence si Stripe envoie 2 fois le webhook)
- ✅ Aucun numéro de carte ne passe par ton code (tout sur pages Stripe)
- ✅ Limitation des champs metadata (anti-injection)
- ✅ Headers sécurité HTTP (XSS, clickjacking, HSTS)

## Ce qui reste à faire

- Mettre à jour `boutique.html` pour utiliser le nouveau backend (étape suivante)
- Ajouter PayPal (après validation de Stripe)
- Ajouter le système de réservation atelier (espèces/chèque)
- Configurer EmailJS pour l'envoi d'email depuis le webhook (ou utiliser Resend/Postmark côté serveur)
