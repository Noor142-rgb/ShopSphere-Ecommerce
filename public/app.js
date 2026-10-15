"use strict";

/* ShopSphere frontend */

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

function showMessage(message, isError = false) {
  const box = $("globalMessage");

  if (!box) {
    alert(message);
    return;
  }

  box.textContent = message;
  box.classList.remove("hidden");
  box.style.background = isError ? "#fee2e2" : "#eef2ff";
  box.style.color = isError ? "#991b1b" : "#3730a3";
}

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

function navigate(id) {
  [
    "homeSection",
    "authSection",
    "productsSection",
    "cartSection",
    "ordersSection",
    "manageSection"
  ].forEach(section => setVisible(section, section === id));

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateInterface() {
  const customer = state.role === "customer";
  const admin = state.role === "admin";
  const loggedIn = customer || admin;

  setVisible("ordersNav", loggedIn);
  setVisible("manageNav", admin);
  setVisible("logoutBtn", loggedIn);
  setVisible("loginNav", !loggedIn);

  if ($("accountStatus")) {
    $("accountStatus").textContent = admin
      ? "Administrator"
      : customer
        ? "Signed in: " + value(state.user, "name", "Name", "email")
        : "Browsing as guest";
  }

  if ($("checkoutAccountNotice")) {
    $("checkoutAccountNotice").textContent = customer
      ? "You are signed in. You can place your order."
      : "Please log in with a customer account before placing an order.";
  }

  if ($("checkoutBtn")) {
    $("checkoutBtn").disabled =
      !customer || state.cart.size === 0;
  }
}

/* ---------------- SESSION ---------------- */

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

/* ---------------- PRODUCTS ---------------- */

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
        `<p>Could not load products: ${esc(error.message)}</p>`;
    }

    console.error("Could not load products:", error.message);
  }
}

/* ---------------- CATEGORIES ---------------- */

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

/* ---------------- SELLERS ---------------- */

/*
  The server's /api/sellers route returns sellerId and name.
  sellerId is the Neo4j internal node ID used by the product route.
*/

async function loadSellers() {
  const select = $("productSeller");

  if (!select) return;

  const previousValue = select.value;

  select.innerHTML =
    '<option value="">Loading sellers...</option>';

  try {
    const result = await api("/api/sellers");

    state.sellers = records(result, [
      "sellers",
      "data",
      "results"
    ]);

    select.innerHTML =
      '<option value="">Select a seller</option>';

    for (const seller of state.sellers) {
      const id = sellerId(seller);
      const name = sellerName(seller);

      if (id === "" || id === null || id === undefined || !name) {
        console.warn("Seller record is missing an ID or name:", seller);
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

    if (select.options.length === 1) {
      showMessage(
        "No usable sellers were returned. Check the seller records and /api/sellers response.",
        true
      );
    }
  } catch (error) {
    state.sellers = [];

    select.innerHTML =
      '<option value="">Could not load sellers</option>';

    console.error("Could not load sellers:", error.message);

    showMessage(
      "Could not load sellers: " + error.message,
      true
    );
  }
}

/* ---------------- PRODUCT ICONS ---------------- */

function getProductIcon(product) {
  const name = String(productName(product)).toLowerCase();

  if (/mixer|grinder|blender|appliance/.test(name)) return "⚙️";
  if (/pants|trousers|jeans/.test(name)) return "👖";
  if (/shorts/.test(name)) return "🩳";
  if (/headphone|earbud|earphone/.test(name)) return "🎧";
  if (/speaker|audio/.test(name)) return "🔊";
  if (/watch|clock/.test(name)) return "⌚";
  if (/shirt|hoodie|sweater|jacket|dress|clothing/.test(name)) return "👕";
  if (/bowl|plate|kitchen|cooker|utensil/.test(name)) return "🥣";
  if (/book|novel|notebook/.test(name)) return "📚";
  if (/keyboard|computer|laptop|mouse/.test(name)) return "⌨️";
  if (/bag|backpack|purse/.test(name)) return "🎒";
  if (/cream|lotion|beauty|shampoo/.test(name)) return "🧴";
  if (/plant|garden/.test(name)) return "🪴";
  if (/lamp|light/.test(name)) return "💡";
  if (/phone|mobile/.test(name)) return "📱";
  if (/shoe|sneaker/.test(name)) return "👟";
  if (/ball|sports/.test(name)) return "⚽";

  return "🛍️";
}

/* ---------------- PRODUCT DISPLAY ---------------- */

function renderProducts() {
  const list = $("productList");
  if (!list) return;

  const search = ($("searchInput")?.value || "")
    .toLowerCase()
    .trim();

  const selected = $("categoryFilter")?.value || "";

  const filtered = state.products.filter(p => {
    const name = String(productName(p)).toLowerCase();

    const description = String(
      value(p, "description", "Description")
    ).toLowerCase();

    const matchesSearch =
      !search ||
      name.includes(search) ||
      description.includes(search);

    const pCategoryId = value(
      p,
      "category_id",
      "Category_ID",
      "categoryId"
    );

    const pCategoryName = String(
      value(
        p,
        "category_name",
        "Category_Name",
        "categoryName",
        "category"
      )
    ).trim().toLowerCase();

    const chosen = state.categories.find(c =>
      String(categoryId(c)) === String(selected) ||
      categoryName(c).trim().toLowerCase() ===
        String(selected).trim().toLowerCase()
    );

    const chosenName = chosen
      ? categoryName(chosen).trim().toLowerCase()
      : "";

    const matchesCategory = !selected ||
      String(pCategoryId) === String(selected) ||
      (chosenName && pCategoryName === chosenName);

    return matchesSearch && matchesCategory;
  });

  if (!filtered.length) {
    list.innerHTML = "<p>No products found.</p>";
    return;
  }

  list.innerHTML = filtered.map(p => {
    const id = productId(p);
    const name = productName(p);

    const productCategoryName = value(
      p,
      "category_name",
      "Category_Name",
      "categoryName",
      "category"
    );

    return `
      <article class="product-card">
        <div class="product-icon">${getProductIcon(p)}</div>
        <h3>${esc(name)}</h3>
        <p>${esc(value(p, "description", "Description") || "Quality product from ShopSphere.")}</p>
        <p class="muted">${esc(productCategoryName || "Product")}</p>
        <p class="price">₹${money(productPrice(p))}</p>
        <p class="muted">Stock: ${productStock(p)}</p>
        <button
          type="button"
          class="primary"
          data-add-cart="${esc(id)}"
          ${productStock(p) <= 0 ? "disabled" : ""}
        >Add to Cart</button>
      </article>`;
  }).join("");
}

/* ---------------- CART ---------------- */

function addToCart(id) {
  const product = state.products.find(
    p => String(productId(p)) === String(id)
  );

  if (!product) {
    return showMessage("Product not found. Refresh the page.", true);
  }

  const existing = state.cart.get(String(id));
  const quantity = existing ? existing.quantity : 0;

  if (quantity >= productStock(product)) {
    return showMessage(
      "You cannot add more than the available stock.",
      true
    );
  }

  state.cart.set(String(id), {
    product,
    quantity: quantity + 1
  });

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
    showMessage("Available stock limit reached.", true);
  } else {
    item.quantity = next;
  }

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

  if (list) {
    list.innerHTML = !state.cart.size
      ? "<p>Your cart is empty.</p>"
      : Array.from(state.cart.entries()).map(([id, item]) => `
        <div class="item-row">
          <div>
            <strong>${esc(productName(item.product))}</strong>
            <p class="muted">₹${money(productPrice(item.product))} each</p>
          </div>
          <div class="cart-quantity">
            <button type="button" data-quantity="${esc(id)}" data-change="-1">−</button>
            <span>${item.quantity}</span>
            <button type="button" data-quantity="${esc(id)}" data-change="1">+</button>
            <strong>₹${money(productPrice(item.product) * item.quantity)}</strong>
          </div>
        </div>`).join("");
  }

  updateInterface();
}

/* ---------------- CUSTOMERS ---------------- */

async function loadCustomers() {
  if (state.role !== "admin") return;

  try {
    const result = await api("/api/customers");

    state.customers = records(result, [
      "customers",
      "data",
      "results"
    ]);

    renderCustomers();
  } catch (error) {
    if ($("customerList")) {
      $("customerList").innerHTML =
        `<p>${esc(error.message)}</p>`;
    }
  }
}

function renderCustomers() {
  const list = $("customerList");
  if (!list) return;

  if (state.role !== "admin") {
    list.innerHTML = "<p>Administrator login required.</p>";
    return;
  }

  if (!state.customers.length) {
    list.innerHTML = "<p>No customer records found.</p>";
    return;
  }

  list.innerHTML = state.customers.map(c => `
    <div class="item-row">
      <div>
        <strong>${esc(value(c, "name", "Name"))}</strong>
        <p>${esc(value(c, "email", "Email"))}</p>
        <p class="muted">${esc(value(c, "address", "Address"))}</p>
        <p class="muted">Customer ID: ${esc(value(c, "customer_id", "Customer_ID", "customerId", "id"))}</p>
      </div>
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

    state.orders = records(result, [
      "orders",
      "data",
      "results"
    ]);

    renderOrders();
  } catch (error) {
    const list = state.role === "admin"
      ? $("adminOrdersList")
      : $("ordersList");

    if (list) {
      list.innerHTML = `<p>${esc(error.message)}</p>`;
    }
  }
}

function renderOrders() {
  const list = state.role === "admin"
    ? $("adminOrdersList")
    : $("ordersList");

  if (!list) return;

  if (state.role === "guest") {
    list.innerHTML = "<p>Log in to view your orders.</p>";
    return;
  }

  if (!state.orders.length) {
    list.innerHTML = "<p>No orders found.</p>";
    return;
  }

  list.innerHTML = state.orders.map(o => `
    <div class="item-row">
      <div>
        <strong>Order #${esc(value(o, "order_id", "Order_ID", "orderId", "id"))}</strong>
        <p class="muted">${esc(value(o, "order_date", "Order_Date", "orderDate"))}</p>
      </div>
      <div>
        <strong>₹${money(value(o, "total_amount", "Total_Amount", "totalAmount"))}</strong>
        <p>${esc(value(o, "status", "Status") || "Placed")}</p>
      </div>
    </div>`).join("");
}

/* ---------------- ADMIN PRODUCT LIST ---------------- */

function renderManageProducts() {
  const list = $("manageProductList");
  if (!list) return;

  if (state.role !== "admin") {
    list.innerHTML = "<p>Administrator login required.</p>";
    return;
  }

  if (!state.products.length) {
    list.innerHTML = "<p>No products available.</p>";
    return;
  }

  list.innerHTML = state.products.map(p => `
    <div class="item-row">
      <div>
        <strong>${esc(productName(p))}</strong>
        <p class="muted">ID: ${esc(productId(p))} · Stock: ${productStock(p)}</p>
        <strong>₹${money(productPrice(p))}</strong>
      </div>
      <div>
        <button type="button" data-edit-product="${esc(productId(p))}">Edit</button>
        <button type="button" class="danger" data-delete-product="${esc(productId(p))}">Delete</button>
      </div>
    </div>`).join("");
}

/* ---------------- CUSTOMER LOGIN ---------------- */

async function handleCustomerLogin(event) {
  event.preventDefault();

  const email = $("loginEmail")?.value.trim();
  const password = $("loginPassword")?.value;

  if (!email || !password) {
    return showMessage("Enter your email and password.", true);
  }

  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    state.user = result.user || result.customer || null;
    state.role = "customer";

    if (!state.user) {
      await loadSession();
    }

    if (state.role !== "customer" || !state.user) {
      throw new Error("Customer login could not be confirmed.");
    }

    $("customerLoginForm")?.reset();

    updateInterface();
    await loadOrders();

    navigate("productsSection");
    showMessage("Welcome back!");
  } catch (error) {
    showMessage(error.message, true);
  }
}

/* ---------------- CUSTOMER SIGNUP ---------------- */

async function handleSignup(event) {
  event.preventDefault();

  const name = $("signupName")?.value.trim();
  const email = $("signupEmail")?.value.trim();
  const address = $("signupAddress")?.value.trim();
  const password = $("signupPassword")?.value;

  if (!name || !email || !address || !password) {
    return showMessage(
      "Please fill in all registration fields.",
      true
    );
  }

  if (password.length < 8) {
    return showMessage(
      "Your password must contain at least 8 characters.",
      true
    );
  }

  try {
    const result = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name,
        email,
        address,
        password
      })
    });

    state.user = result.user || result.customer || null;
    state.role = "customer";

    if (!state.user) {
      await loadSession();
    }

    if (state.role !== "customer" || !state.user) {
      throw new Error(
        "Account created, but login could not be confirmed. Try signing in."
      );
    }

    $("customerSignupForm")?.reset();

    updateInterface();
    navigate("productsSection");

    showMessage(
      "Account created successfully! Welcome to ShopSphere."
    );
  } catch (error) {
    showMessage(error.message, true);
  }
}

/* ---------------- ADMIN LOGIN ---------------- */

async function handleAdminLogin(event) {
  event.preventDefault();

  const username = $("adminUsername")?.value.trim();
  const password = $("adminPassword")?.value;

  if (!username || !password) {
    return showMessage(
      "Enter your administrator username and password.",
      true
    );
  }

  try {
    const result = await api("/api/auth/admin-login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    state.user = result.user ||
      result.admin ||
      { username, role: "admin" };

    state.role = "admin";

    await loadSession();

    if (state.role !== "admin") {
      throw new Error(
        "Administrator login could not be confirmed."
      );
    }

    $("adminLoginForm")?.reset();

    updateInterface();

    await Promise.all([
      loadSellers(),
      loadCustomers(),
      loadOrders()
    ]);

    navigate("manageSection");
    showMessage("Administrator login successful.");
  } catch (error) {
    showMessage(error.message, true);
  }
}

/* ---------------- LOGOUT ---------------- */

async function logout() {
  try {
    await api("/api/auth/logout", {
      method: "POST"
    });
  } catch (error) {
    console.error("Logout request failed:", error.message);
  }

  state.user = null;
  state.role = "guest";
  state.customers = [];
  state.orders = [];
  state.sellers = [];

  updateInterface();
  renderOrders();
  renderCustomers();

  navigate("homeSection");
  showMessage("You have been logged out.");
}

/* ---------------- CHECKOUT ---------------- */

async function checkout() {
  if (state.role !== "customer") {
    showMessage(
      "Please log in with a customer account before checkout.",
      true
    );

    navigate("authSection");
    return;
  }

  if (!state.cart.size) {
    return showMessage("Your cart is empty.", true);
  }

  const items = Array.from(state.cart.values()).map(item => ({
    productId: productId(item.product),
    quantity: item.quantity
  }));

  try {
    await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({ items })
    });

    state.cart.clear();

    renderCart();

    await loadProducts();
    await loadOrders();

    navigate("ordersSection");

    showMessage("Your order has been placed successfully!");
  } catch (error) {
    showMessage(error.message, true);
  }
}

/* ---------------- PRODUCT FORM ---------------- */

function resetProductForm() {
  $("productForm")?.reset();

  if ($("productId")) {
    $("productId").value = "";
  }

  if ($("productFormHeading")) {
    $("productFormHeading").textContent = "Add Product";
  }

  if ($("saveProductBtn")) {
    $("saveProductBtn").textContent = "Save Product";
  }

  setVisible("cancelEditBtn", false);
}

function editProduct(id) {
  if (state.role !== "admin") {
    return showMessage(
      "Administrator access required.",
      true
    );
  }

  const p = state.products.find(
    item => String(productId(item)) === String(id)
  );

  if (!p) return;

  if ($("productId")) {
    $("productId").value = productId(p);
  }

  if ($("productName")) {
    $("productName").value = productName(p);
  }

  if ($("productPrice")) {
    $("productPrice").value = productPrice(p);
  }

  if ($("productStock")) {
    $("productStock").value = productStock(p);
  }

  if ($("productDescription")) {
    $("productDescription").value =
      value(p, "description", "Description");
  }

  /*
    Select a seller only if the product's seller ID matches
    an actual option from /api/sellers.
  */

  const existingSellerId = value(
    p,
    "sellerId",
    "seller_id",
    "Seller_ID"
  );

  const sellerSelect = $("productSeller");

  if (sellerSelect) {
    const matchingSeller = state.sellers.find(
      s => String(sellerId(s)) === String(existingSellerId)
    );

    sellerSelect.value = matchingSeller
      ? String(sellerId(matchingSeller))
      : "";
  }

  const category = value(
    p,
    "category_name",
    "Category_Name",
    "categoryName",
    "category"
  );

  const existingCategoryId = value(
    p,
    "category_id",
    "Category_ID",
    "categoryId"
  );

  if ($("productCategory")) {
    const categorySelect = $("productCategory");

    const matchingCategory = state.categories.find(c =>
      String(categoryId(c)) === String(existingCategoryId) ||
      categoryName(c).toLowerCase() ===
        String(category).toLowerCase()
    );

    categorySelect.value = matchingCategory
      ? String(categoryId(matchingCategory))
      : "";
  }

  if ($("productFormHeading")) {
    $("productFormHeading").textContent = "Edit Product";
  }

  if ($("saveProductBtn")) {
    $("saveProductBtn").textContent = "Update Product";
  }

  setVisible("cancelEditBtn", true);

  $("productForm")?.scrollIntoView({
    behavior: "smooth"
  });
}

async function saveProduct(event) {
  event.preventDefault();

  if (state.role !== "admin") {
    return showMessage(
      "Administrator access required.",
      true
    );
  }

  const id = $("productId")?.value.trim() || "";
  const name = $("productName")?.value.trim() || "";
  const description =
    $("productDescription")?.value.trim() || "";

  const selectedCategory =
    $("productCategory")?.value.trim() || "";

  const selectedSellerId =
    $("productSeller")?.value.trim() || "";

  const price = Number($("productPrice")?.value);
  const stock = Number($("productStock")?.value);

  if (
    !name ||
    !selectedCategory ||
    !selectedSellerId ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(stock) ||
    stock < 0
  ) {
    return showMessage(
      "Enter a name, category, seller, valid price and whole-number stock.",
      true
    );
  }

  /*
    Use the exact seller selected from the loaded server list.
  */

  const selectedSeller = state.sellers.find(
    seller => String(sellerId(seller)) === selectedSellerId
  );

  if (!selectedSeller) {
    await loadSellers();

    return showMessage(
      "The seller list was refreshed. Please select a seller from the dropdown and try again.",
      true
    );
  }

  const selectedCategoryObject = state.categories.find(c =>
    String(categoryId(c)) === selectedCategory ||
    categoryName(c).toLowerCase() ===
      selectedCategory.toLowerCase()
  );

  const category = selectedCategoryObject
    ? categoryName(selectedCategoryObject)
    : selectedCategory;

  const body = {
    name,
    description,
    category,
    sellerId: String(sellerId(selectedSeller)),
    price,
    stock,
    imageUrl: ""
  };

  try {
    await api(
      id
        ? `/api/products/${encodeURIComponent(id)}`
        : "/api/products",
      {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(body)
      }
    );

    resetProductForm();

    await loadProducts();
    await loadCategories();
    await loadSellers();

    showMessage(
      id ? "Product updated." : "Product added successfully."
    );
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function deleteProduct(id) {
  if (state.role !== "admin") {
    return showMessage(
      "Administrator access required.",
      true
    );
  }

  if (!confirm("Are you sure you want to delete this product?")) {
    return;
  }

  try {
    await api(
      `/api/products/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );

    await loadProducts();

    showMessage("Product deleted.");
  } catch (error) {
    showMessage(error.message, true);
  }
}

/* ---------------- NAVIGATION ---------------- */

on("homeNav", "click", () => navigate("homeSection"));
on("productsNav", "click", () => navigate("productsSection"));
on("shopNowBtn", "click", () => navigate("productsSection"));
on("cartNav", "click", () => navigate("cartSection"));

on("ordersNav", "click", async () => {
  if (state.role === "guest") {
    return navigate("authSection");
  }

  await loadOrders();
  navigate("ordersSection");
});

on("manageNav", "click", async () => {
  if (state.role !== "admin") {
    return showMessage(
      "Administrator access required.",
      true
    );
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

/* ---------------- FORM EVENTS ---------------- */

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

  if (edit) {
    editProduct(edit.dataset.editProduct);
  }

  if (remove) {
    deleteProduct(remove.dataset.deleteProduct);
  }
});

/* ---------------- START APPLICATION ---------------- */

async function startShopSphere() {
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

  console.log("ShopSphere frontend initialized.");
}

document.addEventListener(
  "DOMContentLoaded",
  startShopSphere
);