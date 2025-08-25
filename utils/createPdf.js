// utils/createPdf.js

function receiptHtml(order) {
  // ---- robust pickup detection ----
  const isPickup =
    String(order.orderType || "").toLowerCase() === "pickup" ||
    /avh[aä]mtning/i.test(order?.customer?.address || "");

  // ---- order date: use createdAt if present ----
  const created = order.createdAt ? new Date(order.createdAt) : new Date();
  const orderDate = created.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // ---- safe math ----
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal =
    typeof order.subtotal === "number"
      ? order.subtotal
      : items.reduce(
          (s, i) => s + Number(i.price || 0) * Number(i.quantity || 0),
          0
        );

  const rawFee = Number(order.deliveryFee ?? 0);
  const deliveryFee = isPickup ? 0 : rawFee;
  const total = subtotal + deliveryFee;

  const feeText = deliveryFee === 0 ? "Gratis" : `${deliveryFee.toFixed(2)} kr`;
  const etaText = isPickup ? " 10 minuter" : "20–35 minuter";
  const sectionTitle = isPickup
    ? "Upphämtningsinformation"
    : "Leveransinformation";

  // ---- pickup location shown nicely ----
  const STORE_NAME = "Matkungen";
  const STORE_ADDRESS = "P G Vejdes väg, 352 52 Växjö";
  const STORE_PHONE = "0769 666 666";

  const addressBlock = isPickup
    ? `
      <p><strong>Upphämtningsställe:</strong> ${STORE_NAME}</p>
      <p><strong>Adress:</strong> ${STORE_ADDRESS}</p>
      <p><strong>Restaurangens telefon:</strong> ${STORE_PHONE}</p>
    `
    : `<p><strong>Adress:</strong> ${order.customer?.address || "N/A"}</p>`;

  const itemsHtml = items
    .map((item) => {
      const qty = Number(item.quantity || 1);
      const price = Number(item.price || 0);
      return `
        <div class="order-item">
          <div class="item-name">${item.name} × ${qty}</div>
          <div class="item-price">${(price * qty).toFixed(2)} kr</div>
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Order Receipt - ${order.orderNumber || ""}</title>
   <link rel="stylesheet" href="./assets/css/style.css">
</head>
<body>
  <div class="page">
    <div class="confirmation-card">
      <div class="text-header">
        <h1>Matkungen</h1>
      </div>

      <div class="confirmation-inner">
        <div class="confirmation-header">
          <p class="confirmation-text">
            <span class="badge">Ordernummer</span><br/>
            ${order.orderNumber || ""}
          </p>
        </div>

        <div class="confirmation-content">
          <div class="delivery-info">
            <div class="section-title">${sectionTitle}</div>
            <div id="customer-details" class="muted">
              <p><strong>Namn:</strong> ${order.customer?.name || "N/A"}</p>
              <p><strong>Telefon:</strong> ${order.customer?.phone || "N/A"}</p>
              ${addressBlock}
              ${
                order.customer?.notes
                  ? `<p><strong>Noteringar:</strong> ${order.customer.notes}</p>`
                  : ""
              }
            </div>

            <div class="detail-row"><span>Betalningsmetod:</span><span>${
              order.paymentMethod || "Ej angivet"
            }</span></div>
            <div class="detail-row"><span>Orderdatum:</span><span>${orderDate}</span></div>
            <div class="detail-row"><span>Beräknad tid:</span><span>${etaText}</span></div>
          </div>

          <div class="order-summary">
            <div class="section-title">Ordersammanfattning</div>
            <div class="order-items">
              ${itemsHtml || "<p class='muted'>Inga artiklar i ordern</p>"}
            </div>

            <div class="order-totals">
              <div class="order-row"><span>Delsumma</span><span>${subtotal.toFixed(
                2
              )} kr</span></div>
              <div class="order-row"><span>Leveransavgift</span><span>${feeText}</span></div>
              <div class="order-row total"><span>Totalt</span><span>${total.toFixed(
                2
              )} kr</span></div>
            </div>
          </div>
        </div>
      </div><!-- /.confirmation-inner -->
    </div><!-- /.confirmation-card -->
  </div><!-- /.page -->
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
    await page.setContent(receiptHtml(order), { waitUntil: "networkidle0" });
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
