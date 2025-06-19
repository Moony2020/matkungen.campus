const PDFDocument = require("pdfkit");

const createReceiptPdf = (order) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      let buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      // PDF content
      doc.fontSize(20).text("Order Receipt", { align: "center" });
      doc.moveDown();
      doc.fontSize(14).text(`Order Number: ${order.orderNumber}`);
      doc.text(`Customer: ${order.customer.name}`);
      doc.text(`Email: ${order.customer.email}`);
      doc.text(`Phone: ${order.customer.phone || "N/A"}`);
      doc.moveDown();

      doc.text("Items:");
      order.items.forEach((item) => {
        doc.text(
          `- ${item.name} (x${item.quantity}): ${(
            item.price * item.quantity
          ).toFixed(2)} kr`
        );
      });

      doc.moveDown();
      doc.text(`Subtotal: ${order.subtotal.toFixed(2)} kr`);
      doc.text(`Delivery Fee: ${order.deliveryFee.toFixed(2)} kr`);
      doc.text(`Total: ${order.total.toFixed(2)} kr`);
      doc.text(`Payment Method: ${order.paymentMethod}`);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = createReceiptPdf;
