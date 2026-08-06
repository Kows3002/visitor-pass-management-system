# Visitor Pass Management System

A production-oriented MERN application for managing workplace visitors from registration through host approval, check-in, check-out, reporting, and audit history. All operational data is stored in MongoDB. Authentication and role permissions are enforced by the Express API.

## Main features

- Secure JWT authentication using an HTTP-only cookie
- Administrator, Receptionist, and Employee role-based access
- User, employee, and department management
- Visitor registration with frontend and backend validation
- Employee approval, rejection, and remarks
- Receptionist check-in and check-out workflow
- Role-specific dashboards using live MongoDB data
- Visitor search, combined filters, sorting, and pagination
- Administrator reports with PDF and Excel export
- Complete, role-scoped activity history
- Responsive light and dark interface

## Roles and permissions

| Role | Access |
| --- | --- |
| Administrator | Overall dashboard, user accounts, employees, departments, reports, security, and complete activity history |
| Receptionist | Reception dashboard, visitor registration, approved visitor check-in, check-out, today's visitors, and own activity |
| Employee | Employee dashboard, assigned visitor requests, approval, rejection, remarks, visitor history, and own activity |

The React application hides unavailable navigation, while the backend independently authenticates every protected request and checks the required role.

## Visitor workflow

```text
Receptionist registers a visitor
              |
              v
       Status: Pending
              |
              v
Employee approves or rejects the request
              |
              v
Approved visitor is checked in by Receptionist
              |
              v
       Status: Checked In
              |
              v
Receptionist checks the visitor out
              |
              v
Complete visitor and activity history is retained
```

## Business rules

The API enforces the following rules:

1. A visitor cannot have more than one active visit at the same time.
2. The same visitor cannot be registered more than once on the same date.
3. A visit date cannot be earlier than today.
4. For a visit scheduled today, expected arrival cannot be earlier than the current local time.
5. An employee cannot have more than three pending visitor requests.
6. Only an approved visitor can be checked in.
7. A checked-in visitor cannot be checked in again.
8. Check-out is recorded only after check-in and must have a later timestamp.
9. A rejected visitor cannot be checked in.
10. A cancelled visitor is excluded from active visitor lists.

Status transitions are atomic and allow-listed by the backend. Each registration, decision, remark, cancellation, check-in, and check-out creates an activity record.

## Project structure

```text
visitor-pass-management-system/
|-- client/
|   |-- public/             Favicon, manifest, robots, and sitemap
|   |-- src/
|   |   |-- components/     Shared UI, layout, dialogs, and route guards
|   |   |-- context/        Authentication and theme state
|   |   |-- pages/          Dashboards and application screens
|   |   |-- services/       Reusable Axios API client
|   |   `-- utils/          Shared formatting and helpers
|   |-- .env.example
|   `-- vercel.json         React Router fallback for Vercel
|-- server/
|   |-- src/
|   |   |-- controllers/    HTTP request and response handling
|   |   |-- middleware/     Authentication, roles, validation, errors, uploads
|   |   |-- models/         MongoDB schemas
|   |   |-- routes/         REST endpoints and permissions
|   |   |-- services/       Visitor rules, reports, and activity operations
|   |   |-- scripts/        Controlled database migrations
|   |   |-- app.js          Express application
|   |   |-- server.js       Server entry point
|   |   `-- seed.js         Initial administrator seed
|   `-- .env.example
`-- README.md
```

## Prerequisites

- Node.js 20 or newer
- npm
- MongoDB Community Server or a MongoDB Atlas database

## Local setup

### 1. Start MongoDB

Start the local MongoDB service. If MongoDB is hosted on Atlas, copy its connection string for the server environment file.

### 2. Configure and start the server

Open a terminal in the project directory:

```powershell
cd server
npm install
Copy-Item .env.example .env
```

Open `server/.env` and confirm the values described in the Environment Configuration section below. Then seed the first administrator and start the API:

```powershell
npm run seed
npm run dev
```

The API runs at `http://localhost:5000`. Verify it by opening:

```text
http://localhost:5000/api/health
```

### 3. Configure and start the client

Open a second terminal in the project directory:

```powershell
cd client
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`.

### 4. Initial administrator

The seed command creates one real MongoDB account:

```text
Name:     System Administrator
Email:    admin@visitorpass.com
Password: Admin@123
Role:     Administrator
```

The User model hashes the password with bcrypt before saving it. Change the initial password after signing in. The seed is idempotent and does not create fake visitors or demo employee accounts.

## Environment configuration

### Server: `server/.env`

```dotenv
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/visitor_pass
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=8h
CLIENT_URL=http://localhost:5173
```

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Express port. Defaults to `5000`. |
| `NODE_ENV` | Yes | Use `development` locally and `production` when deployed. |
| `MONGODB_URI` | Yes | Local MongoDB or Atlas connection string. |
| `JWT_SECRET` | Yes | Long private value used to sign authentication tokens. |
| `JWT_EXPIRES_IN` | No | Standard JWT duration such as `8h`. |
| `CLIENT_URL` | Yes | Exact allowed browser origin. Multiple origins may be comma-separated. Do not include a path. |

### Client: `client/.env`

```dotenv
VITE_API_URL=http://localhost:5000/api
```

`VITE_API_URL` is the public API base URL used by Axios. Never place database credentials, JWT secrets, or other private values in the client environment file.

Do not commit `.env` files. Production must use HTTPS, a unique high-entropy JWT secret, and protected database credentials.

## Deployment: Vercel client and Render server

Both deployments must be configured and redeployed. Updating only the server is not sufficient because Vite embeds its environment variables when Vercel creates the client deployment.

### Render environment

Open the Render web service and configure:

```dotenv
NODE_ENV=production
CLIENT_URL=https://visitor-pass-management-system-five.vercel.app
MONGODB_URI=your-mongodb-connection-string
JWT_SECRET=your-long-private-jwt-secret
JWT_EXPIRES_IN=8h
```

`CLIENT_URL` must be the exact Vercel origin. Do not add `/login`, `/api`, or another path. Save the variables and redeploy the latest server commit.

Verify the deployed API:

```text
https://visitor-pass-management-system-b4pv.onrender.com/api/health
```

### Vercel environment

Open **Project Settings -> Environment Variables** and set:

```dotenv
VITE_API_URL=https://visitor-pass-management-system-b4pv.onrender.com/api
```

Apply it to Production and redeploy the client. The `/api` suffix is required. `client/vercel.json` ensures that direct React Router URLs such as `/login` and `/dashboard/admin` do not return a Vercel 404.

### Deployment verification

1. Clear old `auth_token` cookies for the deployed sites.
2. Open `https://visitor-pass-management-system-five.vercel.app/login`.
3. Sign in and inspect the browser Network panel.
4. Login must request `/api/auth/login` on the Render hostname.
5. Session restoration must request `/api/auth/profile` on the Render hostname.

Production authentication uses an HTTP-only `Secure; SameSite=None` cookie because Vercel and Render are different sites. Axios sends credentials and the API returns an exact credentialed CORS header for `CLIENT_URL`.

## Available commands

Run commands from the relevant folder:

| Folder | Command | Purpose |
| --- | --- | --- |
| `server` | `npm run dev` | Start the API with nodemon |
| `server` | `npm start` | Start the API with Node |
| `server` | `npm run seed` | Create or repair the initial administrator |
| `server` | `npm run migrate:employee-links` | Link compatible older User and Employee records |
| `server` | `npm test` | Run server tests |
| `client` | `npm run dev` | Start the Vite development server |
| `client` | `npm run lint` | Run frontend lint checks |

## Brief API documentation

Base URL locally:

```text
http://localhost:5000/api
```

All protected requests use the signed `auth_token` HTTP-only cookie. The browser client sends it using `withCredentials: true`.

### Authentication

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | Public, rate limited | Validate credentials and establish a session |
| POST | `/api/auth/logout` | Authenticated | Invalidate the current session and clear the cookie |
| GET | `/api/auth/profile` | Authenticated | Validate the session and return the logged-in user |
| POST | `/api/auth/change-password` | Authenticated | Validate the current password and set a new one |

Login request:

```json
{
  "email": "admin@visitorpass.com",
  "password": "Admin@123",
  "rememberMe": false
}
```

### Users and employees

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET, POST | `/api/users` | Administrator | Search/list or create accounts |
| PUT, DELETE | `/api/users/:id` | Administrator | Edit or delete an account |
| PATCH | `/api/users/:id/activate` | Administrator | Activate an account |
| PATCH | `/api/users/:id/deactivate` | Administrator | Deactivate an account |
| POST | `/api/users/:id/reset-password` | Administrator | Reset an account password |
| GET, POST | `/api/employees` | Administrator | Search/list or create employees |
| PUT, DELETE | `/api/employees/:id` | Administrator | Edit or delete employees |
| GET | `/api/departments` | Authenticated | List active departments |
| POST | `/api/departments` | Administrator | Create a department |
| GET | `/api/employee-options` | Administrator, Receptionist | Find active linked employees for visitor registration |

### Visitors

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/api/visitors` | Authenticated | Search and filter paginated visitor records |
| POST | `/api/visitors` | Receptionist, Administrator | Register a visitor, optionally with a photo |
| GET | `/api/visitors/:id` | Authenticated | Get visitor details |
| GET | `/api/visitors/:id/history` | Authenticated | Get the visitor's activity history |
| POST | `/api/visitors/:id/remarks` | Employee, Administrator | Add a host remark |
| POST | `/api/visitors/:id/approve` | Employee, Administrator | Approve a pending request |
| POST | `/api/visitors/:id/reject` | Employee, Administrator | Reject a pending request |
| POST | `/api/visitors/:id/cancel` | Receptionist, Administrator | Cancel a pending or approved request |
| POST | `/api/visitors/:id/checkin` | Receptionist | Check in an approved visitor |
| POST | `/api/visitors/:id/checkout` | Receptionist | Check out a checked-in visitor |

Visitor list filters:

```text
search, status, employee, department, from, to, page, limit, sortBy, sortOrder
```

Free-text search covers visitor details and the host employee's name or email. Empty optional filters are ignored.

### Dashboard, reports, and activity

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/api/dashboard` | Authenticated | Return role-specific live dashboard data |
| GET | `/api/reports` | Administrator | Return filtered report summaries, charts, and rows |
| GET | `/api/reports/export/pdf` | Administrator | Export the selected report as PDF |
| GET | `/api/reports/export/excel` | Administrator | Export the selected report as Excel |
| GET | `/api/activities` | Authenticated | Return role-scoped, paginated audit events |

Report parameters:

```text
period=today|yesterday|week|month|custom
from, to, status, department, employee, page, limit
```

Activity parameters:

```text
search, action, role, from, to, page, limit
```

### Response format

Successful response:

```json
{
  "success": true,
  "message": "Visitors loaded",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 15,
    "total": 0,
    "pages": 1
  }
}
```

Error response:

```json
{
  "success": false,
  "message": "Invalid email or password",
  "code": "INVALID_CREDENTIALS"
}
```

Typical status codes:

- `200` successful request
- `201` resource created
- `400` invalid operation
- `401` authentication required or expired
- `403` insufficient role permission
- `404` resource or route not found
- `409` business-rule conflict
- `422` request validation failed
- `500` unexpected server error

## Security controls

- bcrypt password hashing
- Signed JWT with issuer, audience, expiry, and token-version checks
- HTTP-only authentication cookie
- Helmet security headers
- Exact-origin credentialed CORS
- Login rate limiting
- Express Validator request validation
- MongoDB key sanitization
- Centralized 404 and error handling
- Restricted visitor-photo upload type and size
- No-store API cache policy

## Troubleshooting

- **API is unreachable:** start MongoDB and the server, then open `/api/health`.
- **CORS error:** confirm the exact `CLIENT_URL`, save it in Render, and redeploy the server.
- **Requests omit `/api`:** correct `VITE_API_URL` in Vercel and redeploy the client.
- **Direct Vercel route returns 404:** confirm `client/vercel.json` is included in the deployed client root.
- **Login fails after JWT changes:** clear the old authentication cookie and sign in again.
- **Employee is unavailable during registration:** confirm the Employee record is active, has a department, and is linked to an active Employee user account.
- **Seed cannot connect:** check `MONGODB_URI` and confirm MongoDB is available.

