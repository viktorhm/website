// ============================================================
// Espace professionnel — Horlogerie Haratyk · v6
// Chaque client pro connecté ne voit que SES tickets
// (règle Firestore verrouillée sur son email)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, query, where, onSnapshot, getDocs, getDoc, doc, limit
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
    let snap = await getDocs(query(collection(db, "clients"), where("email", "==", email), limit(1)));
    if (snap.empty) snap = await getDocs(query(collection(db, "clients"), where("email2", "==", email), limit(1)));
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
  const qNouveaux = query(collection(db, "tickets"), where("clientEmails", "array-contains", em));
  const qAnciens = query(collection(db, "tickets"), where("clientEmail", "==", email));
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

function ligneDevisHtml(t, l, i) {
  const prix = eur(parseFloat(l.prix) || 0);
  const repondu = ["accepte", "refuse"].includes((t.devis || {}).statut);
  if (!l.optionnelle) {
    return `<div class="devis-ligne"><span>${echap(l.designation)}</span><b>${prix}</b></div>`;
  }
  if (repondu) {
    return `<div class="devis-ligne ${l.refusee ? "barree" : ""}">
      <span>${echap(l.designation)}<span class="tag">option ${l.refusee ? "refusée" : "acceptée"}</span></span><b>${prix}</b></div>`;
  }
  return `<label class="devis-ligne option">
    <span style="display:flex;align-items:center"><input type="checkbox" class="opt-devis" data-ticket="${t.id}" data-i="${i}" data-prix="${parseFloat(l.prix) || 0}">
      <span>${echap(l.designation)}<span class="tag">en option</span></span></span>
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
    const r = await fetch(`/.netlify/functions/devis-reponse?token=${encodeURIComponent(token)}&reponse=${reponse}&opts=${encodeURIComponent(opts || "")}&qui=${encodeURIComponent(qui)}`);
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
