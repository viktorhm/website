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
  getFirestore, collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, runTransaction,
  serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ------------------------------------------------------------
// ⚠ CONFIG : copie ici le firebaseConfig de ton site boutique
// (le même projet Firebase — même Firestore)
// ------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBdhXev9PvfrQIBKktIJJ58vEsP-Db-mpc",
  authDomain: "horlogerie-haratyk.firebaseapp.com",
  projectId: "horlogerie-haratyk",
  storageBucket: "horlogerie-haratyk.firebasestorage.app",
  messagingSenderId: "90184929449",
  appId: "1:90184929449:web:03bc08665e0577ac6399b8"
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
  { id: "rendu",        label: "Rendu" },
  { id: "refuse",       label: "Devis refusé" }
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
console.log("Atelier app.js chargé — version 4.3");
const EMAIL_ADMIN = "haratykviktor@gmail.com";
window.addEventListener("error", e => {
  const el = document.getElementById("login-erreur");
  if (el) el.textContent = "Erreur JS : " + e.message;
});

$("#btn-login").addEventListener("click", async () => {
  $("#login-erreur").textContent = "Connexion en cours…";
  try {
    const cred = await signInWithEmailAndPassword(auth, $("#login-email").value.trim(), $("#login-mdp").value);
    if (cred.user.email === EMAIL_ADMIN) $("#login-erreur").textContent = "";
  } catch (e) {
    console.error("Erreur de connexion :", e.code, e.message);
    const messages = {
      "auth/invalid-credential": "Email ou mot de passe incorrect.",
      "auth/wrong-password": "Mot de passe incorrect.",
      "auth/user-not-found": "Aucun compte avec cet email.",
      "auth/invalid-email": "Format d'email invalide.",
      "auth/too-many-requests": "Trop de tentatives, réessaie dans quelques minutes.",
      "auth/network-request-failed": "Pas de connexion réseau vers Firebase.",
      "auth/invalid-api-key": "Config Firebase invalide (ancien fichier en cache ?)."
    };
    $("#login-erreur").textContent = messages[e.code] || ("Erreur : " + (e.code || e.message));
  }
});
$("#login-mdp").addEventListener("keydown", e => { if (e.key === "Enter") $("#btn-login").click(); });
$("#btn-logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, user => {
  // L'atelier est réservé au compte admin : tout autre compte est éjecté
  if (user && user.email !== EMAIL_ADMIN) {
    signOut(auth);
    const err = $("#login-erreur");
    if (err) err.innerHTML = "Ce compte est un compte client professionnel.<br>Cet espace est r\u00e9serv\u00e9 \u00e0 l'atelier.<br>Votre espace de suivi : <a href='/pro/' style='color:var(--laiton)'>horlogerie-haratyk.fr/pro/</a>";
    return;
  }
  const login = $("#ecran-login");
  const appEl = $("#app");
  login.hidden = !!user;
  appEl.hidden = !user;
  // Forçage direct (contourne tout conflit CSS/cache)
  login.style.display = user ? "none" : "flex";
  appEl.style.display = user ? "block" : "none";
  if (user) {
    console.log("Connecté :", user.email);
    demarrerEcouteTickets();
  }
});

// ------------------------------------------------------------
// Navigation
// ------------------------------------------------------------
let modePro = false; // vue tickets : false = clients atelier, true = pros

function montrerVue(nom) {
  $$(".vue").forEach(v => (v.hidden = true));
  $("#vue-" + nom).hidden = false;
  $$(".nav-btn").forEach(b => {
    const actif = b.dataset.vue === nom &&
      (nom !== "tickets" || (b.dataset.pro === "1") === modePro);
    b.classList.toggle("actif", actif);
  });
  if (nom === "tickets") {
    $("#tickets-titre").textContent = modePro ? "Tickets professionnels" : "Tickets atelier client";
    rendreListe();
  }
  if (nom === "bilan") rendreBilan();
  window.scrollTo(0, 0);
}
$$(".nav-btn").forEach(b => b.addEventListener("click", () => {
  if (b.dataset.vue === "tickets") modePro = b.dataset.pro === "1";
  montrerVue(b.dataset.vue);
}));
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
initPastilles("client-civilite");
initPastilles("etat-objet", true);
initPastilles("demande-client", true);

const pastilleVal = id => $("#" + id + " .pastille.actif")?.dataset.val || "";
const pastillesVals = id => $$("#" + id + " .pastille.actif").map(p => p.dataset.val);

// ------------------------------------------------------------
// Recherche client existant
// ------------------------------------------------------------
let clientChoisi = null;

// Fermer les suggestions dès qu'on clique/tape ailleurs
document.addEventListener("click", e => {
  if (!e.target.closest(".champ")) $("#client-suggestions").hidden = true;
});
document.addEventListener("focusin", e => {
  if (!e.target.closest(".champ")) $("#client-suggestions").hidden = true;
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") $("#client-suggestions").hidden = true;
});

// Afficher SIRET quand "professionnel" est coché
$("#client-pro").addEventListener("change", e => {
  $("#client-siret").hidden = !e.target.checked;
  $("#client-email2").hidden = !e.target.checked;
});

// Cache clients : une seule lecture Firestore par session,
// la recherche filtre ensuite en mémoire (0 lecture par frappe)
let cacheClients = null;
async function chargerClients() {
  if (cacheClients) return cacheClients;
  const snap = await getDocs(query(collection(db, "clients"), orderBy("nomMin"), limit(1000)));
  cacheClients = [];
  snap.forEach(d => cacheClients.push({ id: d.id, ...d.data() }));
  return cacheClients;
}

$("#client-recherche").addEventListener("input", async e => {
  const q$ = e.target.value.trim().toLowerCase();
  const box = $("#client-suggestions");
  if (q$.length < 2) { box.hidden = true; return; }
  const clients = await chargerClients();
  const resultats = clients.filter(c =>
    (c.nomMin || "").includes(q$) ||
    (c.tel || "").replace(/\s/g, "").includes(q$.replace(/\s/g, ""))
  );
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
  // Client pro : permettre de voir/compléter le 2e email (fiche mise à jour à la création)
  const zone = $("#client-choisi-emails");
  if (c.pro) {
    zone.hidden = false;
    $("#client-choisi-email1").value = c.email || "";
    $("#client-choisi-email2").value = c.email2 || "";
  } else {
    zone.hidden = true;
  }
}
$("#btn-client-changer").addEventListener("click", () => {
  clientChoisi = null;
  $("#client-choisi").hidden = true;
  $("#client-choisi-emails").hidden = true;
  $("#client-nouveau").hidden = false;
});

// ------------------------------------------------------------
// Photos → Cloudinary
// ------------------------------------------------------------
let photosDepot = [];

async function traiterPhotos(e) {
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
}
$("#photo-camera").addEventListener("change", traiterPhotos);
$("#photo-input").addEventListener("change", traiterPhotos);

// Compression avant envoi : max 1600px, JPEG qualité 80 %
// (une photo de tablette passe de ~4 Mo à ~300 Ko, largement
// suffisant pour documenter l'état d'une montre)
async function compresserImage(fichier, maxCote = 1600, qualite = 0.8) {
  try {
    const bitmap = await createImageBitmap(fichier);
    const ratio = Math.min(1, maxCote / Math.max(bitmap.width, bitmap.height));
    const larg = Math.round(bitmap.width * ratio);
    const haut = Math.round(bitmap.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = larg;
    canvas.height = haut;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, larg, haut);
    bitmap.close();
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", qualite));
    // si la compression échoue ou n'apporte rien, garder l'original
    return (blob && blob.size < fichier.size) ? blob : fichier;
  } catch {
    return fichier; // format non géré (HEIC exotique…) : envoi tel quel
  }
}

async function uploadCloudinary(fichier) {
  const image = await compresserImage(fichier);
  const fd = new FormData();
  fd.append("file", image);
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
    client = { ...clientChoisi };
    if (client.pro) {
      client.email = $("#client-choisi-email1").value.trim();
      client.email2 = $("#client-choisi-email2").value.trim();
    }
  } else {
    const nom = $("#client-nom").value.trim();
    const tel = $("#client-tel").value.trim();
    if (!nom || !tel) return toast("Nom et téléphone du client obligatoires", true);
    client = {
      nom, tel,
      civilite: pastilleVal("client-civilite"),
      email: $("#client-email").value.trim(),
      email2: $("#client-pro").checked ? $("#client-email2").value.trim() : "",
      pro: $("#client-pro").checked,
      siret: $("#client-pro").checked ? $("#client-siret").value.trim() : "",
      nomMin: nom.toLowerCase()
    };
  }

  const typeObjet = pastilleVal("type-objet");
  if (!typeObjet) return toast("Choisis le type d'objet", true);
  const demandes = pastillesVals("demande-client");
  if (!demandes.length) return toast("Choisis la demande du client", true);
  const demande = demandes.join(", ");

  btn.disabled = true;
  btn.textContent = "Création…";

  try {
    // Enregistrer le client s'il est nouveau, ou mettre à jour ses emails
    let clientId = client.id;
    if (!clientId) {
      const ref = await addDoc(collection(db, "clients"), {
        ...client, createdAt: serverTimestamp()
      });
      clientId = ref.id;
      cacheClients = null; // recharger au prochain usage
    } else if (client.pro && (client.email !== clientChoisi.email || client.email2 !== clientChoisi.email2)) {
      await updateDoc(doc(db, "clients", clientId), {
        email: client.email || "", email2: client.email2 || ""
      });
      cacheClients = null;
    }

    // Numéro de ticket via compteur transactionnel
    const numero = await prochainNumero();

    const ticket = {
      numero,
      clientId,
      clientNom: client.nom,
      clientCivilite: client.civilite || "",
      clientTel: client.tel,
      clientEmail: client.email || "",
      clientEmails: [client.email, client.email2].filter(Boolean).map(e => e.toLowerCase()),
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
  $("#client-siret").hidden = true;
  $("#client-email2").hidden = true;
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
    const actifs = t => !["rendu"].includes(t.statut);
    const nClient = tousTickets.filter(t => !t.clientPro && actifs(t)).length;
    const nPro = tousTickets.filter(t => t.clientPro && actifs(t)).length;
    $("#badge-client").textContent = nClient;
    $("#badge-client").hidden = nClient === 0;
    $("#badge-pro").textContent = nPro;
    $("#badge-pro").hidden = nPro === 0;
    if (!$("#vue-bilan").hidden) rendreBilan();
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
  let liste = tousTickets.filter(t => !!t.clientPro === modePro);
  if (filtreActif === "actifs") liste = liste.filter(t => !["pret", "rendu"].includes(t.statut));
  else if (filtreActif !== "tous") liste = liste.filter(t => t.statut === filtreActif);
  if (rech) {
    liste = liste.filter(t =>
      String(t.numero).includes(rech) ||
      (t.clientNom || "").toLowerCase().includes(rech) ||
      (t.marque || "").toLowerCase().includes(rech) ||
      (t.contremarque || "").toLowerCase().includes(rech)
    );
  }
  $("#liste-tickets").innerHTML = liste.map(t => `
    <div class="ticket-carte" data-id="${t.id}">
      <div class="tc-num">N° ${t.numero}</div>
      <div class="tc-corps">
        <div class="tc-client">${echap(t.clientNom)}${t.clientPro ? ' <span class="tag-pro">PRO</span>' : ""}</div>
        <div class="tc-objet">${echap([t.typeObjet, t.marque, t.modele].filter(Boolean).join(" · "))}${t.contremarque ? " · CM " + echap(t.contremarque) : ""}</div>
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
    <div><span>Client</span><b>${echap((t.clientCivilite ? t.clientCivilite + " " : "") + t.clientNom)}${t.clientPro ? " · PRO" : ""}</b></div>
    ${t.contremarque ? `<div><span>Contremarque</span><b>${echap(t.contremarque)}</b></div>` : ""}
    <div><span>Téléphone</span><b>${echap(t.clientTel)}</b></div>
    ${(t.clientEmails && t.clientEmails.length ? t.clientEmails : [t.clientEmail]).filter(Boolean).map(e => `<div><span>Email</span><b>${echap(e)}</b></div>`).join("")}
    <div><span>Objet</span><b>${echap([t.typeObjet, t.marque, t.modele].filter(Boolean).join(" · "))}</b></div>
    ${t.numSerie ? `<div><span>N° série</span><b>${echap(t.numSerie)}</b></div>` : ""}
    <div><span>État au dépôt</span><b>${echap([...(t.etat || []), t.etatTexte].filter(Boolean).join(", ") || "RAS")}</b></div>
    <div><span>Demande</span><b>${echap([t.demande, t.demandeTexte].filter(Boolean).join(" — "))}</b></div>
    <div><span>Déposé le</span><b>${fmtDate(t.createdAt)}</b></div>
    ${t.facture ? `<div><span>Facturation</span><b style="color:var(--emauxvert)">✓ Facturé le ${fmtDate(t.factureDate)}</b></div>` : ""}
  `;
  $("#fiche-photos").innerHTML = (t.photos || []).map(u =>
    `<a class="photo-item" href="${u}" target="_blank"><img src="${u.replace("/upload/", "/upload/w_200,h_200,c_fill/")}"></a>`
  ).join("");

  // Devis
  rendreDevis(t);

  // Contrôle final
  const c = t.controle || {};
  $("#ctrl-marche").value = c.marche || "";
  $("#ctrl-amplitude").value = c.amplitude || "";
  $("#ctrl-reserve").value = c.reserve || "";
  $("#ctrl-remarque").value = c.remarque || "";

  // Pièces
  const pieces = t.pieces || [];
  const total = pieces.reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);
  $("#fiche-pieces").innerHTML = pieces.map((p, i) => `
    <div class="piece-ligne">
      <span>${echap(p.designation)}${p.ref ? ` <em>(${echap(p.ref)})</em>` : ""}${p.fournisseur ? ` <em>· ${echap(p.fournisseur)}</em>` : ""}
        ${p.aCommander ? `<button class="tag-option tag-cmd piece-cmd" data-i="${i}" title="Marquer comme reçue">📦 à commander</button>` : ""}
      </span>
      <b>${(parseFloat(p.prix) || 0).toFixed(2)} €</b>
    </div>
  `).join("") + (pieces.length ? `<div class="piece-ligne piece-total"><span>Total pièces</span><b>${total.toFixed(2)} €</b></div>` : "<p class='liste-vide'>Aucune pièce pour l'instant.</p>");

  $$(".piece-cmd").forEach(b => b.addEventListener("click", async () => {
    const nouvelles = pieces.map((p, i) => {
      if (i !== parseInt(b.dataset.i)) return p;
      const { aCommander, ...reste } = p;
      return reste;
    });
    await updateDoc(doc(db, "tickets", t.id), { pieces: nouvelles, updatedAt: serverTimestamp() });
    toast("Pièce marquée comme reçue ✓");
  }));

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
  const maj = {
    statut: nouveau,
    historique: arrayUnion({ statut: nouveau, date: new Date().toISOString() }),
    updatedAt: serverTimestamp()
  };
  // Accord/refus donné de vive voix : synchroniser l'état du devis
  const d = ticketOuvert.devis;
  if (["accepte", "refuse"].includes(nouveau) && d && d.lignes && d.lignes.length
      && !["accepte", "refuse"].includes(d.statut)) {
    maj["devis.statut"] = nouveau;
    maj["devis.dateReponse"] = new Date().toISOString();
  }
  await updateDoc(doc(db, "tickets", ticketOuvert.id), maj);
  toast("Statut : " + statutLabel(nouveau));
}

$("#btn-ajouter-piece").addEventListener("click", async () => {
  const designation = $("#piece-designation").value.trim();
  if (!designation) return;
  const piece = {
    designation,
    ref: $("#piece-ref").value.trim(),
    fournisseur: $("#piece-fournisseur").value.trim(),
    prix: parseFloat($("#piece-prix").value) || 0,
    date: new Date().toISOString()
  };
  if ($("#piece-commander").checked) piece.aCommander = true;
  await updateDoc(doc(db, "tickets", ticketOuvert.id), {
    pieces: arrayUnion(piece),
    updatedAt: serverTimestamp()
  });
  $("#piece-designation").value = ""; $("#piece-ref").value = ""; $("#piece-prix").value = "";
  $("#piece-fournisseur").value = ""; $("#piece-commander").checked = false;
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
// Devis
// ------------------------------------------------------------
function rendreDevis(t) {
  const devis = t.devis || { lignes: [] };
  const lignes = devis.lignes || [];
  const repondu = ["accepte", "refuse"].includes(devis.statut);
  const totalBase = lignes.filter(l => !l.optionnelle).reduce((s, l) => s + (parseFloat(l.prix) || 0), 0);
  const totalOptions = lignes.filter(l => l.optionnelle && !(repondu && l.refusee)).reduce((s, l) => s + (parseFloat(l.prix) || 0), 0);

  $("#fiche-devis").innerHTML = lignes.map((l, i) => {
    const refusee = l.optionnelle && repondu && l.refusee;
    const tag = l.optionnelle
      ? (repondu ? (refusee ? '<span class="tag-option tag-refuse">option refusée</span>' : '<span class="tag-option tag-ok">option acceptée</span>')
                 : '<span class="tag-option">option</span>')
      : "";
    return `
    <div class="piece-ligne ${refusee ? "ligne-refusee" : ""}">
      <span>${echap(l.designation)} ${tag} <button class="btn-lien devis-suppr" data-i="${i}">✕</button></span>
      <b>${(parseFloat(l.prix) || 0).toFixed(2)} €</b>
    </div>`;
  }).join("") + (lignes.length
    ? `<div class="piece-ligne piece-total"><span>Total ${repondu ? "retenu" : "base"} (TVA non applicable)</span><b>${(totalBase + (repondu ? totalOptions : 0)).toFixed(2)} €</b></div>`
      + (!repondu && totalOptions ? `<div class="piece-ligne"><span style="color:var(--texte-2)">dont options proposées</span><b style="color:var(--texte-2)">+ ${totalOptions.toFixed(2)} €</b></div>` : "")
    : "<p class='liste-vide'>Aucune ligne de devis.</p>");

  $$(".devis-suppr").forEach(b => b.addEventListener("click", async () => {
    const nouvelles = lignes.filter((_, i) => i !== parseInt(b.dataset.i));
    await updateDoc(doc(db, "tickets", t.id), {
      "devis.lignes": nouvelles, updatedAt: serverTimestamp()
    });
  }));

  const infos = {
    envoye: "Devis envoyé le " + (devis.dateEnvoi ? fmtDate(devis.dateEnvoi) : ""),
    accepte: "✓ Devis accepté par le client",
    refuse: "✗ Devis refusé par le client"
  };
  $("#devis-info").textContent = infos[devis.statut] || "";
  if (t.clientPro) {
    $("#btn-envoyer-devis").disabled = !lignes.length;
    $("#btn-envoyer-devis").textContent = devis.statut === "envoye"
      ? "↻ Republier le devis (espace pro)" : "▸ Publier le devis sur l'espace pro";
  } else {
    $("#btn-envoyer-devis").disabled = !lignes.length || !t.clientEmail;
    $("#btn-envoyer-devis").textContent = !t.clientEmail
      ? "Pas d'email client enregistré"
      : (devis.statut === "envoye" ? "✉ Renvoyer le devis" : "✉ Envoyer le devis au client");
  }
}

$$("#devis-presets .pastille").forEach(p => p.addEventListener("click", () => {
  $("#devis-designation").value = p.dataset.des;
  if (p.dataset.prix) $("#devis-prix").value = p.dataset.prix;
  $("#devis-prix").focus();
}));

$("#btn-ajouter-devis").addEventListener("click", async () => {
  const designation = $("#devis-designation").value.trim();
  const prix = parseFloat($("#devis-prix").value) || 0;
  if (!designation) return;
  const t = ticketOuvert;
  const ligne = { designation, prix };
  if ($("#devis-option").checked) ligne.optionnelle = true;
  const lignes = [...((t.devis && t.devis.lignes) || []), ligne];
  await updateDoc(doc(db, "tickets", t.id), {
    "devis.lignes": lignes, updatedAt: serverTimestamp()
  });
  $("#devis-designation").value = ""; $("#devis-prix").value = ""; $("#devis-option").checked = false;
});

$("#btn-envoyer-devis").addEventListener("click", async () => {
  const t = ticketOuvert;
  const btn = $("#btn-envoyer-devis");
  const lignes = (t.devis && t.devis.lignes) || [];
  if (!lignes.length) return;
  if (!t.clientPro && !t.clientEmail) return;
  btn.disabled = true;
  btn.textContent = t.clientPro ? "Publication…" : "Envoi…";
  try {
    const token = (t.devis && t.devis.token) || crypto.randomUUID();

    // Particulier : email avec boutons Accepter/Refuser.
    // Pro : PAS d'email — le devis apparaît sur l'espace pro, tu le préviens toi-même.
    if (!t.clientPro) {
      const r = await fetch("/.netlify/functions/send-devis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: (t.clientEmails && t.clientEmails.length ? t.clientEmails : [t.clientEmail]).join(", "),
          nom: t.clientNom,
          numero: t.numero,
          contremarque: t.contremarque || "",
          objet: [t.typeObjet, t.marque, t.modele].filter(Boolean).join(" "),
          lignes,
          token
        })
      });
      if (!r.ok) throw new Error();
    }

    await updateDoc(doc(db, "tickets", t.id), {
      "devis.statut": "envoye",
      "devis.token": token,
      "devis.dateEnvoi": new Date().toISOString(),
      statut: "devis_envoye",
      historique: arrayUnion({ statut: "devis_envoye", date: new Date().toISOString() }),
      updatedAt: serverTimestamp()
    });
    toast(t.clientPro ? "Devis publié sur l'espace pro ✓" : "Devis envoyé par email ✓");
  } catch {
    toast("Échec de l'envoi du devis", true);
    btn.disabled = false;
  }
});

// ------------------------------------------------------------
// Suppression de ticket
// ------------------------------------------------------------
$("#btn-supprimer").addEventListener("click", async () => {
  const t = ticketOuvert;
  if (!t) return;
  if (!confirm(`Supprimer définitivement le ticket n° ${t.numero} (${t.clientNom}) ?`)) return;
  if (!confirm("Cette action est irréversible. Confirmer la suppression ?")) return;
  try {
    await deleteDoc(doc(db, "tickets", t.id));
    ticketOuvert = null;
    toast(`Ticket n° ${t.numero} supprimé`);
    montrerVue("tickets");
  } catch (e) {
    console.error(e);
    toast("Échec de la suppression", true);
  }
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
        email: (t.clientEmails && t.clientEmails.length ? t.clientEmails : [t.clientEmail]).join(", "),
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
// Bilan
// ------------------------------------------------------------
const MOIS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

function montantTicket(t) {
  const devis = t.devis || {};
  const lignes = devis.lignes || [];
  if (lignes.length) {
    const accepte = devis.statut === "accepte";
    return lignes
      .filter(l => !l.optionnelle || (accepte && !l.refusee))
      .reduce((s, l) => s + (parseFloat(l.prix) || 0), 0);
  }
  return (t.pieces || []).reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);
}

function dateStatut(t, statut) {
  const h = (t.historique || []).filter(x => x.statut === statut);
  return h.length ? new Date(h[h.length - 1].date) : null;
}

function initBilanMois() {
  const sel = $("#bilan-mois");
  if (sel.options.length) return;
  const maintenant = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
    const opt = document.createElement("option");
    opt.value = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    opt.textContent = MOIS_FR[d.getMonth()] + " " + d.getFullYear();
    sel.appendChild(opt);
  }
  sel.addEventListener("change", rendreBilan);
}

const eur = n => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function rendreBilan() {
  initBilanMois();
  const [annee, mois] = $("#bilan-mois").value.split("-").map(Number);
  const dansLeMois = d => d && d.getFullYear() === annee && d.getMonth() + 1 === mois;

  // --- Cartes ---
  const attente = tousTickets.filter(t => t.statut === "devis_envoye");
  $("#stat-attente-n").textContent = attente.length;
  $("#stat-attente-eur").textContent = eur(attente.reduce((s, t) => s + montantTicket(t), 0)) + " en jeu";

  const atelier = tousTickets.filter(t => ["accepte", "en_cours"].includes(t.statut));
  $("#stat-atelier-n").textContent = atelier.length;
  $("#stat-atelier-eur").textContent = eur(atelier.reduce((s, t) => s + montantTicket(t), 0)) + " à venir";

  const prets = tousTickets.filter(t => t.statut === "pret");
  $("#stat-pret-n").textContent = prets.length;
  $("#stat-pret-eur").textContent = eur(prets.reduce((s, t) => s + montantTicket(t), 0)) + " à encaisser";

  // Pièces en attente de commande / réception
  const enAttente = [];
  tousTickets.filter(t => t.statut !== "rendu").forEach(t => {
    (t.pieces || []).forEach((p, i) => {
      if (p.aCommander) enAttente.push({ t, p, i });
    });
  });
  $("#stat-pieces-n").textContent = enAttente.length;
  $("#stat-pieces-detail").textContent = enAttente.length
    ? [...new Set(enAttente.map(x => x.p.fournisseur || "sans fournisseur"))].length + " fournisseur(s)"
    : "rien à commander";

  const parFournisseur = {};
  enAttente.forEach(x => {
    const f = x.p.fournisseur || "Fournisseur non renseigné";
    (parFournisseur[f] = parFournisseur[f] || []).push(x);
  });
  $("#bilan-commandes").innerHTML = Object.keys(parFournisseur).sort().map(f => `
    <div class="cmd-fournisseur">${echap(f)} — ${parFournisseur[f].length} pièce(s)</div>
    ${parFournisseur[f].map(x => `
      <div class="cmd-ligne">
        <div class="cmd-info">
          ${echap(x.p.designation)}
          ${x.p.ref ? `<span class="cmd-ref"> · ${echap(x.p.ref)}</span>` : ""}
          <div class="cmd-ticket">Ticket n° ${x.t.numero} — ${echap(x.t.clientNom)}</div>
        </div>
        <button class="btn-recue" data-ticket="${x.t.id}" data-i="${x.i}">✓ Reçue</button>
      </div>`).join("")}
  `).join("") || "<p class='liste-vide'>Aucune pièce en attente de commande.</p>";

  $$("#bilan-commandes .btn-recue").forEach(b => b.addEventListener("click", async () => {
    const t = tousTickets.find(x => x.id === b.dataset.ticket);
    if (!t) return;
    const nouvelles = (t.pieces || []).map((p, i) => {
      if (i !== parseInt(b.dataset.i)) return p;
      const { aCommander, ...reste } = p;
      return reste;
    });
    await updateDoc(doc(db, "tickets", t.id), { pieces: nouvelles, updatedAt: serverTimestamp() });
    toast("Pièce marquée comme reçue ✓");
  }));

  const rendusMois = tousTickets.filter(t => t.statut === "rendu" && dansLeMois(dateStatut(t, "rendu")));
  $("#stat-ca-libelle").textContent = "Rendus — " + MOIS_FR[mois - 1];
  $("#stat-ca-eur").textContent = eur(rendusMois.reduce((s, t) => s + montantTicket(t), 0));
  $("#stat-ca-n").textContent = rendusMois.length + " ticket" + (rendusMois.length > 1 ? "s" : "") + " rendu" + (rendusMois.length > 1 ? "s" : "");

  // --- Dû par les clients pro ---
  // À facturer : UNIQUEMENT les montres rendues (non facturées), devis validé ou accord oral.
  // En atelier : travail engagé (accepté / en réparation / prêt), pas encore rendu.
  const proTickets = tousTickets.filter(t => t.clientPro && montantTicket(t) > 0);
  const parClient = {};
  proTickets.forEach(t => {
    const c = parClient[t.clientNom] || (parClient[t.clientNom] = { enCours: 0, nEnCours: 0, du: 0, nDu: 0, cumul: 0, nCumul: 0, tickets: [] });
    if (t.statut === "rendu") {
      if (!t.facture) { c.du += montantTicket(t); c.nDu++; c.tickets.push(t); }
      else { c.cumul += montantTicket(t); c.nCumul++; }
    } else if (["accepte", "en_cours", "pret"].includes(t.statut)) {
      c.enCours += montantTicket(t); c.nEnCours++;
    }
  });
  const noms = Object.keys(parClient).sort();
  let totalEnCours = 0, totalDu = 0, totalCumul = 0;
  $("#bilan-pro").innerHTML = noms.length ? `
    <div class="bilan-ligne bilan-ligne-pro bilan-ligne-titre">
      <span>Client</span><span>En atelier</span><span>À facturer</span><span>Facturé (cumul)</span><span></span>
    </div>
    ${noms.map((n, idx) => {
      const c = parClient[n];
      totalEnCours += c.enCours; totalDu += c.du; totalCumul += c.cumul;
      return `<div class="bilan-ligne bilan-ligne-pro">
        <span>${echap(n)}</span>
        <span>${c.nEnCours ? eur(c.enCours) + " (" + c.nEnCours + ")" : "—"}</span>
        <span>${c.nDu ? eur(c.du) + " (" + c.nDu + ")" : "—"}</span>
        <span>${c.nCumul ? eur(c.cumul) : "—"}</span>
        <span>${c.nDu ? `<button class="btn-facture" data-client="${echap(n)}">✓ Facturé</button>` : ""}</span>
      </div>`;
    }).join("")}
    <div class="bilan-ligne bilan-ligne-pro bilan-ligne-total">
      <span>Total</span><span>${eur(totalEnCours)}</span><span>${eur(totalDu)}</span><span>${eur(totalCumul)}</span><span></span>
    </div>`
    : "<p class='liste-vide'>Aucun devis pro accepté pour l'instant.</p>";

  // Bouton "Facturé" : remet le solde du client à zéro (marque les tickets rendus comme facturés)
  $$(".btn-facture").forEach(b => b.addEventListener("click", async () => {
    const nom = b.dataset.client;
    const c = parClient[nom];
    if (!c || !c.tickets.length) return;
    if (!confirm(`Marquer comme facturés les ${c.nDu} ticket(s) de ${nom} (${eur(c.du)}) ?\nLe solde "À facturer" repassera à zéro.`)) return;
    const dateFacture = new Date().toISOString();
    try {
      await Promise.all(c.tickets.map(t => updateDoc(doc(db, "tickets", t.id), {
        facture: true, factureDate: dateFacture, updatedAt: serverTimestamp()
      })));
      toast(`${nom} : ${eur(c.du)} marqués facturés ✓`);
    } catch (e) {
      console.error(e);
      toast("Erreur lors du marquage", true);
    }
  }));

  // --- Tickets validés ---
  const valides = tousTickets
    .filter(t => t.devis && t.devis.statut === "accepte")
    .sort((a, b) => new Date(b.devis.dateReponse || 0) - new Date(a.devis.dateReponse || 0));
  $("#bilan-valides").innerHTML = valides.map(t => `
    <div class="ticket-carte" data-id="${t.id}">
      <div class="tc-num">N° ${t.numero}</div>
      <div class="tc-corps">
        <div class="tc-client">${echap(t.clientNom)}${t.clientPro ? ' <span class="tag-pro">PRO</span>' : ""}</div>
        <div class="tc-objet">Accepté le ${t.devis.dateReponse ? fmtDate(t.devis.dateReponse) : "—"} · ${eur(montantTicket(t))}</div>
      </div>
      <div class="tc-statut statut-${t.statut}">${statutLabel(t.statut)}</div>
    </div>
  `).join("") || "<p class='liste-vide'>Aucun ticket validé.</p>";
  $$("#bilan-valides .ticket-carte").forEach(c => c.addEventListener("click", () => ouvrirFiche(c.dataset.id)));

  rendreCourbe();
}

function rendreCourbe() {
  // Courbe : encaissé mensuel sur 12 mois
  const maintenant = new Date();
  const points = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
    points.push({ a: d.getFullYear(), m: d.getMonth(), total: 0 });
  }
  tousTickets.filter(t => t.statut === "rendu").forEach(t => {
    const d = dateStatut(t, "rendu");
    if (!d) return;
    const cible = points.find(x => x.a === d.getFullYear() && x.m === d.getMonth());
    if (cible) cible.total += montantTicket(t);
  });

  const L = 600, H = 190, basY = 150, hautY = 24;
  const max = Math.max(...points.map(p => p.total), 1);
  const px = i => Math.round(20 + i * (L - 40) / 11);
  const py = v => Math.round(basY - (v / max) * (basY - hautY));

  // Lissage Catmull-Rom converti en courbes de Bézier
  const pts = points.map((p, i) => [px(i), py(p.total)]);
  let chemin = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    chemin += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  const aire = chemin + ` L${px(11)},${basY} L${px(0)},${basY} Z`;

  const cercles = points.map((p, i) =>
    `<circle cx="${px(i)}" cy="${py(p.total)}" r="4" fill="#C9A55C"/>` +
    (p.total ? `<text x="${px(i)}" y="${py(p.total) - 10}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="11" fill="var(--laiton)">${Math.round(p.total)}</text>` : "")
  ).join("");

  const labels = points.map((p, i) =>
    `<text x="${px(i)}" y="${basY + 20}" text-anchor="middle" font-size="11" fill="var(--texte-2)">${MOIS_FR[p.m].slice(0, 3)}${p.m === 0 ? " " + String(p.a).slice(2) : ""}</text>`
  ).join("");

  $("#bilan-courbe").innerHTML = `
    <svg viewBox="0 0 ${L} ${H}" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="degAire" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#C9A55C" stop-opacity=".35"/>
          <stop offset="1" stop-color="#C9A55C" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="0" y1="${basY}" x2="${L}" y2="${basY}" stroke="var(--ligne)" stroke-width="1"/>
      <path d="${aire}" fill="url(#degAire)"/>
      <path d="${chemin}" fill="none" stroke="#C9A55C" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${cercles}
      ${labels}
    </svg>`;
}

// ------------------------------------------------------------
// Contrôle final + certificat de révision
// ------------------------------------------------------------
$("#btn-sauver-controle").addEventListener("click", async () => {
  const t = ticketOuvert;
  await updateDoc(doc(db, "tickets", t.id), {
    controle: {
      marche: $("#ctrl-marche").value.trim(),
      amplitude: $("#ctrl-amplitude").value.trim(),
      reserve: $("#ctrl-reserve").value.trim(),
      remarque: $("#ctrl-remarque").value.trim(),
      date: new Date().toISOString()
    },
    updatedAt: serverTimestamp()
  });
  toast("Contrôle enregistré ✓");
});

$("#btn-certificat").addEventListener("click", () => {
  const t = ticketOuvert;
  const c = t.controle || {
    marche: $("#ctrl-marche").value.trim(),
    amplitude: $("#ctrl-amplitude").value.trim(),
    reserve: $("#ctrl-reserve").value.trim(),
    remarque: $("#ctrl-remarque").value.trim()
  };
  $("#pc-ref").textContent = "Ticket n° " + t.numero + " — le " + new Date().toLocaleDateString("fr-FR");
  $("#pc-objet").textContent = [t.typeObjet, t.marque, t.modele].filter(Boolean).join(" · ");
  $("#pc-serie").textContent = t.numSerie || "";
  $("#pc-serie-ligne").style.display = t.numSerie ? "" : "none";
  $("#pc-client").textContent = (t.clientCivilite ? t.clientCivilite + " " : "") + t.clientNom;
  const interventions = (t.pieces || []).map(p => p.designation);
  $("#pc-interventions").textContent = interventions.length
    ? "Révision complète — " + interventions.join(", ")
    : "Révision complète (démontage, nettoyage, lubrification, réglage)";
  $("#pc-marche").textContent = c.marche || "—";
  $("#pc-amplitude").textContent = c.amplitude || "—";
  $("#pc-reserve").textContent = c.reserve || "";
  $("#pc-reserve-ligne").style.display = c.reserve ? "" : "none";
  $("#pc-remarque").textContent = c.remarque || "";
  $("#pc-remarque-ligne").style.display = c.remarque ? "" : "none";
  $("#pc-date-garantie").textContent = new Date().toLocaleDateString("fr-FR");
  document.body.classList.add("mode-certif");
  window.print();
  document.body.classList.remove("mode-certif");
});

// ------------------------------------------------------------
// Impression ticket A6
// ------------------------------------------------------------
$("#btn-imprimer").addEventListener("click", () => { if (ticketOuvert) imprimerTicket(ticketOuvert); });

function imprimerTicket(t) {
  $("#pt-num").textContent = "N° " + t.numero;
  $("#pt-contremarque").textContent = t.contremarque ? "Contremarque : " + t.contremarque : "";
  const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || Date.now());
  $("#pt-date").textContent = "Déposé le " + d.toLocaleDateString("fr-FR");
  $("#pt-client").textContent = (t.clientCivilite ? t.clientCivilite + " " : "") + t.clientNom;
  $("#pt-tel").textContent = t.clientTel;
  $("#pt-objet").textContent = [t.typeObjet, t.marque, t.modele].filter(Boolean).join(" · ");
  $("#pt-etat").textContent = [...(t.etat || []), t.etatTexte].filter(Boolean).join(", ") || "RAS";
  $("#pt-demande").textContent = [t.demande, t.demandeTexte].filter(Boolean).join(" — ");
  window.print();
}
