// utils/createPdf.js
const fs = require("fs");
const path = require("path");

/* ------------ helpers ------------ */
function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Build HTML for the receipt/PDF (used for customer & admin prints) */
function receiptHtml(order) {
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));

  const isPickup =
    /pickup/i.test(String(order.fulfillmentMethod || order.orderType || "")) ||
    /avh[aä]mtning/i.test(order?.customer?.address || "");

  const etaLabel   = isPickup ? "Beräknad tid" : "Beräknad leveranstid";
  const etaText    = isPickup ? "10 minuter"   : "20–35 minuter";
  const sectionLbl = isPickup ? "Upphämtningsinformation" : "Leveransinformation";

  const created   = order.createdAt ? new Date(order.createdAt) : new Date();
  const orderDate = created.toLocaleDateString("sv-SE", {
    year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit",
  });

  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal =
    typeof order.subtotal === "number"
      ? order.subtotal
      : items.reduce((s,i)=>s+Number(i.price||0)*Number(i.quantity||0),0);
  const rawFee = Number(order.deliveryFee ?? 0);
  const fee    = isPickup ? 0 : rawFee;
  const total  = subtotal + fee;

  const c = order.customer || {};
  const STORE_NAME    = "Matkungen";
  const STORE_ADDRESS = "P G Vejdes väg, 352 52 Växjö";
  const STORE_PHONE   = "0769 666 666";

  const itemsHtml = items.map((i)=>{
    const qty = Number(i.quantity||1);
    const price = Number(i.price||0);
    const lineTotal = (price*qty).toFixed(2);
    return `
      <div class="order-item">
        <div class="item-row">
          <div class="item-name">${esc(i.name)} × ${qty}</div>
          <div class="item-price">${lineTotal} kr</div>
        </div>
        ${i.note ? `<div class="item-note"><span class="emoji" aria-hidden="true">📝</span><span class="text">${esc(i.note)}</span></div>` : ""}
      </div>`;
  }).join("");

  // Build the 4-line key-value table (only these four!)
  const kvRows = `
    <tr><td class="k">Namn:</td><td class="v">${esc(c.name || "-")}</td></tr>
    <tr><td class="k">Telefon:</td><td class="v">${esc(c.phone || "-")}</td></tr>
    ${
      isPickup
        ? `
          <tr><td class="k">Upphämtningsställe:</td><td class="v">${esc(STORE_NAME)}</td></tr>
          <tr><td class="k">Adress:</td><td class="v">${esc(STORE_ADDRESS)}</td></tr>
        `
        : `<tr><td class="k">Adress:</td><td class="v">${esc(c.address || "-")}</td></tr>`
    }
    ${c.notes ? `<tr><td class="k">Noteringar:</td><td class="v">${esc(c.notes)}</td></tr>` : ""}
  `;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Order Receipt - ${esc(order.orderNumber || "")}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#222}
    .confirmation-card{max-width:840px;margin:0 auto;padding:24px}
    .confirmation-header h1{margin:0 0 4px}
    .confirmation-text{color:#666;margin:0 0 16px}
    h2{color:#6b5a20;margin:16px 0 8px}

    /* Four-line key/value table — reliable in email renderers */
    .kvtable{border-collapse:collapse;border-spacing:0;width:auto}
    .kvtable td{padding:0;vertical-align:baseline}         /* no horizontal padding */
    .kvtable .k{font-weight:600;white-space:nowrap;padding-right:0}  /* no gap after ":" */
    .kvtable .v{word-break:break-word;padding-left:0}      /* keep value flush after ":" */


    .detail-row{display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid #eee}
    .detail-row span:first-child{color:#333}
    .detail-row span:last-child{font-weight:500;white-space:nowrap}

    /* Items + under-note (same as your working prints) */
    .order-items{margin-top:8px}
    .order-items .order-item{display:block!important;padding:8px 0;border-bottom:1px solid #eee;page-break-inside:avoid}
    .order-items .order-item .item-row{display:flex;justify-content:space-between;gap:16px}
    .order-items .order-item .item-name{font-weight:500}
    .order-items .order-item .item-price{font-weight:600;white-space:nowrap;text-align:right}
    .order-items .order-item .item-note{display:flex!important;align-items:center;gap:8px;margin:6px 0 0;padding:0;font-size:13px;line-height:1.35;color:#333}
    .order-items .order-item .item-note .emoji{display:inline-block;line-height:1;vertical-align:middle;transform:translateY(0)}
    .order-row{display:flex;justify-content:space-between;padding:6px 0}
    .order-row.total{font-weight:700;border-top:1px solid #eee;margin-top:6px;padding-top:8px}
    .muted{color:#777}
  </style>
</head>
<body class="print-view">
  <div class="page">
    <div class="confirmation-card">
      <div class="confirmation-header">
        <h1>Matkungen</h1>
        <p class="confirmation-text">
          Ordernummer<br><span id="order-number">${esc(order.orderNumber || "")}</span>
        </p>
      </div>

      <div class="confirmation-content">
        <div class="delivery-info">
          <h2>${sectionLbl}</h2>

          <!-- ONLY these four lines are inline label→value -->
          <table class="kvtable" role="presentation">
            <tbody>
              ${kvRows}
            </tbody>
          </table>

          <!-- Keep these three in your older two-column look -->
          <div class="detail-row"><span>Betalningsmetod:</span><span>${esc(order.paymentMethod || "—")}</span></div>
          <div class="detail-row"><span>Orderdatum:</span><span>${esc(orderDate)}</span></div>
          <div class="detail-row"><span>${esc(etaLabel)}:</span><span>${esc(etaText)}</span></div>
        </div>

        <div class="order-summary">
          <h2>Ordersammanfattning</h2>
          <div class="order-items">
            ${itemsHtml || "<p class='muted'>Inga artiklar i ordern</p>"}
          </div>

          <div class="order-totals">
            <div class="order-row"><span>Delsumma</span><span>${subtotal.toFixed(2)} kr</span></div>
            <div class="order-row"><span>Leveransavgift</span><span>${fee === 0 ? "Gratis" : fee.toFixed(2) + " kr"}</span></div>
            <div class="order-row total"><span>Totalt</span><span>${total.toFixed(2)} kr</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/* ------------ puppeteer launcher ------------ */
async function launchBrowser() {
  const mode = (process.env.PUPPETEER_MODE || "").toLowerCase();
  if (mode === "chromium") {
    const chromium = require("@sparticuz/chromium");
    const puppeteerCore = require("puppeteer-core");
    console.log(
      "🖨️  PDF engine: chromium (@sparticuz/chromium + puppeteer-core)"
    );
    return puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }

  try {
    console.log("🖨️  PDF engine: puppeteer (full)");
    const puppeteer = require("puppeteer");
    return await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  } catch (e) {
    console.warn(
      "⚠️  puppeteer launch failed, falling back to chromium:",
      e?.message
    );
    const chromium = require("@sparticuz/chromium");
    const puppeteerCore = require("puppeteer-core");
    console.log("🖨️  PDF engine: chromium fallback");
    return puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
}

/* ------------ create PDF with CSS injected ------------ */
async function createReceiptPdf(order) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    // 1) HTML (no external loads needed)
    await page.setContent(receiptHtml(order), {
      waitUntil: "domcontentloaded",
      timeout: 0,
    });

    // 2) add site CSS if available
    const cssCandidates = [
      path.join(__dirname, "..", "public", "assets", "css", "style.css"),
      path.join(__dirname, "..", "assets", "css", "style.css"),
    ];
    let css = "";
    for (const p of cssCandidates) {
      if (fs.existsSync(p)) {
        css = fs.readFileSync(p, "utf8");
        break;
      }
    }
    if (css) await page.addStyleTag({ content: css });
    else
      console.warn(
        "⚠️ PDF: style.css not found (continuing without site CSS)."
      );

    // 3) PDF-only overrides: ensure note sits UNDER item row
    await page.addStyleTag({
      content: `
        .print-view .confirmation-header { text-align:center; }
        .print-view .confirmation-header h1 { margin:0 0 .25rem 0; }

        .print-view .delivery-info h2,
        .print-view .order-summary h2 { color: var(--gold-crayola-dark, var(--gold-crayola)); }

        .print-view .delivery-info .detail-row{
          display:flex !important; align-items:baseline; gap:.5rem; margin:6px 0;
          border-top:none;
        }
        .print-view .delivery-info .detail-row span:first-child{
          color: var(--gold-crayola-dark, var(--gold-crayola)); font-weight:600; min-width:max-content;
        }
        .print-view .delivery-info .detail-row.value-right{
          justify-content:space-between !important; gap:1rem;
        }
        .print-view .delivery-info .detail-row.topline{
          border-top:1px solid #eee !important; margin-top:10px; padding-top:10px;
        }

        .print-view .order-summary .order-row{ display:flex; justify-content:space-between; }

        /* item line + note layout */
        .print-view .order-items .order-item { padding:6px 0; }
        .print-view .order-items .order-item + .order-item { border-top:1px solid #eee; }
        .print-view .order-items .item-row {
          display:flex; justify-content:space-between; align-items:flex-start; gap:1rem;
        }
        .print-view .order-items .item-name { flex:1; }
        .print-view .order-items .item-price { white-space:nowrap; }
        .print-view .order-items .item-note {
          display:block; margin:6px 0 2px 0; font-size:12.5px; color:#222;
        }
        .print-view .order-items .item-note .note-emoji { margin-right:.35rem; }
      `,
    });

    await page.emulateMediaType("print");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    console.log("✅ PDF created successfully");
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = createReceiptPdf;
