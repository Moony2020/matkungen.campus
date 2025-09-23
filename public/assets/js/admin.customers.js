// public/assets/js/admin.customers.js

const $ = (sel, parent = document) => parent.querySelector(sel);
const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));

function fmtMoney(n, currency = "kr") {
  if (n == null) return `0 ${currency}`;
  const v = Math.round(Number(n) * 100) / 100;
  return `${v.toLocaleString()} ${currency}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const diff = (Date.now() - d.getTime()) / 1000;
  const minutes = Math.floor(diff / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function renderCustomerRow(c) {
  const joined = c?.createdAt
    ? new Date(c.createdAt).toLocaleDateString("sv-SE")
    : "—";
  const guestBadge = c?.isGuest
    ? '<span class="tag tag-guest">Guest</span>'
    : '<span class="tag tag-registered">Registered</span>';

  return `
    <tr data-id="${c?._id || ""}" class="customer-row">
      <td>
        <div class="cust-name">${c?.name || "—"} ${guestBadge}</div>
        <div class="cust-joined">Joined: ${joined}</div>
      </td>
      <td>
        <div>${c?.email || "—"}</div>
        <div>${c?.phone || "—"}</div>
      </td>
      <td>${Number(c?.totalOrders ?? 0)}</td>
      <td>${fmtMoney(c?.totalSpent)}</td>
      <td>${c?.lastOrderAt ? timeAgo(c.lastOrderAt) : "—"}</td>
    </tr>`;
}

function getAdminToken() {
  // Try common storage keys your login might use
  return (
    localStorage.getItem("adminToken") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("adminToken") ||
    sessionStorage.getItem("token") ||
    null
  );
}

function authHeaders() {
  const t = getAdminToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const Customers = (() => {
  const state = {
    page: 1,
    limit: 20,
    search: "",
    filter: "all",
    sort: "recent",
    totalPages: 1,
    loading: false,
  };

  const els = {
    section: $("#customers-section"),
    tbody: $("#customers-tbody"),
    loading: $("#customers-loading"),
    pagination: $("#customers-pagination"),
    search: $("#customers-search"),
    filter: $("#customers-filter"),
    sort: $("#customers-sort"),
    badge: $("#customers-badge"),
    drawer: $("#customer-drawer"),
    drawerBody: $("#customer-drawer-body"),
    drawerClose: $("#customer-drawer-close"),
    newCustomersStat: $("#new-customers"),
  };

  let debounceTimer;

  function setLoading(yes) {
    state.loading = yes;
    if (els.loading) els.loading.style.display = yes ? "block" : "none";
  }

  function buildRow(c) {
    return `
      <tr data-id="${c._id}" class="customer-row">
        <td>
          <div class="cust-name">${c.name}</div>
          <div class="cust-created">Joined: ${new Date(
            c.createdAt
          ).toLocaleDateString()}</div>
        </td>
        <td>
          <div>${c.email || "—"}</div>
          <div>${c.phone || "—"}</div>
        </td>
        <td>${c.totalOrders}</td>
        <td>${fmtMoney(c.totalSpent)}</td>
        <td>${c.lastOrderAt ? timeAgo(c.lastOrderAt) : "—"}</td>
      </tr>
    `;
  }

  async function load() {
    if (!els.section) return;

    // === 1D: short-circuit if no admin token ===
    if (!getAdminToken()) {
      if (els.tbody) {
        els.tbody.innerHTML = `<tr><td colspan="5">Please log in again (no admin token found).</td></tr>`;
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(state.page),
        limit: String(state.limit),
        search: state.search,
        filter: state.filter,
        sort: state.sort,
      });

      const res = await fetch(`/api/admin/customers?${params.toString()}`, {
        credentials: "include",
        headers: {
          ...authHeaders(),
        },
      });

      // === 1C: friendly 401 handler ===
      if (res.status === 401) {
        throw new Error("No token, authorization denied");
      }

      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || "Failed to load");

      state.totalPages = json.totalPages || 1;

      if (els.tbody) {
        els.tbody.innerHTML = json.data.map(renderCustomerRow).join("");
      }

      // Badge + stat (fallback to API if socket not yet updated)
      if (els.badge) {
        const badgeCount = json.data.filter((c) => c.totalOrders === 0).length;
        if (badgeCount > 0) {
          els.badge.textContent = String(badgeCount);
          els.badge.style.display = "flex";
        } else {
          els.badge.style.display = "none";
        }
      }

      buildPagination();
      bindRowClicks();
    } catch (e) {
      console.error("Customers load error:", e);
      if (els.tbody) {
        els.tbody.innerHTML = `<tr><td colspan="5">Failed to load customers.</td></tr>`;
      }
    } finally {
      setLoading(false);
    }
  }

  function buildPagination() {
    if (!els.pagination) return;
    const { page, totalPages } = state;
    let html = `<button class="btn btn-outline" data-page="${page - 1}" ${
      page <= 1 ? "disabled" : ""
    }><i class="ri-arrow-left-line"></i> Previous </button>`;
    html += `<span class="page-info">Page ${page} of ${totalPages}</span>`;
    html += `<button class="btn btn-outline" data-page="${page + 1}" ${
      page >= totalPages ? "disabled" : ""
    }> Next <i class="ri-arrow-right-line"></i></button>`;
    els.pagination.innerHTML = html;
    els.pagination.querySelectorAll("button[data-page]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const p = parseInt(e.currentTarget.getAttribute("data-page"), 10);
        if (!Number.isNaN(p) && p >= 1 && p <= state.totalPages) {
          state.page = p;
          load();
        }
      });
    });
  }

  function bindRowClicks() {
    $$("#customers-tbody .customer-row").forEach((tr) => {
      tr.addEventListener("click", () =>
        openDrawer(tr.getAttribute("data-id"))
      );
    });
  }

  // === 2A: open drawer ===
  async function openDrawer(id) {
    try {
      const token = getAdminToken();
      if (!token) {
        // no token -> bounce to login
        console.warn("No admin token found, redirecting to login");
        window.location.href = "/admin-login.html";
        return;
      }

      const res = await fetch(`/api/admin/customers/${id}`, {
        credentials: "include", // keep if you also use cookies
        headers: {
          Accept: "application/json",
          ...authHeaders(), // <-- adds Authorization: Bearer <token>
        },
      });

      if (res.status === 401 || res.status === 403) {
        // token expired or invalid
        localStorage.removeItem("adminToken");
        alert("Session expired. Please log in again.");
        window.location.href = "/admin-login.html";
        return;
      }

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed to load customer (${res.status})`);
      }

      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || "Failed");

      const { customer, orders } = json;
      if (!els.drawerBody || !els.drawer) return;

      // 👇 NEW: fall back to the most recent order's phone/address if user document is empty
      const lastOrder =
        Array.isArray(orders) && orders.length
          ? orders[0] // assuming API returns newest first
          : null;

      const phoneInOrder = lastOrder?.customer?.phone || "—";
      const addrInOrder = lastOrder?.customer?.address || "—";

      els.drawerBody.innerHTML = `
      <h3>${customer.name}</h3>
      <div class="drawer-block">
        <div><strong>Email:</strong> ${customer.email || "—"}</div>
        <div><strong>Phone:</strong> ${customer.phone || phoneInOrder}</div>
        <div><strong>Address:</strong> ${customer.address || addrInOrder}</div>
        <div><strong>Joined:</strong> ${new Date(
          customer.createdAt
        ).toLocaleString()}</div>
        <div><strong>Total Orders:</strong> ${customer.totalOrders}</div>
        <div><strong>Total Spent:</strong> ${fmtMoney(
          customer.totalSpent
        )}</div>
      </div>
      <h4>Recent Orders</h4>
      <div class="drawer-orders">
        ${
          orders && orders.length
            ? orders
                .map(
                  (o) => `
        <div class="drawer-order">
          <div>#${o.orderNumber}</div>
          <div>${fmtMoney(o.total)}</div>
          <div>${o.status}</div>
          <div>${new Date(o.createdAt).toLocaleString()}</div>
        </div>
        `
                )
                .join("")
            : "<div>No orders yet.</div>"
        }
      </div>
      `;
      els.drawer.classList.remove("hidden");
    } catch (e) {
      console.error("Open drawer error:", e);
      // Optional: surface a toast if you have one
      try {
        window.app?.showNotification?.(String(e.message || e), true);
      } catch {}
    }
  }

  function closeDrawer() {
    if (els.drawer) els.drawer.classList.add("hidden");
  }

  function bindUI() {
    if (els.drawerClose) {
      els.drawerClose.addEventListener("click", closeDrawer);
    }

    if (els.search) {
      els.search.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          state.search = els.search.value.trim();
          state.page = 1;
          load();
        }, 250);
      });
    }

    if (els.filter) {
      els.filter.addEventListener("change", () => {
        state.filter = els.filter.value;
        state.page = 1;
        load();
      });
    }

    if (els.sort) {
      els.sort.addEventListener("change", () => {
        state.sort = els.sort.value;
        state.page = 1;
        load();
      });
    }

    // Hook into sidebar if available
    const customersItem = document.querySelector(
      'aside.sidebar [data-section="customers"]'
    );
    if (customersItem) {
      customersItem.addEventListener("click", () => {
        // If your main admin.js toggles sections by data-section,
        // we simply ensure our section is visible then load:
        if (els.section) {
          // Show our section and trigger load when it becomes visible
          load();
        }
      });
    }

    // Live update: pick up socket "stats-update" if your main admin.js exposes one
    // Fallback: poll today's new customers once on load
    if (els.newCustomersStat) {
      fetch("/api/admin/customers/stats/today", {
        credentials: "include",
        headers: { ...authHeaders() },
      })
        .then((r) => r.json())
        .then((j) => {
          if (j?.success && typeof j.newCustomers === "number") {
            els.newCustomersStat.textContent = String(j.newCustomers);
          }
        })
        .catch(() => {});
    }
  }

  function init() {
    if (!$("#customers-section")) return; // page not on customers-enabled admin
    bindUI();
    // If customers section is the current one, load immediately:
    if ($("#customers-section.content-section.active")) {
      load();
    }
  }

  return { init, load };
})();

document.addEventListener("DOMContentLoaded", () => {
  Customers.init();
});
