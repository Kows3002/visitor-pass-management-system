# Visitor Pass Client

The client is the responsive React interface for the Visitor Pass Management System. It consumes the Express API directly; it contains no fake login, hardcoded role session, or mock visitor data.

## Stack

React, Vite, React Router, Redux Toolkit, Axios, React Hook Form, Zod, React Hot Toast, Recharts, Framer Motion, and Tailwind CSS.

## Setup

```powershell
cd client
npm install
Copy-Item .env.example .env
npm run dev
```

The development server opens at `http://localhost:5173` by default. Start the API separately before signing in.

## Environment

`client/.env` contains the browser-safe API location:

```dotenv
VITE_API_URL=http://localhost:5000/api
```

Only variables prefixed with `VITE_` are exposed to browser code. Never place JWT secrets, database credentials, or private keys here.

## Application routes

| Route | Access |
| --- | --- |
| `/login` | Public |
| `/dashboard/admin` | Administrator |
| `/dashboard/receptionist` | Receptionist |
| `/dashboard/employee` | Employee |
| `/people` | Administrator |
| `/visitors` | Authenticated, with role-appropriate actions |
| `/visitors/register` | Receptionist and Administrator |
| `/reports` | Administrator |
| `/activity` | Authenticated; results are scoped by the API |
| `/security` | Authenticated account security |

Unknown routes use the not-found screen. Authenticated users who attempt to open another role's route are sent to the unauthorized screen.

## Authentication behavior

- Axios sends credentials with every API request.
- The signed JWT is stored in an HTTP-only cookie by the API, not used as a localStorage authentication authority.
- The application restores the session through `GET /api/auth/profile` after refresh.
- A `401` response clears client authentication state and returns the user to login.
- The post-login redirect is determined from the authenticated role.

## Frontend organization

```text
src/
├── components/       shared UI, layout, route guards, dialogs, states
├── context/          authentication and theme state
├── pages/            role dashboards and functional screens
├── services/         reusable Axios API layer
├── utils/            formatting and shared helpers
├── App.jsx           route definitions
├── index.css         base interface styles
└── enterprise.css    application design-system refinements
```

Forms use client validation for immediate feedback, but the server remains the authority for permissions and business rules. Data screens retain loading, empty, error, filter, and pagination states.

## Checks

```powershell
npm run lint
```

## UI conventions

- Use existing surface, border, type, spacing, button, badge, and focus styles before adding page-specific CSS.
- Keep labels explicit and preserve visible keyboard focus.
- Use status colors semantically, not decoratively.
- Keep role actions available only where both the route and API permit them.

