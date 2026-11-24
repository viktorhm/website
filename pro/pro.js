// ============================================================
// Espace professionnel — Horlogerie Haratyk · v6
// Chaque client pro connecté ne voit que SES tickets
// (règle Firestore verrouillée sur son email)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, query, where, onSnapshot, getDocs, getDoc, doc, limit, setDoc, deleteDoc, serverTimestamp
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

const EMAIL_ATELIER = "haratykviktor@gmail.com";

const STATUTS = {
  depose: "Déposé", diagnostic: "En diagnostic", devis_envoye: "Devis à valider",
  accepte: "Devis accepté", piece_attente: "Pièce en commande", en_cours: "En réparation",
  pret: "Prêt à retirer", rendu: "Rendu", refuse: "Devis refusé"
};
// Étape de progression (0 → 5) : Déposé · Diagnostic · Devis · Réparation · Prêt · Rendu
const ETAPE = { depose: 0, diagnostic: 1, devis_envoye: 2, accepte: 3, piece_attente: 3, en_cours: 3, pret: 4, rendu: 5, refuse: 2 };
const EN_ATELIER = ["depose", "diagnostic", "accepte", "piece_attente", "en_cours"];

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function toast(msg, erreur = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("toast-erreur", erreur);
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 3800);
}

function echap(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}
const attr = s => echap(s).replace(/"/g, "&quot;");

function versDate(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return isNaN(d) ? null : d;
}
function fmtDate(ts) {
  const d = versDate(ts);
  return d ? d.toLocaleDateString("fr-FR") : "—";
}
function fmtDateLongue(ts) {
  const d = versDate(ts);
  return d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—";
}
const eur = n => (n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const objetDe = t => [t.typeObjet, t.marque, t.modele].filter(Boolean).join(" · ") || "Objet";

function dateStatut(t, statut) {
  const h = (t.historique || []).filter(x => x.statut === statut);
  return h.length ? new Date(h[h.length - 1].date) : null;
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
      "auth/invalid-email": "Adresse email invalide.",
      "auth/too-many-requests": "Trop de tentatives, réessayez dans quelques minutes.",
      "auth/network-request-failed": "Pas de connexion internet."
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
let derniereMaj = null;
function etatLigne(ok, texte) {
  const led = $("#led");
  if (!led) return;
  led.classList.toggle("led-rouge", !ok);
  $("#led-texte").textContent = texte || (ok ? "Synchronisé" : "Hors ligne");
}
window.addEventListener("online", () => etatLigne(true));
window.addEventListener("offline", () => etatLigne(false, "Pas de connexion"));

function majDateAccueil() {
  const aujourdhui = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const maj = derniereMaj ? " · mis à jour à " + derniereMaj.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
  $("#accueil-date").textContent = aujourdhui.charAt(0).toUpperCase() + aujourdhui.slice(1) + maj;
}

onAuthStateChanged(auth, user => {
  const login = $("#ecran-login");
  const appEl = $("#app");
  login.hidden = !!user;
  appEl.hidden = !user;
  if (user) {
    societe = "";
    majAccueil();
    majDateAccueil();
    etatLigne(navigator.onLine, navigator.onLine ? "Connexion…" : "Pas de connexion");
    chargerSociete(user.email);
    chargerHoraires();
    initNotifications();
    chargerMeteo();
    demarrerEcoute(user.email);
  } else if (arretEcoute) {
    arretEcoute();
    arretEcoute = null;
  }
});

// ------------------------------------------------------------
// Société & horaires
// ------------------------------------------------------------
let societe = "";
function majAccueil() {
  $("#accueil-titre").textContent = societe ? "Bonjour, " + societe : "Bonjour";
}

async function chargerSociete(email) {
  try {
    let snap = await getDocs(query(collection(db, "clients"), where("pro", "==", true), where("email", "==", email), limit(1)));
    if (snap.empty) snap = await getDocs(query(collection(db, "clients"), where("pro", "==", true), where("email2", "==", email), limit(1)));
    if (!snap.empty) { societe = snap.docs[0].data().nom || ""; majAccueil(); }
  } catch (e) {
    console.warn("Fiche client non accessible (règle Firestore ?)", e.code || e);
  }
}

async function chargerHoraires() {
  try {
    const snap = await getDoc(doc(db, "config", "atelier"));
    if (snap.exists() && snap.data().horaires) $("#horaires").textContent = snap.data().horaires;
  } catch { /* lecture non autorisée pour les pros : on garde le texte par défaut */ }
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
  // + clientPro == true : la règle Firestore l'exige, et une requête doit
  // reprendre les conditions de la règle sinon elle est refusée en bloc.
  const qNouveaux = query(collection(db, "tickets"), where("clientPro", "==", true), where("clientEmails", "array-contains", em));
  const qAnciens = query(collection(db, "tickets"), where("clientPro", "==", true), where("clientEmail", "==", email));
  const resultats = { a: [], b: [] };
  let premierChargement = true;

  const fusionner = () => {
    const vus = new Set();
    mesTickets = [...resultats.a, ...resultats.b].filter(t => {
      if (vus.has(t.id)) return false;
      vus.add(t.id);
      return true;
    });
    mesTickets.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (!societe && mesTickets.length) { societe = mesTickets[0].clientNom || ""; majAccueil(); }
    derniereMaj = new Date();
    majDateAccueil();
    // S'il y a des devis à valider à l'arrivée, on ouvre directement cet onglet
    if (premierChargement && mesTickets.some(t => t.statut === "devis_envoye")) choisirFiltre("devis", false);
    premierChargement = false;
    // Arrivée depuis une notification : ?t=<id du ticket>
    if (ticketDemande && mesTickets.some(t => t.id === ticketDemande)) {
      const id = ticketDemande;
      ticketDemande = null;
      setTimeout(() => ouvrirTicket(id), 0);
    }
    majTableauDeBord();
    rendreListe();
  };

  const erreur = err => {
    console.error(err);
    etatLigne(false, "Erreur serveur");
    if (!mesTickets.length) {
      $("#liste").innerHTML = `<div class="vide"><div class="vide-titre">Accès impossible</div>
        Erreur de chargement. Contactez l'atelier au <a href="tel:+33785851080">07 85 85 10 80</a>.</div>`;
    }
  };

  const arretA = onSnapshot(qNouveaux, snap => {
    resultats.a = [];
    snap.forEach(d => resultats.a.push({ id: d.id, ...d.data() }));
    etatLigne(true);
    fusionner();
  }, erreur);

  const arretB = onSnapshot(qAnciens, snap => {
    resultats.b = [];
    snap.forEach(d => resultats.b.push({ id: d.id, ...d.data() }));
    etatLigne(true);
    fusionner();
  }, err => { if (!resultats.a.length) erreur(err); else console.warn(err); });

  arretEcoute = () => { arretA(); arretB(); };
}

// ------------------------------------------------------------
// Filtres, recherche
// ------------------------------------------------------------
const FILTRES = {
  actifs: t => !["rendu", "pret"].includes(t.statut),
  devis:  t => t.statut === "devis_envoye",
  pret:   t => t.statut === "pret",
  rendu:  t => t.statut === "rendu"
};

function choisirFiltre(f, defiler = true) {
  filtreActif = f;
  $("#recherche").value = "";
  $$(".onglet").forEach(o => o.classList.toggle("actif", o.dataset.filtre === f));
  rendreListe();
  if (defiler) $("#onglets").scrollIntoView({ behavior: "smooth", block: "start" });
}
$$(".onglet").forEach(o => o.addEventListener("click", () => choisirFiltre(o.dataset.filtre, false)));
$$("[data-aller]").forEach(k => k.addEventListener("click", () => choisirFiltre(k.dataset.aller)));
$("#btn-alerte").addEventListener("click", () => choisirFiltre("devis"));
$("#recherche").addEventListener("input", rendreListe);

// ------------------------------------------------------------
// Tableau de bord
// ------------------------------------------------------------
function totalDevis(t) {
  const devis = t.devis || {};
  const lignes = devis.lignes || [];
  const repondu = ["accepte", "refuse"].includes(devis.statut);
  if (devis.statut === "refuse" || t.statut === "refuse") return 0;
  return lignes
    .filter(l => !l.optionnelle || (repondu ? !l.refusee : false))
    .reduce((s, l) => s + (parseFloat(l.prix) || 0), 0);
}

const pluriel = (n, mot) => n + " " + mot + (n > 1 ? "s" : "");

function aFacturer() {
  return mesTickets.filter(t => t.statut === "rendu" && !t.facture && totalDevis(t) > 0);
}

function majTableauDeBord() {
  const devis = mesTickets.filter(FILTRES.devis);
  const atelier = mesTickets.filter(t => EN_ATELIER.includes(t.statut));
  const prets = mesTickets.filter(FILTRES.pret);
  const du = aFacturer();
  const somme = l => l.reduce((s, t) => s + totalDevis(t), 0);

  $("#kpi-devis").textContent = devis.length;
  $("#kpi-devis-sous").textContent = devis.length ? eur(somme(devis)) + " proposés" : "rien en attente";
  $("#kpi-atelier").textContent = atelier.length;
  const enCommande = atelier.filter(t => t.statut === "piece_attente").length;
  $("#kpi-atelier-sous").textContent = atelier.length
    ? (enCommande ? pluriel(enCommande, "pièce") + " en commande" : "en cours de traitement")
    : "aucune montre";
  $("#kpi-pret").textContent = prets.length;
  $("#kpi-pret-sous").textContent = prets.length ? "à retirer à l'atelier" : "rien à retirer";
  $("#kpi-du").textContent = eur(somme(du));
  $("#kpi-du-sous").textContent = du.length ? pluriel(du.length, "montre") + " rendue" + (du.length > 1 ? "s" : "") + " · facture à venir" : "aucun montant en attente";
  $("#btn-releve").hidden = !du.length;

  const alerte = $("#alerte-devis");
  alerte.hidden = !devis.length;
  if (devis.length) {
    $("#alerte-texte").innerHTML = `<b>${devis.length === 1 ? "Un devis attend" : devis.length + " devis attendent"} votre validation</b>
      <small>Les travaux démarrent dès votre accord — vous pouvez cocher ou décocher les options proposées.</small>`;
  }

  const n = f => mesTickets.filter(f).length;
  const cpt = { actifs: n(FILTRES.actifs), devis: devis.length, pret: prets.length, rendu: n(FILTRES.rendu) };
  Object.entries(cpt).forEach(([k, v]) => ($("#cpt-" + k).textContent = v || ""));
  $('.onglet[data-filtre="devis"]').classList.toggle("urgent", devis.length > 0);
}

// ------------------------------------------------------------
// Liste des dépôts
// ------------------------------------------------------------
function rendreListe() {
  const rech = $("#recherche").value.trim().toLowerCase();
  let liste;
  if (rech) {
    liste = mesTickets.filter(t =>
      [t.numero, t.marque, t.modele, t.typeObjet, t.numSerie, t.contremarque]
        .some(v => String(v || "").toLowerCase().includes(rech)));
  } else {
    liste = mesTickets.filter(FILTRES[filtreActif]);
  }

  if (!liste.length) {
    const messages = {
      actifs: ["Aucune montre à l'atelier", "Vos prochains dépôts apparaîtront ici dès leur enregistrement."],
      devis: ["Aucun devis en attente", "Vous serez averti ici dès qu'un devis sera prêt."],
      pret: ["Rien à retirer pour le moment", "Les montres terminées apparaîtront ici."],
      rendu: ["Pas encore d'historique", "Les montres rendues seront archivées ici."]
    };
    const [titre, texte] = rech ? ["Aucun résultat", "Aucun dépôt ne correspond à « " + echap(rech) + " »."] : messages[filtreActif];
    $("#liste").innerHTML = `<div class="vide"><div class="vide-titre">${titre}</div>${texte}</div>`;
    return;
  }

  $("#liste").innerHTML = liste.map(carteHtml).join("");

  $$(".depot-tete").forEach(c => c.addEventListener("click", e => {
    if (e.target.closest("a")) return;
    const id = c.closest(".depot").dataset.id;
    ticketOuvertId = ticketOuvertId === id ? null : id;
    rendreListe();
    if (ticketOuvertId) document.querySelector(`.depot[data-id="${ticketOuvertId}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }));

  $$(".opt-devis").forEach(c => c.addEventListener("change", () => {
    const t = mesTickets.find(x => x.id === c.dataset.ticket);
    if (!t) return;
    let total = totalDevis(t);
    $$(`.opt-devis[data-ticket="${t.id}"]:checked`).forEach(x => (total += parseFloat(x.dataset.prix) || 0));
    const cible = document.querySelector(`.total-devis[data-id="${t.id}"]`);
    if (cible) cible.textContent = eur(total);
  }));

  $$(".btn-devis-reponse").forEach(b => b.addEventListener("click", () => {
    const id = b.closest(".depot").dataset.id;
    const opts = $$(`.opt-devis[data-ticket="${id}"]:checked`).map(c => c.dataset.i).join(",");
    repondreDevis(b, b.dataset.token, b.dataset.reponse, opts);
  }));
}

function carteHtml(t) {
  const ouvert = t.id === ticketOuvertId;
  const etape = ETAPE[t.statut] ?? 0;
  const photo = (t.photos && t.photos[0])
    ? `<img src="${attr(t.photos[0].replace("/upload/", "/upload/w_160,h_160,c_fill/"))}" alt="" loading="lazy">`
    : "⌚";
  const montant = totalDevis(t);
  const classeProg = t.statut === "refuse" ? "refus" : (t.statut === "rendu" ? "fini" : "");
  return `
  <article class="depot ${ouvert ? "ouvert" : ""}" data-id="${t.id}">
    <div class="depot-tete" role="button" tabindex="0" aria-expanded="${ouvert}">
      <div class="depot-photo">${photo}</div>
      <div class="depot-corps">
        <div class="depot-ligne1">
          <span class="depot-num">N° ${echap(t.numero)}</span>
          <span class="depot-objet">${echap(objetDe(t))}</span>
        </div>
        <div class="depot-meta">Déposé le ${fmtDate(t.createdAt)}${t.contremarque ? ` · Votre réf. <span class="ref">${echap(t.contremarque)}</span>` : ""}${t.numSerie ? ` · Série <span class="ref">${echap(t.numSerie)}</span>` : ""}</div>
      </div>
      <div class="depot-droite">
        <span class="statut s-${attr(t.statut)}">${STATUTS[t.statut] || echap(t.statut)}</span>
        ${montant ? `<span class="depot-montant">${eur(montant)}</span>` : ""}
      </div>
      <span class="chevron">▾</span>
    </div>
    <div class="progression ${classeProg}" title="${attr(STATUTS[t.statut] || "")}">
      ${[0, 1, 2, 3, 4, 5].map(i => `<span class="${i < etape ? "fait" : i === etape ? "courant" : ""}"></span>`).join("")}
    </div>
    ${ouvert ? detailHtml(t) : ""}
  </article>`;
}

function detailHtml(t) {
  const devis = t.devis || {};
  const lignes = devis.lignes || [];
  const etat = [...(t.etat || []), t.etatTexte].filter(Boolean).join(", ");
  const demande = [t.demande, t.demandeTexte].filter(Boolean).join(" — ");
  const c = t.controle || {};
  const aControle = c.marche || c.amplitude || c.reserve;
  const rendu = dateStatut(t, "rendu");
  const finGarantie = rendu && aControle ? new Date(rendu.getFullYear() + 1, rendu.getMonth(), rendu.getDate()) : null;
  const hist = (t.historique || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const sujet = encodeURIComponent(`Ticket n° ${t.numero} — ${objetDe(t)}${t.contremarque ? " (réf. " + t.contremarque + ")" : ""}`);

  return `
  <div class="detail">
    <div>
      <section>
        <h3>Le dépôt</h3>
        <dl class="infos">
          <dt>Objet</dt><dd>${echap(objetDe(t))}</dd>
          ${t.numSerie ? `<dt>N° de série</dt><dd>${echap(t.numSerie)}</dd>` : ""}
          ${t.contremarque ? `<dt>Votre référence</dt><dd>${echap(t.contremarque)}</dd>` : ""}
          <dt>Demande</dt><dd>${echap(demande || "—")}</dd>
          <dt>État constaté</dt><dd>${echap(etat || "RAS")}</dd>
          <dt>Déposé le</dt><dd>${fmtDateLongue(t.createdAt)}</dd>
        </dl>
      </section>
      ${(t.photos && t.photos.length) ? `
      <section>
        <h3>Photos au dépôt</h3>
        <div class="photos">
          ${t.photos.map(u => `<a href="${attr(u)}" target="_blank" rel="noopener" title="Agrandir"><img src="${attr(u.replace("/upload/", "/upload/w_200,h_200,c_fill/"))}" alt="photo du dépôt" loading="lazy"></a>`).join("")}
        </div>
      </section>` : ""}
      ${hist.length ? `
      <section>
        <h3>Suivi</h3>
        <ol class="chrono">
          ${hist.map(h => `<li><time>${new Date(h.date).toLocaleDateString("fr-FR")} · ${new Date(h.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time>${STATUTS[h.statut] || echap(h.statut)}</li>`).join("")}
        </ol>
      </section>` : ""}
    </div>
    <div>
      <section>
        <h3>Devis</h3>
        ${lignes.length ? `
          <div class="devis">
            ${lignes.map((l, i) => ligneDevisHtml(t, l, i)).join("")}
            <div class="devis-total"><span>Total<small>TVA non applicable</small></span><b class="total-devis" data-id="${t.id}">${eur(totalDevis(t))}</b></div>
          </div>
          ${devisActions(t)}`
        : `<p class="attente">Diagnostic en cours — le devis détaillé apparaîtra ici dès qu'il sera prêt.</p>`}
      </section>
      ${aControle ? `
      <section>
        <h3>Contrôle final</h3>
        <div class="controle">
          ${c.marche ? `<div><small>Marche</small><b>${echap(c.marche)}</b></div>` : ""}
          ${c.amplitude ? `<div><small>Amplitude</small><b>${echap(c.amplitude)}</b></div>` : ""}
          ${c.reserve ? `<div><small>Réserve</small><b>${echap(c.reserve)}</b></div>` : ""}
        </div>
        ${c.remarque ? `<p class="garantie" style="color:var(--texte-2)">${echap(c.remarque)}</p>` : ""}
        ${finGarantie ? `<p class="garantie">✓ Garantie 1 an — jusqu'au ${finGarantie.toLocaleDateString("fr-FR")}</p>` : ""}
      </section>` : ""}
    </div>
    <div class="detail-actions">
      <a class="btn btn-ligne btn-petit" href="mailto:${EMAIL_ATELIER}?subject=${sujet}">✉ Question sur ce dépôt</a>
      <a class="btn btn-ligne btn-petit" href="tel:+33785851080">☎ Appeler l'atelier</a>
    </div>
  </div>`;
}

// 1re ligne = titre de la prestation, lignes suivantes = détail
function designationHtml(txt) {
  const lignes = String(txt || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const [titre = "", ...detail] = lignes;
  return `<span class="dv-titre">${echap(titre)}</span>` +
    (detail.length ? `<span class="dv-detail">${detail.map(echap).join("<br>")}</span>` : "");
}

function ligneDevisHtml(t, l, i) {
  const prix = eur(parseFloat(l.prix) || 0);
  const repondu = ["accepte", "refuse"].includes((t.devis || {}).statut);
  if (!l.optionnelle) {
    return `<div class="devis-ligne"><span>${designationHtml(l.designation)}</span><b>${prix}</b></div>`;
  }
  if (repondu) {
    return `<div class="devis-ligne ${l.refusee ? "barree" : ""}">
      <span>${designationHtml(l.designation)}<span class="tag">option ${l.refusee ? "refusée" : "acceptée"}</span></span><b>${prix}</b></div>`;
  }
  return `<label class="devis-ligne option">
    <span style="display:flex;align-items:center"><input type="checkbox" class="opt-devis" data-ticket="${t.id}" data-i="${i}" data-prix="${parseFloat(l.prix) || 0}">
      <span>${designationHtml(l.designation)}<span class="tag">en option</span></span></span>
    <b>+ ${prix}</b></label>`;
}

function devisActions(t) {
  const devis = t.devis || {};
  const qui = devis.repondant ? " par " + echap(devis.repondant) : "";
  if (devis.statut === "accepte") return `<p class="devis-etat ok">✓ Devis accepté${qui} le ${fmtDate(devis.dateReponse)}</p>`;
  if (devis.statut === "refuse") return `<p class="devis-etat ko">✗ Devis refusé${qui} le ${fmtDate(devis.dateReponse)}</p>`;
  if (devis.statut === "envoye" && devis.token) return `
    <div class="devis-actions">
      <button class="btn btn-vert btn-devis-reponse" data-token="${attr(devis.token)}" data-reponse="accepte">✓ Accepter le devis</button>
      <button class="btn btn-refuser btn-devis-reponse" data-token="${attr(devis.token)}" data-reponse="refuse">Refuser</button>
    </div>`;
  return "";
}

async function repondreDevis(bouton, token, reponse, opts) {
  if (reponse === "refuse" && !confirm("Confirmer le refus de ce devis ?\nLa montre vous sera rendue en l'état.")) return;
  const boutons = bouton.parentElement.querySelectorAll("button");
  boutons.forEach(b => (b.disabled = true));
  bouton.textContent = "Envoi…";
  try {
    const qui = auth.currentUser ? auth.currentUser.email : "";
    const r = await fetch(`/.netlify/functions/devis-reponse?token=${encodeURIComponent(token)}&reponse=${reponse}&opts=${encodeURIComponent(opts || "")}&qui=${encodeURIComponent(qui)}`, { method: "POST" });
    if (!r.ok) throw new Error();
    toast(reponse === "accepte" ? "Devis accepté ✓ — les travaux vont démarrer" : "Refus enregistré");
  } catch {
    toast("Erreur — réessayez ou appelez l'atelier", true);
    boutons.forEach(b => (b.disabled = false));
    rendreListe();
  }
}

// ------------------------------------------------------------
// Relevé imprimable (montres rendues non facturées)
// ------------------------------------------------------------
$("#btn-releve").addEventListener("click", () => {
  const liste = aFacturer().sort((a, b) => (dateStatut(a, "rendu") || 0) - (dateStatut(b, "rendu") || 0));
  const total = liste.reduce((s, t) => s + totalDevis(t), 0);
  $("#print-zone").innerHTML = `
    <div class="rl-entete">
      <div><div class="rl-marque">HORLOGERIE HARATYK</div>
        <div class="rl-coord">Viktor Haratyk — Artisan horloger<br>43 rue du Vieux Four · 59700 Marcq-en-Barœul<br>07 85 85 10 80 · SIRET 988 378 378</div></div>
      <div class="rl-coord" style="text-align:right">Client<br><b>${echap(societe || auth.currentUser?.email || "")}</b><br>Édité le ${new Date().toLocaleDateString("fr-FR")}</div>
    </div>
    <h2 class="rl-titre">Relevé des travaux rendus — à facturer</h2>
    <div class="rl-sous">Document récapitulatif, ne vaut pas facture.</div>
    <table class="rl">
      <thead><tr><th>N°</th><th>Objet</th><th>Votre réf.</th><th>Rendu le</th><th class="m">Montant</th></tr></thead>
      <tbody>${liste.map(t => `<tr><td>${echap(t.numero)}</td><td>${echap(objetDe(t))}${t.numSerie ? "<br><small>Série " + echap(t.numSerie) + "</small>" : ""}</td>
        <td>${echap(t.contremarque || "—")}</td><td>${fmtDate(dateStatut(t, "rendu"))}</td><td class="m">${eur(totalDevis(t))}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="4">Total — ${pluriel(liste.length, "montre")}</td><td class="m">${eur(total)}</td></tr></tfoot>
    </table>
    <p class="rl-pied">TVA non applicable. Règlement : espèces ou chèque.</p>`;
  window.print();
});

// ------------------------------------------------------------
// Export CSV (Excel FR : séparateur ; + BOM UTF-8)
// ------------------------------------------------------------
$("#btn-export").addEventListener("click", () => {
  const cellule = v => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const entetes = ["N° ticket", "Déposé le", "Type", "Marque", "Modèle", "N° série", "Votre réf.", "Demande", "Statut", "Montant (€)", "Rendu le", "Facturé"];
  const lignes = mesTickets.map(t => [
    t.numero, fmtDate(t.createdAt), t.typeObjet, t.marque, t.modele, t.numSerie, t.contremarque,
    [t.demande, t.demandeTexte].filter(Boolean).join(" — "), STATUTS[t.statut] || t.statut,
    totalDevis(t).toFixed(2).replace(".", ","), fmtDate(dateStatut(t, "rendu")).replace("—", ""), t.facture ? "oui" : "non"
  ]);
  const csv = "﻿" + [entetes, ...lignes].map(l => l.map(cellule).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `depots-horlogerie-haratyk-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Clavier : Entrée / Espace ouvre une carte
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("depot-tete")) {
    e.preventDefault();
    e.target.click();
  }
});


// ------------------------------------------------------------
// Notifications push sur le PC / téléphone du pro
// ------------------------------------------------------------
const VAPID_PUBLIC_KEY = "BAmRdio-yTF6aRvXkJRTzmm5WnvONSAJpYMFsv3ZR5fDCdp-Pkui-H3kd2rJ3OSAVGKsc-Ecv35wCalQ34tZt7A";
let ticketDemande = new URLSearchParams(location.search).get("t");

function ouvrirTicket(id) {
  const t = mesTickets.find(x => x.id === id);
  if (!t) return;
  const f = Object.keys(FILTRES).find(k => FILTRES[k](t)) || "actifs";
  ticketOuvertId = id;
  choisirFiltre(f, false);
  const el = document.querySelector(`.depot[data-id="${id}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  history.replaceState(null, "", location.pathname);
}

// ------------------------------------------------------------
// Météo à l'atelier (Open-Meteo, gratuit, sans clé) — actualisée toutes les 30 min
// ------------------------------------------------------------
const METEO_CODES = [
  [[0], "☀️", "Ensoleillé", "🌙", "Ciel dégagé"],
  [[1], "🌤️", "Plutôt ensoleillé", "🌙", "Peu nuageux"],
  [[2], "⛅", "Éclaircies", "☁️", "Partiellement nuageux"],
  [[3], "☁️", "Couvert"],
  [[45, 48], "🌫️", "Brouillard"],
  [[51, 53, 55, 56, 57], "🌦️", "Bruine"],
  [[61, 63, 80, 81], "🌧️", "Pluie"],
  [[65, 82], "🌧️", "Forte pluie"],
  [[66, 67], "🌧️", "Pluie verglaçante"],
  [[71, 73, 75, 77, 85, 86], "🌨️", "Neige"],
  [[95, 96, 99], "⛈️", "Orage"]
];
function meteoInfo(code, jour = true) {
  const m = METEO_CODES.find(x => x[0].includes(code)) || [[], "🌡️", "—"];
  return !jour && m[3] ? { icone: m[3], texte: m[4] } : { icone: m[1], texte: m[2] };
}
let meteoTimer = null;
const CLE_METEO = "pro.meteo";
function meteoActive() { try { return localStorage.getItem(CLE_METEO) !== "0"; } catch { return true; } }

// Ville de la météo (mémorisée sur cet appareil) — par défaut : l'atelier
const VILLE_ATELIER = { nom: "Marcq-en-Barœul", lat: 50.674, lon: 3.096, atelier: true };
const CLE_VILLE = "pro.meteoVille";
function villeMeteo() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_VILLE) || "null");
    if (v && typeof v.lat === "number" && typeof v.lon === "number" && v.nom) return v;
  } catch {}
  return VILLE_ATELIER;
}
function choisirVille(v) {
  try {
    if (!v || v.atelier) localStorage.removeItem(CLE_VILLE);
    else localStorage.setItem(CLE_VILLE, JSON.stringify({ nom: v.nom, detail: v.detail || "", lat: v.lat, lon: v.lon }));
  } catch {}
  majChoixVille();
  chargerMeteo();
}
function majChoixVille() {
  const v = villeMeteo();
  $("#meteo-ville-actuelle").textContent = v.nom;
  $("#meteo-ville-reset").hidden = !!v.atelier;
  $("#meteo-ville-zone").style.opacity = meteoActive() ? "1" : ".45";
}

// ------------------------------------------------------------
// Phase de lune (calcul local, aucun service externe)
// ------------------------------------------------------------
const MOIS_SYNODIQUE = 29.530588853;
const NOUVELLE_LUNE_REF = Date.UTC(2000, 0, 6, 18, 14); // nouvelle lune de référence

function phaseLune(date = new Date()) {
  const jours = (date.getTime() - NOUVELLE_LUNE_REF) / 86400000;
  const age = ((jours % MOIS_SYNODIQUE) + MOIS_SYNODIQUE) % MOIS_SYNODIQUE;
  const p = age / MOIS_SYNODIQUE;
  const eclairage = (1 - Math.cos(2 * Math.PI * p)) / 2;
  const q = MOIS_SYNODIQUE / 4;
  let nom;
  if (age < 1 || age > MOIS_SYNODIQUE - 1) nom = "Nouvelle lune";
  else if (age < q - 1) nom = "Premier croissant";
  else if (age <= q + 1) nom = "Premier quartier";
  else if (age < 2 * q - 1) nom = "Gibbeuse croissante";
  else if (age <= 2 * q + 1) nom = "Pleine lune";
  else if (age < 3 * q - 1) nom = "Gibbeuse décroissante";
  else if (age <= 3 * q + 1) nom = "Dernier quartier";
  else nom = "Dernier croissant";
  // Prochaine pleine lune (si on est dedans, on annonce la suivante)
  let avantPleine = 2 * q - age;
  if (avantPleine < -1) avantPleine += MOIS_SYNODIQUE;
  const prochainePleine = new Date(date.getTime() + Math.max(avantPleine, 0) * 86400000);
  return { age, p, eclairage, nom, avantPleine, prochainePleine };
}

function svgLune({ p, eclairage }) {
  // Style planche : disque noir cerclé, partie éclairée jaune avec mers lunaires
  const c = 30, r = 27;
  const croissante = p < 0.5;              // hémisphère nord : éclairée à droite
  const croissant = eclairage < 0.5;        // croissant ou gibbeuse
  const rx = (r * Math.abs(Math.cos(2 * Math.PI * p))).toFixed(2);
  const arcExt = croissante ? 1 : 0;
  const arcTerm = croissante ? (croissant ? 0 : 1) : (croissant ? 1 : 0);
  const eclaire = `M${c} ${c - r} A${r} ${r} 0 0 ${arcExt} ${c} ${c + r} A${rx} ${r} 0 0 ${arcTerm} ${c} ${c - r}Z`;
  const id = "lune" + Math.round(p * 1000);
  // Mers lunaires placées comme sur la vraie face visible (nord en haut)
  const mers = [
    [14, 27, 6.5, 12, -12],  // Océan des Tempêtes
    [21, 19, 7, 5.5, -15],   // Mer des Pluies
    [33.5, 18.5, 4.6, 4.2, 0], // Mer de la Sérénité
    [38.5, 27.5, 5.8, 4.6, 20], // Mer de la Tranquillité
    [48, 21.5, 3.2, 2.6, 10], // Mer des Crises
    [45.5, 34, 3.4, 4.8, 15], // Mer de la Fécondité
    [36, 37, 3.2, 2.6, 0],   // Mer du Nectar
    [26, 40, 5.5, 3.6, -10], // Mer des Nuées
    [16.5, 40.5, 2.8, 2.6, 0], // Mer des Humeurs
    [30, 11, 8, 2, 0]        // Mer du Froid
  ].map(([x, y, a, b, rot]) => `<ellipse cx="${x}" cy="${y}" rx="${a}" ry="${b}" transform="rotate(${rot} ${x} ${y})"/>`).join("");
  const cratere = (x, y, rr) =>
    `<circle cx="${x}" cy="${y}" r="${rr}" fill="#B57A00" opacity=".55"/>`
    + `<circle cx="${x + rr * .25}" cy="${y + rr * .25}" r="${rr * .7}" fill="#FFF3B8" opacity=".7"/>`;
  const rayons = [[-100, 18], [-70, 13], [-35, 9], [10, 7], [150, 8], [195, 10], [-140, 12]]
    .map(([a, l]) => `<line x1="30" y1="47" x2="${(30 + Math.cos(a * Math.PI / 180) * l).toFixed(1)}" y2="${(47 + Math.sin(a * Math.PI / 180) * l).toFixed(1)}"/>`).join("");
  return `<svg viewBox="0 0 60 60" aria-hidden="true">
    <defs>
      <radialGradient id="${id}-g" cx="44%" cy="40%" r="62%">
        <stop offset="0" stop-color="#FFF8C8"/><stop offset=".45" stop-color="#FFE36A"/>
        <stop offset=".85" stop-color="#F4BE1E"/><stop offset="1" stop-color="#D99A00"/>
      </radialGradient>
      <radialGradient id="${id}-n" cx="50%" cy="45%" r="60%">
        <stop offset="0" stop-color="#232833"/><stop offset="1" stop-color="#0B0D12"/>
      </radialGradient>
      <filter id="${id}-f" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.7"/></filter>
      <filter id="${id}-r" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".45"/></filter>
      <filter id="${id}-t" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".55"/></filter>
      <clipPath id="${id}-d"><circle cx="${c}" cy="${c}" r="${r}"/></clipPath>
      <mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="60" height="60">
        <path d="${eclaire}" fill="#fff" filter="url(#${id}-t)"/>
      </mask>
    </defs>
    <circle cx="${c}" cy="${c}" r="${r}" fill="url(#${id}-n)"/>
    <g clip-path="url(#${id}-d)">
      <g fill="#3A4152" opacity=".35" filter="url(#${id}-f)">${mers}</g>
      <g mask="url(#${id}-m)">
        <circle cx="${c}" cy="${c}" r="${r}" fill="url(#${id}-g)"/>
        <g fill="#C08604" opacity=".4" filter="url(#${id}-f)">${mers}</g>
        <g stroke="#FFF9DC" stroke-width=".6" stroke-linecap="round" opacity=".28" filter="url(#${id}-r)">${rayons}</g>
        <circle cx="30" cy="47" r="1.3" fill="#FFFBE6" opacity=".9"/>
        ${cratere(23, 27, 1.5)}${cratere(19, 33, 1)}${cratere(41, 43, 1.3)}${cratere(44, 13, 1.1)}${cratere(13, 18, 1)}${cratere(36, 50, 1)}
      </g>
    </g>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#000" stroke-opacity=".7" stroke-width="1.6"/>
  </svg>`;
}

const NOMS_PHASES = ["Nouvelle lune", "Premier croissant", "Premier quartier", "Gibbeuse croissante",
  "Pleine lune", "Gibbeuse décroissante", "Dernier quartier", "Dernier croissant"];

function rendreLune() {
  const zone = $("#meteo-lune");
  if (!zone) return;
  const l = phaseLune();
  const actuelle = NOMS_PHASES.indexOf(l.nom);
  const pct = Math.round(l.eclairage * 100);
  const fmt = d => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const suite = l.nom === "Pleine lune"
    ? "nouvelle lune le " + fmt(new Date(Date.now() + (MOIS_SYNODIQUE - l.age) * 86400000))
    : "pleine lune le " + fmt(l.prochainePleine);
  zone.title = `${l.nom} — ${pct} % éclairée · âge ${l.age.toFixed(1)} j`;
  const frise = NOMS_PHASES.map((nom, i) => {
    const p = i / 8;
    const svg = svgLune({ p, eclairage: (1 - Math.cos(2 * Math.PI * p)) / 2 });
    return `<span class="lune-phase${i === actuelle ? " actuelle" : ""}" title="${nom}">${svg}</span>`;
  }).join("");
  zone.innerHTML = `
    <div class="lune-frise" role="img" aria-label="Phase de lune : ${l.nom}">${frise}</div>
    <div class="lune-legende"><b>${l.nom}</b> · <span class="lune-pct">${pct} %</span> · ${suite}</div>`;
}

async function chargerMeteo() {
  clearTimeout(meteoTimer);
  if (!meteoActive()) { $("#meteo").hidden = true; return; }
  meteoTimer = setTimeout(chargerMeteo, 30 * 60 * 1000);
  rendreLune();
  try {
    const ville = villeMeteo();
    $("#meteo-lieu").textContent = ville.atelier ? "Marcq-en-Barœul · atelier" : ville.nom;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${ville.lat}&longitude=${ville.lon}`
      + "&current=temperature_2m,weather_code,is_day,wind_speed_10m"
      + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
      + "&timezone=Europe%2FParis&forecast_days=4";
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    const c = d.current, j = d.daily;
    const now = meteoInfo(c.weather_code, c.is_day === 1);
    $("#meteo-icone").textContent = now.icone;
    $("#meteo-temp").textContent = Math.round(c.temperature_2m) + "°";
    const pluie = j.precipitation_probability_max?.[0];
    $("#meteo-texte").textContent = `${now.texte} · ${Math.round(j.temperature_2m_min[0])}° / ${Math.round(j.temperature_2m_max[0])}°`
      + (pluie >= 30 ? ` · 💧 ${pluie} %` : "");
    $("#meteo-jours").innerHTML = j.time.slice(1, 4).map((jour, i) => {
      const nom = new Date(jour + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
      const m = meteoInfo(j.weather_code[i + 1]);
      return `<div class="meteo-jour" title="${attr(m.texte)}"><span>${nom}</span><span>${m.icone}</span><span>${Math.round(j.temperature_2m_max[i + 1])}°<small>${Math.round(j.temperature_2m_min[i + 1])}°</small></span></div>`;
    }).join("");
    $("#meteo").hidden = false;
  } catch {
    $("#meteo").hidden = true; // pas de météo plutôt qu'un cadre vide
  }
}

// ------------------------------------------------------------
// ⚙ Réglages du compte : mot de passe, notifications, météo
// ------------------------------------------------------------
function ouvrirReglages() {
  $("#form-mdp").reset();
  $("#mdp-erreur").textContent = "";
  $("#mdp-email").value = auth.currentUser?.email || "";
  $("#opt-meteo").checked = meteoActive();
  $("#meteo-ville-recherche").value = "";
  $("#meteo-ville-resultats").hidden = true;
  majChoixVille();
  $("#panneau-reglages").hidden = false;
  majBoutonNotif();
  setTimeout(() => $("#mdp-actuel").focus(), 50);
}
function fermerReglages() { $("#panneau-reglages").hidden = true; }
$("#btn-reglages-pro").addEventListener("click", ouvrirReglages);
$("#btn-fermer-reglages").addEventListener("click", fermerReglages);
$("#panneau-reglages").addEventListener("click", e => { if (e.target.id === "panneau-reglages") fermerReglages(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#panneau-reglages").hidden) fermerReglages(); });

$("#opt-meteo").addEventListener("change", e => {
  try { localStorage.setItem(CLE_METEO, e.target.checked ? "1" : "0"); } catch {}
  majChoixVille();
  chargerMeteo();
});

// Recherche de ville (géocodage Open-Meteo, gratuit, sans clé)
let villeTimer = null, villeResultats = [];
$("#meteo-ville-recherche").addEventListener("input", e => {
  clearTimeout(villeTimer);
  const q = e.target.value.trim();
  const ul = $("#meteo-ville-resultats");
  if (q.length < 2) { ul.hidden = true; return; }
  villeTimer = setTimeout(async () => {
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=fr&format=json`);
      const d = await r.json();
      villeResultats = (d.results || []).map(x => ({
        nom: x.name, lat: x.latitude, lon: x.longitude,
        detail: [x.postcodes && x.postcodes[0], x.admin2 || x.admin1, x.country_code !== "FR" ? x.country : ""].filter(Boolean).join(" · ")
      }));
      ul.innerHTML = villeResultats.length
        ? villeResultats.map((v, i) => `<li><button type="button" data-i="${i}"><b>${echap(v.nom)}</b> <span>${echap(v.detail)}</span></button></li>`).join("")
        : `<li class="vide-ville">Aucune ville trouvée</li>`;
      ul.hidden = false;
    } catch {
      ul.innerHTML = `<li class="vide-ville">Recherche impossible (pas de connexion ?)</li>`;
      ul.hidden = false;
    }
  }, 300);
});
$("#meteo-ville-resultats").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]");
  if (!b) return;
  const v = villeResultats[parseInt(b.dataset.i)];
  if (!v) return;
  $("#meteo-ville-recherche").value = "";
  $("#meteo-ville-resultats").hidden = true;
  if (!meteoActive()) { try { localStorage.setItem(CLE_METEO, "1"); } catch {} $("#opt-meteo").checked = true; }
  choisirVille(v);
  toast("Météo : " + v.nom + " ✓");
});
$("#meteo-ville-reset").addEventListener("click", () => { choisirVille(null); toast("Météo de l'atelier rétablie"); });

$("#form-mdp").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("#mdp-erreur");
  const actuel = $("#mdp-actuel").value, nouveau = $("#mdp-nouveau").value, confirme = $("#mdp-confirme").value;
  err.textContent = "";
  if (nouveau.length < 6) { err.textContent = "Le nouveau mot de passe doit faire au moins 6 caractères."; return; }
  if (nouveau !== confirme) { err.textContent = "Les deux nouveaux mots de passe ne correspondent pas."; return; }
  if (nouveau === actuel) { err.textContent = "Le nouveau mot de passe doit être différent de l'actuel."; return; }
  const btn = $("#btn-mdp");
  btn.disabled = true; btn.textContent = "Enregistrement…";
  try {
    const user = auth.currentUser;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, actuel));
    await updatePassword(user, nouveau);
    toast("Mot de passe modifié ✓");
    fermerReglages();
  } catch (ex) {
    const messages = {
      "auth/wrong-password": "Mot de passe actuel incorrect.",
      "auth/invalid-credential": "Mot de passe actuel incorrect.",
      "auth/weak-password": "Mot de passe trop faible (6 caractères minimum).",
      "auth/too-many-requests": "Trop de tentatives, réessayez dans quelques minutes.",
      "auth/network-request-failed": "Pas de connexion internet."
    };
    err.textContent = messages[ex.code] || "Impossible de changer le mot de passe. Réessayez ou appelez l'atelier.";
  } finally {
    btn.disabled = false; btn.textContent = "Changer le mot de passe";
  }
});

// Clic sur une notification alors que l'espace pro est déjà ouvert
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", e => {
    if (e.data && e.data.type === "ouvrir") {
      const id = new URL(e.data.url, location.origin).searchParams.get("t");
      if (id) ouvrirTicket(id);
    }
  });
}

const pushPossible = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const estIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const estInstalle = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function cleVapid(base64) {
  const pad = "=".repeat((4 - base64.length % 4) % 4);
  const b = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...b].map(c => c.charCodeAt(0)));
}
async function idAbonnement(endpoint) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
async function enregistrementSW() {
  return navigator.serviceWorker.register("/pro/sw.js", { scope: "/pro/" });
}

async function majBoutonNotif() {
  const btn = $("#btn-notif");
  if (!btn) return;
  if (!pushPossible()) {
    // iPhone : il faut d'abord ajouter l'espace pro à l'écran d'accueil
    btn.hidden = !estIOS();
    btn.textContent = "🔔 Notifications";
    btn.dataset.etat = "ios";
    return;
  }
  btn.hidden = false;
  if (Notification.permission === "denied") {
    btn.textContent = "🔕 Notifications bloquées";
    btn.dataset.etat = "bloque";
    return;
  }
  const reg = await navigator.serviceWorker.getRegistration("/pro/");
  const abo = reg && await reg.pushManager.getSubscription();
  const actif = !!abo && Notification.permission === "granted";
  btn.textContent = actif ? "🔔 Notifications activées" : "🔔 Activer les notifications";
  btn.dataset.etat = actif ? "actif" : "inactif";
  btn.classList.toggle("notif-actif", actif);
  // Garde l'abonnement à jour côté serveur (il peut changer)
  if (actif) sauverAbonnement(abo).catch(() => {});
}

async function sauverAbonnement(abo) {
  const user = auth.currentUser;
  if (!user) return;
  const j = abo.toJSON();
  await setDoc(doc(db, "pushAbonnements", await idAbonnement(j.endpoint)), {
    email: user.email,
    emailMin: user.email.toLowerCase(),
    endpoint: j.endpoint,
    keys: j.keys,
    appareil: navigator.userAgent.slice(0, 180),
    majLe: serverTimestamp()
  });
}

async function activerNotifications() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    toast(perm === "denied" ? "Notifications refusées — autorisez-les dans les réglages du navigateur" : "Notifications non activées", true);
    return majBoutonNotif();
  }
  const reg = await enregistrementSW();
  await navigator.serviceWorker.ready;
  let abo = await reg.pushManager.getSubscription();
  if (!abo) abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVapid(VAPID_PUBLIC_KEY) });
  await sauverAbonnement(abo);
  toast("Notifications activées ✓ — vous serez prévenu des devis et des montres prêtes");
  majBoutonNotif();
}

async function desactiverNotifications() {
  const reg = await navigator.serviceWorker.getRegistration("/pro/");
  const abo = reg && await reg.pushManager.getSubscription();
  if (abo) {
    try { await deleteDoc(doc(db, "pushAbonnements", await idAbonnement(abo.endpoint))); } catch {}
    await abo.unsubscribe();
  }
  toast("Notifications désactivées sur cet appareil");
  majBoutonNotif();
}

function initNotifications() {
  const btn = $("#btn-notif");
  if (!btn || btn.dataset.init) { majBoutonNotif(); return; }
  btn.dataset.init = "1";
  btn.addEventListener("click", async () => {
    try {
      const etat = btn.dataset.etat;
      if (etat === "ios") {
        alert(estInstalle()
          ? "Mettez à jour l'iPhone (iOS 16.4 ou plus) pour recevoir les notifications."
          : "Sur iPhone : touchez le bouton Partager ⬆️ puis « Sur l'écran d'accueil ». Ouvrez ensuite l'espace pro depuis cette icône pour activer les notifications.");
      } else if (etat === "bloque") {
        alert("Les notifications sont bloquées pour ce site.\nCliquez sur le cadenas 🔒 à gauche de l'adresse, puis autorisez « Notifications ».");
      } else if (etat === "actif") {
        if (confirm("Désactiver les notifications sur cet appareil ?")) await desactiverNotifications();
      } else {
        btn.disabled = true;
        await activerNotifications();
      }
    } catch (e) {
      console.error(e);
      toast("Impossible d'activer les notifications sur ce navigateur", true);
    } finally {
      btn.disabled = false;
    }
  });
  // Service worker enregistré dès l'ouverture (rapide au premier clic)
  if (pushPossible()) enregistrementSW().catch(() => {});
  majBoutonNotif();
}
