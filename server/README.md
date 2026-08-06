# Visitor Pass API

The server is the source of truth for authentication, authorization, visitor workflow, validation, reporting, and audit history. It is an Express API backed by MongoDB through Mongoose.

## Setup

Start MongoDB, then run:

```powershell
cd server
npm install
Copy-Item .env.example .env
npm run seed
npm run dev
```

The API listens on `http://localhost:5000` by default. A health check is available at `GET /api/health`.

## Environment

```dotenv
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/visitor_pass
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=8h
CLIENT_URL=http://localhost:5173
```

| Variable | Notes |
| --- | --- |
| `PORT` | Port used by Express |
| `NODE_ENV` | Use `production` in a deployed environment |
| `MONGODB_URI` | Local MongoDB or Atlas connection string |
| `JWT_SECRET` | Long, private, high-entropy signing value |
| `JWT_EXPIRES_IN` | JWT duration accepted by `jsonwebtoken`, such as `8h` |
| `CLIENT_URL` | Comma-separated CORS allowlist with exact origins |

Do not commit `.env`. Use HTTPS in production so the authentication cookie can be transported securely.

For the deployed Render API, use the exact frontend origin without a path:

```dotenv
NODE_ENV=production
CLIENT_URL=https://visitor-pass-management-system-five.vercel.app
```

After changing a Render environment variable, redeploy or restart the service. The production authentication cookie uses `Secure; SameSite=None` because the Vercel and Render hosts are different sites; the CORS allowlist remains exact and credentialed.

## Initial administrator

`npm run seed` creates or repairs the required initial administrator without creating sample operational data:

```text
System Administrator
admin@visitorpass.com
Admin@123
Administrator
```

The User model hashes the password with bcrypt. The seed is safe to run again. Change the initial password after setup.

## Architecture

```text
src/
├── config/           database and environment setup
├── controllers/      HTTP request/response orchestration
├── middleware/       authentication, roles, validation, uploads, errors
├── models/           User, Employee, Department, Visitor, ActivityLog
├── routes/           REST endpoint and permission definitions
├── scripts/          controlled data migrations
├── services/         visitor rules and activity persistence
├── utils/            responses, dates, tokens, async helpers
├── app.js             Express application
├── server.js          process entry point
└── seed.js            initial administrator seed
```

## Authentication and authorization

The login endpoint validates credentials against MongoDB and returns user information while setting a signed JWT in an HTTP-only cookie. `authenticateUser` validates the token, issuer, audience, current user status, and token version. `authorizeRoles(...roles)` then applies endpoint-specific permissions.

Passwords are never selected or returned by ordinary user queries. Password changes and administrator resets invalidate older sessions through the user's token version.

## API reference

Every path below starts with `/api`.

### Authentication

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/login` | Public, rate limited | Authenticate email/password and establish session |
| POST | `/auth/logout` | Authenticated | Clear the session cookie |
| GET | `/auth/profile` | Authenticated | Validate session and return current user |
| POST | `/auth/change-password` | Authenticated | Validate current password and set a new password |

Login body:

```json
{ "email": "admin@visitorpass.com", "password": "Admin@123", "rememberMe": false }
```

### User accounts — Administrator

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET, POST | `/users` | Search/list or create accounts |
| PUT, DELETE | `/users/:id` | Edit or delete an account |
| PATCH | `/users/:id/activate` | Activate an account |
| PATCH | `/users/:id/deactivate` | Deactivate an account |
| POST | `/users/:id/reset-password` | Set a validated replacement password |

Creating an Employee user either links an available Employee record or creates the associated profile from the supplied department, designation, and phone. User and Employee references are maintained in both collections.

### Employees and departments — Administrator

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET, POST | `/employees` | Search/list or create employees |
| PUT, DELETE | `/employees/:id` | Edit or delete employees |
| GET | `/departments` | List active departments |
| POST | `/departments` | Create a department |
| GET | `/employee-options` | Find active, linked hosts for registration |

### Visitors

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/visitors` | Authenticated | Paginated visitor search and filtering |
| GET | `/visitors/:id` | Authenticated | Visitor detail |
| GET | `/visitors/:id/history` | Authenticated | Visitor activity history |
| POST | `/visitors` | Receptionist, Administrator | Register visitor; optional `photo` multipart field |
| POST | `/visitors/:id/remarks` | Employee, Administrator | Add host remark |
| POST | `/visitors/:id/approve` | Employee, Administrator | Approve pending request |
| POST | `/visitors/:id/reject` | Employee, Administrator | Reject pending request |
| POST | `/visitors/:id/cancel` | Receptionist, Administrator | Cancel pending or approved request |
| POST | `/visitors/:id/checkin` | Receptionist | Record actual arrival for approved visitor |
| POST | `/visitors/:id/checkout` | Receptionist | Record departure for checked-in visitor |

`GET /visitors` accepts `search`, `status`, `employee`, `department`, `from`, `to`, `page`, and `limit`. Free-text search includes visitor identity/company/purpose and host employee name or email. Empty optional query values are treated as absent.

### Dashboard, reports, and activity

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/dashboard` | Authenticated | Role-specific live statistics and recent records |
| GET | `/reports` | Administrator | Statistics, charts, and paginated visitor rows |
| GET | `/reports/export/pdf` | Administrator | PDF for the selected period/filter |
| GET | `/reports/export/excel` | Administrator | Formatted summary and visitor-detail workbook |
| GET | `/activities` | Authenticated | Paginated audit events; role scoped by server |

Reports accept `period=today|yesterday|week|month|custom`, `from`, `to`, `status`, `department`, `employee`, `page`, and `limit`. Activity accepts `search`, `action`, `role`, `from`, `to`, `page`, and `limit`. Empty optional filters do not cause validation errors.

## Visitor rules enforced by the server

1. A visitor cannot have overlapping active visits.
2. The same visitor cannot be registered twice for the same date.
3. Visit dates cannot be in the past.
4. Today's expected arrival cannot be earlier than the current local time.
5. A host cannot have more than three pending requests.
6. Only approved visitors can check in.
7. A checked-in visitor cannot check in again.
8. Checkout is recorded only after check-in and uses a later timestamp.
9. Rejected visitors cannot check in.
10. Cancelled visits are excluded from active visitor views.

Lifecycle changes are atomic and status allow-listed. Each action writes an ActivityLog containing the action, actor, role, visitor where applicable, remarks/description, timestamp, and available request IP information.

## Response format

Success:

```json
{
  "success": true,
  "message": "Visitors loaded",
  "data": [],
  "meta": { "page": 1, "limit": 15, "total": 0, "pages": 0 }
}
```

Error:

```json
{
  "success": false,
  "message": "Invalid email or password",
  "code": "AUTHENTICATION_ERROR"
}
```

Validation failures use HTTP 422, authentication failures 401, permission failures 403, missing resources 404, business conflicts 409 where appropriate, and unexpected failures 500.

## Security controls

- Helmet security headers
- Exact-origin CORS with credentials
- HTTP-only JWT cookie and token-version invalidation
- bcrypt password hashing
- Login rate limiting
- Express Validator request validation
- Recursive input sanitization against unsafe MongoDB keys
- Centralized 404 and error responses
- Restricted MIME type and size handling for visitor photos
- No-store caching policy for API responses

## Commands

```text
npm run dev                    start with nodemon
npm start                      start with Node
npm run seed                   provision the initial administrator
npm run migrate:employee-links link compatible existing User/Employee records
npm test                       run Node tests
```

Run the employee-link migration only when upgrading older data that predates bidirectional User/Employee references. Back up production data before any migration.
