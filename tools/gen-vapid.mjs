#!/usr/bin/env node
/**
 * Génère une paire de clés VAPID pour les notifications push.
 * Aucune dépendance : uniquement le module `crypto` de Node.
 *
 *   node tools/gen-vapid.mjs
 */
import { generateKeyPairSync, createPublicKey } from "node:crypto";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

// Clé publique : point non compressé (65 octets, commence par 0x04)
const pubDer = createPublicKey(privateKey).export({ type: "spki", format: "der" });
const publicRaw = pubDer.subarray(pubDer.length - 65);

// Clé privée : scalaire d de 32 octets
const jwk = privateKey.export({ format: "jwk" });
const privateRaw = Buffer.from(jwk.d, "base64url");

console.log(`
──────────────────────────────────────────────────────────────
  Clés VAPID générées
──────────────────────────────────────────────────────────────

1) Dans web/config.js :

   VAPID_PUBLIC_KEY: "${b64url(publicRaw)}",

2) Dans Supabase (Edge Functions > Secrets), ou en ligne de commande :

   supabase secrets set \\
     VAPID_PUBLIC_KEY="${b64url(publicRaw)}" \\
     VAPID_PRIVATE_KEY="${b64url(privateRaw)}" \\
     VAPID_SUBJECT="mailto:ton@email.com"

⚠️  La clé PRIVÉE ne doit jamais être commitée ni mise dans config.js.
──────────────────────────────────────────────────────────────
`);
