// utils/sendEmail.js
const nodemailer = require("nodemailer");

const {
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_FROM, // e.g. "Matkungen <mymoon676@gmail.com>"
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  ALLOW_INSECURE_TLS,
} = process.env;

// ========================= Helper: Escape HTML =========================
function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ========================= Helper: Build Email HTML =========================
function buildOrderEmailHtml(order) {
  const isPickup =
    /pickup/i.test(String(order.fulfillmentMethod || order.orderType || "")) ||
    /avh[aä]mtning/i.test(order?.customer?.address || "");

  const etaLabel = isPickup ? "Beräknad tid" : "Beräknad leveranstid";
  const etaText = isPickup ? "10 minuter" : "20–35 minuter";

  const c = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];

  const subtotal = items.reduce(
    (s, i) => s + Number(i.price || 0) * Number(i.quantity || 0),
    0
  );
  const fee = isPickup ? 0 : Number(order.deliveryFee ?? 0);
  const total = subtotal + fee;

  const itemsHtml = items
    .map(
      (i) => `
        <li style="margin:0 0 10px 0; list-style:none; border-bottom:1px solid #eee; padding:8px 0;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <span>${esc(i.name)} × ${i.quantity}</span>
            <span>${(Number(i.price || 0) * Number(i.quantity || 0)).toFixed(
              2
            )} kr</span>
          </div>
          ${
            i.note
              ? `<div style="margin-top:4px; font-size:13px; color:#333;">
                  📝 ${esc(i.note)}
                </div>`
              : ""
          }
        </li>`
    )
    .join("");

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; color:#222;">
    <h1 style="text-align:center; margin-bottom:5px;">Matkungen</h1>
    <p style="text-align:center; margin-top:0;">Ordernummer: <strong>${
      order.orderNumber || "-"
    }</strong></p>

    <h3 style="margin:15px 0 5px 0;">${
      isPickup ? "Upphämtningsinformation" : "Leveransinformation"
    }</h3>
    <p style="margin:0;"><strong>Namn:</strong> ${esc(c.name || "-")}</p>
    <p style="margin:0;"><strong>Telefon:</strong> ${esc(c.phone || "-")}</p>
    ${
      isPickup
        ? `<p style="margin:0;"><strong>Upphämtningsställe:</strong> Matkungen, P G Vejdes väg, Växjö</p>`
        : `<p style="margin:0;"><strong>Adress:</strong> ${esc(
            c.address || "-"
          )}</p>`
    }
    ${
      c.notes
        ? `<p style="margin:4px 0 0 0;"><strong>Noteringar:</strong> ${esc(
            c.notes
          )}</p>`
        : ""
    }
    <p style="margin:4px 0 0 0;"><strong>${etaLabel}:</strong> ${etaText}</p>

    <h3 style="margin:15px 0 8px 0;">Ordersammanfattning</h3>
    <ul style="padding:0; margin:0;">${itemsHtml}</ul>

    <div style="border-top:1px solid #eee; margin-top:10px; padding-top:10px;">
      <p style="margin:0;"><strong>Delsumma:</strong> ${subtotal.toFixed(
        2
      )} kr</p>
      <p style="margin:0;"><strong>Leveransavgift:</strong> ${
        fee === 0 ? "Gratis" : `${fee.toFixed(2)} kr`
      }</p>
      <p style="margin:4px 0 0 0; font-size:15px;"><strong>Totalt:</strong> ${total.toFixed(
        2
      )} kr</p>
    </div>

    <p style="margin-top:20px;">Tack för din beställning! 🍔<br/>Matkungen Team</p>
  </div>`;
}

// ========================= Email Configs =========================
function bool(v, def = false) {
  if (typeof v === "string")
    return ["1", "true", "yes", "on"].includes(v.toLowerCase());
  if (typeof v === "boolean") return v;
  return def;
}

function gmailTransport() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    tls: { rejectUnauthorized: !bool(ALLOW_INSECURE_TLS, true) },
  });
}

function fallbackTransport() {
  const port = Number(SMTP_PORT || 587);
  const secure = bool(SMTP_SECURE, false);
  const host = SMTP_HOST || "smtp.gmail.com";
  return {
    transport: nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      tls: { rejectUnauthorized: !bool(ALLOW_INSECURE_TLS, true) },
    }),
    meta: { host, port, secure },
  };
}

// ========================= Main Email Function =========================
async function sendOrderEmail({ to, order, pdfBuffer, subject, html }) {
  const from = EMAIL_FROM || EMAIL_USER;

  // Allow both calling styles:
  // A) server provides subject/html (no order needed)
  // B) server provides order (we build subject/html here)
  const safeOrder = order || {};
  const finalSubject =
    subject || `Orderbekräftelse #${safeOrder.orderNumber || ""} – Matkungen`;
  const finalHtml = html || buildOrderEmailHtml(safeOrder);

  // Try Gmail first
  try {
    const t = gmailTransport();
    console.log("✉️ Trying Gmail SMTP (465/SSL).");
    await t.verify();
    const info = await t.sendMail({
      from,
      to,
      subject: finalSubject,
      html: finalHtml,
      attachments: pdfBuffer
        ? [
            {
              filename: "receipt.pdf",
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ]
        : [],
    });
    console.log("✅ Email sent via Gmail:", {
      to,
      subject: finalSubject,
      id: info.messageId,
      response: info.response,
    });
    return info;
  } catch (e1) {
    console.error("❌ Gmail SMTP failed:", e1?.message || e1);
  }

  // Fallback transport
  const fb = fallbackTransport();
  try {
    console.log(
      `✉️ Trying fallback SMTP (${fb.meta.host}:${fb.meta.port}${
        fb.meta.secure ? "/SSL" : "/STARTTLS"
      })...`
    );
    await fb.transport.verify();
    const info = await fb.transport.sendMail({
      from,
      to,
      subject: finalSubject,
      html: finalHtml,
      attachments: pdfBuffer
        ? [
            {
              filename: "receipt.pdf",
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ]
        : [],
    });
    console.log("✅ Email sent via fallback SMTP:", {
      to,
      subject: finalSubject,
      id: info.messageId,
      response: info.response,
    });
    return info;
  } catch (e2) {
    console.error("❌ Fallback SMTP failed:", e2?.message || e2);
    throw e2;
  }
}

module.exports = { sendOrderEmail };
