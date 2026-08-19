# Visitor Pass Management System

A production-oriented MERN application for managing workplace visitors from registration through host approval, check-in, check-out, reporting, and audit history. All operational data is stored in MongoDB. Authentication and role permissions are enforced by the Express API.

## Main features

- Secure JWT authentication using an HTTP-only cookie
- Administrator, Receptionist, and Employee role-based access
- User, employee, and department management
- Visitor registration with frontend and backend validation
- Employee approval, rejection, and remarks
- Receptionist check-in and check-out workflow
- Random employee assignment with capacity checks and automatic employee alerts
- Administrator-controlled meeting duration applied to every new registration
- QR visitor passes with automatic email delivery, protected viewing, and PDF download
- Reception arrival/no-arrival confirmation with employee and visitor notifications
- Employee next-visit scheduling with automatic visitor email
- Role-specific dashboards with weekly/monthly trends, approval outcomes, visitor movement, top hosts, and department analytics from MongoDB
- Visitor search, combined filters, sorting, and pagination
- Administrator reports with professionally formatted PDF and Excel export
- Gmail SMTP email and optional Twilio SMS notifications for approval and rejection decisions
- Administrator bulk approval and selected-visitor Excel export
- Complete, role-scoped activity history with employee-management events and administrator CSV audit export
- Server-side business-rule regression tests, centralized API responses, and query-aligned MongoDB indexes
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
An eligible employee is selected randomly
and receives an automatic email alert
              |
              v
       Status: Pending
              |
              v
Employee approves or rejects the request
              |
              v
Approved visitor receives a QR PDF pass by email
              |
              v
Reception confirms Arrived or Not Arrived
              |
              v
Arrived visitor alerts the assigned employee
and can be checked in by Receptionist
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

When Windows can resolve the Atlas hostname but Node reports `querySrv ECONNREFUSED` or `querySrv ETIMEOUT`, the server automatically retries the validated Atlas SRV and TXT records through DNS-over-HTTPS. The fallback never logs credentials and only accepts database hosts under the Atlas project domain. Keep `NODE_ENV=development` locally and add the computer's current public IP in Atlas **Network Access**.

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
PUBLIC_APP_URL=http://localhost:5173
APP_TIMEZONE=Asia/Kolkata
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=YOUR_GMAIL_ADDRESS
SMTP_PASSWORD=YOUR_GMAIL_APP_PASSWORD
NOTIFICATION_FROM_EMAIL=Visitor Pass <YOUR_GMAIL_ADDRESS>
NOTIFICATION_REPLY_TO=YOUR_GMAIL_ADDRESS
# Optional SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Express port. Defaults to `5000`. |
| `NODE_ENV` | Yes | Use `development` locally and `production` when deployed. |
| `MONGODB_URI` | Yes | Local MongoDB or Atlas connection string. |
| `JWT_SECRET` | Yes | Long private value used to sign authentication tokens. |
| `JWT_EXPIRES_IN` | No | Standard JWT duration such as `8h`. |
| `CLIENT_URL` | Yes | Exact allowed browser origin. Multiple origins may be comma-separated. Do not include a path. |
| `PUBLIC_APP_URL` | Production | Public frontend origin encoded into visitor-pass QR verification links. Falls back to the deployed HTTPS origin in `CLIENT_URL`. |
| `APP_TIMEZONE` | No | IANA timezone used to group dashboard analytics (defaults to `Asia/Kolkata`). |
| `DNS_OVER_HTTPS_URL` | No | HTTPS DNS endpoint used only when the runtime cannot resolve Atlas SRV records. |
| `SMTP_HOST` | For email | SMTP server hostname. Use `smtp.gmail.com` for Gmail. |
| `SMTP_PORT` | For email | SMTP port. Use `465` with secure SMTP. |
| `SMTP_SECURE` | For email | Use `true` with Gmail SMTP port `465`. |
| `SMTP_USER` | For email | Gmail or Google Workspace email address. |
| `SMTP_PASSWORD` | For email | Google App Password, never the normal account password. |
| `NOTIFICATION_FROM_EMAIL` | For email | Display name and Gmail sender address. |
| `NOTIFICATION_REPLY_TO` | No | Address that receives replies to approval emails. |
| `TWILIO_ACCOUNT_SID` | For SMS | Twilio account identifier. Required with the other Twilio variables. |
| `TWILIO_AUTH_TOKEN` | For SMS | Private Twilio authentication token. |
| `TWILIO_FROM_NUMBER` | For SMS | SMS-capable Twilio number in E.164 format. |

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
CLIENT_URL=http://localhost:5173,https://visitor-pass-management-system-five.vercel.app
PUBLIC_APP_URL=https://visitor-pass-management-system-five.vercel.app
MONGODB_URI=your-mongodb-connection-string
JWT_SECRET=your-long-private-jwt-secret
JWT_EXPIRES_IN=8h
APP_TIMEZONE=Asia/Kolkata
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=YOUR_GMAIL_ADDRESS
SMTP_PASSWORD=YOUR_GMAIL_APP_PASSWORD
NOTIFICATION_FROM_EMAIL=Visitor Pass <YOUR_GMAIL_ADDRESS>
NOTIFICATION_REPLY_TO=YOUR_GMAIL_ADDRESS
# Optional SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

`CLIENT_URL` is a comma-separated allowlist. It includes the local Vite origin and the exact Vercel origin so either frontend can call the deployed API. Do not add `/login`, `/api`, quotation marks, or another path. Save the variables and redeploy the latest server commit.

### Approval and rejection notifications

Decision emails are sent through Gmail SMTP with Nodemailer to the email saved with the visitor registration. Enable two-step verification on the Gmail or Google Workspace account, create a Google App Password, and place that 16-character value in `SMTP_PASSWORD`. Spaces shown by Google are accepted and normalized by the server. Do not use the account's regular password. Configure `SMTP_USER`, `NOTIFICATION_FROM_EMAIL`, and `NOTIFICATION_REPLY_TO` with the same Gmail address unless your Google Workspace SMTP policy allows another sender. On startup, the server verifies SMTP and logs either `Gmail SMTP connection verified` or a safe configuration error.

SMS is optional and uses Twilio. Configure all three `TWILIO_*` variables and store visitor telephone numbers in E.164 format, for example `+919876543210`. Without those variables, the approval response reports SMS as `not_configured`; the application does not claim that an SMS was sent.

After changing notification variables, restart the local server or redeploy the Render service. Approve or reject a pending visitor that has a valid email address, then inspect the response `meta.notification` and the server log for the masked delivery result.

Use the connection string copied from **MongoDB Atlas -> Database -> Connect -> Drivers**. Its structure should be:

```text
mongodb+srv://<database-user>:<url-encoded-password>@<exact-atlas-cluster-host>/visitor_pass?retryWrites=true&w=majority
```

Do not reuse the Atlas website account password unless it is also the password of a separately created Atlas database user. If the database password contains characters such as `@`, `:`, `/`, `?`, `#`, or `%`, URL-encode the password before placing it in the URI.

In MongoDB Atlas:

1. Confirm the cluster is running and is not paused or deleted.
2. Open **Database Access** and confirm the database user exists and has access to `visitor_pass`.
3. Open the Render service's **Connect** page and copy its outbound IP ranges.
4. Add those outbound IP ranges in Atlas **Network Access**.
5. Copy a fresh Node.js driver connection string from the Atlas Connect dialog into Render's `MONGODB_URI`.

The application never falls back to a local MongoDB instance. When `NODE_ENV=production`, startup fails immediately if `MONGODB_URI` contains `localhost`, `127.0.0.1`, or `::1`.

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

### Automated verification

`npm test` in `server` covers visitor date and time rules, duplicate and active-visit prevention, approval ownership, allowed status transitions, repeated check-in prevention, checkout ordering, atomic check-in, notification delivery states, standardized API responses, partial bulk-approval results, and audit CSV generation. Frontend changes are checked with ESLint.

MongoDB indexes are aligned with visitor status/date queues, employee and department reports, check-in/check-out timestamps, review timestamps, user and employee lists, and activity queries by performer, visitor, action, role, and creation time. Unique visitor identity/date indexes provide database-level duplicate protection.

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

Visitor registration no longer accepts a manually selected employee. The API randomly selects an active, linked employee and excludes employees who already have three pending requests.

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
| POST | `/api/visitors/:id/arrival` | Receptionist | Mark today's appointment as `arrived` or `not_arrived` and send notifications |
| POST | `/api/visitors/:id/next-visit` | Employee, Administrator | Store a future visiting date and email the visitor |
| GET | `/api/visitors/:id/pass` | Authenticated, role scoped | View an approved visitor pass |
| GET | `/api/visitors/:id/pass/pdf` | Authenticated, role scoped | Download an approved visitor pass PDF |
| GET | `/api/passes/verify/:code` | Public | Verify a non-sensitive QR pass reference |
| POST | `/api/visitors/bulk/approve` | Administrator | Approve up to 50 selected pending requests with per-record results |
| POST | `/api/visitors/bulk/export` | Administrator | Export up to 500 selected visitors as an Excel workbook |

Visitor list filters:

```text
search, status, employee, department, from, to, page, limit, sortBy, sortOrder
```

Free-text search covers visitor details and the host employee's name or email. Empty optional filters are ignored.

### Dashboard, reports, and activity

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/api/dashboard` | Authenticated | Return role-specific live dashboard data |
| GET | `/api/settings` | Authenticated | Read meeting duration and pass contact settings |
| PUT | `/api/settings` | Administrator | Update global meeting duration and pass contact details |
| GET | `/api/reports` | Administrator | Return filtered report summaries, charts, and rows |
| GET | `/api/reports/export/pdf` | Administrator | Export the selected report as PDF |
| GET | `/api/reports/export/excel` | Administrator | Export the selected report as Excel |
| GET | `/api/activities` | Authenticated | Return role-scoped, paginated audit events |
| GET | `/api/activities/export/csv` | Administrator | Export the filtered audit history as CSV |

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

## Checking the additional visitor workflow

Use real employee accounts with active Employee profiles, linked User records, departments, and valid email addresses.

1. Sign in as Administrator, open **Operations settings**, set the meeting duration and reception contact details, and save.
2. Sign in as Receptionist and register a visitor with a reachable email address. There is no host picker. Confirm the response names a randomly assigned employee and that the employee receives the assignment email.
3. Register several visitors and verify assignments are not tied to registration order. Employees with three pending requests must not receive another assignment.
4. Sign in as the assigned Employee, open **My visitor requests**, and approve the request. Confirm the visitor receives the approval email and a PDF pass attachment containing a QR code.
5. Open **My visitors & passes** as the employee, or **Today's appointments** as reception, and open the pass. Download its PDF and scan the QR code. The public verification page should show only pass status and appointment information, not government ID or other sensitive data.
6. In **My visitors & passes**, choose a future next visiting date and send it. Confirm the visitor receives the date by email.
7. On the scheduled date, open **Today's appointments** as Receptionist. Verify the appointment, arrived, newly registered, and inside counters use live API data.
8. Mark the visitor **Arrived**. Confirm the employee receives the arrival alert. Then open **Check in** and check in the visitor. The API will reject check-in before arrival confirmation.
9. For another appointment, choose **Not arrived**. Confirm the employee receives the reminder and the visitor receives the no-arrival email.
10. Check out an arrived visitor and verify the dashboard, visitor history, and activity history update.

Email results are returned in API response metadata and logged by the server with masked recipient addresses. Workflow changes remain saved if SMTP delivery fails.

### Employee alert and QR troubleshooting

- Employee alerts resolve the email from the linked Employee profile first. If the linked login account uses a different address, that address is copied on the notification. Keep both records linked and both email addresses current in **People & Access**.
- Assignment, arrived, and not-arrived responses include notification delivery metadata. Render logs show the event name, masked recipient, provider, and message identifier without exposing SMTP credentials.
- Set `PUBLIC_APP_URL` to the deployed Vercel origin on Render. As a safety fallback, pass generation selects the first non-local HTTPS origin in `CLIENT_URL` instead of encoding localhost.
- Pass PDFs contain the verification URL at generation time. Download the pass again after changing `PUBLIC_APP_URL`; an already downloaded PDF cannot have its embedded QR code changed.
- After changing Render variables, deploy the latest backend and restart the service. Redeploy Vercel when frontend files or `VITE_API_URL` change.

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
- **`querySrv ECONNREFUSED` or `ETIMEOUT`:** the runtime could not resolve the Atlas SRV record. Copy a fresh driver URI from Atlas and confirm that the cluster still exists. If the exact SRV hostname is valid but DNS remains blocked, use the standard non-SRV `mongodb://` connection string offered by the Atlas Connect dialog.
- **Atlas server-selection timeout:** add the Render service's current outbound IP ranges to the Atlas project IP Access List and confirm outbound ports `27015-27017` are permitted.
- **Atlas authentication failure:** verify the Atlas database user and URL-encode special characters in its password.
