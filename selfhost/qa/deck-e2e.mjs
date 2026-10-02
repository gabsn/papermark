// End-to-end check of the buyer flow on the public URL, as a buyer would live it:
// open the QA link → name and email → sign the NDA in the embedded Documenso → email code (read
// from the database: the SES simulator address receives nothing) → the deck renders, with the
// viewer's watermark and no download button. Exits 1 with the failed step; screenshot in
// $PAPERMARK_DATA/qa/. Then deletes the signed QA envelope in Documenso.
// On failure it also emails QA_ALERT_EMAIL through SES (the daily `deck-qa` job in gabsn/mini).
// Usage: node selfhost/qa/deck-e2e.mjs [linkId]   (default: QA_LINK_ID from .env)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadEnv } from "../env.mjs";
import { launch, sleep } from "./cdp.mjs";

const root = new URL("../..", import.meta.url).pathname;
loadEnv(root);
const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://deck.focustree.app";
const LINK = process.argv[2] ?? process.env.QA_LINK_ID;
const EMAIL = process.env.QA_EMAIL ?? "success@simulator.amazonses.com";
const NAME = "Deck QA";
const SIGN = new URL(process.env.NEXT_PUBLIC_SIGNING_HOST ?? "https://sign.focustree.app").host;
if (!LINK) throw new Error("QA_LINK_ID missing");

const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: process.env.POSTGRES_PRISMA_URL } } });

async function alert(subject, text) {
  const to = process.env.QA_ALERT_EMAIL;
  if (!to || !process.env.SES_ACCESS_KEY_ID) return;
  const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
  const ses = new SESv2Client({
    region: process.env.SES_REGION,
    credentials: { accessKeyId: process.env.SES_ACCESS_KEY_ID, secretAccessKey: process.env.SES_SECRET_ACCESS_KEY },
  });
  await ses
    .send(new SendEmailCommand({
      FromEmailAddress: process.env.EMAIL_FROM,
      Destination: { ToAddresses: [to] },
      Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text } } } },
    }))
    .catch((e) => console.error(`alert email failed: ${e.message}`));
}

let step = "start";
const log = (s) => { step = s; console.log(`· ${s}`); };
const b = await launch();
const t0 = Date.now();
const startedAt = new Date();
let envelopeId = null;
try {
  log("open link");
  await b.cdp("Page.navigate", { url: `${BASE}/view/${LINK}` });
  await b.waitFor("document.querySelector('input[name=email]')");

  log("name and email");
  await b.evaluate("document.querySelector('input[name=name]').focus()");
  await b.type(NAME);
  await b.evaluate("document.querySelector('input[name=email]').focus()");
  await b.type(EMAIL);

  log("open the NDA");
  await b.evaluate("[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Open signing').click()");
  await b.waitFor("[...document.querySelectorAll('iframe')].some(f=>f.src.includes('" + SIGN + "'))", null, 30000);
  await b.waitFor("document.readyState==='complete' && document.body.innerText.length>50", SIGN, 45000);

  log("sign: name and signature in the side panel");
  const f = (js) => b.evaluate(js, SIGN);
  await b.waitFor("document.querySelector('[data-testid=signature-pad-dialog-button]')", SIGN);
  await f("document.querySelector('[data-testid=signature-pad-dialog-button]').click()");
  await b.waitFor("[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Type')", SIGN);
  await f("[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Type').click()");
  await sleep(800);
  // The typed signature is prefilled with the signer's name from Papermark; type it only if empty.
  if (await f("(()=>{const i=[...document.querySelectorAll('[role=dialog] input,[role=dialog] textarea')].filter(i=>!i.disabled&&!i.readOnly).pop();i.focus();return !i.value})()")) await b.type(NAME);
  await sleep(500);
  await f("(()=>{const x=[...document.querySelectorAll('[role=dialog] button')].filter(x=>x.innerText.trim()==='Next');x[x.length-1].click()})()");
  await sleep(1500);
  await f("(()=>{const x=[...document.querySelectorAll('button')].filter(x=>x.innerText.trim()==='Next'&&!x.closest('[role=dialog]'));x[0]&&x[0].click()})()");
  await sleep(3000);

  log("sign: fill the fields on the signature page");
  const values = { Company: "Deck QA Ltd", Title: "QA" };
  for (const label of ["Company", "Name", "Title", "Signature", "Date"]) {
    await f(`[...document.querySelectorAll('[data-field-type]')].find(e=>e.innerText.trim()==='${label}').querySelector('button').click()`);
    await sleep(1200);
    if (values[label]) {
      await b.waitFor("document.querySelector('[role=dialog] input, [role=dialog] textarea')", SIGN, 8000);
      await f("document.querySelector('[role=dialog] input, [role=dialog] textarea').focus()");
      await b.type(values[label]);
      await f("[...document.querySelectorAll('[role=dialog] button')].find(x=>/save|insert|sign|next/i.test(x.innerText)).click()");
      await sleep(1200);
    }
  }
  const fields = await f("[...document.querySelectorAll('[data-field-type]')].map(e=>e.getAttribute('data-inserted')).join()");
  if (fields !== "true,true,true,true,true") throw new Error(`fields not all filled: ${fields}`);

  log("sign: complete");
  await f("[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Complete').click()");
  await sleep(1500);
  await f("(()=>{const x=[...document.querySelectorAll('[role=dialog] button')].find(x=>/^(sign|complete)$/i.test(x.innerText.trim()));x&&x.click()})()");
  await sleep(5000);
  await b.waitFor("[...document.querySelectorAll('button')].some(x=>x.innerText.trim()==='Download')", null, 30000);
  const response = await db.agreementResponse.findFirst({
    where: { linkId: LINK, signerEmail: EMAIL, createdAt: { gte: startedAt } },
    orderBy: { createdAt: "desc" },
  });
  if (response?.signingStatus !== "COMPLETED") throw new Error(`agreement response is ${response?.signingStatus ?? "missing"}`);
  envelopeId = response.signingEnvelopeId;

  log("continue: email code");
  await b.evaluate("[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Continue').click()");
  let code;
  for (let i = 0; i < 40 && !code; i++) {
    await sleep(500);
    code = (await db.verificationToken.findFirst({ where: { identifier: `otp:${LINK}:${EMAIL}` } }))?.token;
  }
  if (!code) throw new Error("no email code was created (SES send or rate limit)");
  await b.waitFor("document.querySelector('input[autocomplete=one-time-code], input[inputmode=numeric]')", null, 15000);
  await b.evaluate("document.querySelector('input[autocomplete=one-time-code], input[inputmode=numeric]').focus()");
  await b.type(code);
  await sleep(1000);
  await b.evaluate("(()=>{const x=[...document.querySelectorAll('button')].find(x=>/verify|continue|submit/i.test(x.innerText));x&&!x.disabled&&x.click()})()");

  log("deck renders");
  await b.waitFor("document.querySelectorAll('img[src*=\"/api/selfhost/files\"], img[alt*=\"Page\"]').length > 0", null, 45000);
  await sleep(3000);
  const page = await b.evaluate("JSON.stringify({text: document.body.innerText.slice(0, 400), html: document.body.innerHTML.length, imgs: document.querySelectorAll('img').length, download: [...document.querySelectorAll('button,a')].some(x=>/download/i.test(x.innerText+(x.getAttribute('aria-label')||''))), watermark: document.body.innerHTML.includes('" + EMAIL + "')})");
  const p = JSON.parse(page);
  console.log(`  ${p.imgs} images on the page`);
  if (!p.watermark) throw new Error("the viewer's email watermark is missing");
  if (p.download) throw new Error("a download button is visible");
  console.log("✓ deck QA passed");
} catch (err) {
  console.error(`✗ deck QA failed at "${step}": ${err.message}`);
  process.exitCode = 1;
  await alert(`Deck QA failed at "${step}"`, `${err.message}\n\nLink: ${BASE}/view/${LINK}\nScreenshot on the Mac Mini: ~/.local/share/papermark/qa/last.png\nRerun: ssh mm 'cd ~/src/papermark && node selfhost/qa/deck-e2e.mjs'`);
} finally {
  const dir = join(process.env.PAPERMARK_DATA ?? join(process.env.HOME, ".local/share/papermark"), "qa");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "last.png"), await b.screenshot().catch(() => Buffer.alloc(0)));
  await b.close().catch((e) => console.error(`chrome cleanup: ${e.message}`));
  // Leave no trace: the QA signature in Documenso and its response and view in Papermark.
  if (envelopeId) {
    const r = await fetch(`${process.env.SIGNING_API_URL.replace(/\/$/, "")}/envelope/delete`, {
      method: "POST",
      headers: { Authorization: process.env.SIGNING_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ envelopeId }),
    }).catch((e) => ({ ok: false, status: e.message }));
    if (!r.ok) console.error(`could not delete Documenso envelope ${envelopeId}: ${r.status}`);
  }
  await db.agreementResponse.deleteMany({ where: { linkId: LINK, signerEmail: EMAIL } });
  await db.$disconnect();
  console.log(`(${Math.round((Date.now() - t0) / 1000)} s)`);
}
