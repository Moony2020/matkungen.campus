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
    String(s ?? "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m])
    );

  const isPickup =
    /pickup/i.test(String(order.fulfillmentMethod || order.orderType || "")) ||
    /avh[aä]mtning/i.test(order?.customer?.address || "");

  const etaLabel = isPickup ? "Beräknad tid" : "Beräknad leveranstid";
  const etaText = isPickup ? "10 minuter" : "20–35 minuter";
  const sectionLbl = isPickup
    ? "Upphämtningsinformation"
    : "Leveransinformation";

  const created = order.createdAt ? new Date(order.createdAt) : new Date();
  const orderDate = created.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal =
    typeof order.subtotal === "number"
      ? order.subtotal
      : items.reduce(
          (s, i) => s + Number(i.price || 0) * Number(i.quantity || 0),
          0
        );
  const rawFee = Number(order.deliveryFee ?? 0);
  const fee = isPickup ? 0 : rawFee;
  const total = subtotal + fee;

  const c = order.customer || {};
  const STORE_NAME = "Matkungen";
  const STORE_ADDRESS = "P G Vejdes väg, 352 52 Växjö";
  const STORE_PHONE = "0769 666 666";
  const itemsHtml = items
    .map((i) => {
      const qty = Number(i.quantity || 1);
      const price = Number(i.price || 0);
      const lineTotal = (price * qty).toFixed(2);

      // Keep "med" as is, only replace English "with" with "+"
      const itemName = esc(i.name)
        .replace(/\bwith\b/gi, "+")
        .replace(/\(\+(\d+(?:\.\d+)?)\s*kr\)/gi, "($1 kr)");

      const itemNote = i.note
        ? esc(i.note)
            .replace(/\bwith\b/gi, "+")
            .replace(/\(\+(\d+(?:\.\d+)?)\s*kr\)/gi, "($1 kr)")
        : "";

      return `
      <div class="order-item">
        <div class="item-row">
          <div class="item-name">${itemName} × ${qty}</div>
          <div class="item-price">${lineTotal} kr</div>
        </div>
        ${
          i.note
            ? `<div class="item-note"><span class="emoji" aria-hidden="true">📝</span><span class="text">${itemNote}</span></div>`
            : ""
        }
      </div>`;
    })
    .join("");

  // ====== 4 lines: ONE COLUMN, inline, no gaps ======
  const kvRows = `
    <div class="kvrow"><span class="k">Namn:</span><span class="v">${esc(
      c.name || "-"
    )}</span></div>
    <div class="kvrow"><span class="k">Telefon:</span><span class="v">${esc(
      c.phone || "-"
    )}</span></div>
    ${
      isPickup
        ? `
          <div class="kvrow"><span class="k">Upphämtningsställe:</span><span class="v">${esc(
            STORE_NAME
          )}</span></div>
          <div class="kvrow"><span class="k">Adress:</span><span class="v">${esc(
            STORE_ADDRESS
          )}</span></div>
        `
        : `<div class="kvrow"><span class="k">Adress:</span><span class="v">${esc(
            c.address || "-"
          )}</span></div>`
    }
    ${
      c.notes
        ? `<div class="kvrow"><span class="k">Noteringar:</span><span class="v">${esc(
            c.notes
          )}</span></div>`
        : ""
    }
  `;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Order Receipt - ${esc(order.orderNumber || "")}</title>
    <!-- inside receiptHtml() HTML head -->
<style>
  /* Base layout */
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#222}
  .confirmation-card{max-width:840px;margin:0 auto;padding:24px}
  .confirmation-header h1{margin:0 0 4px}
  .confirmation-text{color:#666;margin:0 0 16px}

  /* Section titles */
  .delivery-info h2{color:#6b5a20;margin:8px 0 4px}
  .order-summary  h2{color:#6b5a20;margin:10px 0 4px}

  /* Single-column key/value lines */
  .kvtable{border-collapse:collapse;border-spacing:0;margin:0 0 4px 0}
  .kvrow{
    display:flex;
    gap:4px;
    align-items:baseline;
    margin:0 0 2px 0;
    line-height:1.25;
  }
  .kvrow .k{
    font-weight:600;
    white-space:nowrap;
  }
  .kvrow .v{
    flex:1 1 auto;
    min-width:0;
  }

  /* Detail rows (payment/date/eta) */
  .detail-row{
    display:flex;
    justify-content:space-between;
    align-items:baseline;
    margin:3px 0;
    padding:3px 0;
    border-top:none;
  }
  .detail-row.topline{
    border-top:1px solid #eee;
    margin-top:6px;
    padding-top:6px;
  }
  .detail-row span:first-child{font-weight:600;color:#222}
  .detail-row span:last-child{white-space:nowrap;font-weight:500}

  /* Items */
  .order-items{margin-top:4px}
  .order-items .order-item{
    display:block!important;
    padding:6px 0;
    border-bottom:1px solid #eee;
    page-break-inside:avoid;
  }
  .order-items .item-row{
    display:flex;
    justify-content:space-between;
    gap:16px;
  }
  .order-items .item-name{font-weight:500}
  .order-items .item-price{font-weight:600;white-space:nowrap;text-align:right}
  .order-items .item-note{
    display:flex!important;
    align-items:center;
    gap:8px;
    margin:4px 0 0;
    font-size:13px;
    line-height:1.35;
  }

  /* Totals */
  .order-totals{margin-top:2px}
  .order-row{
    display:flex;
    justify-content:space-between;
    margin:0;
    padding:3px 0;
  }
  .order-row.total{
    font-weight:700;
    border-top:1px solid #eee;
    margin-top:4px;
    padding-top:5px;
  }
</style>
</head>
<body class="print-view">
  <div class="page">
    <div class="confirmation-card">
      <div class="confirmation-header">
        <h1>Matkungen</h1>
        <p class="confirmation-text">
          Ordernummer<br><span id="order-number">${esc(
            order.orderNumber || ""
          )}</span>
        </p>
      </div>

      <div class="confirmation-content">
        <div class="delivery-info">
          <h2>${sectionLbl}</h2>

          <!-- ONLY these four lines are inline label→value -->
          ${kvRows}

          <div class="detail-row value-right topline"><span>Betalningsmetod:</span><span>${
            order.paymentMethod || "—"
          }</span></div>
          <div class="detail-row"><span>Orderdatum:</span><span>${esc(
            orderDate
          )}</span></div>
          <div class="detail-row"><span>${esc(etaLabel)}:</span><span>${esc(
    etaText
  )}</span></div>
        </div>

        <div class="order-summary">
          <h2>Ordersammanfattning</h2>
          <div class="order-items">
            ${itemsHtml || "<p class='muted'>Inga artiklar i ordern</p>"}
          </div>

          <div class="order-totals">
            <div class="order-row"><span>Delsumma</span><span>${subtotal.toFixed(
              2
            )} kr</span></div>
            <div class="order-row"><span>Leveransavgift</span><span>${
              fee === 0 ? "Gratis" : fee.toFixed(2) + " kr"
            }</span></div>
            <div class="order-row total"><span>Totalt</span><span>${total.toFixed(
              2
            )} kr</span></div>
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
