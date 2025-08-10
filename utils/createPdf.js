// utils/createPdf.js
const puppeteer = require("puppeteer");

function receiptHtml(order) {
  const now = new Date();
  const orderDate = now.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const itemsHtml = (order.items || [])
    .map(
      (item) => `
        <div class="order-item">
          <div class="item-name">${item.name} × ${item.quantity}</div>
          <div class="item-price">${(item.price * item.quantity).toFixed(
            2
          )} kr</div>
        </div>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Order Receipt - ${order.orderNumber || ""}</title>
  <style>
    /* --- Minimal inline styles to match your confirmation page look --- */
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color:#111; margin:0; background:#fff; }
    .page { padding: 28px; }
    .confirmation-card { max-width: 800px; margin: 0 auto; border:1px solid #eee; border-radius:12px; padding:28px; }
    .confirmation-header { text-align:center; margin-bottom:18px; }
    .confirmation-header h1 { margin:0 0 6px; letter-spacing: 4px; font-weight:700; font-size:28px; }
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
  </style>
</head>
<body>
  <div class="page">
    <div class="confirmation-card">
      <div class="confirmation-header">
        <h1>Matkungen</h1>
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
            <p><strong>Address:</strong> ${order.customer?.address || "N/A"}</p>
            ${
              order.customer?.notes
                ? `<p><strong>Notes:</strong> ${order.customer.notes}</p>`
                : ""
            }
          </div>

          <div class="detail-row">
            <span>Payment Method:</span>
            <span>${order.paymentMethod || "Not specified"}</span>
          </div>
          <div class="detail-row">
            <span>Order Date:</span>
            <span>${orderDate}</span>
          </div>
          <div class="detail-row">
            <span>Estimated Delivery:</span>
            <span>25-40 minutes</span>
          </div>
        </div>

        <div class="order-summary">
          <div class="section-title">Order Summary</div>
          <div class="order-items">${
            itemsHtml || "<p class='muted'>No items in order</p>"
          }</div>

          <div class="order-totals">
            <div class="order-row"><span>Subtotal</span><span>${(
              order.subtotal ?? 0
            ).toFixed(2)} kr</span></div>
            <div class="order-row"><span>Delivery Fee</span><span>${(
              order.deliveryFee ?? 0
            ).toFixed(2)} kr</span></div>
            <div class="order-row total"><span>Total</span><span>${(
              order.total ?? 0
            ).toFixed(2)} kr</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

const createReceiptPdf = async (order) => {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"], // helpful on many hosts
  });
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
};

module.exports = createReceiptPdf;
