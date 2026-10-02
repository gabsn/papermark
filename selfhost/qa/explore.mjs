import { launch, sleep } from "./cdp.mjs";
const b = await launch();
try {
  await b.cdp("Page.navigate", { url: process.argv[2] });
  await sleep(8000);
  console.log(await b.evaluate("document.body.innerText.slice(0,800)"));
  console.log(await b.evaluate("JSON.stringify([...document.querySelectorAll('input,button,iframe')].map(e=>e.tagName+':'+(e.type||'')+':'+(e.name||e.id||e.innerText||e.src||'').slice(0,60)))"));
  require: 0;
  (await import("node:fs")).writeFileSync("/tmp/qa1.png", await b.screenshot());
} finally { b.close(); }
