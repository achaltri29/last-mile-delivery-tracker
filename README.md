# Last-Mile Delivery Tracker

A comprehensive last-mile logistics dispatch and monitoring web application that resolves zones dynamically, calculates volumetric package pricing, auto-assigns the nearest available delivery agents, and provides immutable audit logs of order lifecycle transitions.

---

## 1. Project Architecture

The repository is divided into two primary sub-folders:
*   `backend/`: Node.js + Express API server with Mongoose schemas and automated Jest integration tests.
*   `frontend/`: React + Vite SPA using vanilla CSS and Lucide icons.

---

## 2. Local Setup Instructions

### Prerequisites
*   Node.js (v18+)
*   MongoDB Atlas Cluster (or local MongoDB instance)

### Environment Configuration
1.  Copy the `.env.example` file in the root directory to a new file named `.env`:
    ```bash
    cp .env.example .env
    ```
2.  Open `.env` and fill in the values (do not commit this file to Git):
    *   `MONGODB_URI`: Your MongoDB connection string.
    *   `JWT_SECRET`: A secure random secret key for signing session tokens.
    *   `PORT`: Server listening port (default: `5001`).

### Running the Application

#### 1. Start the Backend API
Navigate to the `backend/` directory, install dependencies, and start the server:
```bash
cd backend
npm install
npm run start
```
The server will connect to MongoDB and listen on port `5001`.

#### 2. Start the Frontend UI
Open a new terminal window, navigate to the `frontend/` directory, install dependencies, and start the development server:
```bash
cd frontend
npm install
npm run dev
```
The client portal will be available at `http://localhost:5173`.

#### 3. Running Automated Tests
To execute the complete Jest test suite (45 unit & integration tests):
```bash
cd backend
npm run test
```

---

## 3. Database Schema Documentation

The system manages 5 primary Mongoose collections under the `unthinkable_delivery` database:

### 1. User
Stores registered profiles with role-specific descriptors.
*   `name` (String, required)
*   `email` (String, unique, required)
*   `password` (String, required - hashed via `bcryptjs`)
*   `phone` (String, required)
*   `role` (String: `customer`, `agent`, `admin`)
*   `agentMetadata`: Mapped only for delivery agents:
    *   `isAvailable` (Boolean)
    *   `currentZone` (ObjectId -> Zone)
    *   `coordinates` (`{ latitude: Number, longitude: Number }`)
    *   `activeOrderCount` (Number - workload constraint)

### 2. Zone
Maps delivery coverage boundaries.
*   `name` (String, unique)
*   `pincodes` (Array of Strings, unique) - *Indexed for cross-document uniqueness.*
*   `description` (String)

### 3. RateCard
Stores category pricing parameters.
*   `orderType` (String: `B2B`, `B2C`)
*   `zoneType` (String: `intra-zone`, `inter-zone`)
*   `baseWeight` (Number)
*   `baseRate` (Number)
*   `perKgRate` (Number)
*   `codSurcharge` (Number)
*   *Compound index on `{ orderType: 1, zoneType: 1 }` guarantees uniqueness.*

### 4. Order
Manages active shipments.
*   `orderNumber` (String, unique)
*   `customer` (ObjectId -> User)
*   `deliveryAgent` (ObjectId -> User, optional)
*   `pickupAddress` / `dropAddress`: `{ streetAddress, area, city, pincode, state }`
*   `pickupZone` / `dropZone` (ObjectId -> Zone)
*   `dimensions`: `{ length, breadth, height }` (cm)
*   `actualWeight` / `volumetricWeight` / `billableWeight` (kg)
*   `orderType` (`B2B` / `B2C`)
*   `paymentType` (`Prepaid` / `COD`)
*   `deliveryCharge` (Number)
*   `status` (String: `Pending`, `Pending Assignment`, `Assigned`, `Picked Up`, `In Transit`, `Out for Delivery`, `Delivered`, `Failed`, `Rescheduled`)
*   `attempts` (Array of subdocuments recording failed physical delivery logs)

### 5. TrackingHistory
Immutable chronological tracking timeline.
*   `orderId` (ObjectId -> Order)
*   `previousStatus` / `newStatus` (String)
*   `timestamp` (Date, default `Date.now`, immutable)
*   `actor`: `{ userId, role, name }`
*   `remarks` (String)

---

## 4. API Endpoints Catalog

### Authentication (`/api/auth`)
*   `POST /register` -> Register customer (hashed password, issues JWT).
*   `POST /login` -> Authenticates email/password, returns user details and JWT.

### Order Processing & Rates (`/api/orders`)
*   `POST /calculate-rate` -> (Public) Returns preview pricing calculation.
*   `POST /` -> (Customer/Admin) Place a new order.
*   `GET /` -> (All) Fetch list of orders (filtered by role).
*   `GET /:id` -> (All) Retrieve details and tracking timeline.
*   `POST /:id/reschedule` -> (Customer/Admin) Reschedule failed order.
*   `PATCH /:id/status` -> (Agent/Admin) Transition delivery status.
*   `POST /:id/assign` -> (Admin) Manually reassign to specific agent.
*   `GET /agents` -> (Admin) Get list of active agents and workloads.
*   `GET /metadata/zones` -> (Admin) List all zones.
*   `GET /metadata/rates` -> (Admin) List rate card matrix.

### Zone & Rate CRUD Configuration (`/api/orders`)
*   `POST /zones` -> (Admin) Create delivery zone.
*   `PUT /zones/:id` -> (Admin) Edit zone name/pincodes (fails if removing pincodes with active orders).
*   `DELETE /zones/:id` -> (Admin) Delete zone (fails if active orders are mapped).
*   `PUT /rates/:id` -> (Admin) Configure base weights, rates, and surcharges.
