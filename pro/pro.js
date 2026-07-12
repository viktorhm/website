// ============================================================
// Espace professionnel — Horlogerie Haratyk
// Chaque client pro connecté ne voit que SES tickets
// (règle Firestore verrouillée sur son email)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, query, where, onSnapshot, getDocs, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBdhXev9PvfrQIBKktIJJ58vEsP-Db-mpc",
  authDomain: "horlogerie-haratyk.firebaseapp.com",
  projectId: "horlogerie-haratyk",
  storageBucket: "horlogerie-haratyk.firebasestorage.app",
  messagingSenderId: "90184929449",
  appId: "1:90184929449:web:03bc08665e0577ac6399b8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const STATUTS = {
  depose: "Déposé", diagnostic: "En diagnostic", devis_envoye: "Devis en attente",
  accepte: "Devis accepté", en_cours: "En réparation", pret: "Prêt à retirer",
  rendu: "Rendu", refuse: "Devis refusé"
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function toast(msg, erreur = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("toast-erreur", erreur);
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 3500);
}

function echap(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("fr-FR");
}

// ------------------------------------------------------------
// Auth
// ------------------------------------------------------------
$("#btn-login").addEventListener("click", async () => {
  $("#login-erreur").textContent = "Connexion en cours…";
  try {
    await signInWithEmailAndPassword(auth, $("#login-email").value.trim(), $("#login-mdp").value);
    $("#login-erreur").textContent = "";
  } catch (e) {
    const messages = {
      "auth/invalid-credential": "Email ou mot de passe incorrect.",
      "auth/user-not-found": "Aucun compte avec cet email.",
      "auth/too-many-requests": "Trop de tentatives, réessayez dans quelques minutes."
    };
    $("#login-erreur").textContent = messages[e.code] || "Erreur de connexion.";
  }
});
$("#login-mdp").addEventListener("keydown", e => { if (e.key === "Enter") $("#btn-login").click(); });
$("#btn-logout").addEventListener("click", () => signOut(auth));

let arretEcoute = null;

// ------------------------------------------------------------
// LED d'état (connexion / serveur)
// ------------------------------------------------------------
function etatLigne(ok, texte) {
  const led = $("#led");
  if (!led) return;
  led.classList.toggle("led-rouge", !ok);
  $("#led-texte").textContent = texte || (ok ? "En ligne" : "Hors ligne");
}
window.addEventListener("online", () => etatLigne(true));
window.addEventListener("offline", () => etatLigne(false, "Pas de connexion"));

onAuthStateChanged(auth, user => {
  const login = $("#ecran-login");
  const appEl = $("#app");
  login.hidden = !!user;
  appEl.hidden = !user;
  login.style.display = user ? "none" : "flex";
  appEl.style.display = user ? "block" : "none";
  if (user) {
    $("#pro-nom").textContent = user.email;
    $("#pro-societe").textContent = "";
    etatLigne(navigator.onLine, navigator.onLine ? "Connexion…" : "Pas de connexion");
    chargerSociete(user.email);
    demarrerEcoute(user.email);
  } else if (arretEcoute) {
    arretEcoute();
    arretEcoute = null;
  }
});

// ------------------------------------------------------------
// Nom de la société (fiche client, dès la connexion)
// ------------------------------------------------------------
async function chargerSociete(email) {
  try {
    let snap = await getDocs(query(collection(db, "clients"), where("email", "==", email), limit(1)));
    if (snap.empty) snap = await getDocs(query(collection(db, "clients"), where("email2", "==", email), limit(1)));
    if (!snap.empty) $("#pro-societe").textContent = snap.docs[0].data().nom || "";
  } catch (e) {
    console.warn("Fiche client non accessible (règle Firestore manquante ?)", e);
  }
}

// ------------------------------------------------------------
// Tickets du client connecté (temps réel)
// ------------------------------------------------------------
let mesTickets = [];
let filtreActif = "actifs";
let ticketOuvertId = null;

function demarrerEcoute(email) {
  // La requête DOIT filtrer sur l'email : c'est la condition de la règle Firestore
  const em = email.toLowerCase();
  const qNouveaux = query(collection(db, "tickets"), where("clientEmails", "array-contains", em));
  const qAnciens = query(collection(db, "tickets"), where("clientEmail", "==", email));
  const resultats = { a: [], b: [] };

  const fusionner = () => {
    const vus = new Set();
    mesTickets = [...resultats.a, ...resultats.b].filter(t => {
      if (vus.has(t.id)) return false;
      vus.add(t.id);
      return true;
    });
    mesTickets.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (mesTickets.length) $("#pro-societe").textContent = mesTickets[0].clientNom || "";
    majCompteurs();
    rendreListe();
  };

  const arretA = onSnapshot(qNouveaux, snap => {
    resultats.a = [];
    snap.forEach(d => resultats.a.push({ id: d.id, ...d.data() }));
    etatLigne(true);
    fusionner();
  }, err => { console.error(err); etatLigne(false, "Erreur serveur"); });

  const arretB = onSnapshot(qAnciens, snap => {
    resultats.b = [];
    snap.forEach(d => resultats.b.push({ id: d.id, ...d.data() }));
    etatLigne(true);
    fusionner();
  }, err => {
    console.error(err);
    etatLigne(false, "Erreur serveur");
    if (!resultats.a.length) {
      $("#liste-tickets").innerHTML = `<p class="pro-vide">Accès refusé ou erreur de chargement.<br>Contactez l'atelier au 07 85 85 10 80.</p>`;
    }
  });

  arretEcoute = () => { arretA(); arretB(); };
}

$$(".filtre").forEach(f => f.addEventListener("click", () => {
  $$(".filtre").forEach(x => x.classList.remove("actif"));
  f.classList.add("actif");
  filtreActif = f.dataset.statut;
  rendreListe();
}));

function majCompteurs() {
  const n = f => mesTickets.filter(f).length;
  $("#cpt-actifs").textContent = n(t => !["rendu", "refuse"].includes(t.statut)) || "";
  $("#cpt-devis").textContent = n(t => t.statut === "devis_envoye") || "";
  $("#cpt-pret").textContent = n(t => t.statut === "pret") || "";
  $("#cpt-tous").textContent = mesTickets.length || "";
}

function rendreListe() {
  let liste = mesTickets;
  if (filtreActif === "actifs") liste = liste.filter(t => !["rendu", "refuse"].includes(t.statut));
  else if (filtreActif === "devis") liste = liste.filter(t => t.statut === "devis_envoye");
  else if (filtreActif === "pret") liste = liste.filter(t => t.statut === "pret");

  if (!liste.length) {
    $("#liste-tickets").innerHTML = `<p class="pro-vide">Aucun dépôt dans cette catégorie.</p>`;
    return;
  }

  $("#liste-tickets").innerHTML = liste.map(t => {
    const ouvert = t.id === ticketOuvertId;
    const devis = t.devis || {};
    const lignes = devis.lignes || [];
    const total = lignes.reduce((s, l) => s + (parseFloat(l.prix) || 0), 0);

    return `
    <div class="ticket-carte ${ouvert ? "ouvert" : ""}" data-id="${t.id}" style="flex-direction:column;align-items:stretch;">
      <div style="display:flex;align-items:center;gap:18px;">
        <div class="tc-num">N° ${t.numero}</div>
        <div class="tc-corps">
          <div class="tc-client">${echap([t.typeObjet, t.marque, t.modele].filter(Boolean).join(" · "))}</div>
          <div class="tc-objet">Déposé le ${fmtDate(t.createdAt)}${t.contremarque ? " · Réf. " + echap(t.contremarque) : ""}</div>
        </div>
        <div class="tc-statut statut-${t.statut}">${STATUTS[t.statut] || t.statut}</div>
      </div>

      ${ouvert ? `
      <div class="pro-carte-detail">
        ${lignes.length ? `
          <div style="font-size:.8rem;letter-spacing:.15em;text-transform:uppercase;color:var(--laiton);margin-bottom:10px;">Devis</div>
          ${lignes.map((l, i) => ligneDevisHtml(t, l, i)).join("")}
          <div class="piece-ligne piece-total"><span>Total (TVA non applicable)</span><b class="total-devis" data-id="${t.id}">${totalDevis(t).toFixed(2)} €</b></div>
          ${devisActions(t)}
        ` : `<p class="liste-vide" style="margin:0;">Diagnostic en cours — le devis apparaîtra ici.</p>`}
      </div>` : ""}
    </div>`;
  }).join("");

  $$(".ticket-carte").forEach(c => c.addEventListener("click", e => {
    if (e.target.closest("button, label, input, a")) return;
    ticketOuvertId = ticketOuvertId === c.dataset.id ? null : c.dataset.id;
    rendreListe();
  }));

  $$(".opt-devis").forEach(c => c.addEventListener("change", () => {
    const t = mesTickets.find(x => x.id === c.dataset.ticket);
    if (!t) return;
    let total = totalDevis(t);
    $$(`.opt-devis[data-ticket="${t.id}"]:checked`).forEach(x => total += parseFloat(x.dataset.prix) || 0);
    const cible = document.querySelector(`.total-devis[data-id="${t.id}"]`);
    if (cible) cible.textContent = total.toFixed(2) + " €";
  }));

  $$(".btn-devis-reponse").forEach(b => b.addEventListener("click", () => {
    const opts = $$(`.opt-devis[data-ticket="${b.closest(".ticket-carte").dataset.id}"]:checked`).map(c => c.dataset.i).join(",");
    repondreDevis(b.dataset.token, b.dataset.reponse, opts);
  }));
}

function totalDevis(t) {
  const devis = t.devis || {};
  const lignes = devis.lignes || [];
  const repondu = ["accepte", "refuse"].includes(devis.statut);
  return lignes
    .filter(l => !l.optionnelle || (repondu ? !l.refusee : false))
    .reduce((s, l) => s + (parseFloat(l.prix) || 0), 0);
}

function ligneDevisHtml(t, l, i) {
  const prix = (parseFloat(l.prix) || 0).toFixed(2);
  const repondu = ["accepte", "refuse"].includes((t.devis || {}).statut);
  if (!l.optionnelle) {
    return `<div class="piece-ligne"><span>${echap(l.designation)}</span><b>${prix} €</b></div>`;
  }
  if (repondu) {
    const refusee = l.refusee;
    return `<div class="piece-ligne" style="${refusee ? "opacity:.45;text-decoration:line-through;" : ""}">
      <span>${echap(l.designation)} <em style="color:var(--laiton);font-style:normal;font-size:.85em;">(option ${refusee ? "refusée" : "acceptée"})</em></span>
      <b>${prix} €</b></div>`;
  }
  return `<label class="piece-ligne" style="cursor:pointer;align-items:center;">
    <span style="display:flex;gap:10px;align-items:center;">
      <input type="checkbox" class="opt-devis" data-ticket="${t.id}" data-i="${i}" data-prix="${parseFloat(l.prix) || 0}"
             style="width:20px;height:20px;accent-color:var(--laiton);">
      <span>${echap(l.designation)} <em style="color:var(--laiton);font-style:normal;font-size:.85em;">(en option)</em></span>
    </span>
    <b>+ ${prix} €</b></label>`;
}

function devisActions(t) {
  const devis = t.devis || {};
  if (devis.statut === "accepte") return `<p class="notif-info" style="margin:12px 0 0;">✓ Devis accepté le ${fmtDate(devis.dateReponse)}</p>`;
  if (devis.statut === "refuse") return `<p style="color:var(--emauxrouge);font-weight:600;margin:12px 0 0;">✗ Devis refusé le ${fmtDate(devis.dateReponse)}</p>`;
  if (devis.statut === "envoye" && devis.token) return `
    <div class="pro-devis-actions">
      <button class="btn btn-devis-reponse btn-accepter" data-token="${devis.token}" data-reponse="accepte">✓ Accepter le devis</button>
      <button class="btn btn-devis-reponse btn-refuser" data-token="${devis.token}" data-reponse="refuse">✗ Refuser</button>
    </div>`;
  return "";
}

async function repondreDevis(token, reponse, opts) {
  if (reponse === "refuse" && !confirm("Confirmer le refus de ce devis ?")) return;
  try {
    const r = await fetch(`/.netlify/functions/devis-reponse?token=${encodeURIComponent(token)}&reponse=${reponse}&opts=${encodeURIComponent(opts || "")}`);
    if (!r.ok) throw new Error();
    toast(reponse === "accepte" ? "Devis accepté ✓ — les travaux vont démarrer" : "Refus enregistré");
  } catch {
    toast("Erreur — réessayez ou appelez l'atelier", true);
  }
}
