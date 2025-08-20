document.addEventListener("DOMContentLoaded", function () {
  class AdminPanel {
    constructor() {
      // Force light mode on initial load
      if (!localStorage.getItem("darkMode")) {
        document.documentElement.removeAttribute("data-theme");
        localStorage.setItem("darkMode", "disabled");
      }

      this.socket = null;
      this.currentPage = 1;
      this.ordersPerPage = 10;
      this.statusChart = null;
      this.revenueChart = null;

      this.headerSearchInput = document.querySelector(
        ".header-right .search-bar input"
      );
      this.ordersSearchInput = document.getElementById("orders-search");

      this.targetOrderNumber = null;
      this.showingAllRecent = false;

      this.pollingInterval = null; // track polling to clear it later
      this.currentChartPeriod = "today"; // default chart period

      this.init();
    }

    async init() {
      try {
        await this.checkAuth();
        this.initSocket();
        await this.loadDashboard();
        this.setupEventListeners();
        this.setupDarkMode();
      } catch (error) {
        console.error("Admin panel initialization failed:", error);
        this.showNotification("Failed to initialize admin panel", true);
      }
    }

    async checkAuth() {
      const token = localStorage.getItem("adminToken");
      const rememberAdmin = localStorage.getItem("rememberAdmin") === "true";

      if (!token) {
        window.location.href = "/admin-login.html";
        throw new Error("No admin token found");
      }

      try {
        const response = await fetch("/api/admin/verify", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          // Only remove token if "remember me" wasn't selected
          if (!rememberAdmin) {
            localStorage.removeItem("adminToken");
          }
          throw new Error("Invalid admin token");
        }

        const data = await response.json();

        this.adminId = data.adminId;
      } catch (error) {
        if (!rememberAdmin) {
          localStorage.removeItem("adminToken");
        }
        window.location.href = "/admin-login.html";
        throw error;
      }
    }

    initSocket() {
      // Use same-origin in prod, localhost in dev
      const SOCKET_URL =
        location.hostname === "localhost" ||
        location.hostname.startsWith("192.168.")
          ? "http://localhost:4000"
          : location.origin; // e.g. https://matkungen-campus.onrender.com

      this.socket = io(SOCKET_URL, {
        transports: ["websocket", "polling"], // try WS first, fall back if needed
        withCredentials: true,
        auth: { token: localStorage.getItem("adminToken") },
      });

      // 🟢 When any order status is updated (e.g., by driver/admin)
      this.socket.on("orderUpdate", (order) => {
        this.updateOrderInUI(order);
        this.updateOrderInRecent(order); // NEW: Update recent orders section

        // Add this condition to update revenue
        if (order.status === "Delivered") {
          this.updateRevenue(order.total);
        }
        // ❌ Keep notifications only in updateOrderStatus() to avoid double-toasts
        // this.showNotification(
        //   `Order #${order.orderNumber} updated to ${order.status}`
        // );
      });

      this.socket.on("connect", () => {
        console.log("✅ Socket connected");
        this.socket.emit("joinAdminRoom"); // Join admin room
        // Clear polling if still running
        if (this.pollingInterval) {
          clearInterval(this.pollingInterval);
          this.pollingInterval = null;
        }
      });

      // Add this new event listener for chart updates
      this.socket.on("chart-update", (data) => {
        console.log("Chart update received", data);

        // If it's a new order, we need to refresh the entire dashboard
        if (data.isNewOrder) {
          this.loadDashboard(); // Reload the entire dashboard
        } else {
          // If it's just a status change, update only the chart
          this.fetchAndUpdateStatusChart(this.currentChartPeriod);
        }
      });

      // ✅ Real-time broadcast when user creates a new order
      this.socket.on("new-order", (order) => {
        // Only process completed payments
        if (order.paymentStatus !== "Completed") return;

        // Play sound
        this.playNotificationSound();

        // Update badge
        const badge = document.querySelector(".notification-badge");
        const currentCount = parseInt(badge.textContent || "0");
        badge.textContent = currentCount + 1;
        badge.style.display = "inline-block";

        // Add animation
        const notificationBtn = document.querySelector(".notification-btn");
        notificationBtn.classList.add("notification-ping");
        setTimeout(
          () => notificationBtn.classList.remove("notification-ping"),
          2000
        );

        // Add to recent orders / 🔄 Dynamic injection
        this.addOrderToRecent(order);

        // Increment today's orders count / ✅ Real "Today's Orders" only
        this.incrementTodayOrders();

        // Refresh the chart to include the new order / ✅ Real "Today's Orders" in chart
        this.fetchAndUpdateStatusChart(this.currentChartPeriod);
      });

      // ✅ When order is marked as delivered by admin
      this.socket.on("order-delivered", (order) => {
        this.showNotification(
          `Order #${order.orderNumber} marked as Delivered`
        );
        this.updateRevenue(order.total); // or this.updateTodayRevenue(order.total)
      });

      // Update Dashboard Stats
      this.socket.on("stats-update", (stats) => {
        const safeStats = {
          revenue: Number(stats.revenue ?? stats.todayRevenue) || 0,
          todayOrders: Number(stats.todayOrders) || 0,
          pendingOrders: Number(stats.pendingOrders) || 0,
          newCustomers: Number(stats.newCustomers) || 0,
        };
        // updateOrderInRecent;
        this.updateDashboardStats(safeStats);
        this.initCharts(stats); // rebuild charts with fresh weekly data
      });

      // 🚗 Location updates (if using driver tracking)
      this.socket.on("driverLocationUpdate", ({ orderId, location }) => {
        this.updateDriverLocation(orderId, location);
      });

      // ❌ On connection failure
      this.socket.on("connect_error", (err) => {
        console.error("Socket connection error:", err);
        this.showNotification("Realtime connection lost - using polling", true);
        if (!this.pollingInterval) {
          this.initPolling();
        }
      });

      // 🔄 On reconnect
      this.socket.on("reconnect", () => {
        this.showNotification("Realtime connection restored");
        if (this.pollingInterval) {
          clearInterval(this.pollingInterval);
          this.pollingInterval = null;
        }
      });
    }

    // fetch and update the chart order status counts
    async fetchAndUpdateStatusChart(period = "today") {
      try {
        const token = localStorage.getItem("adminToken");
        const response = await fetch(
          `/api/admin/orders/status-counts?period=${period}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!response.ok) throw new Error("Failed to fetch status counts");

        const data = await response.json();
        if (data.success) {
          this.updateStatusChart(data.statusCounts);
        }
      } catch (error) {
        console.error("Error updating chart:", error);
      }
    }
    updateOrderInRecent(order) {
      const table = document.getElementById("recent-orders-table");
      if (!table) return;

      // Find existing order row
      const existingRow = table.querySelector(
        `.order-row[data-order-id="${order._id}"]`
      );

      if (existingRow) {
        // Update status badge
        const statusBadge = existingRow.querySelector(".status-badge");
        if (statusBadge) {
          const statusClass = this.getStatusClass(order.status);
          statusBadge.className = `status-badge ${statusClass}`;
          statusBadge.textContent = order.status;
        }
      }
    }

    addOrderToRecent(order) {
      const table = document.getElementById("recent-orders-table");
      if (!table) return;

      // Ensure header exists before adding order
      this.ensureRecentOrdersHeader();

      const row = this.createOrderRow(order);
      table.insertBefore(row, table.children[1]); // Insert below header
    }

    incrementTodayOrders() {
      const todayOrders = document.getElementById("today-orders");
      const badge = document.getElementById("pending-orders-badge");
      const count = Number(todayOrders.textContent || "0") + 1;
      todayOrders.textContent = count;
      badge.textContent = count;
      badge.style.display = "inline-block";
    }

    // play Notification Sound
    playNotificationSound() {
      const audio = new Audio("/assets/sounds/notification.mp3");
      audio.play().catch((error) => {
        console.log("Audio play failed:", error);
        // Fallback: Use browser notification
        if (Notification.permission === "granted") {
          new Notification("New Order Received");
        }
      });
    }

    showNewOrderNotification(order) {
      const notificationBtn = document.querySelector(".notification-btn");
      const badge = notificationBtn.querySelector(".notification-badge");

      // Update badge
      const currentCount = parseInt(badge.textContent) || 0;
      badge.textContent = currentCount + 1;
      badge.style.display = "block";

      // Add ping animation
      notificationBtn.classList.add("notification-ping");

      setTimeout(() => {
        notificationBtn.classList.remove("notification-ping");
      }, 1000);

      // Show toast notification
      this.showNotification(`New order received: #${order.orderNumber}`);
    }

    updatePendingOrdersBadge() {
      const badge = document.getElementById("pending-orders-badge");
      const currentCount = parseInt(badge.textContent) || 0;
      badge.textContent = currentCount + 1;
    }

    initPolling() {
      if (this.pollingInterval) return; // already initialized
      this.pollingInterval = setInterval(() => {
        this.loadRecentOrders(); // ✅ clean, dynamic, and reusable
      }, 10000);
    }

    async loadDashboard() {
      try {
        const token = localStorage.getItem("adminToken");

        if (!token) {
          this.showNotification("Please log in again", true);

          window.location.href = "/admin-login.html";

          return;
        }

        // Fetch dashboard stats
        const statsResponse = await fetch("/api/admin/stats", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!statsResponse.ok) {
          throw new Error("Failed to load stats");
        }

        const { stats } = await statsResponse.json();
        this.updateDashboardStats(stats);

        // Initialize charts
        this.initCharts(stats);
        // Add this line to fetch initial chart data
        this.fetchAndUpdateStatusChart("today");
        // Load recent orders
        await this.loadRecentOrders();
        this.updateViewAllButton();
      } catch (error) {
        console.error("Dashboard load error:", error);
        this.showNotification("Failed to load dashboard data", true);

        // Show error state in UI
        this.updateDashboardStats({
          todayOrders: 0,
          pendingOrders: 0,
          revenue: 0,
          newCustomers: 0,
        });
      }
    }

    // async showTodaysOrdersModal() {
    //   try {
    //     const token = localStorage.getItem("adminToken");
    //     const response = await fetch("/api/admin/orders/today", {
    //       headers: { Authorization: `Bearer ${token}` },
    //     });

    //     const { orders } = await response.json();
    //     if (!response.ok) throw new Error("Failed to fetch today's orders");

    //     this.createTodaysOrdersModal(orders);
    //   } catch (error) {
    //     this.showNotification(error.message, true);
    //   }
    // }

    // createTodaysOrdersModal(orders) {
    //   const modal = document.createElement("div");
    //   modal.className = "todays-orders-modal";

    //   modal.innerHTML = `
    //   <div class="modal-overlay"></div>
    //   <div class="modal-container">
    //     <div class="modal-header">
    //       <h3>Today's Orders (${orders.length})</h3>
    //       <button class="close-modal">&times;</button>
    //     </div>
    //     <div class="modal-body">
    //       <div class="orders-table-header">
    //         <div>Order #</div>
    //         <div>Customer</div>
    //         <div>Items</div>
    //         <div>Total</div>
    //         <div>Status</div>
    //       </div>
    //       <div class="orders-table-body" id="todays-orders-list">
    //         ${
    //           orders.length > 0
    //             ? orders.map((order) => this.createOrderRow(order)).join("")
    //             : `<div class="empty-state">No orders today</div>`
    //         }
    //       </div>
    //     </div>
    //     <div class="modal-footer">
    //       <button class="btn btn-secondary close-modal">Close</button>
    //     </div>
    //   </div>
    // `;

    //   document.body.appendChild(modal);
    //   document.body.classList.add("modal-open");

    //   // Add close functionality
    //   modal.querySelectorAll(".close-modal").forEach((btn) => {
    //     btn.addEventListener("click", () => {
    //       modal.remove();
    //       document.body.classList.remove("modal-open");
    //     });
    //   });

    //   // Add click handler to view order details
    //   modal.querySelectorAll(".view-order").forEach((btn) => {
    //     btn.addEventListener("click", (e) => {
    //       const orderId = e.target.closest("button").dataset.order;
    //       this.showOrderDetails(orderId);
    //       modal.remove();
    //       document.body.classList.remove("modal-open");
    //     });
    //   });
    // }

    // And ensure updateDashboardStats is properly updating the UI
    updateDashboardStats(stats) {
      // ✅ Safely update today's orders (fallback to 0 if missing/invalid)
      document.getElementById("today-orders").textContent =
        Number(stats.todayOrders) || 0;

      // ✅ Safely update pending orders badge
      document.getElementById("pending-orders-badge").textContent =
        Number(stats.pendingOrders) || 0;

      // ✅ Convert revenue to number (handles null/undefined/string cases)
      const revenue = Number(stats.revenue) || 0;

      // ✅ Show revenue with 2 decimals, fallback is always "0.00 kr"
      document.getElementById("today-revenue").textContent = `${revenue.toFixed(
        2
      )} kr`;

      // ✅ Safely update new customers (fallback to 0)
      document.getElementById("new-customers").textContent =
        Number(stats.newCustomers) || 0;

      // optional monthly widgets
      const monthRevenueEl = document.getElementById("month-revenue");
      if (monthRevenueEl) {
        monthRevenueEl.textContent = `${(
          Number(stats.thisMonthRevenue) || 0
        ).toFixed(2)} kr`;
      }
      const monthOrdersEl = document.getElementById("month-orders");
      if (monthOrdersEl) {
        monthOrdersEl.textContent = Number(stats.thisMonthOrders) || 0;
      }
    }

    updateRevenue(amount) {
      try {
        // Try different ways to find the element
        const revenueElement =
          document.getElementById("today-revenue") ||
          document.querySelector("[data-revenue]");

        if (!revenueElement) {
          console.error("Revenue element not found");
          return;
        }

        // Extract numeric value safely
        const currentText = revenueElement.textContent || "0";
        const currentRevenue =
          parseFloat(currentText.replace(/[^0-9.]/g, "")) || 0;
        const add = parseFloat(amount) || 0;

        // Calculate new value
        const newValue = currentRevenue + add;

        // Update element
        revenueElement.textContent = `${newValue.toFixed(2)} kr`;

        // Add visual feedback
        revenueElement.classList.add("revenue-updated");
        setTimeout(() => {
          revenueElement.classList.remove("revenue-updated");
        }, 1000);
      } catch (error) {
        console.error("Error updating revenue:", error);
      }
    }

    // ✅ Improved: Single method to create header row
    createRecentOrdersHeader() {
      const headerRow = document.createElement("div");
      headerRow.className = "order-header-row";
      headerRow.innerHTML = `
      <div class="order-cell">Order #</div>
      <div class="order-cell">Customer</div>
      <div class="order-cell">Items</div>
      <div class="order-cell">Price</div>
      <div class="order-cell">Status</div>
      <div class="order-cell">Actions</div>
    `;
      return headerRow;
    }

    // ✅ Improved: Add header only when needed
    ensureRecentOrdersHeader() {
      const table = document.getElementById("recent-orders-table");
      if (!table) return;

      // Check if header already exists
      const existingHeader = table.querySelector(".order-header-row");
      if (existingHeader) return;

      // Create and add header if missing
      const headerRow = this.createRecentOrdersHeader();
      table.prepend(headerRow); // Add at the top
    }

    // Load recent orders
    async loadRecentOrders(showAll = false) {
      try {
        const url = showAll
          ? "/api/admin/orders/recent?all=true"
          : "/api/admin/orders/recent";

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("adminToken")}`,
          },
        });

        if (!response.ok) {
          throw new Error("Unauthorized or failed to fetch recent orders");
        }

        const { orders } = await response.json();
        const ordersTable = document.getElementById("recent-orders-table");

        // Clean the table/container
        ordersTable.innerHTML = "";

        // Check for orders
        if (!orders || orders.length === 0) {
          ordersTable.innerHTML = `
          <div class="empty-state" style="padding: 20px; text-align: center; color: var(--text-light);">
            No recent orders
          </div>`;
          return;
        }

        // ✅ Add header only once
        this.ensureRecentOrdersHeader();

        // Sort orders by newest first
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Display orders
        orders.forEach((order) => {
          const orderRow = this.createOrderRow(order);
          ordersTable.appendChild(orderRow);
        });
        // Keep a copy for reuse
        this.recentOrders = orders;

        // 🔁 Fallback: build TODAY status breakdown from recent orders
        try {
          const period =
            document.getElementById("status-chart-filter")?.value || "today";
          if (this.statusChart && period === "today" && Array.isArray(orders)) {
            const counts = {
              Pending: 0,
              Confirmed: 0,
              "On the Way": 0,
              Delivered: 0,
              Cancelled: 0,
            };

            // today window
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            const end = new Date(start);
            end.setDate(end.getDate() + 1);

            for (const o of orders) {
              const t = new Date(o.createdAt);
              if (t >= start && t < end) {
                if (counts[o.status] !== undefined) counts[o.status]++;
              }
            }

            // Update the doughnut
            this.updateStatusChart(counts);
          }
        } catch (e) {
          console.warn("Status chart fallback failed:", e);
        }

        // Toggle scrollable class based on view mode
        if (showAll) {
          ordersTable.classList.add("scrollable");
        } else {
          ordersTable.classList.remove("scrollable");
        }

        // Update the UI state
        this.showingAllRecent = showAll;
        this.updateViewAllButton();
      } catch (error) {
        console.error("Failed to load recent orders:", error);
        this.showNotification("Failed to load recent orders", true);
      }
    }

    updateViewAllButton() {
      const viewAllBtn = document.getElementById("view-all-recent");
      if (!viewAllBtn) return;

      if (this.showingAllRecent) {
        viewAllBtn.textContent = "Show Less";
        viewAllBtn.classList.add("showing-all");
      } else {
        viewAllBtn.textContent = "View All";
        viewAllBtn.classList.remove("showing-all");
      }
    }

    async loadOrders(page = 1, filters = {}) {
      try {
        // If we're searching by order ID, modify the search filter
        if (filters.search && filters.search.length === 24) {
          // Assuming orderId is 24 chars
          filters = { _id: filters.search }; // Search by exact ID
        }
        const token = localStorage.getItem("adminToken");

        if (!token) {
          this.showNotification("Please log in again", true);
          window.location.href = "/admin-login.html";
          return;
        }

        // Add status filter to show all orders by default
        const actualFilters = {
          status: "all",
          ...filters,
        };

        const query = new URLSearchParams({
          page,
          limit: this.ordersPerPage,
          ...actualFilters,
        });

        const response = await fetch(`/api/admin/orders?${query.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // Handle specific error cases
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem("adminToken");
          this.showNotification("Session expired, please log in again", true);
          window.location.href = "/admin-login.html";
          return;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `HTTP error! status: ${response.status}`
          );
        }

        const data = await response.json();
        const ordersList = document.getElementById("orders-list");
        ordersList.innerHTML = "";
        if (!data.orders || data.orders.docs.length === 0) {
          ordersList.innerHTML = `
        <div class="empty-state">
          <i class="ri-inbox-line"></i>
          <p>No orders found</p>
        </div>
      `;
          return;
        }
        data.orders.docs.forEach((order) => {
          const orderCard = this.createOrderCard(order);
          ordersList.appendChild(orderCard);
        });

        // Update pagination controls
        this.currentPage = data.orders.page;
        document.getElementById("current-page").textContent = data.orders.page;
        document.getElementById("total-pages").textContent =
          data.orders.totalPages;
        document.getElementById("prev-page").disabled =
          !data.orders.hasPrevPage;
        document.getElementById("next-page").disabled =
          !data.orders.hasNextPage;

        // Scroll to target order if specified
        if (this.targetOrderNumber) {
          setTimeout(() => {
            this.scrollToOrder(this.targetOrderNumber);
            this.targetOrderNumber = null; // Reset after scrolling
          }, 500); // Small delay to allow DOM rendering
        }
      } catch (error) {
        console.error("Error loading orders:", error);
        this.showNotification(error.message || "Failed to load orders", true);

        // Show error state in UI
        const ordersList = document.getElementById("orders-list");
        ordersList.innerHTML = `
       <div class="error-state">
        <i class="ri-error-warning-line"></i>
        <p>Failed to load orders</p>
        <button class="btn btn-outline retry-load">Retry</button>
       </div>
       `;

        // Add retry functionality
        document.querySelector(".retry-load")?.addEventListener("click", () => {
          this.loadOrders(page, filters);
        });
      }
    }

    // New method to scroll to and highlight an order
    scrollToOrder(orderNumber) {
      const orderCard = document.querySelector(
        `.order-card[data-order-number="${orderNumber}"]`
      );

      if (orderCard) {
        orderCard.scrollIntoView({ behavior: "smooth", block: "center" });

        // Highlight briefly
        orderCard.classList.add("highlighted");
        setTimeout(() => {
          orderCard.classList.remove("highlighted");
        }, 2000);
      }
    }

    createOrderRow(order) {
      const row = document.createElement("div");
      row.className = "order-row";
      row.dataset.orderId = order._id;
      row.innerHTML = `
    <div class="order-cell order-number">#${order.orderNumber}</div>
    <div class="order-cell customer">${order.customer?.name || "N/A"}</div>
    <div class="order-cell items-count text-right">${order.items.reduce(
      (acc, item) => acc + item.quantity,
      0
    )}</div>
    <div class="order-cell total text-right">${
      order.total?.toFixed(2) || "0.00"
    } kr</div>
    <div class="order-cell status">
      <span class="status-badge ${this.getStatusClass(order.status)}">
        ${order.status}
      </span>
    </div>
    <div class="order-cell actions">
      <button class="btn-action view-order" 
              data-order="${order._id}" 
              data-order-number="${order.orderNumber}">
        <i class="ri-eye-line"></i>
      </button>
    </div>
  `;
      return row;
    }
    // createOrderRow(order) {
    //   const row = document.createElement("div");
    //   row.className = "order-row";
    //   row.dataset.orderId = order._id;
    //   const statusMap = {
    //     Pending: "pending",
    //     Confirmed: "confirmed",
    //     "On the Way": "on-the-way",
    //     Delivered: "delivered",
    //     Cancelled: "cancelled",
    //   };

    //   row.innerHTML = `
    //     <div class="order-cell order-number">#${order.orderNumber}</div>
    //     <div class="order-cell customer">${order.customer.name}</div>
    //     <div class="order-cell items-count">${order.items.reduce(
    //       (acc, item) => acc + item.quantity,
    //       0
    //     )}</div>
    //     <div class="order-cell total">${order.total.toFixed(2)} kr</div>
    //     <div class="order-cell status">
    //       <span class="status-badge ${statusMap[order.status]}">${
    //     order.status
    //   }</span>
    //     </div>
    //     <div class="order-cell actions">
    //       <button class="btn-action view-order" data-order="${order._id}">
    //         <i class="ri-eye-line"></i>
    //       </button>
    //       <button class="btn-action edit-order" data-order="${order._id}">
    //         <i class="ri-edit-line"></i>
    //       </button>
    //     </div>
    //   `;
    //   return row;
    // }

    createOrderCard(order) {
      const card = document.createElement("div");
      card.className = "order-card";
      card.dataset.orderId = order._id;
      // store order number on the card
      card.dataset.orderNumber = order.orderNumber;

      const statusMap = {
        Pending: { class: "pending", icon: "ri-time-line" },
        Confirmed: { class: "confirmed", icon: "ri-checkbox-circle-line" },
        "On the Way": { class: "on-the-way", icon: "ri-roadster-line" },
        Delivered: { class: "delivered", icon: "ri-check-double-line" },
        Cancelled: { class: "cancelled", icon: "ri-close-circle-line" },
      };

      const statusInfo = statusMap[order.status] || statusMap["Pending"];
      card.innerHTML = `
        <div class="order-header">
          <div class="order-meta">
            <span class="order-number">#${order.orderNumber}</span>
            <span class="order-date">${new Date(
              order.createdAt
            ).toLocaleString()}</span>
          </div>
          <div class="order-status ${statusInfo.class}">
            <i class="${statusInfo.icon}"></i>
            ${order.status}
          </div>
        </div>
        <div class="order-customer">
          <div class="customer-name">${order.customer.name}</div>
          <div class="customer-phone">${order.customer.phone}</div>
          <div class="customer-address">${order.customer.address}</div>
        </div>
        <div class="order-summary">
          <div class="order-items-preview">
            ${order.items
              .slice(0, 3)
              .map(
                (item) => `
              <div class="preview-item">
                <span>${item.name} × ${item.quantity}</span>
                <span>${(item.price * item.quantity).toFixed(2)} kr</span>
              </div>
            `
              )
              .join("")}
            ${
              order.items.length > 3
                ? `<div class="more-items">+${
                    order.items.length - 3
                  } more items</div>`
                : ""
            }
         </div>
         <div class="order-totals">
           <div class="total-row">
             <span>Subtotal:</span>
             <span>${order.subtotal.toFixed(2)} kr</span>
           </div>
           <div class="total-row">
             <span>Delivery:</span>
             <span>${order.deliveryFee.toFixed(2)} kr</span>
           </div>
           <div class="total-row grand-total">
             <span>Total:</span>
             <span>${order.total.toFixed(2)} kr</span>
           </div>
         </div>
         </div>
         <div class="order-actions">
           <button class="btn btn-outline print-receipt" data-order="${
             order._id
           }">
             Print Receipt
           </button>
           <div class="status-actions">
             <select class="status-select" data-order="${order._id}">
               <option value="Pending" ${
                 order.status === "Pending" ? "selected" : ""
               }>Pending</option>
               <option value="Confirmed" ${
                 order.status === "Confirmed" ? "selected" : ""
               }>Confirmed</option>
              <option value="On the Way" ${
                order.status === "On the Way" ? "selected" : ""
              }>On the Way</option>
              <option value="Delivered" ${
                order.status === "Delivered" ? "selected" : ""
              }>Delivered</option>
              <option value="Cancelled" ${
                order.status === "Cancelled" ? "selected" : ""
              }>Cancelled</option>
            </select>
            <button class="btn btn-primary update-status" data-order="${
              order._id
            }">
              Update
            </button>
          </div>
        </div>
      `;
      return card;
    }

    updateStatusChart(statusCounts) {
      if (!this.statusChart) return;

      const values = [
        statusCounts?.Pending || 0,
        statusCounts?.Confirmed || 0,
        statusCounts?.["On the Way"] || 0,
        statusCounts?.Delivered || 0,
        statusCounts?.Cancelled || 0,
      ];
      const total = values.reduce((a, b) => a + b, 0);

      const labels =
        total === 0
          ? ["No data"]
          : ["Pending", "Confirmed", "On the Way", "Delivered", "Cancelled"];

      const colors =
        total === 0
          ? ["#E0E0E0"]
          : ["#FFA726", "#3e9e43", "#42A5F5", "#1B5E20", "#C62828"];

      this.statusChart.data.labels = labels;
      this.statusChart.data.datasets[0].data = total === 0 ? [1] : values;
      this.statusChart.data.datasets[0].backgroundColor = colors;

      // Toggle tooltip when empty
      this.statusChart.options.plugins.tooltip.enabled = total !== 0;

      this.statusChart.update();
    }

    // Add this method to check if Chart.js is loaded
    checkChartJS() {
      if (typeof Chart === "undefined") {
        console.error(
          "Chart.js is not loaded. Please include it in your HTML."
        );
        this.showNotification(
          "Chart library not loaded. Charts will not display.",
          true
        );
        return false;
      }
      return true;
    }

    // Update the initCharts method
    initCharts(stats) {
      // Check if Chart.js is available
      if (!this.checkChartJS()) {
        return;
      }

      // Store the stats for later use
      this.stats = stats;

      // ---- STATUS DOUGHNUT ----
      const statusCtx = document.getElementById("order-status-chart");

      if (!statusCtx) {
        console.error("Status chart canvas element not found");
        return;
      }

      try {
        // Get status data with fallbacks
        const statusBreakdown = stats.statusBreakdown || {};
        const initialPeriod =
          document.getElementById("status-chart-filter")?.value || "today";
        const initialStatusData = statusBreakdown[initialPeriod] || {
          Pending: 0,
          Confirmed: 0,
          "On the Way": 0,
          Delivered: 0,
          Cancelled: 0,
        };

        if (this.statusChart) this.statusChart.destroy();

        this.statusChart = new Chart(statusCtx, {
          type: "doughnut",
          data: {
            labels: [
              "Pending",
              "Confirmed",
              "On the Way",
              "Delivered",
              "Cancelled",
            ],
            datasets: [
              {
                data: [
                  initialStatusData.Pending || 0,
                  initialStatusData.Confirmed || 0,
                  initialStatusData["On the Way"] || 0,
                  initialStatusData.Delivered || 0,
                  initialStatusData.Cancelled || 0,
                ],
                backgroundColor: [
                  "#FFA726",
                  "#3e9e43",
                  "#42A5F5",
                  "#1B5E20",
                  "#C62828",
                ],
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false, // <-- important
            cutout: "65%", // nice donut hole
            plugins: {
              legend: { position: "bottom" },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    const label = context.label || "";
                    const value = context.raw || 0;
                    const total = context.dataset.data.reduce(
                      (a, b) => a + b,
                      0
                    );
                    const pct =
                      total > 0 ? Math.round((value / total) * 100) : 0;
                    return `${label}: ${value} (${pct}%)`;
                  },
                },
              },
            },
          },
        });

        console.log("Status chart initialized successfully");
      } catch (error) {
        console.error("Error initializing status chart:", error);
      }

      // ---- REVENUE CHART ----
      const revenueCtx = document.getElementById("revenue-analytics-chart");

      if (revenueCtx) {
        try {
          const weeklyLabels = stats.weeklyLabels || [
            "Mon",
            "Tue",
            "Wed",
            "Thu",
            "Fri",
            "Sat",
            "Sun",
          ];
          const weeklyRevenue = stats.weeklyRevenue || [0, 0, 0, 0, 0, 0, 0];

          if (this.revenueChart) this.revenueChart.destroy();
          this.revenueChart = new Chart(revenueCtx, {
            type: "line",
            data: {
              labels: weeklyLabels,
              datasets: [
                {
                  label: "Revenue (kr)",
                  data: weeklyRevenue,
                  borderColor: "#4CAF50",
                  backgroundColor: "rgba(76, 175, 80, 0.1)",
                  fill: true,
                  tension: 0.3,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false, // allow full height
              cutout: "65%", // optional donut hole
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true } },
            },
          });

          console.log("Revenue chart initialized successfully");
        } catch (error) {
          console.error("Error initializing revenue chart:", error);
        }
      } else {
        console.error("Revenue chart canvas element not found");
      }
    }

    // Update the debugChartIssues method
    debugChartIssues() {
      const statusCtx = document.getElementById("order-status-chart");

      if (!statusCtx) {
        console.error("Status chart canvas element not found");
        return false;
      }

      if (typeof Chart === "undefined") {
        console.error("Chart.js is not loaded");
        return false;
      }

      console.log("Chart.js is available, canvas element found");
      return true;
    }

    async showOrderDetails(orderId) {
      try {
        const token = localStorage.getItem("adminToken");
        if (!token) {
          this.showNotification("Please log in again", true);
          window.location.href = "/admin-login.html";
          return;
        }

        // 1. FIRST fetch the order details to get the order number
        const response = await fetch(`/api/admin/orders/${orderId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        // Handle non-OK responses
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            localStorage.removeItem("adminToken");
            this.showNotification("Session expired, please log in again", true);
            window.location.href = "/admin-login.html";
            return;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || "Failed to load order details");
        }

        // 2. Store order number BEFORE loading orders
        this.targetOrderNumber = data.order.orderNumber;

        // 3. Switch to Orders section and load orders
        this.showSection("orders");
        await this.loadOrders(1, { search: orderId });
      } catch (error) {
        console.error("Error fetching order details:", error);
        this.showNotification(
          error.message || "Failed to load order details",
          true
        );
      }
    }
    printOrderReceipt(order) {
      // Create a hidden iframe for printing
      const iframe = document.createElement("iframe");
      iframe.style.position = "absolute";
      iframe.style.left = "-9999px";
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

      // Use the order's creation date instead of current date
      const orderDate = new Date(order.createdAt).toLocaleDateString("sv-SE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      iframeDoc.open();
      iframeDoc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Order Receipt - ${order.orderNumber || ""}</title>
      <link rel="stylesheet" href="./assets/css/style.css">
      <style>
        body { background: white; padding: 20px; }
        .print-view .confirmation-card { 
          max-width: 600px; 
          margin: 0 auto;
          box-shadow: none;
          border: none;
        }
        .print-view .confirmation-header {
          text-align: center;
          padding: 20px 0;
          border-bottom: 2px solid #000;
        }
        .print-view .confirmation-content {
          display: block;
          padding: 20px 0;
        }
        .print-view .delivery-info, 
        .print-view .order-summary {
          width: 100%;
          margin-bottom: 30px;
        }
        .print-view .detail-row {
          display: flex;
          justify-content: space-between;
          margin: 10px 0;
        }
        .print-view .order-item {
          display: flex;
          justify-content: space-between;
          margin: 5px 0;
        }
        .print-view .order-totals {
          margin-top: 20px;
          border-top: 1px solid #ccc;
          padding-top: 10px;
        }
        .print-view .order-row {
          display: flex;
          justify-content: space-between;
          margin: 5px 0;
        }
        .print-view .order-row.total {
          font-weight: bold;
          font-size: 1.2em;
          margin-top: 10px;
        }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body class="print-view">
      <div class="confirmation-card">
        <div class="confirmation-header">
          <h1>Matkungen</h1>
          <p class="confirmation-text">
            Order Number <span id="order-number">${
              order.orderNumber || ""
            }</span>
          </p>
        </div>

        <div class="confirmation-content">
          <div class="delivery-info">
            <h2>Delivery Information</h2>
            <div id="customer-details">
              ${
                order.customer
                  ? `
                <p><strong>Name:</strong> ${order.customer.name || "N/A"}</p>
                <p><strong>Phone:</strong> ${order.customer.phone || "N/A"}</p>
                <p><strong>Address:</strong> ${
                  order.customer.address || "N/A"
                }</p>
                ${
                  order.customer.notes
                    ? `<p><strong>Notes:</strong> ${order.customer.notes}</p>`
                    : ""
                }
              `
                  : "<p>No customer information available</p>"
              }
            </div>
            <div class="detail-row">
              <span>Payment Method:</span>
              <span id="payment-method">${
                order.paymentMethod || "Not specified"
              }</span>
            </div>
            <div class="detail-row">
              <span>Order Date:</span>
              <span>${orderDate}</span>
            </div>
            <div class="detail-row">
              <span>Estimated Delivery:</span>
              <span id="delivery-time">20-35 minutes</span>
            </div>
          </div>

          <div class="order-summary">
            <h2>Order Summary</h2>
            <div class="order-items" id="order-items">
              ${
                order.items
                  ?.map(
                    (item) => `
                <div class="order-item">
                  <div class="item-name">${item.name} × ${item.quantity}</div>
                  <div class="item-price">${(
                    item.price * item.quantity
                  ).toFixed(2)} kr</div>
                </div>
              `
                  )
                  .join("") || "<p>No items in order</p>"
              }
            </div>

            <div class="order-totals">
              <div class="order-row">
                <span>Subtotal</span>
                <span id="order-subtotal">${
                  order.subtotal?.toFixed(2) || "0.00"
                } kr</span>
              </div>
              <div class="order-row">
                <span>Delivery Fee</span>
                <span id="delivery-fee">${
                  order.deliveryFee?.toFixed(2) || "0.00"
                } kr</span>
              </div>
              <div class="order-row total">
                <span>Total</span>
                <span id="order-total">${
                  order.total?.toFixed(2) || "0.00"
                } kr</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            setTimeout(function() {
              window.parent.document.body.removeChild(window.frameElement);
            }, 1000);
          }, 200);
        };
      </script>
    </body>
    </html>
  `);
      iframeDoc.close();
    }
    createEditModal(order) {
      const modal = document.createElement("div");
      modal.className = "edit-modal";
      modal.innerHTML = `
   <div class="modal-overlay"></div>
   <div class="modal-container">
     <div class="modal-header">
       <h3>Edit Order #${order.orderNumber}</h3>
       <button class="close-modal">&times;</button>
     </div>
     <div class="modal-body">
       <form id="edit-order-form">
         <div class="form-group">
           <label>Status</label>
           <select name="status" class="form-control">
             <option value="Pending" ${
               order.status === "Pending" ? "selected" : ""
             }>Pending</option>
             <option value="Confirmed" ${
               order.status === "Confirmed" ? "selected" : ""
             }>Confirmed</option>
             <option value="On the Way" ${
               order.status === "On the Way" ? "selected" : ""
             }>On the Way</option>
             <option value="Delivered" ${
               order.status === "Delivered" ? "selected" : ""
             }>Delivered</option>
             <option value="Cancelled" ${
               order.status === "Cancelled" ? "selected" : ""
             }>Cancelled</option>
           </select>
         </div>
         <div class="form-group">
           <label>Payment Status</label>
           <select name="paymentStatus" class="form-control">
             <option value="Pending" ${
               order.paymentStatus === "Pending" ? "selected" : ""
             }>Pending</option>
             <option value="Paid" ${
               order.paymentStatus === "Paid" ? "selected" : ""
             }>Paid</option>
             <option value="Completed" ${
               order.paymentStatus === "Completed" ? "selected" : ""
             }>Completed</option>
             <option value="Failed" ${
               order.paymentStatus === "Failed" ? "selected" : ""
             }>Failed</option>
             <option value="Refunded" ${
               order.paymentStatus === "Refunded" ? "selected" : ""
             }>Refunded</option>
             </select>
             </div>
             <div class="form-actions">
               <button type="submit" class="btn btn-primary">Save Changes</button>
               <button type="button" class="btn btn-secondary close-modal-btn">Cancel</button>
             </div>
             </form>
             </div>
             </div>
             `;

      // Add event listeners

      modal.querySelector(".close-modal").addEventListener("click", () => {
        modal.remove();
        document.body.classList.remove("modal-open");
      });
      modal.querySelector(".close-modal-btn").addEventListener("click", () => {
        modal.remove();
        document.body.classList.remove("modal-open");
      });
      modal.querySelector(".modal-overlay").addEventListener("click", () => {
        modal.remove();
        document.body.classList.remove("modal-open");
      });

      modal
        .querySelector("#edit-order-form")
        .addEventListener("submit", async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const updates = Object.fromEntries(formData.entries());
          try {
            const response = await fetch(`/api/admin/orders/${order._id}`, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("adminToken")}`,
              },
              body: JSON.stringify(updates),
            });
            const data = await response.json();
            if (!response.ok)
              throw new Error(data.error || "Failed to update order");
            this.updateOrderInUI(data.order);
            this.showNotification("Order updated successfully");
            modal.remove();
            document.body.classList.remove("modal-open");
          } catch (error) {
            this.showNotification(error.message, true);
          }
        });

      return modal;
    }

    async showEditOrderModal(orderId) {
      try {
        const response = await fetch(`/api/admin/orders/${orderId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("adminToken")}`,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const { order } = await response.json();
        const modal = this.createEditModal(order);
        document.body.appendChild(modal);
        document.body.classList.add("modal-open");
      } catch (error) {
        console.error("Error fetching order for edit:", error);
        this.showNotification("Failed to load order for editing", true);
      }
    }

    createOrderModal(order) {
      const modal = document.createElement("div");
      modal.className = "order-modal";
      modal.innerHTML = `
   <div class="modal-overlay"></div>
   <div class="modal-container">
     <div class="modal-header">
       <h3>Order Details</h3>
       <button class="close-modal">&times;</button>
     </div>
     <div class="modal-body">
       <div class="order-meta">
         <div><strong>Order #:</strong> ${order.orderNumber}</div>
         <div><strong>Date:</strong> ${new Date(
           order.createdAt
         ).toLocaleString()}</div>
         <div><strong>Status:</strong> <span class="status-badge ${order.status.toLowerCase()}">${
        order.status
      }</span></div>
         <div><strong>Payment:</strong> ${order.paymentMethod} (${
        order.paymentStatus
      })</div>
       </div>
       <div class="customer-info">
         <h4>Customer Information</h4>
         <p><strong>Name:</strong> ${order.customer.name}</p>
         <p><strong>Phone:</strong> ${order.customer.phone}</p>
         <p><strong>Address:</strong> ${order.customer.address}</p>
         ${
           order.customer.notes
             ? `<p><strong>Notes:</strong> ${order.customer.notes}</p>`
             : ""
         }
       </div>
       <div class="order-items">
         <h4>Order Items</h4>
         <table>
           <thead>
             <tr>
               <th>Item</th>
               <th>Quantity</th>
               <th>Price</th>
               <th>Total</th>
             </tr>
           </thead>
           <tbody>
             ${order.items
               .map(
                 (item) => `
             <tr>
               <td>${item.name}</td>
               <td>${item.quantity}</td>
               <td>${item.price.toFixed(2)} kr</td>
               <td>${(item.price * item.quantity).toFixed(2)} kr</td>
               </tr>
               `
               )
               .join("")}
               </tbody>
  </table>
  </div>
  <div class="order-totals">
    <div class="total-row">
      <span>Subtotal:</span>
      <span>${order.subtotal.toFixed(2)} kr</span>
    </div>
    <div class="total-row">
      <span>Delivery Fee:</span>
      <span>${order.deliveryFee.toFixed(2)} kr</span>
    </div>
    <div class="total-row grand-total">
      <span>Total:</span>
      <span>${order.total.toFixed(2)} kr</span>
    </div>
  </div>
       ${
         order.driver
           ? `
     <div class="driver-info">
       <h4>Driver Information</h4>
       <p><strong>Name:</strong> ${order.driver.name}</p>
       <p><strong>Phone:</strong> ${order.driver.phone}</p>
     </div>
     `
           : ""
       }
     <div class="status-history">
       <h4>Status History</h4>
       <ul>
           ${order.statusHistory
             .map(
               (status) => `
     <li>
       <span class="status">${status.status}</span>
       <span class="timestamp">${new Date(
         status.changedAt
       ).toLocaleString()}</span>
       ${status.note ? `<span class="note">${status.note}</span>` : ""}
     </li>
     `
             )

             .join("")}
     </ul>
   </div>
   </div>
   <div class="modal-footer">
     <button class="btn btn-primary print-order">Print Receipt</button>
     <button class="btn btn-secondary close-modal-btn">Close</button>
   </div>
   </div>
   `;
      return modal;
    }

    showAssignDriverModal(orderId) {
      const modal = document.createElement("div");
      modal.className = "driver-modal";
      modal.innerHTML = `
<div class="modal-overlay"></div>
<div class="modal-container">
  <div class="modal-header">
    <h3>Assign Driver</h3>
    <button class="close-modal">&times;</button>
  </div>
  <div class="modal-body">
    <form id="assign-driver-form">
      <div class="form-group">
        <label for="driver-name">Driver Name</label>
        <input type="text" id="driver-name" required>
      </div>
      <div class="form-group">
        <label for="driver-phone">Driver Phone</label>
        <input type="tel" id="driver-phone" required>
      </div>
      <input type="hidden" id="order-id" value="${orderId}">
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Assign Driver</button>
        <button type="button" class="btn btn-secondary close-modal-btn">Cancel</button>
      </div>
    </form>
  </div>
</div>
`;
      document.body.appendChild(modal);

      document.body.classList.add("modal-open");

      // Add event listeners

      modal.querySelector(".close-modal").addEventListener("click", () => {
        modal.remove();

        document.body.classList.remove("modal-open");
      });

      modal.querySelector(".close-modal-btn").addEventListener("click", () => {
        modal.remove();

        document.body.classList.remove("modal-open");
      });

      modal.querySelector(".modal-overlay").addEventListener("click", () => {
        modal.remove();

        document.body.classList.remove("modal-open");
      });

      modal
        .querySelector("#assign-driver-form")
        .addEventListener("submit", async (e) => {
          e.preventDefault();

          const driverName = modal.querySelector("#driver-name").value;

          const driverPhone = modal.querySelector("#driver-phone").value;

          const orderId = modal.querySelector("#order-id").value;

          try {
            const response = await fetch(
              `/api/admin/orders/${orderId}/assign-driver`,
              {
                method: "PUT",

                headers: {
                  "Content-Type": "application/json",

                  Authorization: `Bearer ${localStorage.getItem("adminToken")}`,
                },

                body: JSON.stringify({
                  driverName,

                  driverPhone,
                }),
              }
            );

            const { order } = await response.json();

            if (!response.ok) {
              throw new Error("Failed to assign driver");
            }

            this.updateOrderInUI(order);

            this.showNotification(
              `Driver assigned to order #${order.orderNumber}`
            );

            modal.remove();

            document.body.classList.remove("modal-open");
          } catch (error) {
            console.error("Error assigning driver:", error);

            this.showNotification("Failed to assign driver", true);
          }
        });
    }

    initOrderMap(mapId, initialLocation) {
      // Initialize Mapbox map

      mapboxgl.accessToken = process.env.MAPBOX_ACCESS_TOKEN;

      const map = new mapboxgl.Map({
        container: mapId,

        style: "mapbox://styles/mapbox/streets-v11",

        center: initialLocation?.coordinates || [14.826, 56.854],

        zoom: 15,
      });

      // Add marker for driver

      const marker = new mapboxgl.Marker()

        .setLngLat(initialLocation?.coordinates || [14.826, 56.854])

        .addTo(map);

      // Listen for driver location updates

      this.socket.on(`driverLocationUpdate-${mapId}`, (location) => {
        marker.setLngLat(location.coordinates);

        map.flyTo({
          center: location.coordinates,

          essential: true,
        });
      });
    }

    calculateETA(deliveryTime) {
      if (!deliveryTime) return "Calculating...";

      const now = new Date();

      const deliveryDate = new Date(deliveryTime);

      const diff = deliveryDate - now;

      if (diff <= 0) return "Arrived";

      const minutes = Math.round(diff / (1000 * 60));

      return `${minutes} minutes`;
    }

    // updateOrderStatus method
    async updateOrderStatus(orderId, newStatus) {
      try {
        const response = await fetch(`/api/admin/orders/${orderId}/status`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("adminToken")}`,
          },
          body: JSON.stringify({ status: newStatus }),
        });

        const { order } = await response.json();
        if (!response.ok) throw new Error("Failed to update order status");
        // UI update logic goes here like updating the order in the table or card view
        this.updateOrderInUI(order);
        this.showNotification(
          `Order #${order.orderNumber} updated to ${newStatus}`
        );
      } catch (error) {
        console.error("Error updating order status:", error);
        this.showNotification("Failed to update order status", true);
      }
    }

    getStatusClass(status) {
      const map = {
        Pending: "pending",
        Confirmed: "confirmed",
        "On the Way": "on-the-way", // Fixed class name
        Delivered: "delivered",
        Cancelled: "cancelled",
        "Pending Payment": "pending", // Add this
      };
      return map[status] || "pending";
    }

    updateOrderInUI(updatedOrder) {
      // Update in orders table
      const tableRow = document.querySelector(
        `.order-row[data-order-id="${updatedOrder._id}"]`
      );

      if (tableRow) {
        const statusBadge = tableRow.querySelector(".status-badge");
        if (statusBadge) {
          const statusClass = this.getStatusClass(updatedOrder.status);
          statusBadge.className = `status-badge ${statusClass}`;
          statusBadge.textContent = updatedOrder.status;
        }
      }

      // Update in orders list
      const orderCard = document.querySelector(
        `.order-card[data-order-id="${updatedOrder._id}"]`
      );

      if (orderCard) {
        const statusElement = orderCard.querySelector(".order-status");
        const statusClass = this.getStatusClass(updatedOrder.status); // Use same mapping
        statusElement.className = `order-status ${statusClass}`;
        statusElement.innerHTML = `<i class="${this.getStatusIcon(
          updatedOrder.status
        )}"></i> ${updatedOrder.status}`;

        // Update status select
        const statusSelect = orderCard.querySelector(".status-select");
        if (statusSelect) {
          statusSelect.value = updatedOrder.status;
        }
      }
    }

    updateDriverLocation(orderId, location) {
      const etaElement = document.querySelector(`#map-${orderId} + .eta`);

      if (etaElement) {
        const now = new Date();

        const deliveryTime = new Date(now.getTime() + 15 * 60000); // 15 minutes from now

        etaElement.textContent = `Estimated arrival: ${this.calculateETA(
          deliveryTime
        )}`;
      }
    }

    getStatusIcon(status) {
      const icons = {
        Pending: "ri-time-line",
        Confirmed: "ri-checkbox-circle-line",
        "On the Way": "ri-roadster-line",
        Delivered: "ri-check-double-line",
        Cancelled: "ri-close-circle-line",
      };

      return icons[status] || "ri-time-line";
    }
    // async printOrderReceiptById(orderId) {
    //   try {
    //     const token = localStorage.getItem("adminToken");
    //     if (!token) return;

    //     const response = await fetch(`/api/admin/orders/${orderId}`, {
    //       headers: { Authorization: `Bearer ${token}` }
    //     });

    //     const data = await response.json();
    //     if (response.ok && data.success) {
    //       this.printOrderReceipt(data.order);
    //     }
    //   } catch (error) {
    //     console.error("Error printing receipt:", error);
    //     this.showNotification("Failed to print receipt", true);
    //   }
    // }
    setupEventListeners() {
      // Improved Sidebar Toggle and Navigation
      const sidebar = document.querySelector(".sidebar");
      const sidebarToggle = document.getElementById("sidebar-toggle");

      sidebarToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        sidebar.classList.toggle("active");
      });

      document.addEventListener("click", (e) => {
        const isMobile = window.innerWidth <= 992;
        const clickedInsideSidebar = sidebar.contains(e.target);
        const clickedToggleButton =
          e.target === sidebarToggle || sidebarToggle.contains(e.target);
        if (isMobile && !clickedInsideSidebar && !clickedToggleButton) {
          sidebar.classList.remove("active");
        }
      });

      document.querySelectorAll(".sidebar li").forEach((item) => {
        item.addEventListener("click", () => {
          const section = item.dataset.section;
          this.showSection(section);
          if (window.innerWidth <= 992) {
            sidebar.classList.remove("active");
          }
        });
      });

      document.addEventListener("click", (e) => {
        // View order details
        const viewBtn = e.target.closest(".view-order");
        if (viewBtn) {
          const orderId = viewBtn.dataset.order;
          this.showOrderDetails(orderId);
          return;
        }

        // Print receipt button
        const printReceiptBtn = e.target.closest(".print-receipt");
        if (printReceiptBtn) {
          const orderId = printReceiptBtn.dataset.order;
          // Find the order in the current view
          const orderCard = document.querySelector(
            `.order-card[data-order-id="${orderId}"]`
          );
          if (orderCard) {
            // Get order data from data attributes or fetch it
            const orderNumber = orderCard.dataset.orderNumber;
            // For a complete solution, you might need to fetch the full order details
            // or store them in memory when loading the orders
            this.fetchAndPrintOrder(orderId);
          }
          return;
        }

        const updateStatusBtn = e.target.closest(".update-status");
        if (updateStatusBtn) {
          const orderId = updateStatusBtn.dataset.order;
          const statusSelect = document.querySelector(
            `.status-select[data-order="${orderId}"]`
          );
          if (statusSelect) {
            const newStatus = statusSelect.value;
            this.updateOrderStatus(orderId, newStatus);
          }
          return;
        }

        const trackBtn = e.target.closest(".track-order");
        if (trackBtn) {
          const orderId = trackBtn.dataset.order;
          this.trackOrder(orderId);
          return;
        }
      });

      document.getElementById("prev-page").addEventListener("click", () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.loadOrders(this.currentPage);
        }
      });

      document.getElementById("next-page").addEventListener("click", () => {
        this.currentPage++;
        this.loadOrders(this.currentPage);
      });

      document
        .getElementById("orders-filter")
        .addEventListener("change", (e) => {
          const value = e.target.value;
          const statusMap = {
            pending: "Pending",
            confirmed: "Confirmed",
            "on-the-way": "On the Way",
            delivered: "Delivered",
            cancelled: "Cancelled",
          };

          const filters = {};
          if (value !== "all") {
            filters.status = statusMap[value];
          }
          this.loadOrders(1, filters);
        });

      document
        .getElementById("orders-search")
        .addEventListener("input", (e) => {
          const searchTerm = e.target.value.trim();
          if (searchTerm.length > 2 || searchTerm.length === 0) {
            this.loadOrders(1, { search: searchTerm });
          }
        });

      document
        .getElementById("view-all-recent")
        ?.addEventListener("click", () => {
          this.loadRecentOrders(!this.showingAllRecent);
        });

      // Add event listener for status chart filter
      const statusChartFilter = document.getElementById("status-chart-filter");
      if (statusChartFilter) {
        if (statusChartFilter) {
          statusChartFilter.addEventListener("change", (e) => {
            const period = e.target.value;
            this.currentChartPeriod = period; // Store the current period
            this.fetchAndUpdateStatusChart(period);
          });
        }

        document.getElementById("logout-btn").addEventListener("click", () => {
          localStorage.removeItem("adminToken");
          window.location.href = "/admin-login.html";
        });

        if (this.headerSearchInput) {
          let searchDebounce;
          this.headerSearchInput.addEventListener("input", (e) => {
            const searchTerm = e.target.value.trim();
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
              if (
                document
                  .getElementById("orders-section")
                  ?.classList.contains("active")
              ) {
                if (this.ordersSearchInput) {
                  this.ordersSearchInput.value = searchTerm;
                }
                this.loadOrders(1, { search: searchTerm });
              } else if (
                document
                  .getElementById("dashboard-section")
                  ?.classList.contains("active")
              ) {
                this.showSearchResults(searchTerm);
              }
            }, 500);
          });
        }

        const deleteAllBtn = document.getElementById("delete-all-orders");
        const modal = document.getElementById("confirm-modal");
        const confirmYes = document.getElementById("confirm-yes");
        const confirmNo = document.getElementById("confirm-no");

        if (deleteAllBtn && modal && confirmYes && confirmNo) {
          deleteAllBtn.addEventListener("click", () => {
            modal.style.display = "flex";
          });

          confirmNo.addEventListener("click", () => {
            modal.style.display = "none";
          });

          confirmYes.addEventListener("click", async () => {
            modal.style.display = "none";
            try {
              const response = await fetch("/api/admin/orders/delete-all", {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${localStorage.getItem("adminToken")}`,
                },
              });

              const result = await response.json();

              if (response.ok) {
                this.showNotification("✅ All orders deleted successfully.");
                document.getElementById("orders-list").innerHTML =
                  '<div class="empty-state">No orders found.</div>';
                document.getElementById("recent-orders-table").innerHTML =
                  '<div class="empty-state">No recent orders.</div>';
              } else {
                this.showNotification("❌ Failed to delete orders.");
              }
            } catch (error) {
              console.error("Error:", error);
              this.showNotification(
                "❌ An error occurred while deleting orders."
              );
            }
          });
        }
      }
    }

    async fetchAndPrintOrder(orderId) {
      try {
        const token = localStorage.getItem("adminToken");
        if (!token) {
          this.showNotification("Please log in again", true);
          window.location.href = "/admin-login.html";
          return;
        }

        const response = await fetch(`/api/admin/orders/${orderId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch order details");
        }

        const { order } = await response.json();
        this.printOrderReceipt(order);
      } catch (error) {
        console.error("Error printing receipt:", error);
        this.showNotification("Failed to print receipt", true);
      }
    }

    // show search results on dashboard
    async showSearchResults(searchTerm) {
      try {
        const token = localStorage.getItem("adminToken");
        if (!token) return;

        const response = await fetch(
          `/api/admin/orders?search=${encodeURIComponent(searchTerm)}&limit=5`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Search failed");

        const resultsContainer = document.getElementById(
          "search-results-container"
        );
        if (!resultsContainer) return;

        if (!data.orders || data.orders.docs.length === 0) {
          resultsContainer.innerHTML =
            '<div class="empty-state">No orders found</div>';
          return;
        }

        resultsContainer.innerHTML = data.orders.docs
          .map(
            (order) =>
              `<div class="recent-order">
                    <div>#${order.orderNumber}</div>
                    <div>${order.customer.name}</div>
                    <div>${order.items.reduce(
                      (acc, item) => acc + item.quantity,
                      0
                    )}</div>
                    <div>${order.total.toFixed(2)} kr</div>
                    <div><span class="status-badge ${order.status
                      .toLowerCase()
                      .replace(/\s+/g, "-")}">${order.status}</span></div>
                 </div>`
          )
          .join("");
      } catch (error) {
        console.error("Search error:", error);
      }
    }
    toggleSidebar() {
      const sidebar = document.querySelector(".sidebar");

      sidebar.classList.toggle("active");
    }

    showSection(section) {
      // Hide all sections

      document.querySelectorAll(".content-section").forEach((sec) => {
        sec.classList.remove("active");
      });

      // Show selected section
      document.getElementById(`${section}-section`).classList.add("active");

      // Update page title
      document.getElementById("page-title").textContent =
        section.charAt(0).toUpperCase() + section.slice(1);

      // Update active nav item
      document.querySelectorAll(".sidebar li").forEach((item) => {
        item.classList.remove("active");
      });

      document
        .querySelector(`.sidebar li[data-section="${section}"]`)
        .classList.add("active");

      // Load section data if needed
      if (section === "orders") {
        this.loadOrders();
      }

      // Clear search results when switching away from dashboard
      if (section !== "dashboard") {
        const resultsContainer = document.getElementById(
          "search-results-container"
        );
        if (resultsContainer) resultsContainer.innerHTML = "";
      }
    }

    setupDarkMode() {
      const darkModeToggle = document.querySelector(".dark-mode-toggle");

      // Initialize based on localStorage

      if (localStorage.getItem("darkMode") === "enabled") {
        document.documentElement.setAttribute("data-theme", "dark");

        darkModeToggle.innerHTML = '<i class="ri-sun-line"></i>';
      } else {
        document.documentElement.removeAttribute("data-theme");

        darkModeToggle.innerHTML = '<i class="ri-moon-line"></i>';
      }

      // Toggle dark mode

      darkModeToggle.addEventListener("click", () => {
        if (document.documentElement.getAttribute("data-theme") === "dark") {
          document.documentElement.removeAttribute("data-theme");

          darkModeToggle.innerHTML = '<i class="ri-moon-line"></i>';

          localStorage.setItem("darkMode", "disabled");
        } else {
          document.documentElement.setAttribute("data-theme", "dark");

          darkModeToggle.innerHTML = '<i class="ri-sun-line"></i>';

          localStorage.setItem("darkMode", "enabled");
        }
      });
    }

    // Show notification
    showNotification(message, isError = false) {
      const toast = document.getElementById("notification-toast");

      toast.textContent = message;

      toast.className = `notification-toast ${isError ? "error" : ""}`;

      setTimeout(() => {
        toast.classList.add("show");

        setTimeout(() => {
          toast.classList.remove("show");
        }, 3000);
      }, 10);
    }
  }

  // Initialize the admin panel

  new AdminPanel();
});
