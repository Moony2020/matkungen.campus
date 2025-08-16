// utils/sendEmail.js
const nodemailer = require("nodemailer");

function makeTransport({ insecure = false, port = 465 }) {
  // port 465 = SMTPS (TLS on connect)
  // port 587 = STARTTLS (upgrade)
  const using465 = port === 465;

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port,
    secure: using465, // true for 465, false for 587
    requireTLS: !using465, // require STARTTLS on 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Gmail App Password
    },
    tls: insecure ? { rejectUnauthorized: false } : undefined,
  });
}

/**
 * Send an order email (no extra wrapper; use your own HTML).
 * Params:
 *  - to: string
 *  - subject: string
 *  - html: string (already built in server.js -> buildOrderEmailHtml)
 *  - pdfBuffer?: Buffer
 */
async function sendOrderEmail({ to, subject, html, pdfBuffer }) {
  const allowInsecure =
    String(process.env.ALLOW_INSECURE_TLS || "").toLowerCase() === "true";

  // Primary attempt: 465 (implicit TLS)
  let transporter = makeTransport({ insecure: allowInsecure, port: 465 });
  let lastErr;

  try {
    // Optional verify for clearer logs
    await transporter.verify().catch(() => {});
    await transporter.sendMail({
      from: `"Matkungen" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html, // your HTML already contains header/logo, we don’t wrap
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
    console.log("✅ Email sent to:", to, "(SMTP 465)");
    return;
  } catch (e) {
    lastErr = e;
    const msg = String(e && (e.message || e));
    const selfSigned =
      e?.code === "ESOCKET" || /self[-\s]?signed certificate/i.test(msg);

    console.warn("⚠️ SMTP 465 failed:", msg);

    // If TLS chain is intercepted (common on Windows dev), retry with 587 STARTTLS.
    // Also retry with insecure if not already allowed.
    const retryInsecure = allowInsecure ? false : selfSigned;

    transporter = makeTransport({
      insecure: allowInsecure || retryInsecure,
      port: 587,
    });

    try {
      await transporter.verify().catch(() => {});
      await transporter.sendMail({
        from: `"Matkungen" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
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
      console.log(
        "✅ Email sent to:",
        to,
        `(SMTP 587${allowInsecure || retryInsecure ? " insecure" : ""})`
      );
      return;
    } catch (e2) {
      console.error("❌ SMTP 587 retry failed:", e2?.message || e2);
      throw e2 || lastErr;
    }
  }
}

module.exports = { sendOrderEmail };
