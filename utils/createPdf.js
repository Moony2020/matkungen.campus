// utils/createPdf.js
const { getLogoDataUrl } = require("./logo");

function receiptHtml(order) {
  const logo = getLogoDataUrl();
  const now = new Date();
  const orderDate = now.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const itemsHtml = (order.items || [])
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
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color:#111; margin:0; background:#fff; }
    .page { padding: 28px; }
    .confirmation-card { max-width: 800px; margin: 0 auto; border:1px solid #eee; border-radius:12px; padding:0; overflow:hidden; }
    .brand-header { background:#000; padding:28px 24px; text-align:center; }
    .brand-header h1 { margin:8px 0 0; letter-spacing: 1px; font-weight:700; font-size:26px; color:#f4c430; }
    .confirmation-inner { padding:28px; }
    .confirmation-header { text-align:center; margin-bottom:18px; }
    .confirmation-text { margin:8px 0 0; color:#555; }
    .badge { display:inline-block; padding:6px 10px; border-radius:6px; background:#f5f5f5; }
    .section-title { font-size:18px; margin:18px 0 10px; color:#7a6b2f; font-weight:700; }
    .confirmation-content { display:flex; gap:24px; flex-wrap:wrap; }
    .delivery-info, .order-summary { flex:1 1 320px; }
    .detail-row { display:flex; justify-content:space-between; margin:6px 0; color:#333; }
    .order-items { border:1px solid #eee; border-radius:10px; padding:8px 12px; }
    .order-item { display:flex; justify-content:space-between; padding:8px 4px; border-bottom:1px dashed #eee; }
    .order-item:last-child { border-bottom:none; }
    .order-totals { margin-top:12px; }
    .order-row { display:flex; justify-content:space-between; margin:6px 0; }
    .order-row.total { border-top:1px solid #e9e9e9; margin-top:10px; padding-top:10px; font-weight:700; }
    .muted { color:#666; }
    img.logo { display:block; margin:0 auto; width:120px; height:auto; }
  </style>
</head>
<body>
  <div class="page">
    <div class="confirmation-card">
      <div class="brand-header">
        <img class="logo" src="${logo}" alt="Matkungen" />
        <h1>Matkungen</h1>
      </div>

      <div class="confirmation-inner">
        <div class="confirmation-header">
          <p class="confirmation-text">
            <span class="badge">Order Number</span><br/>
            ${order.orderNumber || ""}
          </p>
        </div>

        <div class="confirmation-content">
          <div class="delivery-info">
            <div class="section-title">Delivery Information</div>
            <div id="customer-details" class="muted">
              <p><strong>Name:</strong> ${order.customer?.name || "N/A"}</p>
              <p><strong>Phone:</strong> ${order.customer?.phone || "N/A"}</p>
              <p><strong>Address:</strong> ${
                order.customer?.address || "N/A"
              }</p>
              ${
                order.customer?.notes
                  ? `<p><strong>Notes:</strong> ${order.customer.notes}</p>`
                  : ""
              }
            </div>

            <div class="detail-row"><span>Payment Method:</span><span>${
              order.paymentMethod || "Not specified"
            }</span></div>
            <div class="detail-row"><span>Order Date:</span><span>${orderDate}</span></div>
            <div class="detail-row"><span>Estimated Delivery:</span><span>20-35 minutes</span></div>
          </div>

          <div class="order-summary">
            <div class="section-title">Order Summary</div>
            <div class="order-items">
              ${itemsHtml || "<p class='muted'>No items in order</p>"}
            </div>

            <div class="order-totals">
              <div class="order-row"><span>Subtotal</span><span>${(
                Number(order.subtotal) || 0
              ).toFixed(2)} kr</span></div>
              <div class="order-row"><span>Delivery Fee</span><span>${(
                Number(order.deliveryFee) || 0
              ).toFixed(2)} kr</span></div>
              <div class="order-row total"><span>Total</span><span>${(
                Number(order.total) || 0
              ).toFixed(2)} kr</span></div>
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
  // Force which engine to use via env:
  //   PUPPETEER_MODE=chromium  -> puppeteer-core + @sparticuz/chromium (Render)
  //   PUPPETEER_MODE=puppeteer -> full puppeteer (local dev)
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

  // Default: try full puppeteer first (best for Windows/Mac dev)
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
