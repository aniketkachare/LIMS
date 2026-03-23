# LIMS Lab System Documentation

## 1. Project Overview

- Repository root: `app.js`, `views/`, `public/`, `uploads/`
- Engine: Express + EJS
- DB: SQL Server via `mssql`
- File upload: `multer`
- PDF: `pdfkit`, `bwip-js`, `puppeteer` + HTML template
- Images: `sharp`

## 2. Environment

Required `.env` variables:
- `PORT` (default 5005)
- `SECRET_KEY`
- `DB_USER`
- `DB_PASSWORD`
- `DB_SERVER`
- `DB_DATABASE`
- `NODE_ENV` (optional)

NPM commands:
- `npm install`
- `npm start`
- `npm run dev` (nodemon)
- `npm run prod`

## 3. Middleware

- `express-session` with in-memory store (development only)
- `bodyParser.urlencoded`, `express.urlencoded`, `express.json`
- Static directories:
  - `/public`
  - `/uploads`
  - `/templates` (from `views/templates`)

- Auth helper: `requireAuth(req,res,next)` applies to protected routes.

## 4. DB config

- `config` object in `app.js` loads from `.env`.
- `mssql.connect(config)` called at startup, and repeated in route handlers.

## 5. Helper functions

- `formatReportDate(dateVal)` - formats date+time readable.
- `loadImageBase64(filePath)` - embed header/footer encoded in report PDF.
- `mapReport(rows)` - map patient test rows to report view model.
- `parseDDMMYYYY(str)` - convert `DD-MM-YYYY` to `YYYY-MM-DD`.

## 6. Route summary

### Authentication
- `GET /` login page
- `POST /login` user check (plain-text currently)
- `POST /logout` session destroy

### Registration & Visit
- `GET /register` salutations
- `POST /register` start session data + upload (trf/history)
- `GET /nextPage` show saved registerData
- `GET /generateVisitCode` returns code based on `Mst_Centers`

### Submit (final registration)
- `POST /submit` (transaction)
  - Insert patient (`InsertVisitPatient`)
  - Insert visit (`InsertVisit`)
  - Insert test/profile walk
  - Insert address (`InsertVisitAddress`)
  - Process uploads (shrink image, store path)
  - Insert TRF/history paths (stored procs)
  - commit/rollback
  - validation:
    - `age` number 0..150
    - `grossAmount`, `visitingCharges`, `discountAmount`, `paidAmount` non-negative
    - `discount <= gross + visiting`
    - `paid <= net`

### Autocomplete + validation APIs
- `GET /suggestPatients`
- `GET /suggest-lab-names`
- `GET /suggest-refer-names`
- `GET /suggest-doctor-names`
- `GET /suggest-tests-profiles`
- `GET /fetch-payment-modes`
- `GET /validate-center`
- `GET /validate-refered`
- `GET /validate-doctor`

### Collection, Accession, Barcode
- `GET /collection`, `/Accession`, `/Barcodeprinting` (date-filter optional)
- `POST /update-action`, `/update-bulk-action`
- `POST /update-accession-action`, `/update-accession-bulk-action`
- `POST /preview-barcode` (PDF output)
- `GET /Barcodeprinting/print/:visitCode` (PDF output)

### Search & results
- `GET /Search`
- `GET /result`
- `GET /result/details/:visitCode`
- `GET /validation`
- `POST /api/save-result-patient`
- `POST /api/update-testwise-action`

### Reporting
- `GET /reports`
- `GET /reports/data`
- `GET /reports/preview/:visitCode` (puppeteer PDF)
- `GET /reports/download/:visitCode` (puppeteer PDF download)

### Dashboard
- `GET /dashboard` queries counts and renders stats.

### 404 and error handlers
- 404 middleware
- global error middleware returns `error.ejs`

## 7. File Outline

- `app.js` full app
- `views/*.ejs`: UI pages
- `views/partials/sidebar.ejs`: nav and user block
- `public/css/main.css`, `public/js/main.js` (client assets)

## 8. Known issues & improvements

- Passwords stored/checked plain-text.
- Session store in-memory (not production). Use Redis/Mongo.
- Missing CSRF protection (`csurf`).
- SQL parameter reuse from raw strings may still have risk; validate lengths.
- No cleanup for file uploads on transaction rollback.
- `bodyParser` usage double with express built-in.
- Lowercase route names would avoid case-sensitive mismatch.

## 9. Recommended next tasks

1. Enable hashed password + bcrypt.
2. Add `express-validator` for all user inputs.
3. Move DB pool to a shared module.
4. Introduce `helmet`, `compression`, `rate-limit`.
5. Add a tests folder with API coverage.

## 10. How to run

1. `npm install`
2. Create `.env` with DB and secret.
3. `npm run dev`
4. Open `http://localhost:5005`

---

> Note: This file is generated from current `app.js` routes and processing. Validate against actual SQL stored procedures (`InsertVisitPatient`, `InsertVisit`, etc.) for param definitions.