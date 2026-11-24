// Envoi de notifications push (partagé entre les fonctions Netlify)
// Abonnements stockés dans Firestore : collection « pushAbonnements »
import webpush from "web-push";

export const VAPID_PUBLIC_KEY = "BAmRdio-yTF6aRvXkJRTzmm5WnvONSAJpYMFsv3ZR5fDCdp-Pkui-H3kd2rJ3OSAVGKsc-Ecv35wCalQ34tZt7A";
// Compte de l'atelier = l'adresse Gmail déjà configurée pour les emails (variable Netlify GMAIL_USER)
export const emailAtelier = () => String(process.env.GMAIL_USER || "").toLowerCase();

// Envoie `message` ({title, body, url, tag}) à tous les appareils abonnés des emails donnés.
// Retourne { envoyes, total }. Supprime les abonnements expirés.
export async function envoyerPush(db, emails, message) {
  if (!process.env.VAPID_PRIVATE_KEY) throw new Error("VAPID_PRIVATE_KEY manquante dans Netlify");
  const liste = [...new Set(emails.filter(Boolean).map(e => String(e).toLowerCase()))].slice(0, 30);
  if (!liste.length) return { envoyes: 0, total: 0 };
  const abos = await db.collection("pushAbonnements").where("emailMin", "in", liste).get();
  if (abos.empty) return { envoyes: 0, total: 0 };

  webpush.setVapidDetails("mailto:" + (emailAtelier() || "contact@horlogerie-haratyk.fr"), VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const payload = JSON.stringify(message);
  let envoyes = 0;
  const erreurs = [];
  await Promise.all(abos.docs.map(async d => {
    const a = d.data();
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: a.keys }, payload,
        { TTL: 60 * 60 * 24 * 7, urgency: "high" });
      envoyes++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await d.ref.delete();
      else { console.error("Push échoué", err.statusCode, err.body); erreurs.push(err.statusCode || err.message); }
    }
  }));
  return { envoyes, total: abos.size, erreurs };
}
