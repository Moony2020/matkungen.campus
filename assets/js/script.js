"use strict";
let cart = null;

// delivery fee rules (shared by checkout, payment, confirmation, print)
const BASE_DELIVERY_FEE = 20; // kr
const FREE_DELIVERY_MIN = 100; // free delivery from 100 kr

// ==================== GLOBAL VARIABLES ====================
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");

  // Use same-origin in prod, localhost in dev
  const SOCKET_URL =
    location.hostname === "localhost" ||
    location.hostname.startsWith("192.168.")
      ? "http://localhost:4000"
      : location.origin; // e.g. https://matkungen-campus.onrender.com

  const socket = io(SOCKET_URL, {
    transports: ["websocket", "polling"], // try WS first, fall back if needed
    withCredentials: true,
    auth: { token: localStorage.getItem("token") },
  });

  // Store socket globally if needed
  window.socket = socket;

  socket.on("connect", () => {
    console.log("🔌 Connected to server as", socket.id);

    const userId = localStorage.getItem("userId");
    if (userId) {
      socket.emit("joinUserRoom", userId);
    }
  });

  // Reattach your existing listeners here
  socket.on("orderUpdate", (order) => {
    console.log("Order updated:", order);
    updateOrderStatusUI(order);
  });

  socket.on("driverLocationUpdate", (location) => {
    console.log("Driver moved:", location);
    updateDriverLocationUI(location);
  });

  socket.on("newOrderNotification", (order) => {
    console.log("New order received:", order);
    showNewOrderToast(order);
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected from server");
  });
});

// ==================== GENERAL UTILITIES ====================
document.addEventListener("DOMContentLoaded", function () {
  // Preloader
  const preloader = document.querySelector("[data-preaload]");
  if (preloader) {
    window.addEventListener("load", function () {
      preloader.classList.add("loaded");
      document.body.classList.add("loaded");
    });
  }

  // ==================== NAVIGATION ====================
  const navbar = document.querySelector("[data-navbar]");
  const overlay = document.querySelector("[data-overlay]");
  const navTogglers = document.querySelectorAll("[data-nav-toggler]");

  const closeNavbar = function () {
    navbar.classList.remove("active");
    overlay.classList.remove("active");
    document.body.classList.remove("nav-active");
  };

  // 1. Toggle button open/close
  navTogglers.forEach((toggler) => {
    toggler.addEventListener("click", () => {
      navbar.classList.toggle("active");
      overlay.classList.toggle("active");
      document.body.classList.toggle("nav-active");
    });
  });

  // ✅ 2. Overlay click closes navbar
  if (overlay) {
    overlay.addEventListener("click", closeNavbar);
  }

  // ✅ 3. Clicking on any link closes navbar
  document.querySelectorAll(".navbar-link").forEach((link) => {
    link.addEventListener("click", closeNavbar);
  });

  // ==================== HEADER & SCROLL ====================
  const header = document.querySelector("[data-header]");
  const scrollTopBtn = document.getElementById("scroll-top");

  if (header && scrollTopBtn) {
    let lastScrollPos = 0;

    const hideHeader = function () {
      const isScrollBottom = lastScrollPos < window.scrollY;
      if (isScrollBottom) {
        header.classList.add("hide");
      } else {
        header.classList.remove("hide");
      }
      lastScrollPos = window.scrollY;
    };

    window.addEventListener("scroll", function () {
      const userSidebar = document.querySelector(".user-sidebar");
      const isUserSidebarOpen = userSidebar?.classList.contains("open");

      // Do NOT hide header if user-sidebar is open
      if (!isUserSidebarOpen) {
        if (window.scrollY >= 100) {
          header.classList.add("active");
          scrollTopBtn.classList.add("active");
          hideHeader();
        } else {
          header.classList.remove("active");
          scrollTopBtn.classList.remove("active");
        }
      }
    });

    scrollTopBtn.addEventListener("click", function (event) {
      event.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  }

  // ==================== HERO SLIDER ====================
  const heroSlider = document.querySelector("[data-hero-slider]");
  const heroSliderItems = document.querySelectorAll("[data-hero-slider-item]");
  const prevBtn = document.getElementById("prev-slide");
  const nextBtn = document.getElementById("next-slide");

  if (heroSlider && heroSliderItems.length && prevBtn && nextBtn) {
    let currentSlidePos = 0;
    let lastActiveSliderItem = heroSliderItems[0];

    const updateSliderPos = function () {
      lastActiveSliderItem.classList.remove("active");
      heroSliderItems[currentSlidePos].classList.add("active");
      lastActiveSliderItem = heroSliderItems[currentSlidePos];
    };

    const slideNext = function () {
      if (currentSlidePos >= heroSliderItems.length - 1) {
        currentSlidePos = 0;
      } else {
        currentSlidePos++;
      }
      updateSliderPos();
    };

    nextBtn.addEventListener("click", slideNext);

    const slidePrev = function () {
      if (currentSlidePos <= 0) {
        currentSlidePos = heroSliderItems.length - 1;
      } else {
        currentSlidePos--;
      }
      updateSliderPos();
    };

    prevBtn.addEventListener("click", slidePrev);

    let autoSlideInterval;

    const autoSlide = function () {
      autoSlideInterval = setInterval(function () {
        slideNext();
      }, 7000);
    };

    prevBtn.addEventListener("mouseover", function () {
      clearInterval(autoSlideInterval);
    });
    nextBtn.addEventListener("mouseover", function () {
      clearInterval(autoSlideInterval);
    });

    prevBtn.addEventListener("mouseout", autoSlide);
    nextBtn.addEventListener("mouseout", autoSlide);

    window.addEventListener("load", autoSlide);
  }
  // ==================== PRELOADER ====================

  const preload = document.querySelector(".preload");
  const content = document.querySelector("main, body");
  const progressBar = document.getElementById("progress-bar");

  const skipPreload = sessionStorage.getItem("skipPreload");
  const shortPreload = sessionStorage.getItem("shortPreload");

  if (!preload || !progressBar) {
    // No preloader found on this page, do nothing
  } else if (skipPreload === "true") {
    // Skip preloader completely
    preload.style.display = "none";
    if (content) content.style.display = "block";
    sessionStorage.removeItem("skipPreload");
  } else if (shortPreload === "true") {
    // Quick preloader animation
    preload.classList.add("loaded");
    setTimeout(() => {
      preload.style.display = "none";
      if (content) content.style.display = "block";
      sessionStorage.removeItem("shortPreload");
    }, 800);
  } else {
    // Full simulated loading process
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => {
          if (preload) preload.classList.add("loaded");
          setTimeout(() => {
            if (preload) preload.style.display = "none";
            if (content) content.style.display = "block";
          }, 800);
        }, 200);
      }
      if (progressBar) {
        progressBar.style.width = `${progress}%`;
      }
    }, 150);
  }

  // ==================== PARALLAX EFFECT ====================
  const parallaxItems = document.querySelectorAll("[data-parallax-item]");

  if (parallaxItems.length) {
    let x, y;

    window.addEventListener("mousemove", function (event) {
      x = (event.clientX / window.innerWidth) * 10 - 5;
      y = (event.clientY / window.innerHeight) * 10 - 5;

      x = x - x * 2;
      y = y - y * 2;

      for (let i = 0, len = parallaxItems.length; i < len; i++) {
        x = x * Number(parallaxItems[i].dataset.parallaxSpeed);
        y = y * Number(parallaxItems[i].dataset.parallaxSpeed);
        parallaxItems[i].style.transform = `translate3d(${x}px, ${y}px, 0px)`;
      }
    });
  }

  // ==================== RIPPLE EFFECT ====================
  document.querySelectorAll(".service-card").forEach((card) => {
    card.addEventListener("click", function (e) {
      const ripple = document.createElement("span");
      ripple.classList.add("ripple");
      ripple.style.left = `${e.clientX - card.getBoundingClientRect().left}px`;
      ripple.style.top = `${e.clientY - card.getBoundingClientRect().top}px`;
      this.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });

  // ==================== SHOPPING CART ====================

  class Cart {
    constructor() {
      this.cart = JSON.parse(localStorage.getItem("cart")) || [];
      this.initCart();
    }

    initCart() {
      this.updateCart();
      this.setupEventListeners();
    }

    setupEventListeners() {
      // Cart toggle functionality
      const cartBtn = document.getElementById("cart-trigger");
      const cartSidebar = document.querySelector(".cart-sidebar");
      const cartOverlay = document.querySelector(".cart-overlay");
      const closeCartBtn = document.querySelector(".close-cart");

      if (cartBtn && cartSidebar && cartOverlay && closeCartBtn) {
        cartBtn.addEventListener("click", () => {
          cartSidebar.classList.add("open");
          cartOverlay.classList.add("open");
          document.body.classList.add("cart-active"); // Add class to body for styling
        });

        closeCartBtn.addEventListener("click", () => {
          cartSidebar.classList.remove("open");
          cartOverlay.classList.remove("open");
          document.body.classList.remove("cart-active"); // Remove class from body
        });

        cartOverlay.addEventListener("click", () => {
          cartSidebar.classList.remove("open");
          cartOverlay.classList.remove("open");
          document.body.classList.remove("cart-active"); // Remove class from body
        });
      }

      // Checkout button validation
      document.addEventListener("click", (e) => {
        if (
          e.target.classList.contains("checkout-btn") ||
          e.target.closest(".checkout-btn")
        ) {
          if (this.cart.length === 0) {
            e.preventDefault();
            this.showNotification("Your cart is empty", true);
          }
        }
      });
    }

    addItem(product) {
      // Create a unique identifier based on name and price
      const itemKey = `${product.name}-${product.price}`;

      const existingItem = this.cart.find(
        (item) => `${item.name}-${item.price}` === itemKey
      );

      if (existingItem) {
        existingItem.quantity++;
      } else {
        // Add the new item with all properties
        this.cart.push({
          ...product,
          id: Date.now(), // Add unique ID
          quantity: 1, // Initialize quantity
        });
      }

      this.saveCart();
      this.updateCart();
    }

    removeItem(itemId) {
      this.cart = this.cart.filter((item) => item.id !== itemId);
      this.saveCart();
      this.updateCart();
    }

    updateQuantity(itemId, newQuantity) {
      const item = this.cart.find((item) => item.id === itemId);
      if (item) {
        if (newQuantity > 0) {
          item.quantity = newQuantity;
        } else {
          this.cart = this.cart.filter((item) => item.id !== itemId);
        }
        this.saveCart();
        this.updateCart();
      }
    }

    saveCart() {
      localStorage.setItem("cart", JSON.stringify(this.cart));
    }

    clearCart() {
      this.cart = [];
      this.saveCart();
      this.updateCart();
    }

    updateCart() {
      const cartItemsContainer = document.querySelector(".cart-items");
      const cartCount = document.querySelector(".cart-count");
      const subtotalPrice = document.querySelector(".subtotal-price");

      // Update cart count
      if (cartCount) {
        const totalItems = this.cart.reduce(
          (total, item) => total + item.quantity,
          0
        );
        cartCount.textContent = totalItems;
      }

      // Update cart items
      if (cartItemsContainer) {
        if (this.cart.length === 0) {
          cartItemsContainer.innerHTML = `
            <div class="empty-cart">
              <i class="ri-shopping-cart-line"></i>
              <p>Your cart is empty</p>
            </div>
          `;
        } else {
          // In Cart class updateCart() method
          cartItemsContainer.innerHTML = this.cart
            .map(
              (item) => `
  <div class="cart-item" data-id="${item.id}">
    <img src="${item.img}" alt="${item.name}" width="70" height="70">
    <div class="item-details">
      <h4>${item.name.split(" with ")[0]}</h4>
      ${
        item.name.includes(" with ")
          ? `<div class="item-modifiers">${
              // Clean up modifier text
              item.name
                .split(" with ")[1]
                .replace(/\(0 kr\)/g, "") // Remove (0 kr)
                .replace(/, $/, "") // Remove trailing commas
            }</div>`
          : ""
      }
      <div class="item-price">${item.price} kr</div>
      <div class="item-quantity">
        <button class="decrease-quantity">-</button>
        <span>${item.quantity}</span>
        <button class="increase-quantity">+</button>
      </div>
    </div>
    <button class="remove-item"><i class="ri-close-line"></i></button>
  </div>
`
            )
            .join("");
        }
      }

      // Update subtotal
      if (subtotalPrice) {
        const subtotal = this.cart.reduce(
          (total, item) => total + item.price * item.quantity,
          0
        );
        subtotalPrice.textContent = `${subtotal.toFixed(2)} kr`;
      }

      // Add event listeners to cart buttons
      document.querySelectorAll(".remove-item").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const itemId = parseInt(e.target.closest(".cart-item").dataset.id);
          this.removeItem(itemId);
        });
      });

      document.querySelectorAll(".increase-quantity").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const itemId = parseInt(e.target.closest(".cart-item").dataset.id);
          const item = this.cart.find((item) => item.id === itemId);
          if (item) this.updateQuantity(itemId, item.quantity + 1);
        });
      });

      document.querySelectorAll(".decrease-quantity").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const itemId = parseInt(e.target.closest(".cart-item").dataset.id);
          const item = this.cart.find((item) => item.id === itemId);
          if (item) this.updateQuantity(itemId, item.quantity - 1);
        });
      });
    }

    showNotification(message, isError = false) {
      const notification = document.createElement("div");
      notification.className = `notification ${isError ? "error" : ""}`;
      notification.innerHTML = `
        <span>${message}</span>
      `;
      document.body.appendChild(notification);

      setTimeout(() => {
        notification.classList.add("fade-out");
        setTimeout(() => notification.remove(), 300);
      }, 2000);
    }

    async submitOrder(orderData) {
      try {
        const token = localStorage.getItem("authToken");
        const headers = {
          "Content-Type": "application/json",
        };

        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch("/api/orders", {
          method: "POST",
          headers: headers,
          body: JSON.stringify(orderData),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Order submission failed");
        }

        return data;
      } catch (error) {
        console.error("Order submission error:", error);
        this.showNotification("Failed to submit order", true);
        return null;
      }
    }
  }

  // Initialize cart
  cart = new Cart();

  /* ===================== OPENING HOURS ENFORCEMENT (CLIENT) =====================

Hours map: 0=Sun, 1=Mon, ... 6=Sat
- Use { overnight:true } when end time is after midnight (e.g., 03:00 next day)
- Times are in minutes from midnight (local user time)

Your hours:
Mon, Tue, Thu: 11:00–22:00
Wed, Fri:      11:00–03:00 (overnight)
Sat:           12:00–03:00 (overnight)
Sun:           12:00–22:00
*/
  const OPENING_HOURS = {
    0: [{ start: 12 * 60, end: 3 * 60, overnight: true }], // Sun 12:00–22:00
    1: [{ start: 11 * 60, end: 3 * 60, overnight: true }], // Mon 11:00–22:00
    2: [{ start: 11 * 60, end: 3 * 60, overnight: true }], // Tue 11:00–22:00
    3: [{ start: 10 * 60, end: 22 * 60 }], // Wed 11:00–03:00 (Thu)
    4: [{ start: 11 * 60, end: 3 * 60, overnight: true }], // Thu 11:00–22:00
    5: [{ start: 9 * 60, end: 3 * 60, overnight: true }], // Fri 11:00–03:00 (Sat)
    6: [{ start: 12 * 60, end: 3 * 60, overnight: true }], // Sat 12:00–03:00 (Sun)
  };

  function minutesNow() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
  function today() {
    return new Date().getDay();
  }
  function prevDay(d) {
    return (d + 6) % 7;
  }

  function isOpenNow() {
    const d = today();
    const m = minutesNow();

    // today's intervals
    const todayIntervals = OPENING_HOURS[d] || [];
    for (const itv of todayIntervals) {
      if (!itv.overnight) {
        if (m >= itv.start && m < itv.end) return true;
      } else {
        // same-day part: from start until midnight
        if (m >= itv.start) return true;
      }
    }

    // spillover from previous day
    const pd = prevDay(d);
    const prevIntervals = OPENING_HOURS[pd] || [];
    for (const itv of prevIntervals) {
      if (itv.overnight && m < itv.end) return true;
    }

    return false;
  }

  function updateOpenStateUI() {
    const open = isOpenNow();

    // Disable order-related buttons when closed
    document
      .querySelectorAll(".add-to-cart-btn, .make-order-btn, .checkout-btn")
      .forEach((b) => {
        if (!b) return;
        b.disabled = !open;
        b.setAttribute("aria-disabled", String(!open));
      });

    // Optional badge
    const badge = document.querySelector("#open-status");
    if (badge) badge.textContent = open ? "Öppet nu" : "Stängt";
  }

  // Run once + every minute
  document.addEventListener("DOMContentLoaded", () => {
    updateOpenStateUI();
    initStoreStatus(); // <-- add
    updateStoreStatus(); // <-- add (first render)

    // refresh both once per minute
    setInterval(() => {
      updateOpenStateUI();
      updateStoreStatus();
    }, 60_000);
  });

  // ==================== ADD TO CART FUNCTIONALITY ====================
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".add-to-cart-btn");
    if (!btn) return;

    // 🔒 HARD GUARD: block adding when closed
    if (!isOpenNow()) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation();
      }

      if (typeof cart?.showNotification === "function") {
        cart.showNotification(
          "Vi är stängda just nu. Välkommen åter under öppettiderna."
        );
      } else {
        alert("Vi är stängda just nu. Välkommen åter under öppettiderna.");
      }
      return;
    }

    const menuItem = btn.closest(".menu-item, .menu-card1");

    // Get selected size if exists
    let selectedSize = null;
    const sizeSelector = menuItem.querySelector(".size-selector");
    if (sizeSelector) {
      const selectedRadio = sizeSelector.querySelector(
        'input[type="radio"]:checked'
      );
      if (selectedRadio) {
        const sizeLabel = selectedRadio.nextElementSibling.textContent.trim();
        const sizeMatch = sizeLabel.match(/(Small|Medium|Large)/);
        selectedSize = {
          name: sizeMatch ? sizeMatch[0] : sizeLabel.split(" ")[0],
          price: parseFloat(selectedRadio.value),
        };
      }
    }

    const menuItemId = menuItem.id;
    const menuItemData = menuItems.find((item) => item.id === menuItemId);
    const baseName =
      menuItem?.querySelector(".menu-item-title, .menu-title1")?.textContent ||
      "Unknown Item";
    const productName = selectedSize
      ? `${baseName} (${selectedSize.name})`
      : baseName;

    if (menuItemData) {
      e.preventDefault();

      const hasModifiers =
        Array.isArray(menuItemData.modifiers) &&
        menuItemData.modifiers.length > 0;

      if (!hasModifiers) {
        const product = {
          name: productName,
          price: selectedSize ? selectedSize.price : menuItemData.price,
          img: menuItemData.image || "./assets/images/default-food.jpg",
        };

        // Button Animation
        const isIconOnly = btn.classList.contains("icon-only");
        const originalContent = btn.innerHTML;
        if (isIconOnly) {
          btn.innerHTML = '<i class="ri-check-line"></i>';
        } else {
          btn.innerHTML = '<i class="ri-check-line"></i> Added';
        }
        btn.style.backgroundColor = "#4CAF50";
        setTimeout(() => {
          btn.innerHTML = originalContent;
          btn.style.backgroundColor = "var(--gold-crayola)";
        }, 1000);

        cart.addItem(product);

        // ✅ SHOW A VISIBLE MESSAGE (toast)
        cart.showNotification(`${productName} added to cart`);
        return;
      }

      // Item has modifiers → open popup
      openModifierPopup(menuItemData, productName, selectedSize);
    } else {
      // Not in menuItems fallback
      e.preventDefault(); // (safe if button is an <a>)
      const productName =
        btn.dataset.name ||
        menuItem?.querySelector(".menu-item-title, .menu-title1")
          ?.textContent ||
        "Unknown Item";

      const price = selectedSize
        ? selectedSize.price
        : parseFloat(btn.dataset.price) || 0;
      const productImg = btn.dataset.img || "./assets/images/default-food.jpg";

      const product = { name: productName, price, img: productImg };

      // same animation
      const isIconOnly = btn.classList.contains("icon-only");
      const originalContent = btn.innerHTML;
      if (isIconOnly) {
        btn.innerHTML = '<i class="ri-check-line"></i>';
      } else {
        btn.innerHTML = '<i class="ri-check-line"></i> Added';
      }
      btn.style.backgroundColor = "#4CAF50";
      setTimeout(() => {
        btn.innerHTML = originalContent;
        btn.style.backgroundColor = "var(--gold-crayola)";
      }, 1000);

      cart.addItem(product);

      // ✅ toast here too
      cart.showNotification(`${productName} added to cart`);
    }
  });
  /* ===================== CHECKOUT GUARD =====================

Prevents proceeding to payment when closed.
Attach this to your existing "Make Order" / "Checkout" buttons.
*/
  document.addEventListener("click", function (e) {
    const makeOrder = e.target.closest(".make-order-btn, .checkout-btn");
    if (!makeOrder) return;

    if (!isOpenNow()) {
      e.preventDefault();
      cart?.showNotification?.(
        "Vi är stängda just nu. Välkommen åter under öppettiderna."
      );
      return;
    }
  });
  // ==================== SIZE SELECTION FOR PIZZA ITEMS ====================
  document
    .querySelectorAll(".size-selector input[type='radio']")
    .forEach((radio) => {
      if (radio.checked) {
        updateAddToCartButton(radio);
      }

      radio.addEventListener("change", function () {
        updateAddToCartButton(this);
      });
    });

  function updateAddToCartButton(radio) {
    const menuItem = radio.closest(".menu-item");
    if (!menuItem) return;

    const btn = menuItem.querySelector(".add-to-cart-btn");
    const sizeName =
      radio.nextElementSibling.textContent.match(/(Small|Medium|Large)/)?.[0] ||
      "";
    const productName =
      menuItem.querySelector(".menu-item-title")?.textContent || "";

    if (btn && productName && sizeName) {
      btn.dataset.name = `${productName} (${sizeName})`;
      btn.dataset.price = radio.value;
    }
  }

  // ==================== SIZE SELECTION FOR TILLBEHÖR ITEMS ====================
  document
    .querySelectorAll("#addition-menu .size-selector input[type='radio']")
    .forEach((radio) => {
      if (radio.checked) {
        updateAddToCartButtonForTillbehor(radio);
      }

      radio.addEventListener("change", function () {
        updateAddToCartButtonForTillbehor(this);
      });
    });

  function updateAddToCartButtonForTillbehor(radio) {
    const menuItem = radio.closest(".menu-item");
    if (!menuItem) return;

    const btn = menuItem.querySelector(".add-to-cart-btn");
    // Extract just the quantity part (like "7st" or "14st")
    const quantityText = radio.nextElementSibling.textContent
      .trim()
      .split(" ")[0];
    const productName =
      menuItem.querySelector(".menu-item-title")?.textContent || "";

    if (btn && productName && quantityText) {
      // Format as "Product (Xst)"
      btn.dataset.name = `${productName} (${quantityText})`;
      btn.dataset.price = radio.value;
    }
  }
  // ==================== MENU CATEGORIES ====================
  document.querySelectorAll(".menu-btn").forEach((button) => {
    button.addEventListener("click", function () {
      const menuType = this.getAttribute("data-menu");

      // Hide all menu contents
      document.querySelectorAll(".menu-content").forEach((menu) => {
        menu.classList.remove("active");
      });

      // Show the selected menu
      const selectedMenu = document.getElementById(`${menuType}-menu`);
      if (selectedMenu) {
        selectedMenu.classList.add("active");
      }

      // Update active button
      document.querySelectorAll(".menu-btn").forEach((btn) => {
        btn.classList.remove("active");
      });
      this.classList.add("active");

      // Scroll to the menu section
      document.getElementById("menu").scrollIntoView({
        behavior: "smooth",
      });
    });
  });

  // ==================== PIZZA SHOW ALL FUNCTION ====================
  function showAllPizzas() {
    const pizzaContainer = document.querySelector("#pizza-menu .menu-grid");
    if (!pizzaContainer) return;

    const pizzaItems = pizzaContainer.querySelectorAll(".menu-item");

    // Show all pizza items
    pizzaItems.forEach((pizza, index) => {
      pizza.style.display = "block";
    });

    // Hide the "Show All" button after clicking
    const showAllBtn = document.getElementById("show-all-pizza-btn");
    if (showAllBtn) showAllBtn.style.display = "none";
  }

  // Initialize pizza display on page load
  const pizzaContainer = document.querySelector("#pizza-menu .menu-grid");
  if (pizzaContainer) {
    const pizzaItems = pizzaContainer.querySelectorAll(".menu-item");

    // Initially show only the first 12 pizzas
    pizzaItems.forEach((pizza, index) => {
      if (index >= 12) {
        pizza.style.display = "none";
      }
    });

    // Add event listener to the "Show All" button
    const showAllBtn = document.getElementById("show-all-pizza-btn");
    if (showAllBtn) {
      showAllBtn.addEventListener("click", showAllPizzas);
    }
  }
  // ==================== CHECKOUT PAGE FUNCTIONALITY ====================
  if (window.location.pathname.includes("checkout.html")) {
    const orderItems = document.querySelector(".order-items");
    const orderSubtotal = document.querySelector("#order-subtotal");
    const orderTotal = document.querySelector(".order-total");
    const checkoutForm = document.getElementById("checkout-form");

    let deliveryFee = BASE_DELIVERY_FEE;
    let orderType = "delivery";

    // === Elements ===
    const orderTypeSelect = document.getElementById("order-type"); // hidden/native select
    const dropdown = document.getElementById("order-type-dropdown"); // custom dropdown wrapper
    const orderTypeWrap =
      dropdown || document.querySelector(".ordertype-select") || null; // <-- define it!
    const triggerBtn = orderTypeWrap?.querySelector(".order-type-trigger");
    const labelSpan = triggerBtn?.querySelector(".label");
    const iconLeft = triggerBtn?.querySelector(".icon-left");
    const menu = orderTypeWrap?.querySelector(".order-type-menu");
    const optionsEls = menu ? Array.from(menu.querySelectorAll(".option")) : [];
    const triggerLabel = document.querySelector(
      "#order-type-dropdown .order-type-trigger .label"
    );
    if (triggerLabel) triggerLabel.title = triggerLabel.textContent.trim();

    const addressFields = document
      .getElementById("address")
      ?.closest(".form-group");
    const cityFields = document.getElementById("city")?.closest(".form-group");
    const zipFields = document.getElementById("zip")?.closest(".form-group");
    const pickupInfo = document.getElementById("pickup-info");
    const deliveryFeeElement = document.querySelector(".delivery-fee");

    // ---------- SAFE CART GETTER (no side effects) ----------
    function getCartItems() {
      if (window.cart && Array.isArray(cart.cart)) return cart.cart;
      try {
        const raw =
          localStorage.getItem("cart") || localStorage.getItem("cartItems");
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    }

    // ---------- Business logic: apply order type + update UI ----------
    function applyOrderType(value) {
      orderType = value;

      const addr = document.getElementById("address");
      const city = document.getElementById("city");
      const zip = document.getElementById("zip");

      const hideAddress = () => {
        if (addressFields) addressFields.style.display = "none";
        if (cityFields) cityFields.style.display = "none";
        if (zipFields) zipFields.style.display = "none";
        if (pickupInfo) pickupInfo.style.display = "block";

        // disable so HTML5 validation doesn't block pickup
        [addr, city, zip].forEach((el) => {
          if (!el) return;
          el.dataset.wasRequired = el.required ? "1" : "";
          el.required = false;
          el.disabled = true;
        });

        deliveryFee = 0;
        if (deliveryFeeElement) deliveryFeeElement.textContent = "Gratis";

        if (orderTypeWrap) {
          orderTypeWrap.classList.remove("is-delivery");
          orderTypeWrap.classList.add("is-pickup");
        }
        if (iconLeft) {
          iconLeft.classList.remove("ri-car-line", "ri-truck-line");
          iconLeft.classList.add("ri-store-2-line");
        }
        if (labelSpan) labelSpan.textContent = "Avhämtning – 10 min (gratis)";
      };

      const showAddress = () => {
        if (addressFields) addressFields.style.display = "block";
        if (cityFields) cityFields.style.display = "block";
        if (zipFields) zipFields.style.display = "block";
        if (pickupInfo) pickupInfo.style.display = "none";

        // re-enable + restore required exactly as before
        [addr, city, zip].forEach((el) => {
          if (!el) return;
          el.disabled = false;
          el.required = el.dataset.wasRequired === "1";
        });

        deliveryFee = 20;
        if (deliveryFeeElement) deliveryFeeElement.textContent = "20 kr";

        if (orderTypeWrap) {
          orderTypeWrap.classList.remove("is-pickup");
          orderTypeWrap.classList.add("is-delivery");
        }
        if (iconLeft) {
          iconLeft.classList.remove("ri-store-2-line");
          iconLeft.classList.add("ri-car-line");
        }
        if (labelSpan) labelSpan.textContent = "Leverans – 20–30 min (20 kr)";
      };

      if (value === "pickup") hideAddress();
      else showAddress();
      updateOrderSummary();
    }

    // ---------- Render order summary ----------
    function updateOrderSummary() {
      if (!orderItems) return;

      const items = getCartItems();
      if (!items || items.length === 0) {
        orderItems.innerHTML = "<p>Your cart is empty</p>";
        if (orderSubtotal) orderSubtotal.textContent = "0 kr";
        if (orderTotal) orderTotal.textContent = "0 kr";
        if (deliveryFeeElement) deliveryFeeElement.textContent = "0 kr";

        // NEW: clear the hint when empty
        const hint = document.getElementById("free-delivery-hint");
        if (hint) hint.textContent = "";
        return;
      }

      orderItems.innerHTML = items
        .map((item) => {
          const parts = String(item.name || "").split(" with ");
          const baseName = parts[0];
          const modifiers = parts.length > 1 ? parts[1] : null;
          const modifiersHtml = modifiers
            ? `<div class="modifiers">+ ${modifiers}</div>`
            : "";
          const line = Number(item.price || 0) * Number(item.quantity || 0);
          return `
          <div class="order-item-checkout">
            <div class="item-name">
              ${baseName}
              ${modifiersHtml}
              <span class="quantity"> ${item.quantity}</span>
            </div>
            <div class="item-price">${line.toFixed(2)} kr</div>
          </div>
        `;
        })
        .join("");

      // Calculate totals
      const subtotal = items.reduce(
        (t, it) => t + Number(it.price || 0) * Number(it.quantity || 0),
        0
      );

      // ✅ FREE DELIVERY from 100 kr for delivery orders
      const fee =
        orderType === "delivery"
          ? subtotal >= FREE_DELIVERY_MIN
            ? 0
            : BASE_DELIVERY_FEE
          : 0;

      const total = subtotal + fee;

      if (orderSubtotal)
        orderSubtotal.textContent = `${subtotal.toFixed(2)} kr`;
      if (orderTotal) orderTotal.textContent = `${total.toFixed(2)} kr`;
      if (deliveryFeeElement)
        deliveryFeeElement.textContent =
          fee === 0 ? "Gratis" : `${fee.toFixed(2)} kr`;

      // NEW: update the “free delivery” hint
      const hint = document.getElementById("free-delivery-hint");
      if (hint) {
        if (orderType === "delivery" && subtotal < FREE_DELIVERY_MIN) {
          const diff = (FREE_DELIVERY_MIN - subtotal).toFixed(2);
          hint.textContent = `Gratis leverans från 100 kr (saknas ${diff} kr)`;
        } else if (orderType === "delivery") {
          hint.textContent = `Fri leverans aktiverad 🎉`;
        } else {
          hint.textContent = "";
        }
      }
    }

    // ---------- Custom dropdown wiring ----------
    function setAriaSelected(value) {
      optionsEls.forEach((li) =>
        li.setAttribute(
          "aria-selected",
          li.dataset.value === value ? "true" : "false"
        )
      );
    }
    function selectOption(value) {
      if (orderTypeSelect) orderTypeSelect.value = value; // sync hidden/native select
      setAriaSelected(value);
      applyOrderType(value);
      closeMenu();
    }
    function openMenu() {
      if (!orderTypeWrap) return;
      orderTypeWrap.classList.add("open");
      triggerBtn?.setAttribute("aria-expanded", "true");
    }
    function closeMenu() {
      if (!orderTypeWrap) return;
      orderTypeWrap.classList.remove("open");
      triggerBtn?.setAttribute("aria-expanded", "false");
    }

    triggerBtn?.addEventListener("click", () => {
      if (orderTypeWrap.classList.contains("open")) closeMenu();
      else openMenu();
    });
    document.addEventListener("click", (e) => {
      if (orderTypeWrap && !orderTypeWrap.contains(e.target)) closeMenu();
    });
    optionsEls.forEach((li) => {
      li.addEventListener("click", () => selectOption(li.dataset.value));
    });

    // Fallback: native <select> change
    orderTypeSelect?.addEventListener("change", (e) => {
      const v = e.target.value;
      setAriaSelected(v);
      applyOrderType(v);
    });

    // ---------- Form submit ( uses safe getter) ----------
    if (checkoutForm) {
      checkoutForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const items = getCartItems();
        if (!items || items.length === 0) {
          if (window.cart && typeof cart.showNotification === "function") {
            cart.showNotification("Your cart is empty", true);
          } else {
            alert("Your cart is empty");
          }
          return;
        }

        const selectedOrderType = orderTypeSelect
          ? orderTypeSelect.value
          : "delivery";

        const name = document.getElementById("name")?.value || "";
        const email = document.getElementById("email")?.value || "";
        const phone = document.getElementById("phone")?.value || "";

        let address = "",
          zip = "",
          city = "";
        if (selectedOrderType === "delivery") {
          address = document.getElementById("address")?.value || "";
          zip = document.getElementById("zip")?.value || "";
          city = document.getElementById("city")?.value || "";
        }

        const notes = document.getElementById("notes")?.value || "";

        if (!name || !email || !phone) {
          cart.showNotification?.("Please fill in all required fields", true);
          return;
        }
        if (selectedOrderType === "delivery" && (!address || !zip || !city)) {
          cart.showNotification?.(
            "Please fill in all address fields for delivery",
            true
          );
          return;
        }

        const subtotal = items.reduce(
          (t, it) => t + Number(it.price || 0) * Number(it.quantity || 0),
          0
        );
        const appliedDeliveryFee =
          selectedOrderType === "delivery"
            ? subtotal >= FREE_DELIVERY_MIN
              ? 0
              : BASE_DELIVERY_FEE
            : 0;
        const total = subtotal + appliedDeliveryFee;

        const orderData = {
          orderType: selectedOrderType,
          customer: {
            name,
            email,
            phone,
            address:
              selectedOrderType === "delivery"
                ? `${address}, ${zip} ${city}`
                : "Avhämtning",
            notes,
          },
          items: items.map((it) => ({
            name: it.name,
            price: it.price,
            quantity: it.quantity,
            img: it.img || "",
          })),
          subtotal,
          deliveryFee: appliedDeliveryFee,
          total,
          paymentMethod: "Pending",
        };

        const currentUser = JSON.parse(localStorage.getItem("currentUser"));
        if (currentUser) orderData.user = currentUser.id;

        localStorage.setItem("pendingOrder", JSON.stringify(orderData));
        window.location.href = "payment.html";
      });
    }

    // ---------- Init ----------
    const initialValue = orderTypeSelect?.value || "delivery";
    setAriaSelected(initialValue);
    applyOrderType(initialValue); // sets fee + shows/hides address + totals
    updateOrderSummary(); // render items
  }

  // ==================== PAYMENT PAGE LOGIC ====================
  if (document.querySelector(".payment-page")) {
    // Get the pending order from localStorage
    const pendingOrder = JSON.parse(localStorage.getItem("pendingOrder"));

    if (!pendingOrder) {
      console.warn("No pending order found, redirecting to home");
      window.location.href = "index.html";
      return;
    }

    // Calculate total in cents (öre)
    const total = Math.round(pendingOrder.total * 100);

    // Initialize payment methods with the pending order data
    initializePaymentMethods(pendingOrder, total);

    // Render order summary
    renderOrderSummary(pendingOrder);
  }

  async function initializePaymentMethods(pendingOrder, total) {
    try {
      // 1. Fetch payment configuration from server
      const configResponse = await fetch("/config");
      const config = await configResponse.json();

      if (!config.stripePublishableKey || !config.paypalClientId) {
        throw new Error("Payment configuration incomplete");
      }

      // 2. Dynamically load PayPal SDK
      const paypalSDK = document.createElement("script");
      paypalSDK.src = `https://www.paypal.com/sdk/js?client-id=${config.paypalClientId}&currency=SEK`;
      document.head.appendChild(paypalSDK);

      // 3. Initialize Stripe
      const stripe = Stripe(config.stripePublishableKey);
      const elements = stripe.elements();
      const cardElement = elements.create("card", {
        style: {
          base: {
            fontSize: "16px",
            color: "#32325d",
            "::placeholder": { color: "#aab7c4" },
          },
          invalid: { color: "#fa755a", iconColor: "#fa755a" },
        },
        hidePostalCode: true,
      });
      cardElement.mount("#card-element");

      // 4. Payment method selection UI
      const paymentOptions = document.querySelectorAll(".payment-option");
      const paymentForms = {
        card: document.getElementById("card-form"),
        paypal: document.getElementById("paypal-button-container"),
        swish: document.getElementById("swish-form"),
        cash: document.getElementById("cash-form"),
      };

      paymentOptions.forEach((option) => {
        option.addEventListener("click", () => {
          paymentOptions.forEach((opt) => opt.classList.remove("active"));
          option.classList.add("active");

          Object.values(paymentForms).forEach((form) =>
            form.classList.add("hidden")
          );
          paymentForms[option.dataset.method].classList.remove("hidden");
        });
      });

      // Set default to card payment
      paymentOptions[0].click();

      // Payment success handler
      async function handlePaymentSuccess(paymentMethod) {
        try {
          // Add payment method to pending order
          pendingOrder.paymentMethod = paymentMethod;

          // Create order in database AFTER payment success
          const response = await fetch("/api/orders", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${
                localStorage.getItem("authToken") || ""
              }`,
            },
            body: JSON.stringify(pendingOrder),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Order creation failed");
          }

          // Store completed order and clear pending
          localStorage.setItem("currentOrder", JSON.stringify(data.order));
          localStorage.removeItem("pendingOrder");

          // Clear cart only after successful order creation
          const cart = JSON.parse(localStorage.getItem("cart")) || [];
          if (cart.length > 0) {
            localStorage.removeItem("cart");
          }

          // Redirect to confirmation
          window.location.href = "confirmation.html";
        } catch (error) {
          console.error("Order creation failed:", error);
          alert("Failed to create order: " + error.message);
        }
      }

      // 5. Stripe Payment Handler (requires an <input id="card-name">)
      document
        .getElementById("stripe-pay-btn")
        ?.addEventListener("click", async (e) => {
          e.preventDefault();

          const nameEl = document.getElementById("card-name");
          const cardholderName = (nameEl?.value || "").trim();
          const errEl = document.getElementById("card-errors");
          errEl.textContent = "";

          // Require name
          if (!cardholderName) {
            errEl.textContent = "Please enter the cardholder name.";
            nameEl?.focus();
            return;
          }

          // Create a PaymentMethod with the name
          const { error: pmError, paymentMethod } =
            await stripe.createPaymentMethod({
              type: "card",
              card: cardElement, // your initialized Stripe Element
              billing_details: { name: cardholderName },
            });

          if (pmError) {
            errEl.textContent = pmError.message;
            return;
          }

          try {
            // Ask your server to create a PaymentIntent and enforce name presence there too
            const res = await fetch("/create-payment-intent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                amount: total, // make sure this is in öre (e.g., 95.00 kr => 9500)
                cardholderName, // server can validate it's not empty
              }),
            });

            const data = await res.json();
            if (!res.ok || data.error) {
              throw new Error(data.error || "Failed to create payment intent.");
            }

            // Confirm the payment using the PaymentMethod we just created
            const { error: confirmError, paymentIntent } =
              await stripe.confirmCardPayment(data.clientSecret, {
                payment_method: paymentMethod.id,
              });

            if (confirmError) throw confirmError;

            if (paymentIntent?.status === "succeeded") {
              await handlePaymentSuccess("Credit Card");
            }
          } catch (err) {
            errEl.textContent =
              err.message ||
              "Something went wrong while processing the payment.";
          }
        });

      // 6. PayPal Payment Handler
      paypalSDK.onload = () => {
        if (!document.getElementById("paypal-button-container")) return;

        paypal
          .Buttons({
            createOrder: (data, actions) => {
              return fetch("/create-paypal-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount: (total / 100).toFixed(2) }),
              })
                .then((res) => res.json())
                .then((data) => data.orderID);
            },
            onApprove: async (data, actions) => {
              try {
                const response = await fetch("/capture-paypal-order", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ orderID: data.orderID }),
                });
                const details = await response.json();
                await handlePaymentSuccess("PayPal");
              } catch (err) {
                console.error("PayPal error:", err);
                alert(`Payment failed: ${err.message}`);
              }
            },
            onError: (err) => {
              console.error("PayPal error:", err);
              alert(`Payment failed: ${err.message}`);
            },
          })
          .render("#paypal-button-container");
      };

      // 7. Cash payment handler
      document
        .getElementById("confirm-cash")
        ?.addEventListener("click", async () => {
          await handlePaymentSuccess("Cash on Delivery");
        });

      // 8. Swish payment handler
      document
        .querySelector("#swish-form button")
        ?.addEventListener("click", async () => {
          await handlePaymentSuccess("Swish");
        });
    } catch (err) {
      console.error("Payment initialization failed:", err);
      alert("Failed to initialize payment methods. Please try again.");
    }
  }
  async function updateOrder(updatedOrder) {
    try {
      const token = localStorage.getItem("authToken");
      const headers = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/orders/${updatedOrder.orderNumber}`, {
        method: "PUT",
        headers: headers,
        body: JSON.stringify(updatedOrder),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update order");
      }

      // Update local storage with the updated order
      localStorage.setItem("currentOrder", JSON.stringify(updatedOrder));

      return data.order;
    } catch (error) {
      console.error("Order update error:", error);
      throw error;
    }
  }

  function renderOrderSummary(order) {
    const orderItemsContainer = document.querySelector(".order-items");
    const orderSubtotalEl = document.querySelector("#order-subtotal");
    const orderTotalEl = document.querySelector(".order-total");
    const deliveryFeeEl = document.querySelector(".delivery-fee"); // inside #delivery-fee-row

    if (
      !orderItemsContainer ||
      !orderSubtotalEl ||
      !orderTotalEl ||
      !order?.items
    )
      return;

    // Clear
    orderItemsContainer.innerHTML = "";
    // Render each item (with the gold quantity badge)
    order.items.forEach((item) => {
      const parts = (item.name || "").split(" with ");
      const baseName = parts[0];
      const modifiers = parts.length > 1 ? parts[1] : null;
      const modifiersHtml = modifiers
        ? `<div class="modifiers">+ ${modifiers
            .replace(/\(0 kr\)/g, "")
            .replace(/, $/, "")}</div>`
        : "";

      const line = Number(item.price || 0) * Number(item.quantity || 0);
      const el = document.createElement("div");
      el.className = "order-item";
      el.innerHTML = `
      <div class="item-name">
        ${baseName}
        ${modifiersHtml}
        <span class="quantity">${item.quantity}</span>
      </div>
      <div class="item-price">${line.toFixed(2)} kr</div>
    `;
      orderItemsContainer.appendChild(el);
    });

    // Totals (respect orderType)
    const subtotal = order.items.reduce(
      (s, i) => s + Number(i.price || 0) * Number(i.quantity || 0),
      0
    );
    // fee: if pickup => 0, else use provided fee (number/string) or fallback 20
    const fee =
      order.orderType === "pickup"
        ? 0
        : subtotal >= FREE_DELIVERY_MIN
        ? 0
        : Number(order.deliveryFee ?? BASE_DELIVERY_FEE);

    const total = subtotal + fee;

    // Update DOM
    orderSubtotalEl.textContent = `${subtotal.toFixed(2)} kr`;
    orderTotalEl.textContent = `${total.toFixed(2)} kr`;

    if (deliveryFeeEl) {
      deliveryFeeEl.textContent = fee === 0 ? "Gratis" : `${fee.toFixed(2)} kr`;
    }
  }

  // ==================== RENDER ORDER SUMMARY (Payment Page) ====================
  function renderPaymentOrderSummary(orderData) {
    const orderItemsContainer = document.querySelector(
      ".payment-page .order-items"
    );
    if (!orderItemsContainer || !orderData || !orderData.items) return;

    orderItemsContainer.innerHTML = "";

    orderData.items.forEach((item) => {
      const itemDiv = document.createElement("div");
      itemDiv.classList.add("order-item");

      itemDiv.innerHTML = `
      <img src="${item.image}" alt="${item.name}">
      <div class="item-details">
        <div class="item-name">
          ${item.name} <span class="quantity">${item.quantity}</span>
        </div>
        <div class="item-price">${(item.price * item.quantity).toFixed(
          2
        )} kr</div>
      </div>
    `;
      orderItemsContainer.appendChild(itemDiv);
    });
  }

  // ==================== RENDER ORDER SUMMARY (Confirmation Page) ====================
  function renderConfirmationOrderSummary(orderData) {
    const orderItemsContainer = document.querySelector(
      ".confirmation-page .order-items"
    );
    if (!orderItemsContainer || !orderData || !orderData.items) return;

    orderItemsContainer.innerHTML = "";

    orderData.items.forEach((item) => {
      const itemDiv = document.createElement("div");
      itemDiv.classList.add("order-item");

      itemDiv.innerHTML = `
      <img src="${item.image}" alt="${item.name}">
      <div class="item-details">
        <div class="item-name">
          ${item.name} <span class="quantity">${item.quantity}</span>
        </div>
        <div class="item-price">${(item.price * item.quantity).toFixed(
          2
        )} kr</div>
      </div>
    `;
      orderItemsContainer.appendChild(itemDiv);
    });
  }

  // ==================== CONFIRMATION PAGE FUNCTIONALITY ====================
  if (document.querySelector(".confirmation-page")) {
    const currentOrder = JSON.parse(localStorage.getItem("currentOrder")) || {};
    if (!currentOrder || !currentOrder.items) {
      console.warn("No valid order found, redirecting to home");
      window.location.href = "index.html";
      return;
    }

    // --- Store pickup constants ---
    const STORE_NAME = "Matkungen";
    const STORE_ADDRESS = "P G Vejdes väg, 352 52 Växjö";
    const STORE_PHONE = "0769 666 666";

    // Robust pickup detection
    // script.js (confirmation page + print receipt)
    const isPickup =
      /pickup/i.test(
        String(currentOrder.fulfillmentMethod || currentOrder.orderType || "")
      ) || /avh[aä]mtning/i.test(currentOrder.customer?.address || "");

    // Basic details
    const pmEl = document.getElementById("payment-method");
    const noEl = document.getElementById("order-number");
    const mailEl = document.getElementById("customer-email");
    pmEl && (pmEl.textContent = currentOrder.paymentMethod || "Not specified");
    noEl && (noEl.textContent = currentOrder.orderNumber || "N/A");
    mailEl &&
      (mailEl.textContent = currentOrder.customer?.email || "Not provided");

    // Totals (Gratis for pickup / free delivery over 100)
    const subtotal = Number(currentOrder.subtotal ?? 0);
    const fee = isPickup
      ? 0
      : subtotal >= FREE_DELIVERY_MIN
      ? 0
      : Number(currentOrder.deliveryFee ?? BASE_DELIVERY_FEE);
    const total = subtotal + fee;

    const subEl = document.getElementById("order-subtotal");
    const feeEl = document.getElementById("delivery-fee");
    const totEl = document.getElementById("order-total");
    subEl && (subEl.textContent = `${subtotal.toFixed(2)} kr`);
    feeEl &&
      (feeEl.textContent = fee === 0 ? "Gratis" : `${fee.toFixed(2)} kr`);
    totEl && (totEl.textContent = `${total.toFixed(2)} kr`);

    // Heading + ETA (label & value)
    const deliveryHeader = document.querySelector(".delivery-info h2");
    if (deliveryHeader) {
      deliveryHeader.textContent = isPickup
        ? "Upphämtningsinformation"
        : "Leveransinformation";
    }

    const etaEl = document.getElementById("delivery-time");
    if (etaEl) {
      // value
      etaEl.textContent = isPickup ? "10 minuter" : "20-35 minuter";

      // label (left side)
      const etaRow = etaEl.closest(".detail-row");
      if (etaRow) {
        const labelSpan = etaRow.querySelector("span:first-child");
        if (labelSpan) {
          labelSpan.innerHTML = `<strong>${
            isPickup ? "Beräknad tid" : "Beräknad leveranstid"
          }:</strong>`;
        }
      }
    }

    // Customer / pickup details
    const details = document.getElementById("customer-details");
    if (details && currentOrder.customer) {
      const { name, phone, address, notes } = currentOrder.customer;
      details.innerHTML = isPickup
        ? `
        <p><strong>Namn:</strong> ${name || "N/A"}</p>
        <p><strong>Telefon:</strong> ${phone || "N/A"}</p>
        <p><strong>Upphämtningsställe:</strong> ${STORE_NAME}</p>
        <p><strong>Adress:</strong> ${STORE_ADDRESS}</p>
        <p><strong>Restaurangens telefon:</strong> ${STORE_PHONE}</p>
        ${notes ? `<p><strong>Noteringar:</strong> ${notes}</p>` : ""}
      `
        : `
        <p><strong>Namn:</strong> ${name || "N/A"}</p>
        <p><strong>Telefon:</strong> ${phone || "N/A"}</p>
        <p><strong>Adress:</strong> ${address || "N/A"}</p>
        ${notes ? `<p><strong>Noteringar:</strong> ${notes}</p>` : ""}
      `;
    }

    // Items
    const orderItemsEl = document.getElementById("order-items");
    if (orderItemsEl) {
      orderItemsEl.innerHTML = currentOrder.items
        .map((item) => {
          const parts = (item.name || "").split(" with ");
          const baseName = parts[0];
          const modifiers = parts.length > 1 ? parts[1] : null;
          const modifiersHtml = modifiers
            ? `<div class="modifiers">+ ${modifiers
                .replace(/\(0 kr\)/g, "")
                .replace(/, $/, "")}</div>`
            : "";
          return `
          <div class="order-item-confirmation">
            <div class="item-name">
              ${baseName} <span class="quantity">${item.quantity}</span>
              ${modifiersHtml}
            </div>
            <div class="item-price">${(
              Number(item.price || 0) * Number(item.quantity || 0)
            ).toFixed(2)} kr</div>
          </div>
        `;
        })
        .join("");
    }

    // Track / Map buttons (use separate buttons defined in HTML)
    const trackBtn = document.getElementById("track-order-btn");
    const mapBtn = document.getElementById("show-map-btn");

    if (isPickup) {
      // Hide tracking button for pickup
      if (trackBtn) trackBtn.style.display = "none";

      // Show "Visa karta" with Google Maps link to the restaurant
      if (mapBtn) {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${STORE_NAME}, ${STORE_ADDRESS}`
        )}`;
        mapBtn.href = mapsUrl;
        mapBtn.target = "_blank";
        mapBtn.rel = "noopener";
        mapBtn.style.display = ""; // unhide
      }
    } else {
      // Delivery: show Track Order and hide Visa karta
      if (mapBtn) mapBtn.style.display = "none";
      if (trackBtn) {
        if (currentOrder.orderNumber) {
          trackBtn.href = `track-order.html?order=${currentOrder.orderNumber}`;
          trackBtn.style.display = ""; // unhide
        } else {
          trackBtn.style.display = "none";
        }
      }
    }
  }

  // ==================== PRINT RECEIPT FUNCTION ====================
  document
    .getElementById("print-receipt")
    ?.addEventListener("click", function () {
      const currentOrder =
        JSON.parse(localStorage.getItem("currentOrder")) || {};
      // script.js (confirmation page + print receipt)
      const isPickup =
        /pickup/i.test(
          String(currentOrder.fulfillmentMethod || currentOrder.orderType || "")
        ) || /avh[aä]mtning/i.test(currentOrder.customer?.address || "");

      // Store pickup details
      const STORE_NAME = "Matkungen";
      const STORE_ADDRESS = "P G Vejdes väg, 352 52 Växjö";
      const STORE_PHONE = "0769 666 666";

      // Use the order's creation date if available (fallback to now)
      const created = currentOrder.createdAt
        ? new Date(currentOrder.createdAt)
        : new Date();
      const orderDate =
        created.toString() !== "Invalid Date"
          ? created.toLocaleDateString("sv-SE", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : new Date().toLocaleDateString("sv-SE", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });

      // Totals
      const subtotalFromItems = Array.isArray(currentOrder.items)
        ? currentOrder.items.reduce(
            (s, i) => s + Number(i.price || 0) * Number(i.quantity || 0),
            0
          )
        : 0;
      const subP = Number(currentOrder.subtotal ?? subtotalFromItems);
      const feeP = isPickup
        ? 0
        : subP >= FREE_DELIVERY_MIN
        ? 0
        : Number(currentOrder.deliveryFee ?? BASE_DELIVERY_FEE);
      const totP = subP + feeP;

      const feeText = feeP === 0 ? "Gratis" : `${feeP.toFixed(2)} kr`;
      const etaText = isPickup ? "10 minuter" : "20-35 minuter";
      const etaLabel = isPickup ? "Beräknad tid" : "Beräknad leveranstid";

      const sectionTitle = isPickup
        ? "Upphämtningsinformation"
        : "Leveransinformation";

      // Build customer details
      const c = currentOrder.customer || {};
      const customerDetailsHtml = isPickup
        ? `
      <p><strong>Namn:</strong> ${c.name || "N/A"}</p>
      <p><strong>Telefon:</strong> ${c.phone || "N/A"}</p>
      <p><strong>Upphämtningsställe:</strong> ${STORE_NAME}</p>
      <p><strong>Adress:</strong> ${STORE_ADDRESS}</p>
      <p><strong>Restaurangens telefon:</strong> ${STORE_PHONE}</p>
      ${c.notes ? `<p><strong>Noteringar:</strong> ${c.notes}</p>` : ""}
    `
        : `
      <p><strong>Namn:</strong> ${c.name || "N/A"}</p>
      <p><strong>Telefon:</strong> ${c.phone || "N/A"}</p>
      <p><strong>Adress:</strong> ${c.address || "N/A"}</p>
      ${c.notes ? `<p><strong>Noteringar:</strong> ${c.notes}</p>` : ""}
    `;

      // Hidden iframe
      const iframe = document.createElement("iframe");
      iframe.style.position = "absolute";
      iframe.style.left = "-9999px";
      document.body.appendChild(iframe);
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

      iframeDoc.open();
      iframeDoc.write(`
      <html>

      <head>
        <title>Order Receipt - ${currentOrder.orderNumber || ""}</title>
        <base href="${location.origin}/">
        <link rel="stylesheet" href="assets/css/style.css">
      </head>

      <body class="print-view">
        <div class="confirmation-card">
        <div class="confirmation-header">
          <h1>Matkungen</h1>
          <p class="confirmation-text">
            Ordernummer <span id="order-number">${
              currentOrder.orderNumber || ""
            }</span>
          </p>
        </div>

        <div class="confirmation-content">
          <div class="delivery-info">
            <h2>${sectionTitle}</h2>
            <div id="customer-details">
              ${customerDetailsHtml}
            </div>
            <div class="detail-row">
              <span>Betalningsmetod:</span>
              <span id="payment-method">${
                currentOrder.paymentMethod || "Not specified"
              }</span>
            </div>
            <div class="detail-row">
              <span>Orderdatum:</span>
              <span>${orderDate}</span>
            </div>
            <div class="detail-row">
              <span>${etaLabel}:</span>
              <span id="delivery-time">${etaText}</span>
            </div>
          </div>

          <div class="order-summary">
            <h2>Ordersammanfattning</h2>
            <div class="order-items" id="order-items">
              ${
                currentOrder.items
                  ?.map(
                    (item) => `
                  <div class="order-item">
                    <div class="item-name">${item.name} × ${item.quantity}</div>
                    <div class="item-price">${(
                      Number(item.price || 0) * Number(item.quantity || 0)
                    ).toFixed(2)} kr</div>
                  </div>
                `
                  )
                  .join("") || "<p>No items in order</p>"
              }
            </div>

            <div class="order-totals">
              <div class="order-row">
                <span>Delsumma</span>
                <span id="order-subtotal">${subP.toFixed(2)} kr</span>
              </div>
              <div class="order-row">
                <span>Leveransavgift</span>
                <span id="delivery-fee">${feeText}</span>
              </div>
              <div class="order-row total">
                <span>Totalt</span>
                <span id="order-total">${totP.toFixed(2)} kr</span>
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
    });

  // ==================== USER AUTHENTICATION ====================
  class UserAuth {
    constructor() {
      this.token = localStorage.getItem("authToken") || null;
      this.currentUser =
        JSON.parse(localStorage.getItem("currentUser")) || null;
      this.rememberMe = localStorage.getItem("rememberUser") === "true";
      this.initAuth();
    }

    initAuth() {
      this.setupEventListeners();
      this.checkAuthState();

      // Auto-login if remember me is enabled
      if (this.rememberMe && this.token) {
        this.checkTokenAndLogin();
      }
    }

    async checkTokenAndLogin() {
      try {
        const response = await fetch("/api/auth/user", {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        if (response.ok) {
          const { user } = await response.json();
          this.currentUser = user;
          localStorage.setItem("currentUser", JSON.stringify(user));

          // Join user room for live updates
          if (this.currentUser?.id) {
            socket.emit("joinUserRoom", this.currentUser.id);
          }
        } else {
          this.handleLogout();
        }
      } catch (error) {
        console.error("Token validation failed:", error);
        this.handleLogout();
      }
    }

    setupEventListeners() {
      // User sidebar toggle
      const userBtn = document.getElementById("user-trigger");
      const userSidebar = document.querySelector(".user-sidebar");
      const userOverlay = document.querySelector(".user-overlay");
      const closeUserBtn = document.querySelector(".close-user");

      if (userBtn && userSidebar && userOverlay && closeUserBtn) {
        userBtn.addEventListener("click", () => {
          userSidebar.classList.add("open");
          userOverlay.classList.add("open");
          document.body.classList.add("user-active"); // Prevent body scroll
          this.checkAuthState();
        });

        closeUserBtn.addEventListener("click", () => {
          userSidebar.classList.remove("open");
          userOverlay.classList.remove("open");
          document.body.classList.remove("user-active"); // Prevent body scroll
        });

        userOverlay.addEventListener("click", () => {
          userSidebar.classList.remove("open");
          userOverlay.classList.remove("open");
          document.body.classList.remove("user-active"); // Prevent body scroll
        });
      }

      // click Escape to close user sidebar, cart sidebar and navbar
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          // close user sidebar and overlay
          const userSidebar = document.querySelector(".user-sidebar");
          const userOverlay = document.querySelector(".user-overlay");
          if (userSidebar && userOverlay) {
            userSidebar.classList.remove("open");
            userOverlay.classList.remove("open");
            document.body.classList.remove("user-active");
          }

          // close cart sidebar and overlay
          const cartSidebar = document.querySelector(".cart-sidebar");
          const cartOverlay = document.querySelector(".cart-overlay");
          if (cartSidebar && cartOverlay) {
            cartSidebar.classList.remove("open");
            cartOverlay.classList.remove("open");
            document.body.classList.remove("cart-active");
          }

          // close navbar and overlay
          const navbar = document.querySelector(".navbar");
          const navOverlay = document.querySelector(".overlay");
          if (navbar && navOverlay) {
            navbar.classList.remove("active");
            navOverlay.classList.remove("active");
            document.body.classList.remove("nav-active");
          }
        }
      });

      // Form switching
      document
        .getElementById("show-register")
        ?.addEventListener("click", (e) => {
          e.preventDefault();
          this.showForm("register");
        });

      document.getElementById("show-login")?.addEventListener("click", (e) => {
        e.preventDefault();
        this.showForm("login");
      });

      document.getElementById("show-forgot")?.addEventListener("click", (e) => {
        e.preventDefault();
        this.showForm("forgot");
      });

      document
        .getElementById("show-login-from-forgot")
        ?.addEventListener("click", (e) => {
          e.preventDefault();
          this.showForm("login");
        });

      // Log in side bar opening via url parameter
      const urlParams = new URLSearchParams(window.location.search);
      const showLogin = urlParams.get("showLogin");

      if (showLogin === "true") {
        document.getElementById("user-trigger")?.click();
      }

      // Form submissions
      document.getElementById("login-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;
        this.handleLogin(email, password);
      });

      document
        .getElementById("register-form")
        ?.addEventListener("submit", (e) => this.handleRegister(e));
      document
        .getElementById("forgot-form")
        ?.addEventListener("submit", (e) => this.handleForgotPassword(e));
      document
        .getElementById("edit-profile-form")
        ?.addEventListener("submit", (e) => this.handleEditProfile(e));
      document
        .getElementById("change-password-form")
        ?.addEventListener("submit", (e) => this.handleChangePassword(e));

      // Profile actions
      document
        .getElementById("logout")
        ?.addEventListener("click", () => this.handleLogout());
      document
        .getElementById("edit-profile")
        ?.addEventListener("click", () => this.showEditProfile());
      document
        .getElementById("change-password")
        ?.addEventListener("click", () => this.showChangePassword());
      document
        .getElementById("cancel-edit")
        ?.addEventListener("click", () => this.cancelEdit());
      document
        .getElementById("cancel-password")
        ?.addEventListener("click", () => this.cancelPasswordChange());
    }

    showForm(formName) {
      document.querySelectorAll(".user-forms form").forEach((form) => {
        form.classList.remove("active");
      });
      document.getElementById(`${formName}-form`)?.classList.add("active");
    }

    checkAuthState() {
      const userForms = document.querySelector(".user-forms");
      const userProfile = document.querySelector(".user-profile");
      const editProfileForm = document.getElementById("edit-profile-form");
      const changePasswordForm = document.getElementById(
        "change-password-form"
      );
      const logoutBtn = document.getElementById("logout"); // Add this line

      if (
        userForms &&
        userProfile &&
        editProfileForm &&
        changePasswordForm &&
        logoutBtn
      ) {
        if (this.currentUser) {
          // User is logged in
          userForms.style.display = "none";
          userProfile.style.display = "block";
          editProfileForm.style.display = "none";
          changePasswordForm.style.display = "none";
          logoutBtn.style.display = "block"; // Show logout button

          // Populate user info
          const displayName = document.getElementById("user-display-name");
          const userEmail = document.getElementById("user-email");

          if (displayName) displayName.textContent = this.currentUser.name;
          if (userEmail) userEmail.textContent = this.currentUser.email;

          // Populate edit form
          const editName = document.getElementById("edit-name");
          const editEmail = document.getElementById("edit-email");
          const editPhone = document.getElementById("edit-phone");
          const editAddress = document.getElementById("edit-address");

          if (editName) editName.value = this.currentUser.name;
          if (editEmail) editEmail.value = this.currentUser.email;
          if (editPhone) editPhone.value = this.currentUser.phone || "";
          if (editAddress) editAddress.value = this.currentUser.address || "";

          // Load user's orders
          this.loadUserOrders();
        } else {
          // User is not logged in
          userForms.style.display = "block";
          userProfile.style.display = "none";
          logoutBtn.style.display = "none"; // Hide logout button
          this.showForm("login");
        }
      }
    }

    async handleLogin(email, password) {
      const remember = document.getElementById("remember-login").checked;

      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, remember }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Incorrect email or password.");
        }

        this.token = data.token;
        this.currentUser = data.user;
        this.rememberMe = remember;

        localStorage.setItem("authToken", this.token);
        localStorage.setItem("currentUser", JSON.stringify(this.currentUser));
        localStorage.setItem("rememberUser", remember.toString());

        // ✅ Join user-specific room for live updates
        if (this.currentUser?.id) {
          socket.emit("joinUserRoom", this.currentUser.id);
        }

        this.showNotification("Login successful!");
        this.checkAuthState();
        this.loadUserOrders();

        // Close sidebar after successful login
        setTimeout(() => {
          document.querySelector(".user-sidebar")?.classList.remove("open");
          document.querySelector(".user-overlay")?.classList.remove("open");
        }, 1000);

        return true;
      } catch (error) {
        this.showNotification(error.message, true);
        return false;
      }
    }

    async handleRegister(e) {
      e.preventDefault();
      const name = document.getElementById("register-name").value;
      const email = document.getElementById("register-email").value;
      const password = document.getElementById("register-password").value;
      const confirmPassword = document.getElementById("register-confirm").value;

      if (!name || !email || !password || !confirmPassword) {
        this.showNotification("Please fill in all fields", true);
        return;
      }

      if (password !== confirmPassword) {
        this.showNotification("Passwords don't match", true);
        return;
      }

      if (password.length < 6) {
        this.showNotification("Password must be at least 6 characters", true);
        return;
      }

      try {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Registration failed");
        }

        this.showNotification("Registration successful! Please login.");
        this.showForm("login");

        // Clear form
        document.getElementById("register-form").reset();
      } catch (error) {
        this.showNotification(error.message, true);
      }
    }

    async handleForgotPassword(e) {
      e.preventDefault();
      const email = document.getElementById("forgot-email").value;

      if (!email) {
        this.showNotification("Please enter your email", true);
        return;
      }

      try {
        const response = await fetch("/api/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Password reset failed");
        }

        this.showNotification(
          "If an account exists with this email, you'll receive a reset link"
        );
        this.showForm("login");

        // Clear form
        document.getElementById("forgot-form").reset();
      } catch (error) {
        this.showNotification(error.message, true);
      }
    }

    showEditProfile() {
      document.querySelector(".user-profile").style.display = "none";
      document.getElementById("edit-profile-form").style.display = "block";
    }

    showChangePassword() {
      document.querySelector(".user-profile").style.display = "none";
      document.getElementById("change-password-form").style.display = "block";
    }

    cancelEdit() {
      document.getElementById("edit-profile-form").style.display = "none";
      document.querySelector(".user-profile").style.display = "block";
    }

    cancelPasswordChange() {
      document.getElementById("change-password-form").style.display = "none";
      document.querySelector(".user-profile").style.display = "block";
    }

    async handleEditProfile(e) {
      e.preventDefault();
      const name = document.getElementById("edit-name").value;
      const email = document.getElementById("edit-email").value;
      const phone = document.getElementById("edit-phone").value;
      const address = document.getElementById("edit-address").value;

      if (!name || !email) {
        this.showNotification("Name and email are required", true);
        return;
      }

      try {
        const response = await fetch("/api/update-profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify({
            userId: this.currentUser.id,
            name,
            email,
            phone,
            address,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Profile update failed");
        }

        // Update current user in local storage
        this.currentUser = {
          ...this.currentUser,
          name,
          email,
          phone,
          address,
        };

        localStorage.setItem("currentUser", JSON.stringify(this.currentUser));
        this.showNotification("Profile updated successfully!");
        this.checkAuthState();
      } catch (error) {
        this.showNotification(error.message, true);
      }
    }

    async handleChangePassword(e) {
      e.preventDefault();
      const currentPassword = document.getElementById("current-password").value;
      const newPassword = document.getElementById("new-password").value;
      const confirmNewPassword = document.getElementById(
        "confirm-new-password"
      ).value;

      if (!currentPassword || !newPassword || !confirmNewPassword) {
        this.showNotification("Please fill in all fields", true);
        return;
      }

      if (newPassword !== confirmNewPassword) {
        this.showNotification("New passwords don't match", true);
        return;
      }

      if (newPassword.length < 6) {
        this.showNotification("Password must be at least 6 characters", true);
        return;
      }

      try {
        const response = await fetch("/api/change-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify({
            userId: this.currentUser.id,
            currentPassword,
            newPassword,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Password change failed");
        }

        this.showNotification("Password updated successfully!");
        this.cancelPasswordChange();

        // Clear form
        document.getElementById("change-password-form").reset();
      } catch (error) {
        this.showNotification(error.message, true);
      }
    }
    restoreAuth() {
      // Pull from localStorage on page load/refresh
      if (!this.currentUser) {
        try {
          this.currentUser = JSON.parse(
            localStorage.getItem("currentUser") || "{}"
          );
        } catch {
          this.currentUser = {};
        }
      }
      if (!this.token) {
        // prefer "authToken"; fall back to old "token" if you had it before
        this.token =
          localStorage.getItem("authToken") ||
          localStorage.getItem("token") ||
          "";
      }
    }

    async loadUserOrders() {
      const ordersList = document.getElementById("orders-list");
      if (!ordersList) return;

      // Ensure we have fresh in-memory auth after a refresh
      this.restoreAuth();

      const userId = this.currentUser?.id || this.currentUser?._id;
      const token = this.token;

      if (!userId || !token) {
        ordersList.innerHTML = `
      <div class="no-orders">
        <i class="ri-shopping-bag-line"></i>
        <p>Please log in to view your orders</p>
      </div>`;
        return;
      }

      // Small loader so UI doesn’t flash “no orders” during fetch
      ordersList.innerHTML = `<p>Loading your orders…</p>`;

      try {
        const response = await fetch(`/api/orders/user/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // If token expired/invalid on server, clear and show login message
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem("authToken");
          localStorage.removeItem("currentUser");
          localStorage.removeItem("rememberUser");
          ordersList.innerHTML = `
        <div class="no-orders">
          <i class="ri-shopping-bag-line"></i>
          <p>Please log in to view your orders</p>
        </div>`;
          return;
        }

        const data = await response.json();
        if (!response.ok)
          throw new Error(data?.error || "Failed to load orders");

        if (!Array.isArray(data.orders) || data.orders.length === 0) {
          ordersList.innerHTML = `
        <div class="no-orders">
          <i class="ri-shopping-bag-line"></i>
          <p>You don't have any previous orders</p>
          <p class="small">Start ordering from our menu!</p>
        </div>`;
          return;
        }

        // Group by date
        const groups = {};
        for (const order of data.orders) {
          const dateKey = new Date(order.createdAt).toLocaleDateString(
            "sv-SE",
            {
              year: "numeric",
              month: "long",
              day: "numeric",
            }
          );
          (groups[dateKey] ||= []).push(order);
        }

        // Render
        ordersList.innerHTML = Object.entries(groups)
          .map(
            ([date, dateOrders]) => `
        <div class="order-date-group">
          <h4 class="order-date-header">${date}</h4>
          ${dateOrders.map((o) => this.createOrderItemHTML(o)).join("")}
        </div>`
          )
          .join("");

        this.addOrderEventListeners();
      } catch (err) {
        console.error("Error loading orders:", err);
        ordersList.innerHTML = `
      <div class="error-loading">
        <i class="ri-error-warning-line"></i>
        <p>Failed to load orders</p>
      </div>`;
      }
    }

    createOrderItemHTML(order) {
      const statusMap = {
        Completed: {
          class: "completed",
          icon: "ri-checkbox-circle-line",
          label: "Completed",
        },
        "On the Way": {
          class: "on-the-way",
          icon: "ri-roadster-line",
          label: "On the Way",
        },
        Delivered: {
          class: "delivered",
          icon: "ri-check-double-line",
          label: "Delivered",
        },
        Pending: { class: "pending", icon: "ri-time-line", label: "Pending" },
      };

      const rawStatus = order.status || order.paymentStatus || "Pending";
      const statusInfo = statusMap[rawStatus] || {
        class: "pending",
        icon: "ri-time-line",
        label: rawStatus,
      };

      return `
    <div class="order-card">
      <div class="order-header">
        <span class="order-number">#${order.orderNumber}</span>
        <span class="order-date">
          ${new Date(order.createdAt).toLocaleDateString("sv-SE", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      <div class="order-status ${statusInfo.class}">
        <i class="${statusInfo.icon}"></i> ${statusInfo.label}
      </div>

      <div class="order-progress">
        ${this.createProgressSteps(order.status)}
      </div>

      <div class="order-items">
        ${order.items
          .map((item) => {
            // Split item name into base name and modifiers
            const baseName = item.name.split(" with ")[0];
            const modifiers = item.name.includes(" with ")
              ? item.name
                  .split(" with ")[1]
                  .replace(/\(0 kr\)/g, "") // Remove (0 kr)
                  .replace(/, $/, "") // Remove trailing commas
              : null;

            return `
            <div class="cart-item">
              <div class="cart-item-image">
                <img src="${
                  item.img || "./assets/images/default-food.jpg"
                }" alt="${item.name}">
              </div>
              <div class="cart-item-details">
                <h4>${baseName}</h4>
                ${
                  modifiers
                    ? `<div class="item-modifiers">${modifiers}</div>`
                    : ""
                }
                ${
                  item.description
                    ? `<p class="item-desc">${item.description}</p>`
                    : ""
                }
                <span class="item-price">${item.price} kr</span>
              </div>
            </div>
          `;
          })
          .join("")}
      </div>
    </div>
  `;
    }

    createProgressSteps(currentStatus) {
      const steps = [
        { status: "Completed", icon: "ri-checkbox-circle-line" },
        { status: "On the Way", icon: "ri-roadster-line" },
        { status: "Delivered", icon: "ri-check-double-line" },
      ];

      const statusOrder = {
        Completed: 0,
        Confirmed: 0, // fallback if you're using "Confirmed"
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

    addOrderEventListeners() {
      // View order details
      document.querySelectorAll(".view-order").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const orderNumber = e.target
            .closest("button")
            .getAttribute("data-order");
          this.viewOrderDetails(orderNumber);
        });
      });

      // Delete order
      document.querySelectorAll(".delete-order").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const orderNumber = e.target
            .closest("button")
            .getAttribute("data-order");
          this.deleteOrder(orderNumber);
        });
      });
    }

    async deleteOrder(orderNumber) {
      if (!confirm("Are you sure you want to delete this order?")) return;

      try {
        const response = await fetch(`/api/orders/${orderNumber}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to delete order");
        }

        this.loadUserOrders();
        this.showNotification("Order deleted successfully");
      } catch (error) {
        this.showNotification(error.message, true);
      }
    }

    async viewOrderDetails(orderNumber) {
      try {
        const response = await fetch(`/api/orders/${orderNumber}`, {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load order details");
        }

        this.showOrderModal(data.order);
      } catch (error) {
        this.showNotification(error.message, true);
      }
    }

    showOrderModal(order) {
      // Create modal
      const modal = document.createElement("div");
      modal.className = "order-modal";

      // Check if order is being delivered
      const showTracking = order.status === "On the Way" && order.driver;
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3>Order Details</h3>
            <h4>#${order.orderNumber}</h4>
            <span class="close-modal">&times;</span>
          </div>
          <div class="modal-body">
            <div class="order-meta">
              <div><strong>Date:</strong> ${new Date(
                order.createdAt
              ).toLocaleString("sv-SE")}</div>
              <div><strong>Status:</strong> <span class="status-badge ${order.status.toLowerCase()}">${
        order.status
      }</span></div>
              <div><strong>Payment:</strong> ${
                order.paymentMethod || "Not specified"
              }</div>
            </div>
            
            <div class="order-items-section">
              <h5>Items</h5>
              <div class="order-items-list">
                ${order.items
                  .map(
                    (item) => `
                  <div class="order-item-detail">
                    <img src="${
                      item.img || "./assets/images/default-food.jpg"
                    }" width="50" height="50" alt="${item.name}">
                    <div class="item-info">
                      <span class="item-name">${item.name}</span>
                      <span class="item-price">${item.price} kr × ${
                      item.quantity
                    }</span>
                    </div>
                    <div class="item-total">${(
                      item.price * item.quantity
                    ).toFixed(2)} kr</div>
                  </div>
                `
                  )
                  .join("")}
              </div>
            </div>
            
            <div class="order-totals">
              <div class="summary-row">
                <span>Subtotal:</span>
                <span>${order.subtotal.toFixed(2)} kr</span>
              </div>
              <div class="summary-row">
                <span>Leveransavgift:</span>
                <span>${order.deliveryFee.toFixed(2)} kr</span>
              </div>
              <div class="summary-row total">
                <span>Totalt:</span>
                <span>${order.total.toFixed(2)} kr</span>
              </div>
            </div>
            
            <div class="customer-info">
              <h5>Customer Information</h5>
              <p><strong>Namn:</strong> ${order.customer?.name || "N/A"}</p>
              <p><strong>Telefon:</strong> ${order.customer?.phone || "N/A"}</p>
              <p><strong>Adress:</strong> ${
                order.customer?.address || "N/A"
              }</p>
              ${
                order.customer?.notes
                  ? `<p><strong>Notes:</strong> ${order.customer.notes}</p>`
                  : ""
              }
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary close-modal-btn">Close</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      document.body.classList.add("modal-open");

      // Close functionality
      const closeModal = () => {
        modal.remove();
        document.body.classList.remove("modal-open");
      };

      modal.querySelector(".close-modal").addEventListener("click", closeModal);
      modal
        .querySelector(".close-modal-btn")
        .addEventListener("click", closeModal);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
      });
    }

    handleLogout() {
      this.token = null;
      this.currentUser = null;
      this.rememberMe = false;

      localStorage.removeItem("authToken");
      localStorage.removeItem("currentUser");
      localStorage.removeItem("rememberUser");

      this.checkAuthState();
      this.showNotification("Logged out successfully");

      // Close the sidebar after logout
      setTimeout(() => {
        document.querySelector(".user-sidebar")?.classList.remove("open");
        document.querySelector(".user-overlay")?.classList.remove("open");
      }, 500);
    }

    showNotification(message, isError = false) {
      const notification = document.createElement("div");
      notification.className = `user-notification ${isError ? "error" : ""}`;
      notification.innerHTML = `<span>${message}</span>`;
      document.body.appendChild(notification);

      setTimeout(() => {
        notification.classList.add("show");
        setTimeout(() => {
          notification.classList.remove("show");
          setTimeout(() => notification.remove(), 300);
        }, 3000);
      }, 10);
    }
  }

  // Initialize user auth
  const userAuth = new UserAuth();

  // Handle hash navigation for menu sections
  const handleHashNavigation = () => {
    const hash = window.location.hash.substring(1);
    if (!hash) return;

    // Wait for the menu to be initialized
    setTimeout(() => {
      const targetElement = document.getElementById(hash);
      const menuType = hash.split("-")[0];
      const menuButton = document.querySelector(
        `.menu-btn[data-menu="${menuType}"]`
      );

      if (menuButton) {
        // Click the menu button to show the section
        menuButton.click();

        // Scroll to the section after it's visible
        setTimeout(() => {
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: "smooth" });
          } else {
            document
              .getElementById("menu")
              .scrollIntoView({ behavior: "smooth" });
          }
        }, 500);
      } else if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  };

  // Run on initial page load
  handleHashNavigation();

  // Also run when hash changes
  window.addEventListener("hashchange", handleHashNavigation);
});

// ---------- Store status bar (self-contained) ----------
(function initStoreStatusBar() {
  const el = document.getElementById("store-status");
  if (!el) return;

  // --- CONFIG ---
  const SHORT_ADDRESS = "P G Vejdes väg 30";
  // Your fixed Google Maps directions URL:
  const MAPS_URL =
    "https://www.google.com/maps/dir/56.8535951,14.8251036/CAMPUS+MATKUNGEN+I+V%C3%84XJ%C3%96,+P+G+Vejdes+v%C3%A4g,+352+52+V%C3%A4xj%C3%B6";

  // Use +1 on "end" for past-midnight spans
  const HOURS = {
    mon: [{ start: "11:00", end: "22:00" }],
    tue: [{ start: "11:00", end: "22:00" }],
    wed: [{ start: "11:00", end: "03:00+1" }],
    thu: [{ start: "11:00", end: "22:00" }],
    fri: [{ start: "11:00", end: "03:00+1" }],
    sat: [{ start: "12:00", end: "03:00+1" }],
    sun: [{ start: "12:00", end: "22:00" }],
  };

  const dayOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]; // Mon→Sun
  const dayLabels = {
    mon: "Mån",
    tue: "Tis",
    wed: "Ons",
    thu: "Tors",
    fri: "Fre",
    sat: "Lör",
    sun: "Sön",
  };

  // --- HELPERS ---
  const $ = (sel, base = el) => base.querySelector(sel);
  const pad = (n) => String(n).padStart(2, "0");
  const minutesToHHMM = (mins) =>
    `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  const toMinutes = (hhmm) => {
    // "03:00+1" -> { minutes: 180, plus1: true }
    const [h, raw] = hhmm.split(":");
    const plus1 = raw.endsWith("+1");
    const m = parseInt(plus1 ? raw.slice(0, -2) : raw, 10);
    return { minutes: parseInt(h, 10) * 60 + m, plus1 };
  };

  function getTodaySlots(now) {
    const dowIdx = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
    const key = dayOrder[dowIdx];
    return { key, idx: dowIdx, slots: HOURS[key] || [] };
  }

  function isOpenNow(now = new Date()) {
    const { idx, slots } = getTodaySlots(now);
    const minsNow = now.getHours() * 60 + now.getMinutes();

    // Today
    for (const s of slots) {
      const start = toMinutes(s.start);
      const end = toMinutes(s.end);
      if (!end.plus1) {
        if (minsNow >= start.minutes && minsNow < end.minutes) {
          return { open: true, closes: end.minutes, closesDayOffset: 0 };
        }
      } else if (minsNow >= start.minutes) {
        // spans midnight
        return { open: true, closes: end.minutes, closesDayOffset: 1 };
      }
    }

    // Yesterday spillover
    const yIdx = (idx + 6) % 7;
    const yKey = dayOrder[yIdx];
    for (const s of HOURS[yKey] || []) {
      const end = toMinutes(s.end);
      if (end.plus1 && minsNow < end.minutes) {
        return { open: true, closes: end.minutes, closesDayOffset: 0 };
      }
    }
    return { open: false };
  }

  function nextChange(now = new Date()) {
    const state = isOpenNow(now);
    if (state.open)
      return {
        type: "close",
        at: state.closes,
        dayOffset: state.closesDayOffset,
      };

    // Find next opening
    let probe = new Date(now);
    for (let d = 0; d < 8; d++) {
      const { slots } = getTodaySlots(probe);
      const minsNow = d === 0 ? probe.getHours() * 60 + probe.getMinutes() : -1;
      for (const s of slots) {
        const start = toMinutes(s.start).minutes;
        if (d > 0 || minsNow < start) {
          return { type: "open", at: start, dayOffset: d };
        }
      }
      probe.setDate(probe.getDate() + 1);
      probe.setHours(0, 0, 0, 0);
    }
    return null;
  }

  // --- ADDRESS ROW: fill text + link (keeps icon and text on the same line) ---
  const addrText = $(".hours .address-short");
  const addrLink = $(".hours .address-link");
  if (addrText) addrText.textContent = SHORT_ADDRESS;
  if (addrLink) {
    addrLink.href = MAPS_URL;
    addrLink.target = "_blank";
    addrLink.rel = "noopener";
  }

  // --- RENDER SUMMARY (top line) ---
  const textEl = $(".status-text");
  const button = $(".state-line");
  const hoursBox = $(".hours");

  function renderSummary() {
    const now = new Date();
    const state = isOpenNow(now);
    const change = nextChange(now);

    el.classList.toggle("open", state.open);
    el.classList.toggle("closed", !state.open);

    if (!textEl) return;

    if (state.open) {
      textEl.textContent =
        change && change.type === "close"
          ? `Öppet – stänger ${minutesToHHMM(change.at)}`
          : "Öppet";
    } else {
      if (change && change.type === "open") {
        const targetIdx = (((now.getDay() + 6) % 7) + change.dayOffset) % 7;
        const targetKey = dayOrder[targetIdx];
        textEl.textContent = `Stängt – öppnar ${
          dayLabels[targetKey]
        } ${minutesToHHMM(change.at)}`;
      } else {
        textEl.textContent = "Stängt – öppnar snart";
      }
    }
  }

  // --- RENDER GROUPED HOURS (e.g., “Mån – Tis – Tors | 11:00–22:00”) ---
  function renderHours() {
    const list = $(".hours-rows");
    if (!list) return;

    const groups = new Map(); // key = "11:00–22:00" ; value = [mon,tue,...]
    for (const k of dayOrder) {
      const slots = HOURS[k] || [];
      const label = slots.length
        ? slots.map((s) => `${s.start}–${s.end.replace("+1", "")}`).join(", ")
        : "Stängt";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(k);
    }

    const sorted = [...groups.entries()].sort((a, b) => {
      const amin = Math.min(...a[1].map((k) => dayOrder.indexOf(k)));
      const bmin = Math.min(...b[1].map((k) => dayOrder.indexOf(k)));
      return amin - bmin;
    });

    list.innerHTML = sorted
      .map(([time, days]) => {
        const daysText = days.map((k) => dayLabels[k]).join(" – ");
        return `<li><span class="days">${daysText}</span><span class="time">${time}</span></li>`;
      })
      .join("");
  }

  // Toggle dropdown
  if (button && hoursBox) {
    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      hoursBox.hidden = expanded;
      el.classList.toggle("expanded", !expanded);
    });
  }

  renderHours();
  renderSummary();
  setInterval(renderSummary, 60_000);
})();

// ---------- Position the pill just under the search (to the right) ----------
function positionStoreStatus() {
  const status = document.getElementById("store-status");
  const hero = document.querySelector(".hero");
  const searchBox = document.querySelector(".search-container .search-box");
  if (!status || !hero || !searchBox) return;

  const heroTop = hero.getBoundingClientRect().top + window.scrollY;
  const rect = searchBox.getBoundingClientRect();
  const top = rect.bottom + window.scrollY - heroTop + 8; // 8px below search
  status.style.top = `${Math.round(top)}px`;
}

window.addEventListener("load", () => {
  positionStoreStatus();
  setTimeout(positionStoreStatus, 120); // nudge after fonts/layout settle
});
window.addEventListener("resize", positionStoreStatus);
window.addEventListener("orientationchange", positionStoreStatus);

// ==================== LOAD MENU DATA FROM JSON ====================

let menuItems = [];

async function loadMenuItems() {
  try {
    const response = await fetch("./assets/data/menuItems.json");
    if (!response.ok) throw new Error("Could not load menu data");
    menuItems = await response.json();
    initGlobalSearch(); // Run your search setup AFTER loading data!
  } catch (err) {
    console.error(err);
    // Optionally show error to user
  }
}
// ==================== MODIFIER POPUP STATE ====================
let modifierState = {
  currentItem: null,
  currentItemName: "",
  selectedModifiers: {},
  basePrice: 0,
};
// Modifier Popup Functions
// ==================== MODIFIER POPUP FUNCTIONS ====================
function openModifierPopup(item, name, selectedSize = null) {
  modifierState.currentItem = item;
  modifierState.currentItemName = name;
  modifierState.basePrice = selectedSize ? selectedSize.price : item.price;
  modifierState.selectedModifiers = {};

  // Set title using the passed name
  document.getElementById("modifier-title").textContent = name;

  // Populate content
  const content = document.getElementById("modifier-content");
  content.innerHTML = "";

  if (item.modifiers) {
    item.modifiers.forEach((modifier, index) => {
      const group = document.createElement("div");
      group.className = "modifier-group";
      group.innerHTML = `<h4 class="modifier-group-title">${modifier.title}</h4>`;

      if (modifier.type === "radio" || modifier.type === "checkbox") {
        const optionsContainer = document.createElement("div");
        optionsContainer.className = "modifier-options";

        modifier.options.forEach((option) => {
          const optionId = `modifier-${index}-${option.value}`;
          const optionEl = document.createElement("div");
          optionEl.className = "modifier-option";

          // --- Build input element ---
          const input = document.createElement("input");
          input.type = modifier.type;
          input.id = optionId;
          input.name = `modifier-${index}`;
          input.value = option.value;
          input.setAttribute("data-price", option.price);

          // --- FIX: Default check "Normal" radio option ---
          if (modifier.type === "radio" && option.value === "normal") {
            input.checked = true;
          }
          // --- End fix ---

          // Build label
          const label = document.createElement("label");
          label.setAttribute("for", optionId);

          // Inner label html
          const labelSpan = document.createElement("span");
          labelSpan.textContent = option.label;
          label.appendChild(labelSpan);

          if (option.price > 0) {
            const priceTag = document.createElement("span");
            priceTag.className = "modifier-price-tag";
            priceTag.textContent = `+${option.price} kr`;
            label.appendChild(priceTag);
          }

          // Append input and label to optionEl
          optionEl.appendChild(input);
          optionEl.appendChild(label);
          optionsContainer.appendChild(optionEl);

          // Add event listener
          input.addEventListener("change", updateTotalPrice);
        });

        group.appendChild(optionsContainer);
      } else if (modifier.type === "textarea") {
        const textarea = document.createElement("div");
        textarea.className = "textarea-group";
        textarea.innerHTML = `
          <textarea id="modifier-${index}" placeholder="${modifier.placeholder}"></textarea>
        `;
        group.appendChild(textarea);
      }

      content.appendChild(group);
    });
  }

  // Set initial total
  updateTotalPrice();

  // Show popup
  document.getElementById("modifier-popup").classList.add("active");
  document.querySelector(".modifier-overlay").classList.add("active");
}

function closeModifierPopup() {
  document.getElementById("modifier-popup").classList.remove("active");
  document.querySelector(".modifier-overlay").classList.remove("active");
}

function updateTotalPrice() {
  let total = modifierState.basePrice;

  // Reset selectedModifiers
  modifierState.selectedModifiers = {};

  // Calculate modifiers price
  document
    .querySelectorAll(".modifier-option input:checked")
    .forEach((input) => {
      const price = parseFloat(input.dataset.price);
      total += price;

      // Store selected modifier
      const groupIndex = input.name.split("-")[1];
      if (!modifierState.selectedModifiers[groupIndex]) {
        modifierState.selectedModifiers[groupIndex] = [];
      }
      modifierState.selectedModifiers[groupIndex].push({
        label: input.parentElement.querySelector("span").textContent,
        price: price,
      });
    });

  // Update UI
  document.querySelector(".total-price").textContent = `${total.toFixed(2)} kr`;
}

function addItemWithModifiers() {
  if (!modifierState.currentItem) return;

  // Get special instructions
  const specialInstructions =
    document.querySelector(".textarea-group textarea")?.value || "";

  // Create modifier description - skip default "Normal" options
  let modifierDesc = "";
  Object.values(modifierState.selectedModifiers).forEach((group) => {
    group.forEach((modifier) => {
      // Skip "Normal" option with 0 kr price
      if (modifier.label === "Normal" && modifier.price === 0) {
        return;
      }

      modifierDesc += `${modifier.label}`;
      if (modifier.price > 0) {
        modifierDesc += ` (+${modifier.price} kr)`;
      }
      modifierDesc += ", ";
    });
  });

  // Remove trailing comma
  if (modifierDesc) {
    modifierDesc = modifierDesc.slice(0, -2);
  }

  // Create the full product name
  let fullProductName = modifierState.currentItemName;
  if (modifierDesc) {
    fullProductName += ` with ${modifierDesc}`;
  }

  // Create cart item
  const cartItem = {
    name: fullProductName,
    price: parseFloat(document.querySelector(".total-price").textContent),
    img: modifierState.currentItem.image || "./assets/images/default-food.jpg",
  };

  // Add to cart
  cart.addItem(cartItem);

  // Create notification message
  const baseName = modifierState.currentItemName.split(" with ")[0];
  const notificationMessage = modifierDesc
    ? `${baseName} with customizations added to cart`
    : `${baseName} added to cart`;

  // Show notification
  cart.showNotification(notificationMessage);

  // Close popup
  closeModifierPopup();
}

// Event Listeners for modifier popup
document
  .querySelector(".close-modifier")
  ?.addEventListener("click", closeModifierPopup);
document
  .querySelector(".modifier-overlay")
  ?.addEventListener("click", closeModifierPopup);
document
  .querySelector(".add-with-modifiers")
  ?.addEventListener("click", addItemWithModifiers);
// ==================== GLOBAL SEARCH FUNCTIONALITY ====================

function initGlobalSearch() {
  const searchInput = document.getElementById("global-search");
  const searchResults = document.getElementById("results-container");
  const clearSearch = document.getElementById("clear-search");
  const searchContainer = document.querySelector(".search-results");

  if (searchInput && searchResults) {
    searchInput.addEventListener("input", handleSearch);
    searchInput.addEventListener("focus", showSearchResults);

    clearSearch?.addEventListener("click", () => {
      searchInput.value = "";
      searchResults.innerHTML = "";
      searchContainer.classList.remove("open");
    });

    document.addEventListener("click", (e) => {
      if (!searchContainer.contains(e.target)) {
        searchContainer.classList.remove("open");
      }
    });
  }

  function handleSearch() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    if (searchTerm.length === 0) {
      searchResults.innerHTML = "";
      searchContainer.classList.remove("open");
      return;
    }

    const filteredItems = menuItems.filter(
      (item) => item.name.toLowerCase().includes(searchTerm)
      // Remove the description search!
      // || (item.desc && item.desc.toLowerCase().includes(searchTerm))
    );

    displaySearchResults(filteredItems);
    searchContainer.classList.add("open");
  }

  function showSearchResults() {
    if (searchInput.value.trim().length > 0) {
      searchContainer.classList.add("open");
    }
  }

  function displaySearchResults(items) {
    if (items.length === 0) {
      searchResults.innerHTML = '<p class="no-results">No items found</p>';
      return;
    }

    const html = items
      .map(
        (item) => `
      <div class="search-result-item" data-id="${item.id}" data-page="${
          item.page
        }">
        <img src="${item.image}" alt="${item.name}" class="search-result-img">
        <div class="search-item-details">
          <h4 class="item-name">${item.name}</h4>
          <p class="item-desc">${
            item.desc || "Ingen beskrivning tillgänglig"
          }</p>
          <p class="item-price">${item.price} kr</p>
        </div>
      </div>
    `
      )
      .join("");

    searchResults.innerHTML = html;

    document.querySelectorAll(".search-result-item").forEach((item) => {
      item.addEventListener("click", function () {
        const id = this.dataset.id;
        const page = this.dataset.page;

        if (window.location.pathname.endsWith(page)) {
          scrollToItem(id);
        } else {
          navigateToItem(page, id);
        }

        searchContainer.classList.remove("open");
      });
    });
  }

  // Helper: Wait until the element is in the DOM and visible
  function waitForElementVisible(id, tries = 12, delay = 100, cb) {
    let count = 0;
    function check() {
      const el = document.getElementById(id);
      if (el && el.offsetParent !== null) {
        cb();
      } else if (count < tries) {
        count++;
        setTimeout(check, delay);
      }
    }
    check();
  }

  function scrollToItem(id) {
    const menuItem = menuItems.find((item) => item.id === id);

    // If you are on index.html (pizza section)
    if (window.location.pathname.endsWith("index.html") && menuItem) {
      const category = menuItem.category;
      const menuButton = document.querySelector(
        `.menu-btn[data-menu="${category}"]`
      );
      const activeCategory = document
        .querySelector(".menu-btn.active")
        ?.getAttribute("data-menu");

      // Open the pizza tab if it is not already open
      if (menuButton && activeCategory !== category) {
        menuButton.click();
      }

      // ---- Support for the "Visa alla pizzor" ("Show all pizzas") button ----
      if (category === "pizza") {
        const pizzaMenu = document.getElementById("pizza-menu");
        const showAllBtn = pizzaMenu?.querySelector("#show-all-pizza-btn");
        let targetEl = document.getElementById(id);

        // If the button exists and the target item is not visible, click the button!
        if (showAllBtn && (!targetEl || targetEl.offsetParent === null)) {
          showAllBtn.click();
          // Wait until the item appears, then scroll to it
          waitForElementVisible(id, 14, 120, () => {
            scrollToElementWithHighlight(id);
          });
          return;
        }
      }
    }

    // Check if the item exists, and if so, scroll to it directly
    waitForElementVisible(id, 12, 80, () => {
      scrollToElementWithHighlight(id);
    });
  }

  function scrollToElementWithHighlight(id) {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });

      // Add highlight effect
      element.classList.add("search-highlight");
      setTimeout(() => element.classList.remove("search-highlight"), 2000);
    }
  }

  function navigateToItem(page, id) {
    // Save scroll position for current page
    sessionStorage.setItem("scrollPosition", window.pageYOffset);

    // Store target for next page
    sessionStorage.setItem("searchTarget", id);
    sessionStorage.setItem("searchTargetPage", page);

    // Navigate
    window.location.href = page;
  }

  // Handle scroll to item when page loads
  const targetId = sessionStorage.getItem("searchTarget");
  const targetPage = sessionStorage.getItem("searchTargetPage");

  if (targetId && targetPage && window.location.pathname.endsWith(targetPage)) {
    scrollToItem(targetId);
    sessionStorage.removeItem("searchTarget");
    sessionStorage.removeItem("searchTargetPage");
  }
}

// ==================== INIT ON PAGE LOAD ====================
document.addEventListener("DOMContentLoaded", loadMenuItems);
