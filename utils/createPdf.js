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
  // helper (keep if defined globally; otherwise include here)
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));

  // pickup detection (match client)
  const isPickup =
    /pickup/i.test(String(order.fulfillmentMethod || order.orderType || "")) ||
    /avh[aä]mtning/i.test(order?.customer?.address || "");

  const etaLabel = isPickup ? "Beräknad tid" : "Beräknad leveranstid";
  const etaText  = isPickup ? "10 minuter" : "20–35 minuter";
  const sectionLbl = isPickup ? "Upphämtningsinformation" : "Leveransinformation";

  // order date
  const created   = order.createdAt ? new Date(order.createdAt) : new Date();
  const orderDate = created.toLocaleDateString("sv-SE", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  // math (safe)
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal =
    typeof order.subtotal === "number"
      ? order.subtotal
      : items.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0);
  const rawFee = Number(order.deliveryFee ?? 0);
  const fee    = isPickup ? 0 : rawFee;
  const total  = subtotal + fee;

  const c = order.customer || {};
  const STORE_NAME    = "Matkungen";
  const STORE_ADDRESS = "P G Vejdes väg, 352 52 Växjö";
  const STORE_PHONE   = "0769 666 666";

  // items + under-item notes (same structure as confirmation/admin prints)
  const itemsHtml = items.map((i) => {
    const qty   = Number(i.quantity || 1);
    const price = Number(i.price || 0);
    const lineTotal = (price * qty).toFixed(2);
    return `
      <div class="order-item">
        <div class="item-row">
          <div class="item-name">${esc(i.name)} × ${qty}</div>
          <div class="item-price">${lineTotal} kr</div>
        </div>
        ${
          i.note
            ? `<div class="item-note"><span class="emoji" aria-hidden="true">📝</span><span class="text">${esc(i.note)}</span></div>`
            : ""
        }
      </div>`;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Order Receipt - ${esc(order.orderNumber || "")}</title>
  <style>
    /* --- Make email/PDF look like confirmation/admin prints --- */
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#222; }
    .confirmation-card { max-width: 840px; margin: 0 auto; padding: 24px; }
    .confirmation-header h1 { margin: 0 0 4px; }
    .confirmation-text { color:#666; margin: 0 0 16px; }
    h2 { color:#6b5a20; margin: 16px 0 8px; }

    .detail-row { display:flex; justify-content: space-between; gap:16px; padding:6px 0; }
    .detail-row.inline span:first-child { font-weight:600; min-width:170px; }
    .detail-row.value-right span:first-child { font-weight:600; }
    .detail-row.value-right { border-top:1px solid #eee; margin-top:6px; padding-top:8px; }

    .order-items { margin-top: 8px; }
    .order-items .order-item {
      display:block !important;
      padding:8px 0;
      border-bottom:1px solid #eee;
      page-break-inside:avoid;
    }
    .order-items .order-item .item-row {
      display:flex;
      justify-content:space-between;
      gap:16px;
    }
    .order-items .order-item .item-name { font-weight:500; }
    .order-items .order-item .item-price {
      font-weight:600; white-space:nowrap; text-align:right;
    }
    /* NOTE directly under the item, left-aligned with inline emoji */
    .order-items .order-item .item-note {
      display:flex !important;
      align-items:center;
      gap:8px;
      margin:6px 0 0;
      padding:0;
      font-size:13px;
      line-height:1.35;
      color:#333;
    }
    .order-items .order-item .item-note .emoji {
      display:inline-block; line-height:1; vertical-align:middle; transform:translateY(0);
    }

    .order-totals { margin-top: 10px; }
    .order-row { display:flex; justify-content:space-between; padding:6px 0; }
    .order-row.total { font-weight:700; border-top:1px solid #eee; margin-top:6px; padding-top:8px; }
    .muted { color:#777; }
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

          <div class="detail-row inline"><span>Namn:</span><span>${esc(c.name || "-")}</span></div>
          <div class="detail-row inline"><span>Telefon:</span><span>${esc(c.phone || "-")}</span></div>
          ${
            isPickup
              ? `
                <div class="detail-row inline"><span>Upphämtningsställe:</span><span>${esc(STORE_NAME)}</span></div>
                <div class="detail-row inline"><span>Adress:</span><span>${esc(STORE_ADDRESS)}</span></div>
                <div class="detail-row inline"><span>Restaurangens telefon:</span><span>${esc(STORE_PHONE)}</span></div>
              `
              : `<div class="detail-row inline"><span>Adress:</span><span>${esc(c.address || "-")}</span></div>`
          }
          ${c.notes ? `<div class="detail-row inline"><span>Noteringar:</span><span>${esc(c.notes)}</span></div>` : ""}

          <div class="detail-row value-right topline"><span>Betalningsmetod:</span><span>${esc(order.paymentMethod || "—")}</span></div>
          <div class="detail-row value-right"><span>Orderdatum:</span><span>${esc(orderDate)}</span></div>
          <div class="detail-row value-right"><span>${etaLabel}:</span><span>${esc(etaText)}</span></div>
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
