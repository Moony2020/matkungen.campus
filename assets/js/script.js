"use strict";
let cart = null;
// ==================== GLOBAL VARIABLES ====================
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");

  const socket = io("http://localhost:4000", {
    auth: {
      token: token,
    },
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
  // function adjustHeroHeight() {
  //   const hero = document.querySelector(".hero");
  //   if (hero) {
  //     hero.style.height = window.innerHeight + "px";
  //   }
  // }

  // window.addEventListener("load", adjustHeroHeight);
  // window.addEventListener("resize", adjustHeroHeight);
  // window.addEventListener("orientationchange", adjustHeroHeight);
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
        });

        closeCartBtn.addEventListener("click", () => {
          cartSidebar.classList.remove("open");
          cartOverlay.classList.remove("open");
        });

        cartOverlay.addEventListener("click", () => {
          cartSidebar.classList.remove("open");
          cartOverlay.classList.remove("open");
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
                        item.name.split(" with ")[1]
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

  // ==================== ADD TO CART FUNCTIONALITY ====================
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".add-to-cart-btn");
    if (!btn) return;

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

        // Animation (keeps your current behavior)
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
    const orderSubtotal = document.querySelector(".order-subtotal");
    const orderTotal = document.querySelector(".order-total");
    const checkoutForm = document.getElementById("checkout-form");
    const deliveryFee = 20; // Delivery fee in kr

    function renderOrderSummary() {
      if (!orderItems) return;

      if (cart.cart.length === 0) {
        orderItems.innerHTML = "<p>Your cart is empty</p>";
        if (orderSubtotal) orderSubtotal.textContent = "0 kr";
        if (orderTotal) orderTotal.textContent = "0 kr";
        return;
      }

      orderItems.innerHTML = cart.cart
        .map(
          (item) => `
          <div class="order-item">
            <div class="item-name">${item.name} × ${item.quantity}</div>
            <div class="item-price">${(item.price * item.quantity).toFixed(
              2
            )} kr</div>
          </div>
        `
        )
        .join("");

      const subtotal = cart.cart.reduce(
        (total, item) => total + item.price * item.quantity,
        0
      );
      const total = subtotal + deliveryFee;

      if (orderSubtotal)
        orderSubtotal.textContent = `${subtotal.toFixed(2)} kr`;
      if (orderTotal) orderTotal.textContent = `${total.toFixed(2)} kr`;
    }
    if (checkoutForm) {
      checkoutForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        if (cart.cart.length === 0) {
          cart.showNotification("Your cart is empty", true);
          return;
        }

        // Collect all necessary data
        const name = document.getElementById("name")?.value || "";
        const email = document.getElementById("email")?.value || "";
        const phone = document.getElementById("phone")?.value || "";
        const address = document.getElementById("address")?.value || "";
        const zip = document.getElementById("zip")?.value || "";
        const city = document.getElementById("city")?.value || "";
        const notes = document.getElementById("notes")?.value || "";

        // Validate required fields
        if (!name || !email || !phone || !address || !zip || !city) {
          cart.showNotification("Please fill in all required fields", true);
          return;
        }

        // Calculate totals
        const subtotal = cart.cart.reduce(
          (total, item) => total + item.price * item.quantity,
          0
        );
        const total = subtotal + deliveryFee;

        // Prepare order data WITHOUT creating in DB yet
        const orderData = {
          customer: {
            name,
            email,
            phone,
            address: `${address}, ${zip} ${city}`,
            notes,
          },
          items: cart.cart.map((item) => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            img: item.img || "",
          })),
          subtotal,
          deliveryFee,
          total,
          paymentMethod: "Pending", // Will be updated in payment page
        };

        // Add user ID if logged in
        const currentUser = JSON.parse(localStorage.getItem("currentUser"));
        if (currentUser) {
          orderData.user = currentUser.id;
        }

        // Store order data in localStorage for payment page
        localStorage.setItem("pendingOrder", JSON.stringify(orderData));

        // Redirect to payment page
        window.location.href = "payment.html";
      });
    }

    // Initialize order summary
    renderOrderSummary();
  }

  // ==================== PAYMENT PAGE LOGIC ====================
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

      // 5. Stripe Payment Handler
      document
        .getElementById("stripe-pay-btn")
        ?.addEventListener("click", async () => {
          const { error, paymentMethod } = await stripe.createPaymentMethod({
            type: "card",
            card: cardElement,
          });

          if (error) {
            document.getElementById("card-errors").textContent = error.message;
            return;
          }

          try {
            const response = await fetch("/create-payment-intent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ amount: total }),
            });

            const { clientSecret } = await response.json();
            const { error: confirmError, paymentIntent } =
              await stripe.confirmCardPayment(clientSecret, {
                payment_method: paymentMethod.id,
              });

            if (confirmError) throw confirmError;

            if (paymentIntent.status === "succeeded") {
              await handlePaymentSuccess("Credit Card");
            }
          } catch (err) {
            document.getElementById("card-errors").textContent = err.message;
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
    const orderSubtotal = document.querySelector(".order-subtotal");
    const orderTotal = document.querySelector(".order-total");

    if (!orderItemsContainer || !orderSubtotal || !orderTotal) return;

    // Clear existing items
    orderItemsContainer.innerHTML = "";

    // Add each item to the summary
    order.items.forEach((item) => {
      const itemElement = document.createElement("div");
      itemElement.className = "order-item";
      itemElement.innerHTML = `
        <div class="item-name">${item.name} × ${item.quantity}</div>
        <div class="item-price">${(item.price * item.quantity).toFixed(
          2
        )} kr</div>
      `;
      orderItemsContainer.appendChild(itemElement);
    });

    // Update totals
    const subtotal = order.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const deliveryFee = 20; // Fixed delivery fee
    const total = subtotal + deliveryFee;

    orderSubtotal.textContent = `${subtotal.toFixed(2)} kr`;
    orderTotal.textContent = `${total.toFixed(2)} kr`;
  }

  // Replace all payment success handlers with this:
  async function handlePaymentSuccess(paymentMethod) {
    try {
      const response = await fetch("/api/orders/confirm-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderId, paymentMethod }),
      });

      const data = await response.json();
      if (data.success) {
        localStorage.setItem("currentOrder", JSON.stringify(data.order));
        localStorage.removeItem("cart");
        window.location.href = "confirmation.html";
      }
    } catch (error) {
      console.error("Payment completion error:", error);
    }
  }

  // ==================== CONFIRMATION PAGE FUNCTIONALITY ====================
  if (document.querySelector(".confirmation-page")) {
    const currentOrder = JSON.parse(localStorage.getItem("currentOrder")) || {};

    if (!currentOrder || !currentOrder.items) {
      console.warn("No valid order found, redirecting to home");
      window.location.href = "index.html";
      return;
    }

    // Display confirmation details
    document.getElementById("payment-method").textContent =
      currentOrder.paymentMethod || "Not specified";

    document.getElementById("order-number").textContent =
      currentOrder.orderNumber || "N/A";

    document.getElementById("customer-email").textContent =
      currentOrder.customer?.email || "Not provided";

    document.getElementById("order-subtotal").textContent = `${(
      currentOrder.subtotal || 0
    ).toFixed(2)} kr`;

    document.getElementById("order-total").textContent = `${(
      currentOrder.total || 0
    ).toFixed(2)} kr`;

    document.getElementById("delivery-fee").textContent = `${(
      currentOrder.deliveryFee || 0
    ).toFixed(2)} kr`;

    const details = document.getElementById("customer-details");
    if (details && currentOrder.customer) {
      const { name, phone, address, notes } = currentOrder.customer;
      details.innerHTML = `
        <p><strong>Name:</strong> ${name || "N/A"}</p>
        <p><strong>Phone:</strong> ${phone || "N/A"}</p>
        <p><strong>Address:</strong> ${address || "N/A"}</p>
        ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ""}
      `;
    }

    const orderItemsEl = document.getElementById("order-items");
    if (orderItemsEl) {
      orderItemsEl.innerHTML = currentOrder.items
        .map(
          (item) => `
        <div class="order-item">
          <div class="item-name">${item.name} × ${item.quantity}</div>
          <div class="item-price">${(item.price * item.quantity).toFixed(
            2
          )} kr</div>
        </div>
      `
        )
        .join("");
    }

    // ✅ Update Track Order Button
    const trackBtn = document.getElementById("track-order-btn");
    if (trackBtn && currentOrder.orderNumber) {
      trackBtn.href = `track-order.html?order=${currentOrder.orderNumber}`;
    }
  }

  // ==================== PRINT RECEIPT FUNCTION ====================
  document
    .getElementById("print-receipt")
    ?.addEventListener("click", function () {
      const currentOrder =
        JSON.parse(localStorage.getItem("currentOrder")) || {};

      // Create a hidden iframe for printing
      const iframe = document.createElement("iframe");
      iframe.style.position = "absolute";
      iframe.style.left = "-9999px";
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

      // Get current date and time
      const now = new Date();
      const orderDate = now.toLocaleDateString("sv-SE", {
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
        <title>Order Receipt - ${currentOrder.orderNumber || ""}</title>
        <link rel="stylesheet" href="./assets/css/style.css">
      </head>
      <body class="print-view">
        <div class="confirmation-card">
          <div class="confirmation-header">
            <h1>Matkungen</h1>
            <p class="confirmation-text">
              Order Number <span id="order-number">${
                currentOrder.orderNumber || ""
              }</span>
            </p>
          </div>

          <div class="confirmation-content">
            <div class="delivery-info">
              <h2>Delivery Information</h2>
              <div id="customer-details">
                ${
                  currentOrder.customer
                    ? `
                  <p><strong>Name:</strong> ${
                    currentOrder.customer.name || "N/A"
                  }</p>
                  <p><strong>Phone:</strong> ${
                    currentOrder.customer.phone || "N/A"
                  }</p>
                  <p><strong>Address:</strong> ${
                    currentOrder.customer.address || "N/A"
                  }</p>
                  ${
                    currentOrder.customer.notes
                      ? `<p><strong>Notes:</strong> ${currentOrder.customer.notes}</p>`
                      : ""
                  }
                `
                    : "<p>No customer information available</p>"
                }
              </div>
              <div class="detail-row">
                <span>Payment Method:</span>
                <span id="payment-method">${
                  currentOrder.paymentMethod || "Not specified"
                }</span>
              </div>
              <div class="detail-row">
                <span>Order Date:</span>
                <span>${orderDate}</span>
              </div>
              <div class="detail-row">
                <span>Estimated Delivery:</span>
                <span id="delivery-time">25-40 minutes</span>
              </div>
            </div>

            <div class="order-summary">
              <h2>Order Summary</h2>
              <div class="order-items" id="order-items">
                ${
                  currentOrder.items
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
                    currentOrder.subtotal?.toFixed(2) || "0.00"
                  } kr</span>
                </div>
                <div class="order-row">
                  <span>Delivery Fee</span>
                  <span id="delivery-fee">${
                    currentOrder.deliveryFee?.toFixed(2) || "0.00"
                  } kr</span>
                </div>
                <div class="order-row total">
                  <span>Total</span>
                  <span id="order-total">${
                    currentOrder.total?.toFixed(2) || "0.00"
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
          this.checkAuthState();
        });

        closeUserBtn.addEventListener("click", () => {
          userSidebar.classList.remove("open");
          userOverlay.classList.remove("open");
        });

        userOverlay.addEventListener("click", () => {
          userSidebar.classList.remove("open");
          userOverlay.classList.remove("open");
        });
      }

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

    async loadUserOrders() {
      const ordersList = document.getElementById("orders-list");
      if (!ordersList || !this.currentUser) return;

      try {
        const response = await fetch(
          `/api/orders/user/${this.currentUser.id}`,
          {
            headers: {
              Authorization: `Bearer ${this.token}`,
            },
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load orders");
        }

        if (data.orders.length === 0) {
          ordersList.innerHTML = `
            <div class="no-orders">
              <i class="ri-shopping-bag-line"></i>
              <p>You don't have any previous orders</p>
              <p class="small">Start ordering from our menu!</p>
            </div>
          `;
          return;
        }

        // Group orders by date
        const ordersByDate = {};
        data.orders.forEach((order) => {
          const date = new Date(order.createdAt).toLocaleDateString("sv-SE", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });

          if (!ordersByDate[date]) {
            ordersByDate[date] = [];
          }
          ordersByDate[date].push(order);
        });

        // Create HTML for each date group
        ordersList.innerHTML = Object.entries(ordersByDate)
          .map(([date, dateOrders]) => {
            return `
            <div class="order-date-group">
              <h4 class="order-date-header">${date}</h4>
              ${dateOrders
                .map((order) => this.createOrderItemHTML(order))
                .join("")}
            </div>
          `;
          })
          .join("");

        // Add event listeners
        this.addOrderEventListeners();
        // 💡 Listen for live updates
        socket.on("orderUpdate", (updatedOrder) => {
          if (!updatedOrder?.user || updatedOrder.user !== this.currentUser?.id)
            return;

          // Optional: avoid duplicate updates
          console.log("🔁 Live order update received:", updatedOrder.status);

          this.showNotification(
            `Order #${updatedOrder.orderNumber} updated to "${updatedOrder.status}"`
          );
          this.loadUserOrders(); // 🔁 Re-fetch & update UI
        });
      } catch (error) {
        console.error("Error loading orders:", error);
        ordersList.innerHTML = `
          <div class="error-loading">
            <i class="ri-error-warning-line"></i>
            <p>Failed to load orders</p>
          </div>
        `;
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
          <i class="${statusInfo.icon}"></i>
          ${statusInfo.label}
        </div>

        <div class="order-progress">
          ${this.createProgressSteps(order.status)}
        </div>

        <div class="order-summary">
          <div class="order-items-preview">
            ${order.items
              .slice(0, 2)
              .map(
                (item) => `
              <div class="preview-item">
                <img src="${item.img || "./assets/images/default-food.jpg"}"
                    alt="${item.name}" width="40" height="40">
                <span>${item.name}</span>
              </div>
            `
              )
              .join("")}
            ${
              order.items.length > 2
                ? `<div class="more-items">+${
                    order.items.length - 2
                  } more</div>`
                : ""
            }
          </div>

          <div class="order-total">${order.total?.toFixed(2) || "0.00"} kr</div>
        </div>

        <div class="order-actions">
          <button class="btn btn-outline view-order" data-order="${
            order.orderNumber
          }">
            View Details
          </button>
          ${
            order.status === "On the Way"
              ? `
            <button class="btn btn-primary track-order" data-order="${order.orderNumber}">
              <i class="ri-map-pin-line"></i> Track
            </button>
          `
              : ""
          }
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
                <span>Delivery Fee:</span>
                <span>${order.deliveryFee.toFixed(2)} kr</span>
              </div>
              <div class="summary-row total">
                <span>Total:</span>
                <span>${order.total.toFixed(2)} kr</span>
              </div>
            </div>
            
            <div class="customer-info">
              <h5>Customer Information</h5>
              <p><strong>Name:</strong> ${order.customer?.name || "N/A"}</p>
              <p><strong>Phone:</strong> ${order.customer?.phone || "N/A"}</p>
              <p><strong>Address:</strong> ${
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
      // Only include modifiers that are not default "Normal" or have price > 0
      if (modifier.label !== "Normal" || modifier.price > 0) {
        modifierDesc += `${modifier.label}`;
        if (modifier.price > 0) {
          modifierDesc += ` (+${modifier.price} kr)`;
        }
        modifierDesc += ", ";
      }
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
