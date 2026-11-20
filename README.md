# SmartCare HMS — Hospital Management System

SmartCare HMS is a full-stack, PostgreSQL-backed Hospital Management System engineered for hospitals, private clinics, medical centres, and healthcare facilities in Malawi and across Africa.

## Technology Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide React, Recharts
- **Backend**: Node.js, Express.js, REST API, Zod validation, Helmet security headers
- **Database**: PostgreSQL with Drizzle ORM & Drizzle Kit migrations
- **Authentication & RBAC**: Dual authentication (Firebase OAuth Google Sign-In + bcrypt staff credentials with SHA-256 hashed HTTP-only session cookies) and 8-role RBAC matrix
- **Currency**: Malawi Kwacha (`MWK`)

## Modules Included
1. **Executive Hospital Dashboard** — Live KPIs, 7-day patient & revenue trends, department performance, recent transactions & audit activity.
2. **Patient Management** — Registration (`MW-YYYY-XXXX`), search by name/ID/phone, demographics, emergency contact & next-of-kin, allergies, medical timeline, document uploads, and printable patient dossiers.
3. **Appointment Scheduling** — Conflict-free doctor booking, rescheduling, attendance tracking, daily/weekly/monthly views, and status workflows (`Scheduled`, `Confirmed`, `Checked in`, `Completed`, `Cancelled`, `No-show`).
4. **Consultations & Electronic Medical Records (EMR)** — Complaints, symptoms, vital signs, clinical notes, ICD-10 diagnoses, treatment plans, inline prescription & lab test ordering, and immutable chronological records.
5. **Admissions & Ward Management** — Ward & bed grid (`Available`, `Occupied`, `Reserved`, `Maintenance`), inpatient admission, daily nurse ward observations, discharge summaries, and automatic stay billing.
6. **Pharmacy Management** — Medicine catalog, batch & expiry tracking, FIFO stock deduction on dispensing, low-stock alerts, stock movements ledger, and automatic billing.
7. **Laboratory Management** — Test catalog, prioritized request queue (`Routine`, `Urgent`, `STAT`), sample/processing workflow, result entry, report attachment upload, and EMR linking.
8. **Billing & Financial Management (MWK)** — Multi-line invoices, partial & full payments (`Cash`, `Bank transfer`, `Mobile money`, `Card`, `Insurance`), official receipts, and balance tracking.
9. **Inventory & Procurement** — Suppliers directory, medical consumables/PPE/reagent tracking, stock purchases/issues, and reorder alerts.
10. **Reports, Analytics & System Settings** — Filterable reports with CSV export & print support, hospital configuration, departments, service fees, user/role governance, audit logs, and database JSON backup export.

## Local Development Setup
1. Copy `.env.example` to `.env` and populate your PostgreSQL `SQL_*` credentials and `SESSION_SECRET`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Push the Drizzle schema to PostgreSQL:
   ```bash
   npm run db:push
   ```
4. Start the full-stack development server on port `3000`:
   ```bash
   npm run dev
   ```

## Deploying to Render via GitHub
1. Push this repository to GitHub.
2. In Render, choose **New + -> Blueprint** and connect your GitHub repository.
3. Render automatically reads `render.yaml`, provisions the `smartcare-hms-db` PostgreSQL database, injects `SQL_HOST`, `SQL_PORT`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`, and `SESSION_SECRET`, builds the Vite frontend (`npm ci && npm run build`), and starts the Express backend (`npm run start`).
4. Run `npm run db:push` once from Render's Shell tab (or set as a pre-deploy command) to create all 33 PostgreSQL tables.
