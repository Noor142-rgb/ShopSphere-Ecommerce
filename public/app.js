"use strict";

/* ==========================================================================
   ShopSphere — Premium Frontend Application
   Architecture: Vanilla JS SPA connected to Express + Neo4j AuraDB backend
   ========================================================================== */

const state = {
  products: [],
  categories: [],
  customers: [],
  orders: [],
  sellers: [],
  cart: new Map(),
  user: null,
  role: "guest"
};

const $ = (id) => document.getElementById(id);

function on(id, event, handler) {
  const element = $(id);
  if (element) element.addEventListener(event, handler);
}

/* ---------------- NOTIFICATIONS ---------------- */

let messageTimer = null;

function showMessage(message, isError = false) {
  const box = $("globalMessage");
  if (!box) {
    alert(message);
    return;
  }

  box.textContent = message;
  box.className = `status-banner ${isError ? "error" : "info"}`;
  box.classList.remove("hidden");

  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    box.classList.add("hidden");
  }, 6000);
}

/* ---------------- API CLIENT ---------------- */

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const type = response.headers.get("content-type") || "";
  const result = type.includes("application/json")
    ? await response.json()
    : { message: await response.text() };

  if (!response.ok) {
    throw new Error(
      result.message ||
      result.error ||
      `Request failed (${response.status})`
    );
  }

  return result;
}

function records(data, keys = []) {
  if (Array.isArray(data)) return data;
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

function value(obj, ...keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return "";
}

function esc(input) {
  return String(input ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function money(amount) {
  return Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function productId(p) {
  return value(p, "product_id", "Product_ID", "productId", "id");
}

function productName(p) {
  return value(p, "product_name", "Product_Name", "productName", "name");
}

function productPrice(p) {
  return Number(value(p, "price", "Price") || 0);
}

function productStock(p) {
  return Number(value(p, "stock", "Stock", "quantity") || 0);
}

const PRODUCT_IMAGE_FALLBACKS = {
  "wireless headphones": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
  "smart watch": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",
  "cotton shirt": "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=80",
  "mixer grinder": "https://images.unsplash.com/photo-1570222094114-d054a817e56b?auto=format&fit=crop&w=900&q=80",
  "dbms textbook": "https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=900&q=80",
  "backpack": "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80",
  "keyboard": "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=80",
  "novel": "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=900&q=80",
  "pants": "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=900&q=80",
  "shorts": "https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&w=900&q=80",
  "skirt": "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=900&q=80",
  "phone": "https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=900&q=80",
  "belt": "https://images.unsplash.com/photo-1624222247344-550fb60583dc?auto=format&fit=crop&w=900&q=80",
  "socks": "https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?auto=format&fit=crop&w=900&q=80"
};

const CATEGORY_IMAGE_FALLBACKS = {
  clothing: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=900&q=80",
  electronics: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
  books: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80",
  "home appliances": "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80",
  accessories: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80"
};

function productImageUrl(p) {
  const explicit = value(p, "imageUrl", "image_url", "ImageUrl", "image");
  if (explicit && typeof explicit === "string" && /^https?:\/\//i.test(explicit.trim())) {
    return explicit.trim();
  }

  const nameKey = String(productName(p) || "").toLowerCase().trim();
  if (PRODUCT_IMAGE_FALLBACKS[nameKey]) {
    return PRODUCT_IMAGE_FALLBACKS[nameKey];
  }

  for (const [key, url] of Object.entries(PRODUCT_IMAGE_FALLBACKS)) {
    if (nameKey.includes(key) || key.includes(nameKey)) {
      return url;
    }
  }

  const catKey = String(value(p, "category_name", "categoryName", "category") || "").toLowerCase().trim();
  for (const [cat, url] of Object.entries(CATEGORY_IMAGE_FALLBACKS)) {
    if (catKey.includes(cat) || cat.includes(catKey)) {
      return url;
    }
  }

  return "";
}

function categoryId(c) {
  return typeof c === "string" || typeof c === "number"
    ? c
    : value(c, "category_id", "Category_ID", "categoryId", "id");
}

function categoryName(c) {
  return typeof c === "string" || typeof c === "number"
    ? String(c)
    : String(
        value(
          c,
          "category_name",
          "Category_Name",
          "categoryName",
          "name",
          "category"
        )
      );
}

function sellerId(s) {
  return value(s, "sellerId", "seller_id", "Seller_ID", "id");
}

function sellerName(s) {
  return value(
    s,
    "name",
    "seller_name",
    "Seller_Name",
    "sellerName",
    "store_name",
    "Store_Name"
  );
}

function setVisible(id, visible) {
  $(id)?.classList.toggle("hidden", !visible);
}

/* ---------------- NAVIGATION ---------------- */

function navigate(id) {
  const sections = [
    "homeSection",
    "authSection",
    "productsSection",
    "cartSection",
    "ordersSection",
    "manageSection"
  ];

  sections.forEach(section => setVisible(section, section === id));

  const navMap = {
    homeSection: "homeNav",
    productsSection: "productsNav",
    ordersSection: "ordersNav",
    manageSection: "manageNav",
    authSection: "loginNav",
    cartSection: "cartNav"
  };

  document.querySelectorAll(".nav-link").forEach(btn => btn.classList.remove("active"));
  const activeBtnId = navMap[id];
  if (activeBtnId && $(activeBtnId)) {
    $(activeBtnId).classList.add("active");
  }

  $("mainNav")?.classList.remove("open");
  $("mobileMenuToggle")?.setAttribute("aria-expanded", "false");

  window.scrollTo({ top: 0, behavior: "smooth" });
  if (typeof window.updateParachutePosition === "function") {
    window.updateParachutePosition(0);
  }
}

function updateInterface() {
  const customer = state.role === "customer";
  const admin = state.role === "admin";
  const loggedIn = customer || admin;

  setVisible("ordersNav", loggedIn);
  setVisible("manageNav", admin);
  setVisible("logoutBtn", loggedIn);
  setVisible("loginNav", !loggedIn);

  const accountStatusEl = $("accountStatus");
  const accountChip = $("accountStatusChip");

  if (accountStatusEl) {
    accountStatusEl.textContent = admin
      ? "Admin: Administrator"
      : customer
        ? "Signed in: " + value(state.user, "name", "Name", "email")
        : "Browsing as guest";
  }

  if (accountChip) {
    accountChip.classList.toggle("signed-in", loggedIn);
  }

  if ($("checkoutAccountNotice")) {
    $("checkoutAccountNotice").textContent = customer
      ? "✓ You are signed in. You can place your order now."
      : "Please sign in with a customer account before placing an order.";
  }

  if ($("checkoutBtn")) {
    $("checkoutBtn").disabled = !customer || state.cart.size === 0;
  }
}

/* ---------------- SESSION MANAGEMENT ---------------- */

async function loadSession() {
  try {
    const result = await api("/api/auth/me");
    const user = result.user || result.customer || null;

    if (
      result.role === "admin" ||
      result.isAdmin ||
      (user && user.role === "admin")
    ) {
      state.user = result.admin || user || result;
      state.role = "admin";
    } else if (
      user &&
      result.authenticated !== false &&
      result.loggedIn !== false
    ) {
      state.user = user;
      state.role = "customer";
    } else {
      state.user = null;
      state.role = "guest";
    }
  } catch (error) {
    console.error("Could not load session:", error.message);
    state.user = null;
    state.role = "guest";
  }

  updateInterface();
}

/* ---------------- PRODUCTS & CATEGORIES ---------------- */

async function loadProducts() {
  try {
    const result = await api("/api/products");

    state.products = records(result, [
      "products",
      "data",
      "results"
    ]);

    renderProducts();
    renderManageProducts();
  } catch (error) {
    if ($("productList")) {
      $("productList").innerHTML =
        `<div class="catalog-empty-box">
          <p class="catalog-empty-title">Could not load products</p>
          <p class="catalog-empty-text">${esc(error.message)}</p>
        </div>`;
    }
    console.error("Could not load products:", error.message);
  }
}

async function loadCategories() {
  try {
    const result = await api("/api/categories");

    state.categories = records(result, [
      "categories",
      "data",
      "results"
    ])
      .map(c =>
        typeof c === "string" || typeof c === "number"
          ? {
              category_id: String(c),
              category_name: String(c)
            }
          : {
              ...c,
              category_id: categoryId(c),
              category_name: categoryName(c)
            }
      )
      .filter(c => c.category_name);

    renderCategories();
    renderProducts();
  } catch (error) {
    console.error("Could not load categories:", error.message);
  }
}

function renderCategories() {
  for (const id of ["categoryFilter", "productCategory"]) {
    const select = $(id);
    if (!select) continue;

    const selected = select.value;

    const first = id === "categoryFilter"
      ? '<option value="">All Categories</option>'
      : '<option value="">Select category</option>';

    select.innerHTML = first + state.categories.map(c =>
      `<option value="${esc(categoryId(c))}">${esc(categoryName(c))}</option>`
    ).join("");

    if ([...select.options].some(o => o.value === selected)) {
      select.value = selected;
    }
  }
}

async function loadSellers() {
  const select = $("productSeller");
  if (!select) return;

  const previousValue = select.value;
  select.innerHTML = '<option value="">Loading sellers...</option>';

  try {
    const result = await api("/api/sellers");

    state.sellers = records(result, [
      "sellers",
      "data",
      "results"
    ]);

    select.innerHTML = '<option value="">Select a seller</option>';

    for (const seller of state.sellers) {
      const id = sellerId(seller);
      const name = sellerName(seller);

      if (id === "" || id === null || id === undefined || !name) {
        continue;
      }

      const option = document.createElement("option");
      option.value = String(id);
      option.textContent = String(name);
      select.appendChild(option);
    }

    if (
      previousValue &&
      [...select.options].some(option => option.value === previousValue)
    ) {
      select.value = previousValue;
    }
  } catch (error) {
    state.sellers = [];
    select.innerHTML = '<option value="">Could not load sellers</option>';
    console.error("Could not load sellers:", error.message);
  }
}

/* ---------------- TASTEFUL NEUTRAL PLACEHOLDER ---------------- */

function getNeutralPlaceholder(categoryName, productName) {
  const cat = String(categoryName || "Curated").toLowerCase();
  
  let iconPath = `<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path>`;
  if (/cloth|shirt|pants|shorts|skirt|apparel/.test(cat)) {
    iconPath = `<path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.5a2 2 0 0 0 1.5 1.62L6 11.2V21a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9.8l1.64-.39a2 2 0 0 0 1.5-1.62l.58-3.5a2 2 0 0 0-1.34-2.23z"></path>`;
  } else if (/elec|phone|headphone|keyboard|watch/.test(cat)) {
    iconPath = `<rect x="4" y="4" width="16" height="16" rx="2"></rect><line x1="9" y1="9" x2="15" y2="9"></line><line x1="9" y1="13" x2="15" y2="13"></line><line x1="9" y1="17" x2="13" y2="17"></line>`;
  } else if (/book/.test(cat)) {
    iconPath = `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>`;
  } else if (/home|appliance|kitchen/.test(cat)) {
    iconPath = `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>`;
  } else if (/access/.test(cat)) {
    iconPath = `<rect x="3" y="8" width="18" height="13" rx="2"></rect><path d="M8 8V5a4 4 0 0 1 8 0v3"></path>`;
  }

  return `
    <div class="product-placeholder-art" aria-hidden="true">
      <div class="placeholder-icon-circle">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          ${iconPath}
        </svg>
      </div>
      <span class="placeholder-tag">${esc(cat)}</span>
    </div>
  `;
}

/* ---------------- PRODUCT CATALOG DISPLAY ---------------- */

function renderProducts() {
  const list = $("productList");
  if (!list) return;

  const search = ($("searchInput")?.value || "").toLowerCase().trim();
  const selected = $("categoryFilter")?.value || "";

  const filtered = state.products.filter(p => {
    const name = String(productName(p)).toLowerCase();
    const description = String(value(p, "description", "Description")).toLowerCase();

    const matchesSearch =
      !search ||
      name.includes(search) ||
      description.includes(search);

    const pCategoryId = value(p, "category_id", "Category_ID", "categoryId");
    const pCategoryName = String(
      value(p, "category_name", "Category_Name", "categoryName", "category")
    ).trim().toLowerCase();

    const chosen = state.categories.find(c =>
      String(categoryId(c)) === String(selected) ||
      categoryName(c).trim().toLowerCase() === String(selected).trim().toLowerCase()
    );

    const chosenName = chosen ? categoryName(chosen).trim().toLowerCase() : "";

    const matchesCategory =
      !selected ||
      String(pCategoryId) === String(selected) ||
      (chosenName && pCategoryName === chosenName);

    return matchesSearch && matchesCategory;
  });

  const summaryEl = $("productResultsSummary");
  if (summaryEl) {
    const catLabel = selected
      ? ` in ${state.categories.find(c => String(categoryId(c)) === String(selected))?.category_name || selected}`
      : "";
    summaryEl.textContent = `Showing ${filtered.length} ${filtered.length === 1 ? "product" : "products"}${catLabel}`;
  }

  if (!filtered.length) {
    list.innerHTML = `
      <div class="catalog-empty-box">
        <div class="catalog-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </div>
        <h3 class="catalog-empty-title">No products match your criteria</h3>
        <p class="catalog-empty-text">Try adjusting your search terms or clearing category filters.</p>
        <button type="button" class="btn-primary" id="clearFiltersBtn" style="padding: 10px 20px; font-size: 0.875rem;">Clear Filters</button>
      </div>`;

    $("clearFiltersBtn")?.addEventListener("click", () => {
      if ($("searchInput")) $("searchInput").value = "";
      if ($("categoryFilter")) $("categoryFilter").value = "";
      renderProducts();
    });
    return;
  }

  list.innerHTML = filtered.map(p => {
    const id = productId(p);
    const name = productName(p);
    const stock = productStock(p);
    const price = productPrice(p);
    const imgUrl = productImageUrl(p);
    const pCategory = value(p, "category_name", "Category_Name", "categoryName", "category") || "Collection";
    const seller = value(p, "seller", "seller_name", "Seller") || "Verified Seller";
    const desc = value(p, "description", "Description") || "Hand-selected quality goods from ShopSphere.";

    let stockBadgeClass = "in-stock";
    let stockBadgeText = `In Stock (${stock})`;
    if (stock <= 0) {
      stockBadgeClass = "out-stock";
      stockBadgeText = "Out of Stock";
    } else if (stock <= 10) {
      stockBadgeClass = "low-stock";
      stockBadgeText = `Only ${stock} left`;
    }

    let mediaHtml = "";
    if (imgUrl && /^https?:\/\//i.test(imgUrl)) {
      mediaHtml = `
        <img
          class="product-real-img"
          src="${esc(imgUrl)}"
          alt="${esc(name)}"
          loading="lazy"
          onerror="this.onerror=null; this.parentElement.innerHTML = getNeutralPlaceholder('${esc(pCategory)}', '${esc(name)}');"
        >`;
    } else {
      mediaHtml = getNeutralPlaceholder(pCategory, name);
    }

    return `
      <article class="product-card">
        <div class="product-media-container">
          ${mediaHtml}
          <span class="product-category-chip">${esc(pCategory)}</span>
          <span class="product-stock-chip ${stockBadgeClass}">${stockBadgeText}</span>
        </div>

        <div class="product-details">
          <h3 class="product-title">${esc(name)}</h3>
          <div class="product-seller-text">by ${esc(seller)}</div>
          <p class="product-desc">${esc(desc)}</p>

          <div class="product-footer-row">
            <span class="product-price-tag">₹${money(price)}</span>
            <button
              type="button"
              class="btn-add-cart"
              data-add-cart="${esc(id)}"
              ${stock <= 0 ? "disabled" : ""}
              aria-label="Add ${esc(name)} to cart"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Add</span>
            </button>
          </div>
        </div>
      </article>`;
  }).join("");
}

/* ---------------- CART STATE & PERSISTENCE ---------------- */

const CART_STORAGE_KEY = "shopsphere_cart_state_v1";

function saveCartToStorage() {
  try {
    const serialized = Array.from(state.cart.entries()).map(([id, item]) => ({
      id,
      product: item.product,
      quantity: item.quantity
    }));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(serialized));
  } catch (e) {
    console.warn("Could not save cart to localStorage:", e);
  }
}

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return;
    const items = JSON.parse(raw);
    if (Array.isArray(items)) {
      state.cart.clear();
      for (const item of items) {
        if (item.id && item.product && item.quantity > 0) {
          state.cart.set(String(item.id), {
            product: item.product,
            quantity: Number(item.quantity)
          });
        }
      }
    }
  } catch (e) {
    console.warn("Could not restore cart from localStorage:", e);
  }
}

function addToCart(id) {
  const product = state.products.find(
    p => String(productId(p)) === String(id)
  );

  if (!product) {
    return showMessage("Product not found. Refreshing...", true);
  }

  const existing = state.cart.get(String(id));
  const quantity = existing ? existing.quantity : 0;

  if (quantity >= productStock(product)) {
    return showMessage("Available inventory limit reached for this item.", true);
  }

  state.cart.set(String(id), {
    product,
    quantity: quantity + 1
  });

  saveCartToStorage();
  renderCart();
  showMessage(`${productName(product)} added to your cart.`);
}

function changeQuantity(id, amount) {
  const item = state.cart.get(String(id));
  if (!item) return;

  const next = item.quantity + amount;

  if (next <= 0) {
    state.cart.delete(String(id));
  } else if (next > productStock(item.product)) {
    showMessage("Available inventory limit reached.", true);
  } else {
    item.quantity = next;
  }

  saveCartToStorage();
  renderCart();
}

function renderCart() {
  const list = $("cartList");
  let total = 0;
  let count = 0;

  for (const item of state.cart.values()) {
    total += productPrice(item.product) * item.quantity;
    count += item.quantity;
  }

  if ($("cartCount")) {
    $("cartCount").textContent = count;
  }

  if ($("cartTotal")) {
    $("cartTotal").textContent = money(total);
  }

  if ($("cartItemsSubtotal")) {
    $("cartItemsSubtotal").textContent = money(total);
  }

  if (list) {
    if (!state.cart.size) {
      list.innerHTML = `
        <div style="text-align: center; padding: 48px 16px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-light); margin-bottom: 12px;">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          <p style="font-family: var(--font-serif); font-size: 1.125rem; color: var(--forest-green); margin: 0 0 6px;">Your cart is empty</p>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0 0 18px;">Discover our collection to find something you will love.</p>
          <button type="button" class="btn-primary" onclick="navigate('productsSection')" style="font-size: 0.875rem; padding: 10px 20px;">Explore Catalog</button>
        </div>`;
    } else {
      list.innerHTML = Array.from(state.cart.entries()).map(([id, item]) => {
        const p = item.product;
        const img = productImageUrl(p);
        const name = productName(p);
        const price = productPrice(p);
        const subtotal = price * item.quantity;

        const thumbHtml = img && /^https?:\/\//i.test(img)
          ? `<img src="${esc(img)}" alt="${esc(name)}">`
          : `<div style="font-size: 1.5rem; color: var(--sand-dark);">◆</div>`;

        return `
          <div class="cart-item-card">
            <div class="cart-item-thumb">
              ${thumbHtml}
            </div>
            <div>
              <h4 class="cart-item-title">${esc(name)}</h4>
              <p class="cart-item-unit-price">₹${money(price)} each</p>
              <div class="cart-stepper-wrap">
                <button type="button" class="stepper-btn" data-quantity="${esc(id)}" data-change="-1" aria-label="Decrease quantity">−</button>
                <span class="stepper-val">${item.quantity}</span>
                <button type="button" class="stepper-btn" data-quantity="${esc(id)}" data-change="1" aria-label="Increase quantity">+</button>
              </div>
            </div>
            <div class="cart-item-subtotal">
              ₹${money(subtotal)}
            </div>
          </div>`;
      }).join("");
    }
  }

  updateInterface();
}

/* ---------------- CUSTOMER LIST (ADMIN) ---------------- */

async function loadCustomers() {
  if (state.role !== "admin") return;

  try {
    const result = await api("/api/customers");
    state.customers = records(result, ["customers", "data", "results"]);
    renderCustomers();
  } catch (error) {
    if ($("customerList")) {
      $("customerList").innerHTML = `<p>${esc(error.message)}</p>`;
    }
  }
}

function renderCustomers() {
  const list = $("customerList");
  if (!list) return;

  if (state.role !== "admin") {
    list.innerHTML = "<p>Administrator access required.</p>";
    return;
  }

  if (!state.customers.length) {
    list.innerHTML = "<p>No customer records found.</p>";
    return;
  }

  list.innerHTML = state.customers.map(c => `
    <div class="manage-item-row">
      <div>
        <strong style="color: var(--forest-green); font-size: 0.9375rem;">${esc(value(c, "name", "Name"))}</strong>
        <div style="font-size: 0.8125rem; color: var(--text-muted);">${esc(value(c, "email", "Email"))}</div>
        <div style="font-size: 0.75rem; color: var(--text-light);">${esc(value(c, "address", "Address"))}</div>
      </div>
      <span class="order-status-badge">ID: ${esc(value(c, "customer_id", "Customer_ID", "customerId", "id"))}</span>
    </div>`).join("");
}

/* ---------------- ORDERS ---------------- */

async function loadOrders() {
  if (state.role === "guest") return;

  try {
    const endpoint = state.role === "admin"
      ? "/api/orders"
      : "/api/my/orders";

    const result = await api(endpoint);
    state.orders = records(result, ["orders", "data", "results"]);
    renderOrders();
  } catch (error) {
    const list = state.role === "admin" ? $("adminOrdersList") : $("ordersList");
    if (list) {
      list.innerHTML = `<p>${esc(error.message)}</p>`;
    }
  }
}

function renderOrders() {
  const list = state.role === "admin" ? $("adminOrdersList") : $("ordersList");
  if (!list) return;

  if (state.role === "guest") {
    list.innerHTML = "<p>Please sign in to view your orders.</p>";
    return;
  }

  let confirmationHtml = "";
  if (state.recentOrderConfirmation && state.role === "customer") {
    const o = state.recentOrderConfirmation;
    confirmationHtml = `
      <div class="order-success-banner" role="alert">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
          <div>
            <h3 style="margin: 0 0 6px; color: var(--forest-green); font-family: var(--font-serif); font-size: 1.25rem;">
              ✓ Order Confirmed!
            </h3>
            <p style="margin: 0; color: var(--text-dark); font-size: 0.9375rem;">
              Thank you for your purchase. Your order <strong>#${esc(o.orderId)}</strong> has been received.
            </p>
          </div>
          <div style="text-align: right; min-width: 140px;">
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">Amount Charged</div>
            <div style="font-size: 1.35rem; font-weight: 700; color: var(--forest-green); font-family: var(--font-serif);">
              ₹${money(o.totalAmount)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (!state.orders.length) {
    list.innerHTML = confirmationHtml + `
      <div style="text-align: center; padding: 36px 16px;">
        <p style="color: var(--text-muted); margin: 0;">No past order records found.</p>
      </div>`;
    return;
  }

  const ordersHtml = state.orders.map(order => {
    const orderId = value(order, "orderId", "order_id", "id");
    const total = Number(value(order, "totalAmount", "total_amount", "total", "amount", "TotalAmount") || 0);
    const date = value(order, "orderDate", "date", "created_at", "order_date") || "Recent";
    const customer = value(order, "customerName", "customer_name", "customer");
    const status = value(order, "status", "Status") || "Placed";
    const items = records(order, ["items", "products", "details"]);

    return `
      <div class="order-card">
        <div class="order-header-row">
          <div>
            <span class="order-id-badge">Order #${esc(orderId)}</span>
            <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 10px;">${esc(date)}</span>
          </div>
          <span class="order-status-badge">${esc(status)}</span>
        </div>
        ${customer && state.role === "admin" ? `<div style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 8px;">Customer: <strong>${esc(customer)}</strong></div>` : ""}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 0.875rem; color: var(--text-muted);">Total Amount</span>
          <span style="font-size: 1.125rem; font-weight: 700; color: var(--forest-green);">
            ₹${money(total)}
          </span>
        </div>
        ${items.length ? `
          <div style="font-size: 0.8125rem; color: var(--text-muted); border-top: 1px dashed var(--border-subtle); padding-top: 10px; margin-top: 6px;">
            <div style="font-weight: 600; margin-bottom: 4px; color: var(--text-dark);">Items:</div>
            <ul style="margin: 0; padding-left: 18px; line-height: 1.6;">
              ${items.map(it => `
                <li>
                  ${esc(it.productName || it.name || productName(it))} &times; ${it.quantity || 1}
                  <span style="color: var(--text-light); margin-left: 6px;">(₹${money(it.subtotal || (Number(it.price || 0) * (it.quantity || 1)))})</span>
                </li>
              `).join("")}
            </ul>
          </div>` : ""}
      </div>`;
  }).join("");

  list.innerHTML = confirmationHtml + ordersHtml;
}

/* ---------------- STORE MANAGEMENT (ADMIN) ---------------- */

function renderManageProducts() {
  const list = $("manageProductList");
  if (!list) return;

  if (state.role !== "admin") {
    list.innerHTML = "<p>Administrator access required.</p>";
    return;
  }

  if (!state.products.length) {
    list.innerHTML = "<p>No products in store catalog.</p>";
    return;
  }

  list.innerHTML = state.products.map(p => {
    const id = productId(p);
    const name = productName(p);
    const price = productPrice(p);
    const stock = productStock(p);
    const img = productImageUrl(p);

    const thumbHtml = img && /^https?:\/\//i.test(img)
      ? `<img src="${esc(img)}" alt="${esc(name)}" style="width: 44px; height: 44px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); flex-shrink: 0;">`
      : `<div style="width: 44px; height: 44px; border-radius: var(--radius-sm); background: var(--bg-surface-subtle); display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 1rem; flex-shrink: 0;">📦</div>`;

    return `
      <div class="manage-item-row">
        <div style="display: flex; align-items: center; gap: 14px;">
          ${thumbHtml}
          <div>
            <strong style="color: var(--forest-green);">${esc(name)}</strong>
            <div style="font-size: 0.8125rem; color: var(--text-muted);">
              ₹${money(price)} &bull; Stock: ${stock} &bull; ID: ${esc(id)}
            </div>
          </div>
        </div>
        <div class="manage-actions">
          <button type="button" class="btn-sm-edit" data-edit-product="${esc(id)}">Edit</button>
          <button type="button" class="btn-sm-delete" data-delete-product="${esc(id)}">Delete</button>
        </div>
      </div>`;
  }).join("");
}

function resetProductForm() {
  const form = $("productForm");
  if (form) form.reset();

  if ($("productId")) $("productId").value = "";
  if ($("productImageUrl")) $("productImageUrl").value = "";
  if ($("productFormHeading")) $("productFormHeading").textContent = "Add Product";
  if ($("saveProductBtn")) $("saveProductBtn").textContent = "Save Product";
  setVisible("cancelEditBtn", false);
}

function editProduct(id) {
  const product = state.products.find(p => String(productId(p)) === String(id));
  if (!product) return;

  if ($("productId")) $("productId").value = id;
  if ($("productName")) $("productName").value = productName(product);
  if ($("productPrice")) $("productPrice").value = productPrice(product);
  if ($("productStock")) $("productStock").value = productStock(product);
  if ($("productDescription")) $("productDescription").value = value(product, "description", "Description");
  if ($("productImageUrl")) $("productImageUrl").value = productImageUrl(product) || "";

  const catVal = value(product, "category_id", "category_name", "category");
  if ($("productCategory")) $("productCategory").value = catVal;

  const sellVal = sellerId(product) || value(product, "seller");
  if ($("productSeller")) $("productSeller").value = sellVal;

  if ($("productFormHeading")) $("productFormHeading").textContent = "Edit Product #" + id;
  if ($("saveProductBtn")) $("saveProductBtn").textContent = "Update Product";
  setVisible("cancelEditBtn", true);

  $("productForm")?.scrollIntoView({ behavior: "smooth" });
}

async function saveProduct(event) {
  event.preventDefault();

  if (state.role !== "admin") {
    return showMessage("Administrator access required.", true);
  }

  const id = $("productId")?.value.trim();
  const name = $("productName")?.value.trim();
  const price = Number($("productPrice")?.value);
  const stock = Number.parseInt($("productStock")?.value, 10);
  const selectedCategory = $("productCategory")?.value.trim();
  const selectedSellerId = $("productSeller")?.value.trim();
  const description = $("productDescription")?.value.trim();
  const imageUrl = $("productImageUrl")?.value.trim() || "";

  if (
    !name ||
    !selectedCategory ||
    !selectedSellerId ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(stock) ||
    stock < 0
  ) {
    return showMessage("Please enter product name, category, seller, valid price, and stock.", true);
  }

  const selectedSeller = state.sellers.find(
    s => String(sellerId(s)) === selectedSellerId
  );

  if (!selectedSeller) {
    await loadSellers();
    return showMessage("Seller list refreshed. Please re-select a seller and submit.", true);
  }

  const catObj = state.categories.find(c =>
    String(categoryId(c)) === selectedCategory ||
    categoryName(c).toLowerCase() === selectedCategory.toLowerCase()
  );

  const category = catObj ? categoryName(catObj) : selectedCategory;

  const body = {
    name,
    description,
    category,
    sellerId: String(sellerId(selectedSeller)),
    price,
    stock,
    imageUrl
  };

  try {
    await api(
      id ? `/api/products/${encodeURIComponent(id)}` : "/api/products",
      {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(body)
      }
    );

    resetProductForm();
    await loadProducts();
    await loadCategories();
    await loadSellers();

    showMessage(id ? "Product updated." : "Product added successfully.");
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function deleteProduct(id) {
  if (state.role !== "admin") {
    return showMessage("Administrator access required.", true);
  }

  if (!confirm("Are you sure you want to delete this product?")) {
    return;
  }

  try {
    await api(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadProducts();
    showMessage("Product deleted.");
  } catch (error) {
    showMessage(error.message, true);
  }
}

/* ---------------- CHECKOUT & ORDERS ---------------- */

async function checkout() {
  if (state.role !== "customer") {
    navigate("authSection");
    return showMessage("Please sign in as a customer to place an order.", true);
  }

  if (!state.cart.size) {
    return showMessage("Your cart is empty.", true);
  }

  const items = Array.from(state.cart.entries()).map(([id, item]) => ({
    productId: id,
    quantity: item.quantity
  }));

  try {
    $("checkoutBtn").disabled = true;
    $("checkoutBtn").textContent = "Processing Order...";

    const result = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({ items })
    });

    state.cart.clear();
    saveCartToStorage();
    renderCart();

    const orderTotal = Number(result.totalAmount || result.total_amount || result.total || 0);
    state.recentOrderConfirmation = {
      orderId: result.orderId,
      totalAmount: orderTotal,
      status: result.status || "Placed"
    };

    const successMsg = orderTotal > 0
      ? `Order #${result.orderId || ""} placed successfully! Total Amount: ₹${money(orderTotal)}`
      : `Order #${result.orderId || ""} placed successfully!`;

    showMessage(successMsg);
    await Promise.all([loadOrders(), loadProducts()]);
    navigate("ordersSection");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    if ($("checkoutBtn")) {
      $("checkoutBtn").textContent = "Place Order";
      $("checkoutBtn").disabled = state.cart.size === 0 || state.role !== "customer";
    }
  }
}

/* ---------------- AUTH HANDLERS ---------------- */

async function handleCustomerLogin(event) {
  event.preventDefault();
  const email = $("loginEmail")?.value.trim();
  const password = $("loginPassword")?.value;

  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    state.user = result.user || result.customer || { email };
    state.role = "customer";

    updateInterface();
    showMessage("Welcome back! Signed in successfully.");
    await loadOrders();
    navigate("productsSection");
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const name = $("signupName")?.value.trim();
  const email = $("signupEmail")?.value.trim();
  const address = $("signupAddress")?.value.trim();
  const password = $("signupPassword")?.value;

  try {
    await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, address, password })
    });

    showMessage("Account created! Signing you in...");

    const loginRes = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    state.user = loginRes.user || { name, email };
    state.role = "customer";

    updateInterface();
    navigate("productsSection");
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const username = $("adminUsername")?.value.trim();
  const password = $("adminPassword")?.value;

  try {
    const result = await api("/api/auth/admin-login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    state.user = result.user || { name: "Administrator", role: "admin" };
    state.role = "admin";

    updateInterface();
    showMessage("Administrator authenticated.");

    await Promise.all([
      loadSellers(),
      loadCustomers(),
      loadOrders()
    ]);

    navigate("manageSection");
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (e) {
    console.warn("Logout request:", e.message);
  }

  state.user = null;
  state.role = "guest";
  updateInterface();
  showMessage("Signed out successfully.");
  navigate("homeSection");
}

/* ---------------- AUTH TAB SWITCHING ---------------- */

function setupAuthTabs() {
  const tabLogin = $("tabCustomerLogin");
  const tabRegister = $("tabCustomerRegister");
  const toggleAdmin = $("toggleAdminPortalBtn");

  const cardLogin = $("customerLoginCard");
  const cardRegister = $("customerSignupCard");
  const cardAdmin = $("adminLoginCard");

  function showTab(type) {
    if (tabLogin) {
      tabLogin.classList.toggle("active", type === "login");
      tabLogin.setAttribute("aria-selected", type === "login");
    }
    if (tabRegister) {
      tabRegister.classList.toggle("active", type === "register");
      tabRegister.setAttribute("aria-selected", type === "register");
    }

    setVisible("customerLoginCard", type === "login");
    setVisible("customerSignupCard", type === "register");
    setVisible("adminLoginCard", type === "admin");
  }

  tabLogin?.addEventListener("click", () => showTab("login"));
  tabRegister?.addEventListener("click", () => showTab("register"));
  toggleAdmin?.addEventListener("click", () => {
    const isAdminVisible = !cardAdmin?.classList.contains("hidden");
    showTab(isAdminVisible ? "login" : "admin");
    toggleAdmin.textContent = isAdminVisible
      ? "Store Administrator? Sign in here"
      : "← Return to Customer Sign In";
  });
}

/* ---------------- HEADER SCROLL & MOBILE MENU ---------------- */

function setupHeaderInteractivity() {
  const header = $("siteHeader");
  window.addEventListener("scroll", () => {
    if (window.scrollY > 20) {
      header?.classList.add("scrolled");
    } else {
      header?.classList.remove("scrolled");
    }
  }, { passive: true });

  const toggle = $("mobileMenuToggle");
  const nav = $("mainNav");

  toggle?.addEventListener("click", () => {
    const isOpen = nav?.classList.toggle("open");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
}

/* ---------------- EVENT WIRING ---------------- */

function wireEvents() {
  on("brandLogo", "click", () => navigate("homeSection"));
  on("brandLogo", "keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate("homeSection");
    }
  });

  on("homeNav", "click", () => navigate("homeSection"));
  on("productsNav", "click", () => navigate("productsSection"));
  on("shopNowBtn", "click", () => navigate("productsSection"));
  on("heroCategoriesBtn", "click", () => {
    navigate("productsSection");
    $("categoryFilter")?.focus();
  });
  on("cartNav", "click", () => navigate("cartSection"));

  on("ordersNav", "click", async () => {
    if (state.role === "guest") return navigate("authSection");
    await loadOrders();
    navigate("ordersSection");
  });

  on("manageNav", "click", async () => {
    if (state.role !== "admin") {
      return showMessage("Administrator access required.", true);
    }
    await Promise.all([
      loadSellers(),
      loadCustomers(),
      loadOrders()
    ]);
    navigate("manageSection");
  });

  on("loginNav", "click", () => navigate("authSection"));
  on("logoutBtn", "click", logout);

  on("footerHomeLink", "click", (e) => { e.preventDefault(); navigate("homeSection"); });
  on("footerProductsLink", "click", (e) => { e.preventDefault(); navigate("productsSection"); });
  on("footerCartLink", "click", (e) => { e.preventDefault(); navigate("cartSection"); });
  on("footerSignInLink", "click", (e) => { e.preventDefault(); navigate("authSection"); });
  on("footerAdminLink", "click", (e) => {
    e.preventDefault();
    if (state.role === "admin") {
      navigate("manageSection");
    } else {
      navigate("authSection");
      $("toggleAdminPortalBtn")?.click();
    }
  });

  on("customerLoginForm", "submit", handleCustomerLogin);
  on("customerSignupForm", "submit", handleSignup);
  on("adminLoginForm", "submit", handleAdminLogin);

  on("searchInput", "input", renderProducts);
  on("categoryFilter", "change", renderProducts);

  on("productList", "click", event => {
    const button = event.target.closest("[data-add-cart]");
    if (button) {
      addToCart(button.dataset.addCart);
    }
  });

  on("cartList", "click", event => {
    const button = event.target.closest("[data-quantity]");
    if (button) {
      changeQuantity(
        button.dataset.quantity,
        Number(button.dataset.change)
      );
    }
  });

  on("checkoutBtn", "click", checkout);

  on("productForm", "submit", saveProduct);
  on("cancelEditBtn", "click", resetProductForm);

  on("manageProductList", "click", event => {
    const edit = event.target.closest("[data-edit-product]");
    const remove = event.target.closest("[data-delete-product]");

    if (edit) editProduct(edit.dataset.editProduct);
    if (remove) deleteProduct(remove.dataset.deleteProduct);
  });

  setupAuthTabs();
  setupHeaderInteractivity();
}

/* ---------------- CATALOG PARACHUTE SCROLL ANIMATION ---------------- */

function initParachuteScroll() {
  const wrapper = $("parachuteWrapper");
  if (!wrapper) return;

  let ticking = false;

  function updatePosition() {
    const section = $("productsSection");
    if (!section || section.classList.contains("hidden")) return;

    const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, scrollY / maxScroll));

    // Vertical: moves smoothly from top (0px) to bottom
    const sectionHeight = section.scrollHeight || section.offsetHeight;
    const wrapperHeight = wrapper.offsetHeight || 220;
    const maxMoveY = Math.max(0, sectionHeight - wrapperHeight - 40);
    const moveY = progress * maxMoveY;

    // Horizontal: moves smoothly from left (0px) to right across the page
    const trackWidth = section.clientWidth || window.innerWidth;
    const wrapperWidth = wrapper.offsetWidth || 180;
    const maxMoveX = Math.max(0, trackWidth - wrapperWidth - 60);
    const moveX = progress * maxMoveX;

    wrapper.style.transform = `translate3d(${moveX}px, ${moveY}px, 0)`;
    ticking = false;
  }

  window.addEventListener("scroll", () => {
    if (!ticking) {
      window.requestAnimationFrame(updatePosition);
      ticking = true;
    }
  }, { passive: true });

  window.updateParachutePosition = (y = 0) => {
    const section = $("productsSection");
    if (!section) return;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, y / maxScroll));
    const sectionHeight = section.scrollHeight || section.offsetHeight;
    const wrapperHeight = wrapper.offsetHeight || 220;
    const maxMoveY = Math.max(0, sectionHeight - wrapperHeight - 40);
    const moveY = progress * maxMoveY;

    const trackWidth = section.clientWidth || window.innerWidth;
    const wrapperWidth = wrapper.offsetWidth || 180;
    const maxMoveX = Math.max(0, trackWidth - wrapperWidth - 60);
    const moveX = progress * maxMoveX;

    wrapper.style.transform = `translate3d(${moveX}px, ${moveY}px, 0)`;
  };

  updatePosition();
}

/* ---------------- SHOPSPHERE LANDING WINK SOUND & ANIMATION ---------------- */

const LOADING_DURATION = 5500;
const WINK_AT = 3000;

let winkAudioBuffer = null;
let winkAudioContext = null;
let hasPlayedWinkSound = false;

async function prepareWinkAudio() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      winkAudioContext = new AudioCtx();
    }
    const resp = await fetch("freesound_community-cartoon_wink_magic_sparkle-6896.mp3");
    if (resp.ok && winkAudioContext) {
      const arr = await resp.arrayBuffer();
      winkAudioBuffer = await winkAudioContext.decodeAudioData(arr);
    }
  } catch (err) {
    console.warn("Pre-loading audio buffer:", err);
  }
}

function unlockAudioOnGesture() {
  if (winkAudioContext && winkAudioContext.state === "suspended") {
    winkAudioContext.resume().catch(() => {});
  }
  const el = $("winkAudioElement");
  if (el) {
    el.load();
  }
}

["pointerdown", "touchstart", "click", "keydown"].forEach((evt) => {
  window.addEventListener(evt, unlockAudioOnGesture, { passive: true });
});

function playWinkSound() {
  if (hasPlayedWinkSound) return;
  hasPlayedWinkSound = true;

  // 1. Try Web Audio API with pre-decoded buffer (Highest reliability)
  if (winkAudioContext && winkAudioBuffer) {
    try {
      if (winkAudioContext.state === "suspended") {
        winkAudioContext.resume();
      }
      const source = winkAudioContext.createBufferSource();
      const gainNode = winkAudioContext.createGain();
      gainNode.gain.setValueAtTime(1.0, winkAudioContext.currentTime);
      source.buffer = winkAudioBuffer;
      source.connect(gainNode);
      gainNode.connect(winkAudioContext.destination);
      source.start(0);
      return;
    } catch (e) {
      console.warn("Buffer playback fallback:", e);
    }
  }

  // 2. Try HTML5 Audio Element in DOM
  const el = $("winkAudioElement");
  if (el) {
    el.currentTime = 0;
    el.volume = 1.0;
    const p = el.play();
    if (p !== undefined) {
      p.catch(() => {
        try {
          const a = new Audio("freesound_community-cartoon_wink_magic_sparkle-6896.mp3");
          a.volume = 1.0;
          a.play().catch(() => {});
        } catch (_) {}
      });
      return;
    }
  }

  // 3. Try direct new Audio
  try {
    const a = new Audio("freesound_community-cartoon_wink_magic_sparkle-6896.mp3");
    a.volume = 1.0;
    a.play().catch(() => {});
  } catch (_) {}
}

function initLoadingScreen() {
  const loadingEl = $("loadingScreen");
  if (!loadingEl) return;

  prepareWinkAudio();

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Wink sound triggers strictly at 3 seconds (when the eye winks)
  const soundTimer = setTimeout(() => {
    if (!reduceMotion) {
      playWinkSound();
    }
  }, WINK_AT);

  const completeLanding = () => {
    clearTimeout(soundTimer);
    loadingEl.classList.add("fade-out");
    setTimeout(() => {
      if (loadingEl.parentNode) {
        loadingEl.parentNode.removeChild(loadingEl);
      }
      navigate("homeSection");
    }, 500);
  };

  const exitTimer = setTimeout(completeLanding, LOADING_DURATION);

  // Touching or clicking landing screen unlocks audio, does NOT cancel the wink
  loadingEl.addEventListener("pointerdown", () => {
    unlockAudioOnGesture();
  });

  const skipBtn = $("skipLandingBtn");
  if (skipBtn) {
    skipBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      clearTimeout(exitTimer);
      clearTimeout(soundTimer);
      completeLanding();
    });
  }
}

/* ---------------- START APPLICATION ---------------- */

async function startShopSphere() {
  loadCartFromStorage();
  wireEvents();
  initLoadingScreen();
  initParachuteScroll();

  await loadSession();

  await Promise.all([
    loadCategories(),
    loadProducts()
  ]);

  renderCart();
  updateInterface();

  if (state.role === "admin") {
    await Promise.all([
      loadSellers(),
      loadCustomers(),
      loadOrders()
    ]);
  } else if (state.role === "customer") {
    await loadOrders();
  }

  console.log("ShopSphere premium frontend initialized.");
}

document.addEventListener("DOMContentLoaded", startShopSphere);
