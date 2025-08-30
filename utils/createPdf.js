// utils/createPdf.js
const fs = require("fs");
const path = require("path");

function receiptHtml(order) {
  // --- pickup detection (same as server/client) ---
  const isPickup =
    /pickup/i.test(String(order.fulfillmentMethod || order.orderType || "")) ||
    /avh[aä]mtning/i.test(order?.customer?.address || "");

  const etaLabel = isPickup ? "Beräknad tid" : "Beräknad leveranstid";
  const etaText = isPickup ? "10 minuter" : "20–35 minuter";
  const sectionLbl = isPickup
    ? "Upphämtningsinformation"
    : "Leveransinformation";

  // --- order date ---
  const created = order.createdAt ? new Date(order.createdAt) : new Date();
  const orderDate = created.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // --- math (safe) ---
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal =
    typeof order.subtotal === "number"
      ? order.subtotal
      : items.reduce(
          (s, i) => s + Number(i.price || 0) * Number(i.quantity || 0),
          0
        );
  const rawFee = Number(order.deliveryFee ?? 0);
  const isPickupFee = isPickup ? 0 : rawFee;
  const total = subtotal + isPickupFee;

  const c = order.customer || {};
  const STORE_NAME = "Matkungen";
  const STORE_ADDRESS = "P G Vejdes väg, 352 52 Växjö";
  const STORE_PHONE = "0769 666 666";

  const itemsHtml = items
    .map((i) => {
      const qty = Number(i.quantity || 1);
      const price = Number(i.price || 0);
      return `
      <div class="order-item">
        <div class="item-name">${i.name} × ${qty}</div>
        <div class="item-price">${(price * qty).toFixed(2)} kr</div>
      </div>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Order Receipt - ${order.orderNumber || ""}</title>
</head>
<body class="print-view">
  <div class="page">
    <div class="confirmation-card">
      <div class="confirmation-header">
        <h1>Matkungen</h1>
        <p class="confirmation-text">
          Ordernummer<br><span id="order-number">${
            order.orderNumber || ""
          }</span>
        </p>
      </div>

      <div class="confirmation-content">
        <div class="delivery-info">
          <h2>${sectionLbl}</h2>

          <!-- all rows inline: label then value -->
          <div class="detail-row inline"><span>Namn:</span><span>${
            c.name || "-"
          }</span></div>
          <div class="detail-row inline"><span>Telefon:</span><span>${
            c.phone || "-"
          }</span></div>

          ${
            isPickup
              ? `
                <div class="detail-row inline"><span>Upphämtningsställe:</span><span>${STORE_NAME}</span></div>
                <div class="detail-row inline"><span>Adress:</span><span>${STORE_ADDRESS}</span></div>
                <div class="detail-row inline"><span>Restaurangens telefon:</span><span>${STORE_PHONE}</span></div>
              `
              : `<div class="detail-row inline"><span>Adress:</span><span>${
                  c.address || "-"
                }</span></div>`
          }

          ${
            c.notes
              ? `<div class="detail-row inline"><span>Noteringar:</span><span>${c.notes}</span></div>`
              : ""
          }

   <!-- these three were two-column before; now forced inline -->
   <div class="detail-row value-right"><span>Betalningsmetod:</span><span>${
     order.paymentMethod || "—"
   }</span></div>
   <div class="detail-row value-right"><span>Orderdatum:</span><span>${orderDate}</span></div>
   <div class="detail-row value-right"><span>${etaLabel}:</span><span>${etaText}</span></div>

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
              isPickupFee === 0 ? "Gratis" : isPickupFee.toFixed(2) + " kr"
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

async function createReceiptPdf(order) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();

    // 1) HTML
    await page.setContent(receiptHtml(order), { waitUntil: "networkidle0" });

    // 2) Your site CSS (so variables like --gold-crayola exist)
    const cssPath = path.join(__dirname, "..", "assets", "css", "style.css");
    const css = fs.readFileSync(cssPath, "utf8");
    await page.addStyleTag({ content: css });

    // 3) PDF-only overrides: inline rows + dark-gold labels + centered header
    await page.addStyleTag({
      content: `
    /* Header centering */
    .print-view .confirmation-header { text-align:center; }
    .print-view .confirmation-header h1 { margin:0 0 .25rem 0; }

    /* Base detail rows: inline label + value */
    .print-view .delivery-info .detail-row{
      display:flex !important;
      justify-content:flex-start !important;
      align-items:baseline;
      gap:.5rem;
      margin:6px 0;
    }
    .print-view .delivery-info .detail-row span:first-child{
      color: var(--gold-crayola);
      font-weight: 600;
      min-width: max-content;
    }
    .print-view .delivery-info .detail-row span:last-child{
       color: var(--gold-crayola);
      font-weight: 400;
    }

    /* Only these rows push value to the far right */
    .print-view .delivery-info .detail-row.value-right{
      justify-content: space-between !important;
      gap: 1rem;
    }
    .print-view .delivery-info .detail-row.value-right span:last-child{
      margin-left: auto;
      text-align: right;
    }

    /* Totals stay left/right */
    .print-view .order-summary .order-row{
      display:flex;
      justify-content:space-between;
    }
  `,
    });

    // 4) Apply print media
    await page.emulateMediaType("print");

    // 5) PDF buffer
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = createReceiptPdf;
