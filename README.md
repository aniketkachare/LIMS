<<<<<<< HEAD
# LIMS — Laboratory Information System Management

Production-ready Node.js + Express + MSSQL + EJS application for HLL Lifecare Laboratory.

---

## 🚀 Quick Start

1. Clone repository, then:
   ```bash
   npm install
   ```
2. Create `.env` in project root with:
   ```env
   PORT=5005
   SECRET_KEY=your-strong-secret
   DB_SERVER=your-sql-host
   DB_DATABASE=your-database-name
   DB_USER=your-user
   DB_PASSWORD=your-password
   NODE_ENV=development
   ```
3. Run in development:
   ```bash
   npm run dev
   ```
   Production:
   ```bash
   npm start
   ```

> ⚠️ For production: use a persistent session store (Redis/Mongo) instead of default memory store.

---

## 📁 Project Structure

```
├── app.js
├── .env
├── package.json
├── public/
│   ├── css/main.css
│   └── js/main.js
├── views/
│   ├── login.ejs
│   ├── register.ejs
│   ├── nextPage.ejs
│   ├── dashboard.ejs
│   ├── collection.ejs
│   ├── Accession.ejs
│   ├── Barcodeprinting.ejs
│   ├── result.ejs
│   ├── validation.ejs
│   ├── Search.ejs
│   ├── report-list.ejs
│   ├── error.ejs
│   ├── partials/
│   │   └── sidebar.ejs
│   └── templates/
│       └── template1.ejs
└── uploads/ (TRF/history files + header/footer images)
```

---

## 🔧 Middleware & Core Config

- `express-session` (session cookie config in `app.js`)
- Body parsing: built-ins (`express.urlencoded`, `express.json`)
- Static: `/public`, `/uploads`, `/templates`
- Authentication: `requireAuth` checks `req.session.user`
- DB: `mssql` config uses `.env` variables

---

## 🧾 Endpoints

### Authentication
- `GET /` : login page
- `POST /login` : username/password
- `POST /logout` : end session

### Registration Flow
- `GET /register` : form + salutations
- `POST /register` : store step 1 to session; files upload
- `GET /nextPage` : step 2 summary
- `POST /submit` : final save (transactional)

Validation in `/submit`:
- `age`: int 0..150
- `grossAmount`, `visitingCharges`, `discountAmount`, `paidAmount`: >= 0
- `discount <= gross + visiting`
- `paid <= net`

### Autocomplete + support
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

### Collection/Accession/Barcode
- `GET /collection`
- `GET /Accession`
- `GET /Barcodeprinting`
- `POST /update-action`
- `POST /update-bulk-action`
- `POST /update-accession-action`
- `POST /update-accession-bulk-action`
- `POST /preview-barcode` (PDF)
- `GET /Barcodeprinting/print/:visitCode` (PDF)

### Search / Result / Validation
- `GET /Search`
- `GET /result`
- `GET /result/details/:visitCode`
- `GET /validation`
- `POST /api/save-result-patient`
- `POST /api/update-testwise-action`

### Reports
- `GET /reports`
- `GET /reports/data`
- `GET /reports/preview/:visitCode` (Puppeteer PDF)
- `GET /reports/download/:visitCode` (Puppeteer PDF)

### Dashboard
- `GET /dashboard`

---

## ☑️ Security Notes

- Auth enforced on most routes with `requireAuth`
- Upload file types restricted to `image/jpeg`, `image/png`, `application/pdf`
- Session cookie `httpOnly` (and `secure` should be `true` in HTTPS)
- Use hashed passwords (`bcrypt`) rather than plain comparison in `POST /login`
- Add CSRF (`csurf`) and rate limiting in production

---

## 🗂️ Requirements

- `uploads/header.jpg`, `uploads/footer.jpg` for report generation
- Stored procedures used in `app.js` (ensure they exist and match parameter contract)

---

## 🛠️ Recommended improvements

1. switch session to persistent store (Redis/Mongo)
2. use `bcrypt` for password hashing + compare
3. direct DB pool reuse for reduced overhead
4. centralize request validation with `express-validator`
5. rollback file uploads on errors
6. fix case-sensitivity for route names (`/Accession` vs `/accession`)

---

## 📌 Notes

This `README` is aligned with the current `app.js` code in this repository.
=======
# LIMS
Karan LIMS
>>>>>>> effbf8b12d9b4cde1b56c0b090e26831f0bdcbcd
