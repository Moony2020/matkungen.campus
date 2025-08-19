// track.js
let orderNumber = null;

// ✅ Dynamic socket URL: localhost in dev, live URL in prod
const SOCKET_URL =
  location.hostname === "localhost" || location.hostname.startsWith("192.168.")
    ? "http://localhost:4000"
    : location.origin;

const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });

document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  orderNumber = urlParams.get("order");

  const statusText = document.getElementById("status-message");
  const infoBox = document.getElementById("order-info");

  if (!orderNumber) {
    statusText.textContent = "Order number not provided.";
    return;
  }

  try {
    // ✅ Always fetch from same origin (auto works for localhost/prod)
    const res = await fetch(`/api/orders/track/${orderNumber}`);
    const data = await res.json();

    if (!res.ok || !data.success || !data.order) {
      statusText.textContent = "Order not found.";
      return;
    }

    // Show initial status
    document.getElementById("order-number").textContent =
      data.order.orderNumber;
    //  document.getElementById("order-status").textContent = data.order.status;

    updateProgressBar(data.order.status);
    updateStatusLabel(data.order.status);

    infoBox.style.display = "block";
    statusText.style.display = "none";

    // ✅ Join socket room by Mongo _id
    socket.emit("joinOrderRoom", data.order._id);
    console.log("🟢 Joining socket room:", data.order._id);
  } catch (err) {
    console.error("❌ Error fetching order:", err);
    statusText.textContent = "Something went wrong.";
  }
});

// ✅ REAL-TIME UPDATES
socket.on("orderUpdate", (updatedOrder) => {
  console.log("📦 Received update via socket:", updatedOrder.status);

  if (updatedOrder.orderNumber === orderNumber) {
    // document.getElementById("order-status").textContent = updatedOrder.status;
    updateProgressBar(updatedOrder.status);
    updateStatusLabel(updatedOrder.status);
  }
});

// Add this helper function to track.js
function createProgressSteps(currentStatus) {
  const steps = [
    { status: "Confirmed", icon: "ri-checkbox-circle-line" },
    { status: "On the Way", icon: "ri-roadster-line" },
    { status: "Delivered", icon: "ri-check-double-line" },
  ];

  const statusOrder = {
    Confirmed: 0,
    "On the Way": 1,
    Delivered: 2,
  };

  const currentIndex = statusOrder[currentStatus] ?? 0;

  return steps
    .map(
      (step, index) => `
    <div class="progress-step ${index <= currentIndex ? "active" : ""}">
      <div class="step-icon">
        <i class="${step.icon}"></i>
      </div>
      <div class="step-label">${step.status}</div>
    </div>
  `
    )
    .join("");
}

// Update the progress bar helper
function updateProgressBar(currentStatus) {
  const progressContainer = document.getElementById("order-progress");
  if (progressContainer) {
    progressContainer.innerHTML = createProgressSteps(currentStatus);
  }
}
function updateStatusLabel(status) {
  const labelContainer = document.getElementById("status-label-container");
  if (!labelContainer) return;

  let iconClass = "";
  let bgColor = "";
  let textColor = "";
  let text = status;

  switch (status) {
    case "Confirmed":
      iconClass = "ri-time-line";
      bgColor = "#e6d3a3";
      textColor = "#000";
      break;
    case "On the Way":
      iconClass = "ri-roadster-line";
      bgColor = "#e5f1ff";
      textColor = "#1d4ed8";
      break;
    case "Delivered":
      iconClass = "ri-check-double-line";
      bgColor = "#d9fbe2";
      textColor = "#166534";
      break;
    default:
      iconClass = "ri-time-line";
      bgColor = "#eee";
      textColor = "#666";
  }
  // Update estimated delivery time
  const etaElement = document.getElementById("eta");
  if (etaElement) {
    switch (status) {
      case "Confirmed":
        etaElement.textContent = "20–35 minutes";
        break;
      case "On the Way":
        etaElement.textContent = "10–20 minutes";
        break;
      case "Delivered":
        etaElement.textContent = "Order Delivered";
        break;
      default:
        etaElement.textContent = "-";
    }
  }

  labelContainer.innerHTML = `
    <div style="
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background-color: ${bgColor};
      color: ${textColor};
      padding: 6px 12px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
    ">
      <i class="${iconClass}" style="font-size: 18px;"></i> ${text}
    </div>
  `;
}

// function updateStatusLabel(status) {
//   const labelContainer = document.getElementById("status-label-container");
//   if (!labelContainer) return;

//   let styles = {
//     background: "",
//     color: "",
//     icon: "",
//   };

//   switch (status) {
//     case "Confirmed":
//       styles = {
//         background: "var(--gold-crayola)",
//         color: "black",
//         icon: "ri-time-line",
//       };
//       break;
//     case "On the Way":
//       styles = {
//         background: "#e7f3ff",
//         color: "#1e4e8c",
//         icon: "ri-roadster-line",
//       };
//       break;
//     case "Delivered":
//       styles = {
//         background: "#e6f4ea",
//         color: "#2e7d32",
//         icon: "ri-check-double-line",
//       };
//       break;
//     default:
//       return;
//   }

//   labelContainer.innerHTML = `
//     <div class="status-label" style="background:${styles.background}; color:${styles.color}; display:inline-flex; align-items:center; padding:10px 16px; border-radius:8px; font-weight:600;">
//       <i class="${styles.icon}" style="margin-right:8px; font-size:18px;"></i>
//       ${status}
//     </div>
//   `;
// }

socket.on("connect", () => console.log("✅ Socket connected"));
socket.on("connect_error", (err) =>
  console.error("❌ Socket connection error:", err)
);
