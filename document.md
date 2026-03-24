# LIMS System Documentation

## 1. Overview

This project is a laboratory workflow application built with:

- Node.js
- Express
- EJS
- SQL Server via `mssql`
- `multer` for uploads
- `pdfkit`, `puppeteer`, and `bwip-js` for print output

The system covers:

- patient registration
- billing and invoice generation
- popup invoice preview and printing
- collection and accession workflow
- barcode printing
- manual result entry
- doctor authorization
- report generation
- financial analysis
- validation
- patient search and invoice reprint

## 2. Environment Configuration

Required `.env` values:

- `PORT`
- `SECRET_KEY`
- `DB_SERVER`
- `DB_DATABASE`
- `DB_USER`
- `DB_PASSWORD`
- `NODE_ENV`

Typical startup:

```bash
npm install
npm run dev
```

## 3. Application Structure

Core files:

- `app.js` - main server, routes, SQL integration, helper logic
- `public/css/main.css` - main UI styling
- `public/js/main.js` - shared client-side helpers
- `views/partials/sidebar.ejs` - left navigation

Primary views:

- `views/login.ejs`
- `views/dashboard.ejs`
- `views/financial-analysis.ejs`
- `views/register.ejs`
- `views/nextPage.ejs`
- `views/collection.ejs`
- `views/Accession.ejs`
- `views/Barcodeprinting.ejs`
- `views/result.ejs`
- `views/validation.ejs`
- `views/Search.ejs`
- `views/report-list.ejs`
- `views/invoice.ejs`
- `views/error.ejs`

## 4. Current Workflow

### Registration

The registration flow is split across:

- `GET /register`
- `POST /register`
- `GET /nextPage`
- `POST /submit`

Current behavior:

- patient data is captured first
- test/profile and billing data is captured next
- registration date uses a custom calendar + time input
- center, referred by, and doctor selections are validated
- center, referred by, and doctor can be created inline from registration using popup forms
- files such as TRF/history can be uploaded
- final submission writes patient, visit, address, visit tests, and related records

After successful registration:

- invoice actions are available in popup style
- the visit becomes visible in downstream workflow pages

### Collection

Route:

- `GET /collection`

Actions:

- `POST /update-action`
- `POST /update-bulk-action`

Current behavior:

- Collection defaults to a recent date range when filters are empty
- route maps SQL `ActionName` to display-friendly status values
- Collection rows use one-click buttons instead of action dropdowns
- collected samples move to the next workflow step

### Accession

Route:

- `GET /Accession`

Actions:

- `POST /update-accession-action`
- `POST /update-accession-bulk-action`

Current behavior:

- accession page loads recent collected records by default
- accession rows use one-click `Accepted`, `Reject`, and `Hold` buttons
- bulk accession labels were simplified to `Accepted`, `Rejected`, and `Hold`
- accepted accession cases become available in Result Entry

### Barcode Printing

Route:

- `GET /Barcodeprinting`

Actions:

- `POST /preview-barcode`
- `GET /Barcodeprinting/print/:visitCode`

Current behavior:

- barcode page defaults to today's records
- date filtering uses the same date-correction approach as Search
- barcode preview/print generates PDF output

### Result Entry

Routes:

- `GET /result`
- `GET /result/details/:visitCode`
- `POST /api/save-result-patient`
- `POST /api/update-testwise-action`

Current behavior:

- accepted accession patients appear in Result Entry
- detailed parameter rows load for manual entry
- when stored procedure summary data is missing, the route falls back to direct visit and patient queries
- result entry supports manual observed value entry

Two actions are supported:

- `Save Result`
  - intended for normal lab users
  - saves entered result values only
- `Authorized By Doctor`
  - saves current values
  - updates test status so the case appears in Reports

### Reports

Routes:

- `GET /reports`
- `GET /reports/data`
- `GET /reports/preview/:visitCode`
- `GET /reports/download/:visitCode`

Current behavior:

- reports page defaults to a recent date range
- only authorized/report-ready cases should appear
- date parsing is aligned to `DD-MM-YYYY`

### Search

Route:

- `GET /Search`

Current behavior:

- Search defaults to today's patients
- local date filtering is used after widening the SQL range to avoid missing same-day records because of DB timing/date issues
- patient cards can show pending amount and payment status
- invoice re-open and re-print are available from Search in popup style

### Invoice

Route:

- `GET /invoice/:visitCode`

Current behavior:

- invoice is print-friendly
- invoice is compact, single-layout, and one-page oriented
- invoice/bill opens in popup window style instead of standard tab navigation
- patient and item details are populated from actual visit, patient, and visit transaction data
- item amounts are loaded from `Visit_Trans.TestPrice` and line discount data
- invoice can be opened after registration and again from Search

### Financial Analysis

Route:

- `GET /financial-analysis`

Current behavior:

- date filter supports selected billing range
- shows summary cards for net revenue, collected amount, outstanding amount, and discount
- shows daily revenue trend
- shows daily collection snapshot table
- shows payment mode split
- shows highest due visits

### Dashboard

Route:

- `GET /dashboard`

Current behavior:

- shows summary cards
- includes a patient registration trend chart
- trend chart uses `From Date` and `To Date` calendar filters
- quick actions are shown above the trend chart
- Financial Analysis is available both in sidebar and dashboard quick actions

## 5. Database Notes

The current code is aligned to SQL objects such as:

- `Visit`
- `Visit_patient`
- `Visit_Trans`

Important known billing columns in `Visit`:

- `Gross`
- `Net`
- `AmountPaid`
- `DiscountAmount`
- `VisitingCharges`
- `RefundAmount`
- `BalanceAmt`

Current workflow depends heavily on stored procedures, including examples like:

- `GetCollection`
- `GetAccession`
- `GetSearch`
- `GetBarcodePrinting`
- `GetBarcodePrinting_ByVisitCode`
- `GenerateBarcode`
- `GetPatientAndResultDetails`
- `Getreportforprint`
- `UpdateTestWiseAction`

Important transactional billing columns:

- `Visit.Gross`
- `Visit.Net`
- `Visit.AmountPaid`
- `Visit.DiscountAmount`
- `Visit.VisitingCharges`
- `Visit.BalanceAmt`
- `Visit_Trans.TestPrice`
- `Visit_Trans.DiscountAmount`

## 6. Date Handling Notes

Several pages needed special handling because SQL-side date filtering did not always return expected same-day results.

Current pattern used on key routes:

- default date values are set in the app
- SQL query range may be widened slightly
- returned records are filtered again in Node.js using formatted `DD-MM-YYYY` values

This logic is especially relevant on:

- Search
- Barcode Printing

## 7. Logging and Error Handling

Current code includes console logging for several operational failures, including pages like:

- Search
- Invoice
- Barcode
- Result details
- Financial analysis

The app also has:

- 404 handling
- error page rendering through `error.ejs`

## 8. UI Notes

Recent UI updates include:

- collapsible sidebar that stays icon-only until hover on desktop
- full sidebar behavior preserved on mobile
- invoice simplified to a single compact print layout
- invoice opens in popup-style window flow
- Result Entry redesigned for manual parameter input
- Search and Barcode pages use date fields with default values
- registration page supports inline master creation for center/referred-by/doctor
- billing page was redesigned to a bill-entry layout
- Collection and Accession use one-click action buttons
- dashboard includes a patient trend chart with date filters
- financial analysis page includes styled financial tables and summaries

## 9. Security and Deployment Recommendations

Recommended improvements still pending:

- move session storage to a persistent store
- hash passwords with `bcrypt`
- add CSRF protection
- add rate limiting
- centralize validation
- standardize route naming consistency

## 10. Verification

Basic server syntax check:

```bash
node --check app.js
```

## 11. Summary

This documentation reflects the current codebase after recent updates to:

- invoice and search behavior
- popup invoice behavior
- collection to accession to result workflow
- manual result entry and doctor authorization
- reports visibility
- barcode default filtering
- sidebar interaction
- financial analysis reporting
- dashboard patient trend visualization
