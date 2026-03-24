# LIMS - Laboratory Information System Management

Node.js + Express + MSSQL + EJS application for laboratory registration, collection, accession, result entry, billing, invoice printing, barcode printing, financial analysis, validation, search, and reports.

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
   One-click collection actions move samples forward from the collection queue.
3. Accession
   Accepted accession cases move into Result Entry.
4. Result Entry
   Lab users save manual results.
   Doctor authorization sends cases to Reports.
5. Reports
   Authorized cases appear in the report list for preview/print.
6. Search
   Search patients, reopen invoice, print invoice in popup, and view pending amount.
7. Financial Analysis
   Review revenue, due balance, payment mode split, and daily financial summaries.

## Main Features

- Two-step registration flow with custom registration date picker and patient + billing details
- Add new Center / Lab, Referred By, and Doctor from Registration with inline `+` buttons
- Billing page redesigned into a bill-entry layout
- Invoice generation and invoice reprint from Search in popup window style
- Search page defaults to today's patients
- Collection queue with one-click `Collected`, `Rejected`, and `Hold` buttons
- Accession queue with one-click `Accepted`, `Reject`, and `Hold` buttons
- Barcode printing page with today's records by default
- Manual Result Entry screen for accession-approved patients
- Separate `Save Result` and `Authorized By Doctor` actions
- Reports page for authorized results
- Financial Analysis page with revenue cards, daily snapshot, payment mode split, and due visit tracking
- Dashboard patient trend chart with `From Date` and `To Date` filters
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
- `GET /invoice/:visitID`
- `POST /api/master/center`
- `POST /api/master/refer`
- `POST /api/master/doctor`

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
- `GET /financial-analysis`

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
  financial-analysis.ejs
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
  - `DiscountAmount`
  - `VisitingCharges`
  - `BalanceAmt`

- Current line-item billing column used from `Visit_Trans`:
  - `TestPrice`
  - `DiscountAmount`

## Current UI Notes

- Sidebar is collapsed by default on desktop and expands on hover
- Search and Barcode pages default to today's date
- Invoice opens in popup window style and uses a compact single printable layout
- Result Entry is designed for manual parameter entry
- Dashboard includes a patient registration trend chart with date range filters
- Financial Analysis has a dedicated menu and dashboard quick action

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
