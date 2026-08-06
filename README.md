# Visitor Pass Management System

A complete MERN application for managing workplace visitors from registration through host approval, arrival, departure, reporting, and audit history. The system uses real MongoDB data, HTTP-only cookie authentication, and server-enforced role permissions.

## What the system covers

- Secure login, logout, profile, password change, session restoration, and expiry handling
- Role-based navigation and API authorization for Administrator, Receptionist, and Employee accounts
- Employee and user-account management with linked records
- Visitor registration with server and client validation
- Host approval, rejection, remarks, reception check-in, check-out, cancellation, and full history
- Live role-specific dashboards backed by MongoDB aggregations
- Combined visitor search and filters for visitor, host, date, and status
- Administrator reports with PDF and professionally formatted Excel exports
- Role-scoped, paginated activity history
- Responsive light/dark interface with accessible forms, tables, dialogs, and status indicators

## Roles and permissions

| Role | Main responsibilities |
| --- | --- |
| Administrator | Overall dashboard, users, employees, departments, reports, and complete activity history |
| Receptionist | Reception dashboard, visitor registration, approved-visitor check-in, check-out, and visitor history |
| Employee | Personal visitor requests, approve/reject decisions, remarks, and own visitor history |

Both the React router and Express API enforce these boundaries. Hiding a navigation item is never treated as authorization.

## Visitor workflow

```text
Receptionist registers visitor
        ↓
Pending request reaches the linked employee
        ↓
Employee approves or rejects the request
        ↓
Receptionist checks in an approved visitor
        ↓
Receptionist checks out the visitor
        ↓
Complete visitor and activity history is retained
```

The backend also prevents duplicate same-day registrations, overlapping active visits, past schedules, invalid arrival/departure times, more than three pending requests per employee, invalid status transitions, repeated check-ins, and checkout before check-in. Cancelled visitors are excluded from active operational lists.

## Project structure

```text
visitor-pass-management-system/
├── client/                 React + Vite application
│   ├── public/             favicon, manifest, robots, sitemap
│   └── src/                pages, components, context, services, styles
├── server/                 Express + MongoDB API
│   └── src/                models, routes, controllers, services, middleware
└── README.md
```

Detailed notes are available in [client/README.md](client/README.md) and [server/README.md](server/README.md).

## Prerequisites

- Node.js 20 or newer
- npm
- MongoDB running locally, or a MongoDB Atlas connection string

## Local setup

### 1. Configure and start the API

Open a terminal in `server`:

```powershell
cd server
npm install
Copy-Item .env.example .env
npm run seed
npm run dev
```

Edit `server/.env` before seeding if MongoDB is not available at the default local address. The API starts at `http://localhost:5000`; verify it with `http://localhost:5000/api/health`.

### 2. Configure and start the client

Open another terminal in `client`:

```powershell
cd client
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`.

### 3. First sign-in

The idempotent seed command creates one initial administrator:

- Email: `admin@visitorpass.com`
- Initial password: `Admin@123`

The password is hashed by the User model before storage. Change it after the first sign-in. No visitors, receptionist accounts, employee accounts, or fake authentication records are seeded.

## Environment configuration

Server (`server/.env`):

| Variable | Purpose | Local example |
| --- | --- | --- |
| `PORT` | Express port | `5000` |
| `NODE_ENV` | Runtime mode | `development` |
| `MONGODB_URI` | MongoDB connection | `mongodb://127.0.0.1:27017/visitor_pass` |
| `JWT_SECRET` | Private JWT signing secret | Use a long random value |
| `JWT_EXPIRES_IN` | Session lifetime | `8h` |
| `CLIENT_URL` | Allowed browser origin(s), comma separated | `http://localhost:5173` |

Client (`client/.env`):

| Variable | Purpose | Local example |
| --- | --- | --- |
| `VITE_API_URL` | API base URL | `http://localhost:5000/api` |

Never commit real secrets or production database credentials. Production must use HTTPS and a unique high-entropy JWT secret.

## Useful commands

Run these inside the relevant folder:

```text
server: npm run dev, npm start, npm run seed, npm test
client: npm run dev, npm run lint
```

## API overview

All endpoints are prefixed with `/api`. Successful responses follow `{ success, message, data, meta? }`; errors follow `{ success: false, message, code?, errors? }`.

| Area | Representative endpoints |
| --- | --- |
| Authentication | `POST /auth/login`, `POST /auth/logout`, `GET /auth/profile`, `POST /auth/change-password` |
| Users | `GET/POST /users`, `PUT/DELETE /users/:id`, activate, deactivate, and reset-password actions |
| Employees | `GET/POST /employees`, `PUT/DELETE /employees/:id` |
| Visitors | `GET/POST /visitors`, detail/history, approve, reject, remarks, cancel, check-in, and check-out |
| Dashboard | `GET /dashboard` |
| Reports | `GET /reports`, `GET /reports/export/pdf`, `GET /reports/export/excel` |
| Activity | `GET /activities` |

See [server/README.md](server/README.md) for roles, parameters, and endpoint details.

## Troubleshooting

- **Cannot reach the API:** start MongoDB, then start the server and confirm `/api/health` responds.
- **CORS error:** make sure `CLIENT_URL` exactly matches the browser origin, including its port.
- **Login fails after changing JWT settings:** clear the old authentication cookie and sign in again.
- **Employee is unavailable during registration:** ensure the Employee record is active, has a department, and is linked to an active Employee user account.
- **Seed cannot connect:** verify `MONGODB_URI` and confirm the database service is running.

