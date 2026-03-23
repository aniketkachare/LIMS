# LIMS - Laboratory Information System Management

Node.js + Express + MSSQL + EJS application for laboratory registration, collection, accession, result entry, billing, barcode printing, validation, search, and reports.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env` in the project root:
   ```env
   PORT=5005
   SECRET_KEY=your-strong-secret
   DB_SERVER=your-sql-host
   DB_DATABASE=your-database-name
   DB_USER=your-user
   DB_PASSWORD=your-password
   NODE_ENV=development
   ```
3. Run the app:
   ```bash
   npm run dev
   ```
   Or:
   ```bash
   npm start
   ```

## Current Workflow

1. Registration
   Save patient, visit, billing, files, and selected tests/profiles.
2. Collection
   Collected samples move forward from the collection queue.
3. Accession
   Accepted accession cases move into Result Entry.
4. Result Entry
   Lab users save manual results.
   Doctor authorization sends cases to Reports.
5. Reports
   Authorized cases appear in the report list for preview/print.
6. Search
   Search patients, reopen invoice, print invoice, and view pending amount.

## Main Features

- Two-step registration flow with patient + billing details
- Invoice generation and invoice reprint from Search
- Search page defaults to today's patients
- Collection and Accession queues with status updates
- Barcode printing page with today's records by default
- Manual Result Entry screen for accession-approved patients
- Separate `Save Result` and `Authorized By Doctor` actions
- Reports page for authorized results
- Validation page
- Dashboard summary
- Collapsible hover-expand sidebar
- Console error logging on key operational routes

## Important Routes

### Authentication
- `GET /`
- `POST /login`
- `POST /logout`

### Registration and Billing
- `GET /register`
- `POST /register`
- `GET /nextPage`
- `POST /submit`
- `GET /invoice/:visitCode`

### Lookup and Support APIs
- `GET /generateVisitCode`
- `GET /suggestPatients`
- `GET /suggest-lab-names`
- `GET /suggest-refer-names`
- `GET /suggest-doctor-names`
- `GET /suggest-tests-profiles`
- `GET /fetch-payment-modes`
- `GET /validate-center`
- `GET /validate-refered`
- `GET /validate-doctor`

### Operations
- `GET /collection`
- `POST /update-action`
- `POST /update-bulk-action`
- `GET /Accession`
- `POST /update-accession-action`
- `POST /update-accession-bulk-action`
- `GET /Barcodeprinting`
- `POST /preview-barcode`
- `GET /Barcodeprinting/print/:visitCode`

### Search, Result, Validation
- `GET /Search`
- `GET /result`
- `GET /result/details/:visitCode`
- `POST /api/save-result-patient`
- `POST /api/update-testwise-action`
- `GET /validation`

### Reports
- `GET /reports`
- `GET /reports/data`
- `GET /reports/preview/:visitCode`
- `GET /reports/download/:visitCode`

### Dashboard
- `GET /dashboard`

## Project Structure

```text
app.js
README.md
document.md
public/
  css/main.css
  js/main.js
views/
  partials/sidebar.ejs
  login.ejs
  register.ejs
  nextPage.ejs
  dashboard.ejs
  collection.ejs
  Accession.ejs
  Barcodeprinting.ejs
  result.ejs
  validation.ejs
  Search.ejs
  report-list.ejs
  invoice.ejs
  error.ejs
uploads/
```

## Database Notes

- SQL Server is accessed through `mssql`
- Stored procedures drive most operational pages
- Current code is aligned to schema names like:
  - `Visit`
  - `Visit_patient`
  - `Visit_Trans`
- Current billing columns used from `Visit` include:
  - `Gross`
  - `Net`
  - `AmountPaid`
  - `BalanceAmt`

## Current UI Notes

- Sidebar is collapsed by default on desktop and expands on hover
- Search and Barcode pages default to today's date
- Invoice layout is plain black-and-white and print-friendly
- Result Entry is designed for manual parameter entry

## Production Notes

- Replace in-memory session storage with Redis or another persistent store
- Use hashed passwords instead of plain-text comparison
- Add CSRF protection and rate limiting
- Review and standardize stored procedure contracts

## Verification

Recent code updates were checked with:

```bash
node --check app.js
```

## Notes

This README reflects the current application behavior and recent workflow updates in this repository.
