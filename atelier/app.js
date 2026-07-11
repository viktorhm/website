// ============================================================
// Atelier — Horlogerie Haratyk
// Gestion des tickets de dépôt client
// Stack : Firebase Auth + Firestore, Cloudinary, Netlify Functions
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, getDoc, getDocs, updateDoc,
  query, where, orderBy, limit, onSnapshot, runTransaction,
  serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ------------------------------------------------------------
// ⚠ CONFIG : copie ici le firebaseConfig de ton site boutique
// (le même projet Firebase — même Firestore)
// ------------------------------------------------------------
const firebaseConfig = {
  apiKey: "TA_CLE_API",
  authDomain: "TON_PROJET.firebaseapp.com",
  projectId: "TON_PROJET",
  storageBucket: "TON_PROJET.appspot.com",
  messagingSenderId: "XXXX",
  appId: "XXXX"
};

const CLOUDINARY_CLOUD = "dhdgbhuq8";
const CLOUDINARY_PRESET = "site web";

// Numéro de départ si le compteur n'existe pas encore (suit ta série 3XXX)
const NUMERO_DEPART = 3113;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ------------------------------------------------------------
// Statuts
// ------------------------------------------------------------
const STATUTS = [
  { id: "depose",       label: "Déposé" },
  { id: "diagnostic",   label: "En diagnostic" },
  { id: "devis_envoye", label: "Devis envoyé" },
  { id: "accepte",      label: "Devis accepté" },
  { id: "en_cours",     label: "En réparation" },
  { id: "pret",         label: "Prêt" },
  { id: "rendu",        label: "Rendu" }
];
const statutLabel = id => (STATUTS.find(s => s.id === id) || {}).label || id;

// ------------------------------------------------------------
// Petits helpers
// ------------------------------------------------------------
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

function toast(msg, erreur = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("toast-erreur", erreur);
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 3500);
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("fr-FR") + " " +
         d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function echap(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}

// ------------------------------------------------------------
// Auth
// ------------------------------------------------------------
$("#btn-login").addEventListener("click", async () => {
  $("#login-erreur").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("#login-email").value.trim(), $("#login-mdp").value);
  } catch (e) {
    $("#login-erreur").textContent = "Identifiants incorrects.";
  }
});
$("#login-mdp").addEventListener("keydown", e => { if (e.key === "Enter") $("#btn-login").click(); });
$("#btn-logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, user => {
  $("#ecran-login").hidden = !!user;
  $("#app").hidden = !user;
  if (user) demarrerEcouteTickets();
});

// ------------------------------------------------------------
// Navigation
// ------------------------------------------------------------
function montrerVue(nom) {
  $$(".vue").forEach(v => (v.hidden = true));
  $("#vue-" + nom).hidden = false;
  $$(".nav-btn").forEach(b => b.classList.toggle("actif", b.dataset.vue === nom));
  window.scrollTo(0, 0);
}
$$(".nav-btn").forEach(b => b.addEventListener("click", () => montrerVue(b.dataset.vue)));
$("#btn-retour").addEventListener("click", () => montrerVue("tickets"));

// ------------------------------------------------------------
// Pastilles (sélecteurs tactiles)
// ------------------------------------------------------------
function initPastilles(conteneurId, multi = false) {
  const c = document.getElementById(conteneurId);
  c.addEventListener("click", e => {
    const p = e.target.closest(".pastille");
    if (!p) return;
    if (multi) {
      p.classList.toggle("actif");
    } else {
      c.querySelectorAll(".pastille").forEach(x => x.classList.remove("actif"));
      p.classList.add("actif");
    }
  });
}
initPastilles("type-objet");
initPastilles("etat-objet", true);
initPastilles("demande-client");

const pastilleVal = id => $("#" + id + " .pastille.actif")?.dataset.val || "";
const pastillesVals = id => $$("#" + id + " .pastille.actif").map(p => p.dataset.val);

// ------------------------------------------------------------
// Recherche client existant
// ------------------------------------------------------------
let clientChoisi = null;

$("#client-recherche").addEventListener("input", async e => {
  const q$ = e.target.value.trim().toLowerCase();
  const box = $("#client-suggestions");
  if (q$.length < 2) { box.hidden = true; return; }
  const snap = await getDocs(query(collection(db, "clients"), orderBy("nomMin"), limit(300)));
  const resultats = [];
  snap.forEach(d => {
    const c = d.data();
    if ((c.nomMin || "").includes(q$) || (c.tel || "").replace(/\s/g, "").includes(q$.replace(/\s/g, ""))) {
      resultats.push({ id: d.id, ...c });
    }
  });
  box.innerHTML = resultats.slice(0, 8).map(c =>
    `<div class="suggestion" data-id="${c.id}">${echap(c.nom)} — ${echap(c.tel || "")}${c.pro ? " · PRO" : ""}</div>`
  ).join("") || `<div class="suggestion suggestion-vide">Aucun client trouvé</div>`;
  box.hidden = false;
  box.querySelectorAll(".suggestion[data-id]").forEach(el => {
    el.addEventListener("click", () => {
      const c = resultats.find(r => r.id === el.dataset.id);
      choisirClient(c);
    });
  });
});

function choisirClient(c) {
  clientChoisi = c;
  $("#client-suggestions").hidden = true;
  $("#client-recherche").value = "";
  $("#client-nouveau").hidden = true;
  $("#client-choisi").hidden = false;
  $("#client-choisi-nom").textContent = c.nom + (c.tel ? " — " + c.tel : "") + (c.pro ? " · PRO" : "");
}
$("#btn-client-changer").addEventListener("click", () => {
  clientChoisi = null;
  $("#client-choisi").hidden = true;
  $("#client-nouveau").hidden = false;
});

// ------------------------------------------------------------
// Photos → Cloudinary
// ------------------------------------------------------------
let photosDepot = [];

$("#photo-input").addEventListener("change", async e => {
  for (const fichier of e.target.files) {
    const apercu = document.createElement("div");
    apercu.className = "photo-item photo-chargement";
    apercu.textContent = "⏳";
    $("#photos-apercu").appendChild(apercu);
    try {
      const url = await uploadCloudinary(fichier);
      photosDepot.push(url);
      apercu.className = "photo-item";
      apercu.innerHTML = `<img src="${url.replace("/upload/", "/upload/w_200,h_200,c_fill/")}" alt="photo dépôt">`;
    } catch {
      apercu.remove();
      toast("Échec de l'envoi d'une photo", true);
    }
  }
  e.target.value = "";
});

async function uploadCloudinary(fichier) {
  const fd = new FormData();
  fd.append("file", fichier);
  fd.append("upload_preset", CLOUDINARY_PRESET);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: "POST", body: fd });
  if (!r.ok) throw new Error("upload");
  const j = await r.json();
  return j.secure_url;
}

// ------------------------------------------------------------
// Création du ticket
// ------------------------------------------------------------
$("#btn-creer-ticket").addEventListener("click", async () => {
  const btn = $("#btn-creer-ticket");

  // Client : existant ou nouveau
  let client;
  if (clientChoisi) {
    client = clientChoisi;
  } else {
    const nom = $("#client-nom").value.trim();
    const tel = $("#client-tel").value.trim();
    if (!nom || !tel) return toast("Nom et téléphone du client obligatoires", true);
    client = {
      nom, tel,
      email: $("#client-email").value.trim(),
      pro: $("#client-pro").checked,
      nomMin: nom.toLowerCase()
    };
  }

  const typeObjet = pastilleVal("type-objet");
  if (!typeObjet) return toast("Choisis le type d'objet", true);
  const demande = pastilleVal("demande-client");
  if (!demande) return toast("Choisis la demande du client", true);

  btn.disabled = true;
  btn.textContent = "Création…";

  try {
    // Enregistrer le client s'il est nouveau
    let clientId = client.id;
    if (!clientId) {
      const ref = await addDoc(collection(db, "clients"), {
        ...client, createdAt: serverTimestamp()
      });
      clientId = ref.id;
    }

    // Numéro de ticket via compteur transactionnel
    const numero = await prochainNumero();

    const ticket = {
      numero,
      clientId,
      clientNom: client.nom,
      clientTel: client.tel,
      clientEmail: client.email || "",
      clientPro: !!client.pro,
      typeObjet,
      marque: $("#objet-marque").value.trim(),
      modele: $("#objet-modele").value.trim(),
      numSerie: $("#objet-serie").value.trim(),
      etat: pastillesVals("etat-objet"),
      etatTexte: $("#etat-texte").value.trim(),
      demande,
      demandeTexte: $("#demande-texte").value.trim(),
      photos: photosDepot,
      pieces: [],
      notes: [],
      statut: "depose",
      historique: [{ statut: "depose", date: new Date().toISOString() }],
      notifie: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const ref = await addDoc(collection(db, "tickets"), ticket);
    toast(`Ticket n° ${numero} créé`);
    imprimerTicket({ id: ref.id, ...ticket, createdAt: new Date() });
    reinitFormDepot();
  } catch (e) {
    console.error(e);
    toast("Erreur lors de la création du ticket", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Créer le ticket de dépôt";
  }
});

async function prochainNumero() {
  const ref = doc(db, "compteurs", "tickets");
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const valeur = snap.exists() ? snap.data().valeur + 1 : NUMERO_DEPART;
    tx.set(ref, { valeur });
    return valeur;
  });
}

function reinitFormDepot() {
  $$("#form-depot input[type=text], #form-depot input[type=tel], #form-depot input[type=email]").forEach(i => (i.value = ""));
  $$("#form-depot textarea").forEach(t => (t.value = ""));
  $$("#form-depot .pastille").forEach(p => p.classList.remove("actif"));
  $("#client-pro").checked = false;
  $("#photos-apercu").innerHTML = "";
  photosDepot = [];
  clientChoisi = null;
  $("#client-choisi").hidden = true;
  $("#client-nouveau").hidden = false;
}

// ------------------------------------------------------------
// Liste des tickets (temps réel)
// ------------------------------------------------------------
let tousTickets = [];
let filtreActif = "actifs";

function demarrerEcouteTickets() {
  const q$ = query(collection(db, "tickets"), orderBy("createdAt", "desc"), limit(500));
  onSnapshot(q$, snap => {
    tousTickets = [];
    snap.forEach(d => tousTickets.push({ id: d.id, ...d.data() }));
    rendreListe();
    const enCours = tousTickets.filter(t => !["rendu"].includes(t.statut)).length;
    const badge = $("#badge-encours");
    badge.textContent = enCours;
    badge.hidden = enCours === 0;
    // rafraîchir la fiche ouverte si besoin
    if (ticketOuvert) {
      const maj = tousTickets.find(t => t.id === ticketOuvert.id);
      if (maj) { ticketOuvert = maj; rendreFiche(); }
    }
  });
}

$$(".filtre").forEach(f => f.addEventListener("click", () => {
  $$(".filtre").forEach(x => x.classList.remove("actif"));
  f.classList.add("actif");
  filtreActif = f.dataset.statut;
  rendreListe();
}));
$("#tickets-recherche").addEventListener("input", rendreListe);

function rendreListe() {
  const rech = $("#tickets-recherche").value.trim().toLowerCase();
  let liste = tousTickets;
  if (filtreActif === "actifs") liste = liste.filter(t => !["pret", "rendu"].includes(t.statut));
  else if (filtreActif !== "tous") liste = liste.filter(t => t.statut === filtreActif);
  if (rech) {
    liste = liste.filter(t =>
      String(t.numero).includes(rech) ||
      (t.clientNom || "").toLowerCase().includes(rech) ||
      (t.marque || "").toLowerCase().includes(rech)
    );
  }
  $("#liste-tickets").innerHTML = liste.map(t => `
    <div class="ticket-carte" data-id="${t.id}">
      <div class="tc-num">N° ${t.numero}</div>
      <div class="tc-corps">
        <div class="tc-client">${echap(t.clientNom)}${t.clientPro ? ' <span class="tag-pro">PRO</span>' : ""}</div>
        <div class="tc-objet">${echap([t.typeObjet, t.marque, t.modele].filter(Boolean).join(" · "))}</div>
      </div>
      <div class="tc-statut statut-${t.statut}">${statutLabel(t.statut)}</div>
    </div>
  `).join("") || `<p class="liste-vide">Aucun ticket ici pour l'instant.</p>`;

  $$(".ticket-carte").forEach(c => c.addEventListener("click", () => ouvrirFiche(c.dataset.id)));
}

// ------------------------------------------------------------
// Fiche ticket
// ------------------------------------------------------------
let ticketOuvert = null;

function ouvrirFiche(id) {
  ticketOuvert = tousTickets.find(t => t.id === id);
  if (!ticketOuvert) return;
  rendreFiche();
  $$(".vue").forEach(v => (v.hidden = true));
  $("#vue-fiche").hidden = false;
  window.scrollTo(0, 0);
}

function rendreFiche() {
  const t = ticketOuvert;
  $("#fiche-numero").textContent = "N° " + t.numero;

  // Statuts
  $("#fiche-statuts").innerHTML = STATUTS.map(s =>
    `<button class="pastille ${t.statut === s.id ? "actif" : ""}" data-statut="${s.id}">${s.label}</button>`
  ).join("");
  $$("#fiche-statuts .pastille").forEach(b => b.addEventListener("click", () => changerStatut(b.dataset.statut)));

  // Zone notification
  const zone = $("#fiche-notif");
  zone.hidden = t.statut !== "pret";
  $("#notif-info").textContent = t.notifie ? "✓ Client déjà notifié" : (t.clientEmail ? "" : "Pas d'email enregistré — appelle le " + t.clientTel);
  $("#btn-notifier").disabled = !t.clientEmail || t.notifie;

  // Infos
  $("#fiche-infos").innerHTML = `
    <div><span>Client</span><b>${echap(t.clientNom)}${t.clientPro ? " · PRO" : ""}</b></div>
    <div><span>Téléphone</span><b>${echap(t.clientTel)}</b></div>
    ${t.clientEmail ? `<div><span>Email</span><b>${echap(t.clientEmail)}</b></div>` : ""}
    <div><span>Objet</span><b>${echap([t.typeObjet, t.marque, t.modele].filter(Boolean).join(" · "))}</b></div>
    ${t.numSerie ? `<div><span>N° série</span><b>${echap(t.numSerie)}</b></div>` : ""}
    <div><span>État au dépôt</span><b>${echap([...(t.etat || []), t.etatTexte].filter(Boolean).join(", ") || "RAS")}</b></div>
    <div><span>Demande</span><b>${echap([t.demande, t.demandeTexte].filter(Boolean).join(" — "))}</b></div>
    <div><span>Déposé le</span><b>${fmtDate(t.createdAt)}</b></div>
  `;
  $("#fiche-photos").innerHTML = (t.photos || []).map(u =>
    `<a class="photo-item" href="${u}" target="_blank"><img src="${u.replace("/upload/", "/upload/w_200,h_200,c_fill/")}"></a>`
  ).join("");

  // Pièces
  const pieces = t.pieces || [];
  const total = pieces.reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);
  $("#fiche-pieces").innerHTML = pieces.map(p => `
    <div class="piece-ligne">
      <span>${echap(p.designation)}${p.ref ? ` <em>(${echap(p.ref)})</em>` : ""}</span>
      <b>${(parseFloat(p.prix) || 0).toFixed(2)} €</b>
    </div>
  `).join("") + (pieces.length ? `<div class="piece-ligne piece-total"><span>Total pièces</span><b>${total.toFixed(2)} €</b></div>` : "<p class='liste-vide'>Aucune pièce pour l'instant.</p>");

  // Notes
  $("#fiche-notes").innerHTML = (t.notes || []).map(n =>
    `<div class="note"><div class="note-date">${fmtDate(n.date)}</div>${echap(n.texte)}</div>`
  ).join("") || "<p class='liste-vide'>Aucune note.</p>";

  // Historique
  $("#fiche-historique").innerHTML = (t.historique || []).map(h =>
    `<div class="hist-ligne"><span>${fmtDate(h.date)}</span><b>${statutLabel(h.statut)}</b></div>`
  ).join("");
}

async function changerStatut(nouveau) {
  if (!ticketOuvert || ticketOuvert.statut === nouveau) return;
  await updateDoc(doc(db, "tickets", ticketOuvert.id), {
    statut: nouveau,
    historique: arrayUnion({ statut: nouveau, date: new Date().toISOString() }),
    updatedAt: serverTimestamp()
  });
  toast("Statut : " + statutLabel(nouveau));
}

$("#btn-ajouter-piece").addEventListener("click", async () => {
  const designation = $("#piece-designation").value.trim();
  if (!designation) return;
  await updateDoc(doc(db, "tickets", ticketOuvert.id), {
    pieces: arrayUnion({
      designation,
      ref: $("#piece-ref").value.trim(),
      prix: parseFloat($("#piece-prix").value) || 0,
      date: new Date().toISOString()
    }),
    updatedAt: serverTimestamp()
  });
  $("#piece-designation").value = ""; $("#piece-ref").value = ""; $("#piece-prix").value = "";
});

$("#btn-ajouter-note").addEventListener("click", async () => {
  const texte = $("#note-texte").value.trim();
  if (!texte) return;
  await updateDoc(doc(db, "tickets", ticketOuvert.id), {
    notes: arrayUnion({ texte, date: new Date().toISOString() }),
    updatedAt: serverTimestamp()
  });
  $("#note-texte").value = "";
});

// ------------------------------------------------------------
// Notification "montre prête" (fonction Netlify + Nodemailer)
// ------------------------------------------------------------
$("#btn-notifier").addEventListener("click", async () => {
  const t = ticketOuvert;
  const btn = $("#btn-notifier");
  btn.disabled = true;
  btn.textContent = "Envoi…";
  try {
    const r = await fetch("/.netlify/functions/notify-ready", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: t.clientEmail,
        nom: t.clientNom,
        numero: t.numero,
        objet: [t.typeObjet, t.marque, t.modele].filter(Boolean).join(" ")
      })
    });
    if (!r.ok) throw new Error();
    await updateDoc(doc(db, "tickets", t.id), { notifie: true });
    toast("Client notifié par email ✓");
  } catch {
    toast("Échec de l'envoi de l'email", true);
  } finally {
    btn.textContent = "✉ Prévenir le client (montre prête)";
  }
});

// ------------------------------------------------------------
// Impression ticket A6
// ------------------------------------------------------------
$("#btn-imprimer").addEventListener("click", () => { if (ticketOuvert) imprimerTicket(ticketOuvert); });

function imprimerTicket(t) {
  $("#pt-num").textContent = "N° " + t.numero;
  const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || Date.now());
  $("#pt-date").textContent = "Déposé le " + d.toLocaleDateString("fr-FR");
  $("#pt-client").textContent = t.clientNom;
  $("#pt-tel").textContent = t.clientTel;
  $("#pt-objet").textContent = [t.typeObjet, t.marque, t.modele].filter(Boolean).join(" · ");
  $("#pt-etat").textContent = [...(t.etat || []), t.etatTexte].filter(Boolean).join(", ") || "RAS";
  $("#pt-demande").textContent = [t.demande, t.demandeTexte].filter(Boolean).join(" — ");
  window.print();
}
