// utils/sendEmail.js
const nodemailer = require("nodemailer");
const { getLogoDataUrl } = require("./logo");

// If ALLOW_INSECURE_TLS=true (only for local dev), we relax TLS to bypass
// local antivirus or proxy MITM that causes “self-signed certificate” warnings.
const allowInsecure =
  String(process.env.ALLOW_INSECURE_TLS || "").toLowerCase() === "true";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  tls: allowInsecure ? { rejectUnauthorized: false } : undefined,
});

// Optional verify (logs only)
transporter.verify().then(
  () => console.log("📧 Mailer verified."),
  (e) => console.warn("⚠️  Mailer verify failed:", e?.message)
);

function wrapWithBranding(innerHtml) {
  const logo = getLogoDataUrl();
  const header = `
    <div style="background:#000;padding:28px 24px;border-radius:16px 16px 0 0;text-align:center;">
      <img src="${logo}" alt="Matkungen" width="120" style="display:block;margin:0 auto 8px;" />
      <h1 style="color:#f4c430;margin:0;font:700 24px/1.2 system-ui,-apple-system,Segoe UI,Roboto;">Matkungen</h1>
    </div>`;
  const cardOpen = `<div style="max-width:800px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden;background:#fff;">`;
  const body = `<div style="padding:24px;">${innerHtml || ""}</div>`;
  const cardClose = `</div>`;
  return `${cardOpen}${header}${body}${cardClose}`;
}

async function sendOrderEmail({ to, subject, html, pdfBuffer }) {
  const finalHtml = wrapWithBranding(
    html || "<p>Hej! Tack för din beställning.</p>"
  );

  const mailOptions = {
    from: `"Matkungen" <${process.env.EMAIL_USER}>`,
    to,
    subject,
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
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error(
      "❌ sendMail error:",
      err?.code,
      err?.responseCode,
      err?.message || err
    );
    throw err;
  }
}

module.exports = sendOrderEmail;
