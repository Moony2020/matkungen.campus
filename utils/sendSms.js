const twilio = require("twilio");

const client = new twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const sendSms = async (to, message) => {
  return client.messages.create({
    body: message,
    to, // e.g., "+46712345678"
    from: process.env.TWILIO_PHONE,
  });
};

module.exports = sendSms;
