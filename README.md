# ShopSphere — E-Commerce Platform Management System

A beginner-friendly college project using:
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: Existing Neo4j AuraDB graph

## Important safety notes
- This app uses the existing graph and does not run bulk `CREATE` scripts on startup.
- Browsing products and viewing orders are read-only.
- Clicking **Place order** writes a new `Order` node and `PLACED` / `CONTAINS` relationships into the database.
- Use a test order first. Do not put your Aura password into frontend code or share your `.env` file.
- The app assumes numeric `customer_id` and `product_id` properties, matching the existing project setup. If your data differs, adjust the query after checking the properties in Neo4j.

## Requirements
Install Node.js LTS from https://nodejs.org/ . Then open a terminal in this folder.

## Setup
1. Install packages:
   ```bash
   npm install
   ```
2. Copy `.env.example` to a file named `.env`.
3. In Neo4j Aura Console, open your existing Free instance and copy its connection URI. Put it in `NEO4J_URI`.
4. Enter your Neo4j username and password in `.env`. Use the password you set when the Aura instance was created. If you do not know it, use Aura's password reset/credential management flow; do not create a new database just for this.
5. Start the existing Aura instance so it says Running.
6. Start the app:
   ```bash
   npm start
   ```
7. Open http://localhost:3000 in your browser.
8. Confirm the status says connected to Neo4j and products load.

## If product fields do not match
Run these read-only Cypher checks in Aura Query:
```cypher
MATCH (p:Product) RETURN properties(p) LIMIT 3;
MATCH (c:Customer) RETURN properties(c) LIMIT 3;
MATCH (cat:Category) RETURN properties(cat) LIMIT 3;
```
Compare the property names to the API queries in `server.js`.

## API routes
- `GET /api/health` — connection status and node count
- `GET /api/products` — products with seller and category
- `GET /api/categories` — category names
- `GET /api/customers` — customers for the demo checkout selector
- `GET /api/orders` — existing orders
- `POST /api/orders` — creates an order for selected customer and cart items

## Suggested demo sequence
1. Show the product catalog loaded from Neo4j.
2. Search for a product and filter by category.
3. Add a product to the cart and change quantity.
4. Show the order history.
5. If your instructor expects a write demonstration, place one test order and then verify it in Neo4j:
   ```cypher
   MATCH (c:Customer)-[:PLACED]->(o:Order)-[r:CONTAINS]->(p:Product)
   RETURN c.name, o.order_id, p.product_name, r.quantity, r.subtotal
   ORDER BY o.order_id DESC
   LIMIT 10;
   ```
