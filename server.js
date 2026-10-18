require("dotenv").config();

const express = require("express");
const path = require("path");
const neo4j = require("neo4j-driver");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");

const app = express();

app.use(express.json({ limit: "1mb" }));

app.use(session({
  name: "shopsphere.sid",
  secret: process.env.SESSION_SECRET || "shopsphere-local-development-secret-change-before-deployment",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 2 * 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, "public")));

const required = [
  "NEO4J_URI",
  "NEO4J_USERNAME",
  "NEO4J_PASSWORD"
];

const missing = required.filter(k => !process.env[k]);

let driver;

function native(v) {
  if (neo4j.isInt(v)) return v.toNumber();
  if (v instanceof neo4j.types.Date) return v.toString();

  if (Array.isArray(v)) return v.map(native);

  if (v && typeof v === "object" && v.constructor === Object) {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, native(x)])
    );
  }

  return v;
}

async function query(q, p = {}) {
  if (!driver) throw Error("Neo4j is not connected. Check .env.");

  const s = driver.session({
    database: process.env.NEO4J_DATABASE || "neo4j"
  });

  try {
    const r = await s.run(q, p);
    return r.records.map(x =>
      Object.fromEntries(x.keys.map(k => [k, native(x.get(k))]))
    );
  } finally {
    await s.close();
  }
}

async function write(q, p = {}) {
  if (!driver) throw Error("Neo4j is not connected. Check .env.");

  const s = driver.session({
    database: process.env.NEO4J_DATABASE || "neo4j"
  });

  try {
    return await s.executeWrite(async tx => {
      const r = await tx.run(q, p);
      return r.records.map(x =>
        Object.fromEntries(x.keys.map(k => [k, native(x.get(k))]))
      );
    });
  } finally {
    await s.close();
  }
}

function fail(res, e, msg) {
  console.error(msg, e.message);
  res.status(500).json({ message: msg });
}

const isDev = process.env.NODE_ENV !== "production";
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  limit: isDev ? 1000 : (parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 60),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Too many attempts. Please try again in a moment." }
});

function requireCustomer(req, res, next) {
  if (req.session.user?.role !== "customer") {
    return res.status(401).json({
      message: "Please log in as a customer."
    });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.session.user?.role !== "admin") {
    return res.status(403).json({
      message: "Administrator access required."
    });
  }
  next();
}

// ---------------- AUTHENTICATION ----------------

app.get("/api/auth/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const address = String(req.body?.address || "").trim();
  const password = String(req.body?.password || "");

  if (!name || !email || !address || password.length < 8) {
    return res.status(400).json({
      message: "Enter your name, email, address and a password of at least 8 characters."
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }

  try {
    const existing = await query(
      "MATCH (c:Customer) WHERE toLower(c.email)=$email RETURN c LIMIT 1",
      { email }
    );

    if (existing.length) {
      return res.status(409).json({
        message: "This email already exists. Please log in or contact the administrator."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const created = await write(
      `OPTIONAL MATCH (old:Customer)
       WITH coalesce(max(toInteger(old.customer_id)), 0) + 1 AS id
       CREATE (c:Customer {
         customer_id: id,
         name: $name,
         email: $email,
         address: $address,
         password_hash: $passwordHash
       })
       RETURN toString(c.customer_id) AS customerId`,
      { name, email, address, passwordHash }
    );

    if (!created.length) {
      return res.status(500).json({ message: "Could not create account." });
    }

    req.session.regenerate(err => {
      if (err) {
        return res.status(500).json({ message: "Could not start your session." });
      }

      req.session.user = {
        role: "customer",
        customerId: created[0].customerId,
        name,
        email
      };

      req.session.save(saveErr => {
        if (saveErr) {
          return res.status(500).json({
            message: "Account created, but login could not be started. Please log in."
          });
        }

        res.status(201).json({
          message: "Account created successfully.",
          user: req.session.user
        });
      });
    });
  } catch (e) {
    fail(res, e, "Could not create account.");
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  try {
    const rows = await query(
      `MATCH (c:Customer)
       WHERE toLower(c.email) = $email
       RETURN toString(c.customer_id) AS customerId,
              c.name AS name,
              c.email AS email,
              c.password_hash AS passwordHash`,
      { email }
    );

    if (
      !rows.length ||
      !rows[0].passwordHash ||
      !(await bcrypt.compare(password, rows[0].passwordHash))
    ) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const customer = rows[0];

    req.session.regenerate(err => {
      if (err) {
        return res.status(500).json({ message: "Could not start your session." });
      }

      req.session.user = {
        role: "customer",
        customerId: customer.customerId,
        name: customer.name,
        email: customer.email
      };

      req.session.save(saveErr => {
        if (saveErr) {
          return res.status(500).json({ message: "Could not save your session." });
        }

        res.json({
          message: "Login successful.",
          user: req.session.user
        });
      });
    });
  } catch (e) {
    fail(res, e, "Could not log in.");
  }
});

app.post("/api/auth/admin-login", authLimiter, (req, res) => {
  const username = String(req.body?.username || "");
  const password = String(req.body?.password || "");

  if (
    !process.env.ADMIN_USERNAME ||
    !process.env.ADMIN_PASSWORD ||
    username !== process.env.ADMIN_USERNAME ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      message: "Invalid admin username or password."
    });
  }

  req.session.regenerate(err => {
    if (err) {
      return res.status(500).json({ message: "Could not start your session." });
    }

    req.session.user = {
      role: "admin",
      name: "Administrator"
    };

    req.session.save(saveErr => {
      if (saveErr) {
        return res.status(500).json({ message: "Could not save your session." });
      }

      res.json({
        message: "Admin login successful.",
        user: req.session.user
      });
    });
  });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ message: "Could not log out." });
    }

    res.clearCookie("shopsphere.sid", { path: "/" });
    res.json({ message: "Logged out successfully." });
  });
});

// ---------------- HEALTH CHECK ----------------

app.get("/api/health", async (req, res) => {
  if (missing.length) {
    return res.status(503).json({
      ok: false,
      message: `Missing environment settings: ${missing.join(", ")}`
    });
  }

  try {
    await driver.verifyConnectivity();
    const r = await query("MATCH (n) RETURN count(n) AS nodeCount");

    res.json({
      ok: true,
      database: "Neo4j",
      nodeCount: r[0]?.nodeCount || 0
    });
  } catch (e) {
    res.status(503).json({
      ok: false,
      message: "Could not connect to Neo4j. Check .env and AuraDB."
    });
  }
});

// ---------------- PRODUCTS AND CATEGORIES ----------------

app.get("/api/products", async (req, res) => {
  try {
    const p = {};
    let w = "";

    if (req.query.category) {
      w = "WHERE toLower(coalesce(cat.category_name,''))=toLower($category)";
      p.category = String(req.query.category);
    }

    res.json(await query(
      `MATCH (p:Product)
       OPTIONAL MATCH (s:Seller)-[:SELLS]->(p)
       OPTIONAL MATCH (cat:Category)-[:HAS_PRODUCT]->(p)
       ${w}
       WITH p,s,cat
       RETURN toString(p.product_id) AS productId,
              coalesce(p.product_name,'Unnamed product') AS name,
              toFloat(p.price) AS price,
              coalesce(p.description,'') AS description,
              coalesce(p.stock,0) AS stock,
              coalesce(p.image_url,'') AS imageUrl,
              coalesce(s.seller_name,'Seller') AS seller,
              coalesce(cat.category_name,'Uncategorized') AS category
       ORDER BY name`,
      p
    ));
  } catch (e) {
    fail(res, e, "Could not load products.");
  }
});

app.get("/api/categories", async (req, res) => {
  try {
    const r = await query(
      "MATCH (c:Category) RETURN DISTINCT coalesce(c.category_name,'Uncategorized') AS name ORDER BY name"
    );
    res.json(r.map(x => x.name));
  } catch (e) {
    fail(res, e, "Could not load categories.");
  }
});

// New seller list endpoint for the admin product form.
// Only authenticated administrators can view this list.
app.get("/api/sellers", requireAdmin, async (req, res) => {
  try {
    const sellers = await query(
      `MATCH (s:Seller)
       RETURN toString(id(s)) AS sellerId,
              coalesce(s.seller_name, 'Seller') AS name
       ORDER BY name`
    );
    res.json(sellers);
  } catch (e) {
    fail(res, e, "Could not load sellers.");
  }
});

// ---------------- CREATE PRODUCT ----------------

app.post("/api/products", requireAdmin, async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const description = String(b.description || "").trim();
  const category = String(b.category || "").trim();
  const sellerId = String(b.sellerId || b.seller || "").trim();
  const imageUrl = String(b.imageUrl || "").trim();
  const price = Number(b.price);
  const stock = Number.parseInt(b.stock, 10);

  if (
    !name || !category || !sellerId ||
    !Number.isFinite(price) || price < 0 ||
    !Number.isInteger(stock) || stock < 0
  ) {
    return res.status(400).json({
      message: "Enter name, category, seller, valid price and stock."
    });
  }

  if (imageUrl && !/^https?:\/\/\S+$/i.test(imageUrl)) {
    return res.status(400).json({
      message: "Image URL must start with http:// or https://."
    });
  }

  try {
    const r = await write(
      `MATCH (s:Seller)
       WHERE toString(id(s)) = $sellerId
          OR toLower(coalesce(s.seller_name, '')) = toLower($sellerId)
       WITH head(collect(s)) AS s
       WHERE s IS NOT NULL
       MATCH (c:Category)
       WHERE toLower(coalesce(c.category_name, '')) = toLower($category)
       WITH s, head(collect(c)) AS c
       WHERE c IS NOT NULL
       OPTIONAL MATCH (old:Product)
       WITH s, c,
            coalesce(max(toInteger(old.product_id)), 0) + 1 AS id
       CREATE (p:Product {
         product_id: id,
         product_name: $name,
         description: $description,
         price: $price,
         stock: $stock,
         image_url: $imageUrl
       })
       CREATE (s)-[:SELLS]->(p)
       CREATE (c)-[:HAS_PRODUCT]->(p)
       RETURN toString(p.product_id) AS id`,
      {
        sellerId,
        category,
        name,
        description,
        imageUrl,
        price,
        stock
      }
    );

    if (!r.length) {
      return res.status(400).json({
        message: "Seller or category not found. Refresh the lists and select an existing seller and category."
      });
    }

    res.status(201).json({
      message: "Product created.",
      productId: r[0].id
    });
  } catch (e) {
    fail(res, e, "Could not create product.");
  }
});

// ---------------- UPDATE PRODUCT ----------------

app.put("/api/products/:id", requireAdmin, async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const description = String(b.description || "").trim();
  const imageUrl = String(b.imageUrl || "").trim();
  const price = Number(b.price);
  const stock = Number.parseInt(b.stock, 10);

  if (
    !name ||
    !Number.isFinite(price) || price < 0 ||
    !Number.isInteger(stock) || stock < 0
  ) {
    return res.status(400).json({
      message: "Enter a name, non-negative price and whole-number stock."
    });
  }

  if (imageUrl && !/^https?:\/\/\S+$/i.test(imageUrl)) {
    return res.status(400).json({
      message: "Image URL must start with http:// or https://."
    });
  }

  try {
    const r = await write(
      `MATCH (p:Product)
       WHERE toString(p.product_id)=$id
       SET p.product_name=$name,
           p.description=$description,
           p.price=$price,
           p.stock=$stock,
           p.image_url=$imageUrl
       RETURN p.product_id AS id`,
      {
        id: String(req.params.id),
        name,
        description,
        price,
        stock,
        imageUrl
      }
    );

    if (!r.length) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.json({ message: "Product updated." });
  } catch (e) {
    fail(res, e, "Could not update product.");
  }
});

app.delete("/api/products/:id", requireAdmin, async (req, res) => {
  try {
    const r = await query(
      `MATCH (p:Product)
       WHERE toString(p.product_id)=$id
       OPTIONAL MATCH (o:Order)-[:CONTAINS]->(p)
       WITH p,count(o) AS used
       RETURN toString(p.product_id) AS id,used`,
      { id: String(req.params.id) }
    );

    if (!r.length) {
      return res.status(404).json({ message: "Product not found." });
    }

    if (Number(r[0].used) > 0) {
      return res.status(409).json({
        message: "This product is in order history and cannot be deleted. Edit it instead."
      });
    }

    await write(
      "MATCH (p:Product) WHERE toString(p.product_id)=$id DETACH DELETE p",
      { id: String(req.params.id) }
    );

    res.json({ message: "Product deleted." });
  } catch (e) {
    fail(res, e, "Could not delete product.");
  }
});

// ---------------- CUSTOMERS ----------------

app.get("/api/customers", requireAdmin, async (req, res) => {
  try {
    res.json(await query(
      `MATCH (c:Customer)
       RETURN toString(c.customer_id) AS customerId,
              coalesce(c.name,'Customer') AS name,
              coalesce(c.email,'') AS email,
              coalesce(c.address,'') AS address
       ORDER BY name`
    ));
  } catch (e) {
    fail(res, e, "Could not load customers.");
  }
});

app.put("/api/customers/:id", requireAdmin, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const address = String(req.body?.address || "").trim();

  if (!name || !email || !address) {
    return res.status(400).json({
      message: "Name, email and address are required."
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Enter a valid email." });
  }

  try {
    const r = await write(
      `MATCH (c:Customer)
       WHERE toString(c.customer_id)=$id
       SET c.name=$name,c.email=$email,c.address=$address
       RETURN c.name AS name`,
      { id: String(req.params.id), name, email, address }
    );

    if (!r.length) {
      return res.status(404).json({ message: "Customer not found." });
    }

    res.json({ message: "Customer updated." });
  } catch (e) {
    fail(res, e, "Could not update customer.");
  }
});

// ---------------- ORDERS ----------------

app.get("/api/orders", requireAdmin, async (req, res) => {
  try {
    res.json(await query(
      `MATCH (c:Customer)-[:PLACED]->(o:Order)
       OPTIONAL MATCH (o)-[r:CONTAINS]->(p:Product)
       WITH o, c, collect({
         productId: toString(p.product_id),
         productName: coalesce(p.product_name, 'Product'),
         quantity: coalesce(r.quantity, 1),
         price: coalesce(r.unit_price, toFloat(p.price)),
         subtotal: coalesce(r.subtotal, toFloat(p.price) * coalesce(r.quantity, 1))
       }) AS rawItems
       RETURN toString(o.order_id) AS orderId,
              coalesce(c.name,'Customer') AS customer,
              toString(o.order_date) AS orderDate,
              toFloat(o.total_amount) AS totalAmount,
              coalesce(o.status,'Placed') AS status,
              [it IN rawItems WHERE it.productId IS NOT NULL] AS items
       ORDER BY toInteger(o.order_id) DESC`
    ));
  } catch (e) {
    fail(res, e, "Could not load orders.");
  }
});

app.get("/api/my/orders", requireCustomer, async (req, res) => {
  try {
    res.json(await query(
      `MATCH (c:Customer)-[:PLACED]->(o:Order)
       WHERE toString(c.customer_id)=$customerId
       OPTIONAL MATCH (o)-[r:CONTAINS]->(p:Product)
       WITH o, c, collect({
         productId: toString(p.product_id),
         productName: coalesce(p.product_name, 'Product'),
         quantity: coalesce(r.quantity, 1),
         price: coalesce(r.unit_price, toFloat(p.price)),
         subtotal: coalesce(r.subtotal, toFloat(p.price) * coalesce(r.quantity, 1))
       }) AS rawItems
       RETURN toString(o.order_id) AS orderId,
              coalesce(c.name,'Customer') AS customer,
              toString(o.order_date) AS orderDate,
              toFloat(o.total_amount) AS totalAmount,
              coalesce(o.status,'Placed') AS status,
              [it IN rawItems WHERE it.productId IS NOT NULL] AS items
       ORDER BY toInteger(o.order_id) DESC`,
      { customerId: req.session.user.customerId }
    ));
  } catch (e) {
    fail(res, e, "Could not load your orders.");
  }
});

app.post("/api/orders", requireCustomer, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!items.length) {
    return res.status(400).json({
      message: "Add at least one product to the cart."
    });
  }

  const clean = items.map(i => ({
    productId: String(i.productId || ""),
    quantity: Math.max(1, Math.min(99, parseInt(i.quantity, 10) || 1))
  }));

  if (clean.some(i => !i.productId)) {
    return res.status(400).json({
      message: "Every cart item needs a product ID."
    });
  }

  try {
    const r = await write(
      `MATCH (c:Customer)
       WHERE toString(c.customer_id)=$customerId
       WITH c
       UNWIND $items AS item
       MATCH (p:Product)
       WHERE toString(p.product_id)=item.productId
       WITH c,item,p
       WITH c,
            collect({product:p,quantity:item.quantity}) AS lines,
            count(*) AS matched
       WHERE matched=size($items)
       OPTIONAL MATCH (old:Order)
       WITH c,lines,
            coalesce(max(toInteger(old.order_id)),600)+1 AS newId
       WITH c,lines,newId,
            reduce(total=0.0,line IN lines |
              total+toFloat(line.product.price)*line.quantity
            ) AS total
       CREATE (o:Order {
         order_id:newId,
         order_date:date(),
         total_amount:total,
         status:'Placed'
       })
       CREATE (c)-[:PLACED]->(o)
       WITH o,lines
       UNWIND lines AS line
       WITH o,line,line.product AS p
       CREATE (o)-[:CONTAINS {
         quantity:line.quantity,
         unit_price:toFloat(p.price),
         subtotal:toFloat(p.price)*line.quantity
       }]->(p)
       WITH DISTINCT o
       RETURN toString(o.order_id) AS orderId,
              toFloat(o.total_amount) AS totalAmount,
              o.status AS status`,
      {
        customerId: req.session.user.customerId,
        items: clean
      }
    );

    if (!r.length) {
      return res.status(400).json({
        message: "A customer or product could not be found. Check the Neo4j IDs."
      });
    }

    res.status(201).json(r[0]);
  } catch (e) {
    fail(
      res,
      e,
      "Order was not created. Check the Neo4j customer/product IDs and properties."
    );
  }
});

// ---------------- START SERVER ----------------

async function start() {
  if (missing.length) {
    console.warn(`Missing settings: ${missing.join(", ")}. Add them to .env.`);
  } else {
    driver = neo4j.driver(
      process.env.NEO4J_URI,
      neo4j.auth.basic(
        process.env.NEO4J_USERNAME,
        process.env.NEO4J_PASSWORD
      )
    );

    try {
      await driver.verifyConnectivity();
      console.log("Connected to Neo4j AuraDB.");
    } catch (e) {
      console.error("Neo4j connection check failed. Verify .env and AuraDB.");
    }
  }

  const port = Number(process.env.PORT) || 3001;

  app.listen(port, () => {
    console.log(`ShopSphere running at http://localhost:${port}`);
  });
}

process.on("SIGINT", async () => {
  if (driver) await driver.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (driver) await driver.close();
  process.exit(0);
});

start();