const express = require('express');
const mssql = require('mssql');
const session = require('express-session');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const multer = require('multer');
const ejs = require('ejs');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const moment = require('moment');
const bwipjs = require('bwip-js');
const fs = require('fs');
const puppeteer = require('puppeteer');

dotenv.config();

const app = express();
const port = process.env.PORT || 5005;

// ─── Session ────────────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SECRET_KEY || 'LIMS-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  }
}));

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});
app.use((req, res, next) => {
  res.locals.req = req;
  next();
});

// ─── View Engine ─────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Static Files ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/templates', express.static(path.join(__dirname, 'views', 'templates')));

// ─── Database Config ─────────────────────────────────────────────────────────
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    connectTimeout: 30000,
    requestTimeout: 30000
  },
  pool: {
    max: 10, min: 0, idleTimeoutMillis: 30000
  }
};

// Test connection on startup
mssql.connect(config).then(() => {
  console.log('✅ Connected to SQL Server');
}).catch(err => {
  console.error('❌ SQL Server connection error:', err.message);
});

// ─── Auth Middleware ─────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/');
}

// ─── Multer Config ────────────────────────────────────────────────────────────
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Only PDF and images allowed'), allowed.includes(file.mimetype));
  }
});

// ─── Helper: format date for reports ─────────────────────────────────────────
function formatReportDate(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${day}-${months[d.getMonth()]}-${d.getFullYear()} ${hours}:${minutes} ${ampm}`;
}

function loadImageBase64(filePath) {
  if (!fs.existsSync(filePath)) return { base64: '', mime: '' };
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  let mime = 'image/jpeg';
  if (ext === '.png') mime = 'image/png';
  else if (ext === '.svg') mime = 'image/svg+xml';
  return { base64: buf.toString('base64'), mime };
}

function mapReport(rows) {
  const first = rows[0];
  return {
    patientId: first.PatientID,
    patientName: first.PatientName,
    age: `${first.Age} ${first.AgeType}`,
    gender: first.Gender,
    visitCode: first.VisitCode,
    visitDateTime: first.VisitDateTime,
    referName: first.ReferName,
    doctorName: first.DoctorName,
    registrationDateandTime: first.RegistrationDate,
    sampleCollectionDateandTime: first.SampleCollectionDate,
    accessionDateandTime: first.AccessionDate,
    validationDateandTime: first.ValidationDate,
    doctorAuthDateandTime: first.DoctorAuthDate,
    actionDate: first.ActionDateAndTime,
    results: Array.from(new Map(rows.map(r => [r.ParameterName, r])).values()).map(r => ({
      parameter: r.ParameterName,
      result: r.Result,
      unit: r.UnitName,
      range: r.DisplayRange
    })),
    pathologist: "Dr. Sagar Deshpande"
  };
}

// ─── Date parse helper ────────────────────────────────────────────────────────
function parseDDMMYYYY(str) {
  if (!str) return null;
  const [d, m, y] = str.split('-');
  return y && m && d ? `${y}-${m}-${d}` : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Login ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', { error: req.query.error ? true : false });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  new mssql.Request()
    .input('username', mssql.VarChar, username)
    .query('SELECT * FROM Mst_Users WHERE LOWER(userName) = LOWER(@username)', (err, result) => {
      if (err || !result.recordset.length) return res.redirect('/?error=1');
      const user = result.recordset[0];
      if (password !== user.Password) return res.redirect('/?error=1');
      req.session.user = user;
      res.redirect('/dashboard');
    });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ─── Registration ─────────────────────────────────────────────────────────────
app.get('/register', requireAuth, (req, res) => {
  const q = req.query;
  const queryParams = {
    success: q.success === 'true',
    patientID: q.patientID || null,
    visitID: q.visitID || null
  };
  new mssql.Request().query('SELECT * FROM Mst_Salutation', (err, result) => {
    if (err) return res.status(500).render('error', { error: err });

    const rows = result.recordset;
    // Normalize: find whichever column holds the text value
    const salutations = rows.map(row => {
      const val = row.SalutationName
               || row.Salutation
               || row.Title
               || row.SaluteName
               || row.Name
               || row.Description
               || Object.values(row).find(v => typeof v === 'string' && v.trim() !== '')
               || '';
      return { label: val, value: val };
    });
    res.render('register', { salutations, user: req.session.user, queryParams });
  });
});

app.post('/register', requireAuth, upload.fields([{ name: 'trfFiles', maxCount: 10 }, { name: 'historyFiles', maxCount: 10 }]), (req, res) => {
  req.session.registerData = req.body;
  res.redirect('/nextPage');
});

// ─── Generate Visit Code ──────────────────────────────────────────────────────
app.get('/generateVisitCode', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const centerConfig = await pool.request().query('SELECT TOP 1 Prefix, visitCodeLength FROM Mst_Centers');
    const { Prefix, visitCodeLength } = centerConfig.recordset[0];
    const lastVisit = await pool.request().query(`SELECT MAX(CAST(SUBSTRING(VisitCode, LEN('${Prefix}') + 1, LEN(VisitCode)) AS INT)) AS LastCode FROM Visit`);
    const nextCode = (lastVisit.recordset[0].LastCode || 0) + 1;
    const paddedCode = nextCode.toString().padStart(visitCodeLength - Prefix.length, '0');
    res.json({ visitCode: `${Prefix}${paddedCode}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Suggest Patients ─────────────────────────────────────────────────────────
app.get('/suggestPatients', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const result = await pool.request()
      .input('query', mssql.NVarChar, `%${req.query.query.trim().toUpperCase()}%`)
      .execute('SearchPatients');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json([]);
  }
});

// ─── Next Page (Step 2) ───────────────────────────────────────────────────────
app.get('/nextPage', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const paymentModes = await pool.request().query('SELECT PayModeID, PaymentMode FROM Mst_Paymentmode');
    res.render('nextPage', {
      registerData: req.session.registerData || {},
      paymentModes: paymentModes.recordset,
      user: req.session.user
    });
  } catch (err) {
    res.status(500).render('error', { error: err });
  }
});

// ─── Submit (Final Registration) ──────────────────────────────────────────────
app.post('/submit', requireAuth, upload.fields([{ name: 'trfFiles', maxCount: 10 }, { name: 'historyFiles', maxCount: 10 }]), async (req, res) => {
  const pool = await mssql.connect(config);
  const transaction = new mssql.Transaction(pool);
  try {
    await transaction.begin();
    const nextPageData = req.body;
    const registerData = req.session.registerData || {};
    const combinedData = { ...registerData, ...nextPageData };
    const Patient_status = 1;
    const createdByUserID = req.session.user.UID;

    // --- Date of Birth ---
    const dob = combinedData.dob;
    let formattedDob = null;
    if (dob && dob.trim() !== '') {
      if (!/^\d{2}-\d{2}-\d{4}$/.test(dob.trim())) {
        formattedDob = null; // ignore bad format, don't block submission
      } else {
        const [day, month, year] = dob.trim().split('-');
        formattedDob = `${year}-${month}-${day}`;
        if (isNaN(Date.parse(formattedDob))) {
          formattedDob = null; // ignore invalid date, don't block submission
        }
      }
    }

  let mobileNumber = combinedData.phone || '';
  const countryCode = combinedData.countryCode || '';
  if (mobileNumber && countryCode && !mobileNumber.startsWith(countryCode)) {
     mobileNumber = `${countryCode}${mobileNumber}`;
  }
  // Trim to max 20 chars to avoid truncation
  mobileNumber = mobileNumber.trim().slice(0, 20);

    const gross = parseFloat(combinedData.grossAmount || 0);
    const visiting = parseFloat(combinedData.visitingCharges || 0);
    const discount = parseFloat(combinedData.discountAmount || 0);
    const paid = parseFloat(combinedData.paidAmount || 0);

    const age = parseInt(combinedData.age, 10);

    const numericErrors = [];
    if (Number.isNaN(age) || age < 0 || age > 150) numericErrors.push('Age must be a number between 0 and 150');
    if (Number.isNaN(gross) || gross < 0) numericErrors.push('Gross amount must be a non-negative number');
    if (Number.isNaN(visiting) || visiting < 0) numericErrors.push('Visiting charges must be a non-negative number');
    if (Number.isNaN(discount) || discount < 0) numericErrors.push('Discount amount must be a non-negative number');
    if (Number.isNaN(paid) || paid < 0) numericErrors.push('Paid amount must be a non-negative number');

    if (numericErrors.length > 0) {
      return res.status(400).json({ error: numericErrors.join('; ') });
    }

    const totalGross = gross + visiting;
    if (discount > totalGross) return res.status(400).json({ error: 'Discount cannot exceed gross amount.' });
    const net = totalGross - discount;
    if (paid > net) return res.status(400).json({ error: 'Paid cannot exceed net amount.' });
    const balance = net - paid;

    const req_ = new mssql.Request(transaction);
  
    const ageTypeChar = (combinedData.ageType || 'Y')[0].toUpperCase();

    const patientResult = await req_
      .input('salutation',      mssql.VarChar,  (combinedData.salutation  || '').slice(0, 12))
      .input('patientName',     mssql.NVarChar, (combinedData.patientName || '').slice(0, 150))
      .input('gender',          mssql.NVarChar, (combinedData.gender      || '').slice(0, 6))
      .input('dob',             mssql.Date,      formattedDob)
      .input('age',             mssql.Int,       parseInt(combinedData.age) || 0)
      .input('ageType',         mssql.VarChar,   ageTypeChar)
      .input('EmailID',         mssql.VarChar,  (combinedData.email       || '').slice(0, 50))
      .input('MobileNo',        mssql.VarChar,   mobileNumber.slice(0, 50))
      .input('createdByUserID', mssql.Int,       createdByUserID)
      .execute('InsertVisitPatient');
    const patientID = patientResult.recordset[0].PatientID;

    const visitReq = new mssql.Request(transaction);
    const visitResult = await visitReq
      .input('visitCode', mssql.NVarChar, combinedData.visitNo)
      .input('visitDateTime', mssql.DateTime, combinedData.registrationDateTime)
      .input('patientID', mssql.Int, patientID)
      .input('centerId', mssql.Int, combinedData.centerId)
      .input('referedId', mssql.Int, combinedData.referedId)
      .input('doctorId', mssql.Int, combinedData.doctorId)
      .input('discountAmount', mssql.Decimal(10,2), discount)
      .input('grossAmount', mssql.Decimal(10,2), totalGross)
      .input('visitingCharges', mssql.Decimal(10,2), visiting)
      .input('netAmount', mssql.Decimal(10,2), net)
      .input('paymentMode', mssql.Int, combinedData.paymentMode)
      .input('paidAmount', mssql.Decimal(10,2), paid)
      .input('balanceAmount', mssql.Decimal(10,2), balance)
      .input('PatientStatus', mssql.Int, Patient_status)
      .input('createdByUserID', mssql.Int, createdByUserID)
      .execute('InsertVisit');
    const visitID = visitResult.recordset[0].VisitID;

    // Insert tests
    if (combinedData.selectedTests) {
      const testIds = Array.isArray(combinedData.selectedTests) ? combinedData.selectedTests : combinedData.selectedTests.split(',').filter(Boolean);
      for (const testId of testIds) {
        await new mssql.Request(transaction)
          .input('visitId', mssql.Int, visitID).input('testId', mssql.Int, testId)
          .input('profileTestsId', mssql.Int, null).input('TestWiseStatus', mssql.Int, Patient_status)
          .input('createdByUserID', mssql.Int, createdByUserID).execute('InsertVisitTrans');
      }
    }

    // Insert profiles
    if (combinedData.selectedProfiles) {
      const profileIds = Array.isArray(combinedData.selectedProfiles) ? combinedData.selectedProfiles : combinedData.selectedProfiles.split(',').filter(Boolean);
      for (const profileId of profileIds) {
        await new mssql.Request(transaction)
          .input('visitId', mssql.Int, visitID).input('testId', mssql.Int, null)
          .input('profileTestsId', mssql.Int, profileId).input('TestWiseStatus', mssql.Int, Patient_status)
          .input('createdByUserID', mssql.Int, createdByUserID).execute('InsertVisitTrans_Profile');
      }
    }

    // Insert address
    await new mssql.Request(transaction)
      .input('patientID', mssql.Int, patientID)
      .input('address', mssql.NVarChar, combinedData.address)
      .input('city', mssql.NVarChar, combinedData.city)
      .input('state', mssql.NVarChar, combinedData.state)
      .input('district', mssql.NVarChar, combinedData.district)
      .input('pin', mssql.NVarChar, combinedData.pin)
      .input('country', mssql.NVarChar, combinedData.country)
      .input('nationality', mssql.NVarChar, combinedData.nationality)
      .input('createdByUserID', mssql.Int, createdByUserID)
      .execute('InsertVisitAddress');

    // Process file uploads
    const processFiles = async (files) => {
      const paths = [];
      for (const file of (files || [])) {
        if (file.mimetype.startsWith('image/')) {
          const cp = `uploads/compressed-${file.filename}`;
          await sharp(file.path).resize(800).toFormat('jpeg').jpeg({ quality: 80 }).toFile(cp);
          paths.push(cp);
        } else {
          paths.push(file.path);
        }
      }
      return paths;
    };

    const trfPaths = await processFiles(req.files?.trfFiles);
    const histPaths = await processFiles(req.files?.historyFiles);

    const trfInputs = {}, histInputs = {};
    for (let i = 0; i < 10; i++) {
      trfInputs[`TRF${i+1}Path`] = trfPaths[i] || null;
      histInputs[`PTH${i+1}Path`] = histPaths[i] || null;
    }

    const trfReq = new mssql.Request(transaction);
    trfReq.input('visitID', mssql.Int, visitID);
    for (let i = 1; i <= 10; i++) trfReq.input(`TRF${i}Path`, mssql.NVarChar, trfInputs[`TRF${i}Path`]);
    await trfReq.execute('InsertPatientTRF');

    const histReq = new mssql.Request(transaction);
    histReq.input('visitID', mssql.Int, visitID);
    for (let i = 1; i <= 10; i++) histReq.input(`PTH${i}Path`, mssql.NVarChar, histInputs[`PTH${i}Path`]);
    await histReq.execute('InsertPatientHistory');

    await transaction.commit();
    delete req.session.registerData;
    res.redirect(`/register?success=true&patientID=${patientID}&visitID=${visitID}`);
  } catch (err) {
    await transaction.rollback().catch(() => {});
    console.error('Submit error:', err);
    res.status(500).render('error', { error: err });
  }
});

// ─── Autocomplete APIs ────────────────────────────────────────────────────────
app.get('/suggest-lab-names', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const result = await pool.request()
      .input('query', mssql.NVarChar, `%${req.query.query}%`)
      .query('SELECT CenterID, CenterName FROM Mst_Centers WHERE CenterName LIKE @query AND ActiveFlag = 1');
    res.json(result.recordset);
  } catch (err) { res.json([]); }
});

app.get('/suggest-refer-names', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const q = req.query.query.trim().toLowerCase();
    const result = await pool.request()
      .input('query', mssql.NVarChar, `%${q}%`)
      .query('SELECT ReferID, ReferName FROM Mst_Refer WHERE LOWER(LTRIM(RTRIM(ReferName))) LIKE @query');
    res.json(result.recordset);
  } catch (err) { res.json([]); }
});

app.get('/suggest-doctor-names', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const q = req.query.query.trim().toLowerCase();
    const result = await pool.request()
      .input('query', mssql.NVarChar, `%${q}%`)
      .query('SELECT DoctorID, DoctorName FROM Mst_Doctor WHERE LOWER(LTRIM(RTRIM(DoctorName))) LIKE @query');
    res.json(result.recordset);
  } catch (err) { res.json([]); }
});

app.get('/suggest-tests-profiles', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const q = `%${req.query.query.trim().toLowerCase()}%`;
    const [tests, profiles] = await Promise.all([
      pool.request().input('query', mssql.NVarChar, q)
        .query('SELECT TestID, TestName, ShortCode FROM Mst_Test WHERE LOWER(TestName) LIKE @query OR LOWER(ShortCode) LIKE @query'),
      pool.request().input('query', mssql.NVarChar, q)
        .query('SELECT ProfileID, ProfileName, ProfileCode FROM Mst_Profiles WHERE LOWER(ProfileName) LIKE @query OR LOWER(ProfileCode) LIKE @query')
    ]);
    res.json({ tests: tests.recordset, profiles: profiles.recordset });
  } catch (err) { res.json({ tests: [], profiles: [] }); }
});

app.get('/fetch-payment-modes', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const result = await pool.request().query('SELECT PayModeID, PaymentMode FROM Mst_Paymentmode');
    res.json(result.recordset);
  } catch (err) { res.status(500).json([]); }
});

// Validate helpers
app.get('/validate-center', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const r = await pool.request().input('centerId', mssql.Int, req.query.centerId)
      .query('SELECT CenterID FROM Mst_Centers WHERE CenterID = @centerId');
    res.json({ isValid: r.recordset.length > 0 });
  } catch (e) { res.json({ isValid: false }); }
});

app.get('/validate-refered', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const r = await pool.request().input('referedId', mssql.Int, req.query.referedId)
      .query('SELECT ReferID FROM Mst_Refer WHERE ReferID = @referedId');
    res.json({ isValid: r.recordset.length > 0 });
  } catch (e) { res.json({ isValid: false }); }
});

app.get('/validate-doctor', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const r = await pool.request().input('doctorId', mssql.Int, req.query.doctorId)
      .query('SELECT DoctorID FROM Mst_Doctor WHERE DoctorID = @doctorId');
    res.json({ isValid: r.recordset.length > 0 });
  } catch (e) { res.json({ isValid: false }); }
});

// ─── Collection ───────────────────────────────────────────────────────────────
app.get('/collection', requireAuth, async (req, res) => {
  const { FromDate, ToDate } = req.query;
  try {
    const pool = await mssql.connect(config);
    let result;
    if (FromDate && ToDate) {
      const fFrom = parseDDMMYYYY(FromDate), fTo = parseDDMMYYYY(ToDate);
      result = await pool.request().input('FromDate', mssql.Date, fFrom).input('ToDate', mssql.Date, fTo).execute('GetCollection');
    } else {
      result = await pool.request().execute('GetCollection');
    }
    const data = result.recordset.map(item => {
      if (item.VisitDateTime) {
        const d = new Date(item.VisitDateTime);
        item.VisitDateTime = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      }
      return item;
    });
    res.render('collection', { data, user: req.session.user });
  } catch (err) {
    res.status(500).render('error', { error: err });
  }
});

app.post('/update-action', requireAuth, async (req, res) => {
  const { VisitTransID, TestID, ActionID } = req.body;
  if (!VisitTransID || !TestID || !ActionID) return res.status(400).send('Missing params');
  try {
    const pool = await mssql.connect(config);
    await pool.request().input('VisitTransID', mssql.Int, VisitTransID).input('TestID', mssql.Int, TestID).input('ActionID', mssql.Int, ActionID).execute('UpdateTestWiseAction');
    res.status(200).send('OK');
  } catch (err) { res.status(500).send(err.message); }
});

app.post('/update-bulk-action', requireAuth, async (req, res) => {
  const { actionID, rows } = req.body;
  if (!actionID || !rows?.length) return res.status(400).send('Missing params');
  try {
    const pool = await mssql.connect(config);
    for (const { visitTransID, testID } of rows) {
      await pool.request().input('VisitTransID', mssql.Int, visitTransID).input('TestID', mssql.Int, testID).input('ActionID', mssql.Int, actionID).execute('UpdateTestWiseAction');
    }
    res.status(200).send('OK');
  } catch (err) { res.status(500).send(err.message); }
});

// ─── Accession ────────────────────────────────────────────────────────────────
app.get('/Accession', requireAuth, async (req, res) => {
  const { FromDate, ToDate } = req.query;
  try {
    const pool = await mssql.connect(config);
    let result;
    if (FromDate && ToDate) {
      const fFrom = parseDDMMYYYY(FromDate), fTo = parseDDMMYYYY(ToDate);
      result = await pool.request().input('FromDate', mssql.Date, fFrom).input('ToDate', mssql.Date, fTo).execute('GetAccession');
    } else {
      result = await pool.request().execute('GetAccession');
    }
    const data = result.recordset.map(item => {
      if (item.VisitDateTime) {
        const d = new Date(item.VisitDateTime);
        item.VisitDateTime = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      }
      return item;
    });
    res.render('Accession', { data, user: req.session.user });
  } catch (err) { res.status(500).render('error', { error: err }); }
});

app.post('/update-accession-action', requireAuth, async (req, res) => {
  const { VisitTransID, TestID, ActionID } = req.body;
  if (!VisitTransID || !TestID || !ActionID) return res.status(400).send('Missing params');
  try {
    const pool = await mssql.connect(config);
    await pool.request().input('VisitTransID', mssql.Int, VisitTransID).input('TestID', mssql.Int, TestID).input('ActionID', mssql.Int, ActionID).execute('UpdateTestWiseAction');
    res.status(200).send('OK');
  } catch (err) { res.status(500).send(err.message); }
});

app.post('/update-accession-bulk-action', requireAuth, async (req, res) => {
  const { actionID, rows } = req.body;
  if (!actionID || !rows?.length) return res.status(400).send('Missing params');
  try {
    const pool = await mssql.connect(config);
    for (const { visitTransID, testID } of rows) {
      await pool.request().input('VisitTransID', mssql.Int, visitTransID).input('TestID', mssql.Int, testID).input('ActionID', mssql.Int, actionID).execute('UpdateTestWiseAction');
    }
    res.status(200).send('OK');
  } catch (err) { res.status(500).send(err.message); }
});

// ─── Barcode Printing ─────────────────────────────────────────────────────────
app.get('/Barcodeprinting', requireAuth, async (req, res) => {
  const { FromDate, ToDate } = req.query;
  try {
    const pool = await mssql.connect(config);
    let result;
    if (FromDate && ToDate) {
      const fFrom = parseDDMMYYYY(FromDate), fTo = parseDDMMYYYY(ToDate);
      result = await pool.request().input('FromDate', mssql.Date, fFrom).input('ToDate', mssql.Date, fTo).execute('GetBarcodePrinting');
    } else {
      result = await pool.request().execute('GetBarcodePrinting');
    }
    const data = result.recordset.map(item => {
      if (item.VisitDateTime) {
        const d = new Date(item.VisitDateTime);
        item.VisitDateTime = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      }
      return item;
    });
    res.render('Barcodeprinting', { data, user: req.session.user });
  } catch (err) { res.status(500).render('error', { error: err }); }
});

app.post('/preview-barcode', requireAuth, async (req, res) => {
  const { VisitTransID, TestID } = req.body;
  if (!VisitTransID || !TestID) return res.status(400).send('Missing params');
  try {
    const pool = await mssql.connect(config);
    const result = await pool.request().input('VisitTransID', mssql.Int, VisitTransID).input('TestID', mssql.Int, TestID).execute('GenerateBarcode');
    if (!result.recordset.length) return res.status(404).send('No barcode found');
    const { VisitCode, BarCode, PatientName, Age, AgeType, Gender } = result.recordset[0];
    const barcodeBuffer = await bwipjs.toBuffer({ bcid: 'code128', text: BarCode, scale: 2, height: 8, includetext: true, textxalign: 'left' });
    const doc = new PDFDocument({ margin: 20 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Barcode-${VisitCode}.pdf"`);
    doc.pipe(res);
    doc.fontSize(12).text(`[${PatientName}] [${Age} ${AgeType} / ${Gender === 'Male' ? 'M' : Gender === 'Female' ? 'F' : 'O'}]`, { align: 'left' });
    doc.moveDown(0.5);
    doc.image(barcodeBuffer, { fit: [180, 80], align: 'left', valign: 'top' });
    doc.end();
  } catch (err) { res.status(500).send('Error generating barcode'); }
});

// ─── Search ───────────────────────────────────────────────────────────────────
app.get('/Search', requireAuth, async (req, res) => {
  const { FromDate, ToDate } = req.query;
  try {
    const pool = await mssql.connect(config);
    let result;
    if (FromDate && ToDate) {
      const fFrom = parseDDMMYYYY(FromDate) || FromDate;
      const fTo = parseDDMMYYYY(ToDate) || ToDate;
      result = await pool.request().input('FromDate', mssql.Date, fFrom).input('ToDate', mssql.Date, fTo).execute('GetSearch');
    } else {
      result = await pool.request().execute('GetSearch');
    }
    const data = result.recordset.map(item => {
      if (item.VisitDateTime) {
        const d = new Date(item.VisitDateTime);
        item.VisitDateTime = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      }
      return item;
    });
    res.render('Search', { data, user: req.session.user });
  } catch (err) { res.status(500).render('error', { error: err }); }
});

// ─── Result Entry ─────────────────────────────────────────────────────────────
app.get('/result', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    let { FromDate, ToDate } = req.query;
    let patientList = [];
    if (FromDate && ToDate) {
      const r = await pool.request().input('FromDate', mssql.Date, FromDate).input('ToDate', mssql.Date, ToDate).execute('GetResultPatientList');
      patientList = r.recordset || [];
    } else {
      const r = await pool.request().execute('GetResultPatientList');
      patientList = r.recordset || [];
    }
    let resultDetails = null, resultTests = [], distinctTests = [];
    if (patientList.length > 0) {
      const r = await pool.request().input('VisitCode', mssql.VarChar, patientList[0].VisitCode).execute('GetPatientAndResultDetails');
      resultDetails = r.recordsets[0][0];
      resultTests = r.recordsets[1] || [];
      distinctTests = Array.from(new Map(resultTests.map(t => [t.TestID, t.TestName])).entries()).map(([TestID, TestName]) => ({ TestID, TestName }));
    }
    res.render('result', { labName: 'HLL Lab', fromDate: FromDate || '', toDate: ToDate || '', patientList, resultDetails, resultTests, distinctTests, user: req.session.user });
  } catch (err) {
    res.render('result', { labName: '', fromDate: '', toDate: '', patientList: [], resultDetails: null, resultTests: [], distinctTests: [], user: req.session.user });
  }
});

app.get('/result/details/:visitCode', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const r = await pool.request().input('VisitCode', mssql.VarChar, req.params.visitCode).execute('GetPatientAndResultDetails');
    const resultDetails = r.recordsets[0][0];
    const resultTests = r.recordsets[1] || [];
    if (!resultDetails) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, resultDetails, resultTests });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ─── Validation ───────────────────────────────────────────────────────────────
app.get('/validation', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    let { FromDate, ToDate } = req.query;
    let patientList = [];
    if (FromDate && ToDate) {
      const r = await pool.request().input('FromDate', mssql.Date, FromDate).input('ToDate', mssql.Date, ToDate).execute('GetResultPatientList');
      patientList = r.recordset || [];
    } else {
      const r = await pool.request().execute('GetResultPatientList');
      patientList = r.recordset || [];
    }
    res.render('validation', { patientList, fromDate: FromDate || '', toDate: ToDate || '', user: req.session.user });
  } catch (err) {
    res.render('validation', { patientList: [], fromDate: '', toDate: '', user: req.session.user });
  }
});

// ─── Save Result ──────────────────────────────────────────────────────────────
app.post('/api/save-result-patient', requireAuth, async (req, res) => {
  const { VisitCode, TestID, ParameterID, Result } = req.body;
  try {
    const pool = await mssql.connect(config);
    const visitResult = await pool.request().input('VisitCode', mssql.VarChar, VisitCode).query('SELECT VisitID FROM Visit WHERE VisitCode = @VisitCode');
    const visitID = visitResult.recordset[0]?.VisitID;
    if (!visitID) return res.status(400).json({ success: false, error: 'VisitID not found' });
    await pool.request()
      .input('VisitCode', mssql.VarChar, VisitCode).input('visitID', mssql.Int, visitID)
      .input('TestID', mssql.Int, TestID).input('ParameterID', mssql.Int, ParameterID)
      .input('Result', mssql.VarChar, Result).execute('SaveResultPatient');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/update-testwise-action', requireAuth, async (req, res) => {
  const { VisitTransID, TestID, ActionID } = req.body;
  try {
    const pool = await mssql.connect(config);
    await pool.request()
      .input('VisitTransID', mssql.Int, VisitTransID || null)
      .input('TestID', mssql.Int, TestID || null)
      .input('ActionID', mssql.Int, ActionID)
      .execute('UpdateTestWiseAction');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ─── Reports ──────────────────────────────────────────────────────────────────
app.get('/reports', requireAuth, async (req, res) => {
  const { fromDate, toDate } = req.query;
  try {
    const pool = await mssql.connect(config);
    const result = await pool.request().input('FromDate', mssql.Date, fromDate || null).input('ToDate', mssql.Date, toDate || null).execute('Getreportforprint');
    res.render('report-list', { patients: result.recordset, user: req.session.user });
  } catch (err) { res.render('report-list', { patients: [], user: req.session.user }); }
});

app.get('/reports/data', requireAuth, async (req, res) => {
  const { fromDate, toDate } = req.query;
  try {
    const pool = await mssql.connect(config);
    const result = await pool.request().input('FromDate', mssql.VarChar, fromDate).input('ToDate', mssql.VarChar, toDate).execute('Getreportforprint');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch' }); }
});

app.get('/reports/preview/:visitCode', requireAuth, async (req, res) => {
  const visitCode = req.params.visitCode;
  try {
    const pool = await mssql.connect(config);
    const result = await pool.request().input('VisitCode', mssql.VarChar, visitCode).execute('GetPatientReport_ByVisitCode');
    if (!result.recordset.length) return res.status(404).send('No report data found');
    const report = mapReport(result.recordset);
    const headerImg = loadImageBase64(path.join(__dirname, 'uploads', 'header.jpg'));
    const footerImg = loadImageBase64(path.join(__dirname, 'uploads', 'footer.jpg'));
    const html = await ejs.renderFile(path.join(__dirname, 'views/templates/template1.ejs'), {
      report, preview: true, formatReportDate,
      headerBase64: headerImg.base64, headerMime: headerImg.mime,
      footerBase64: footerImg.base64, footerMime: footerImg.mime
    });
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', baseURL: `http://localhost:${port}` });
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; })));
    });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '40px', left: '20px', right: '20px' } });
    await browser.close();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Report-${visitCode}.pdf`);
    res.end(pdfBuffer);
  } catch (err) { res.status(500).send('Error generating report'); }
});

app.get('/reports/download/:visitCode', requireAuth, async (req, res) => {
  const visitCode = req.params.visitCode;
  try {
    const pool = await mssql.connect(config);
    const result = await pool.request().input('VisitCode', mssql.VarChar, visitCode).execute('GetPatientReport_ByVisitCode');
    if (!result.recordset.length) return res.status(404).send('No report data found');
    const report = mapReport(result.recordset);
    const html = await ejs.renderFile(path.join(__dirname, 'views/templates/template1.ejs'), { report, preview: true, formatReportDate });
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', baseURL: `http://localhost:${port}` });
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; })));
    });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '40px', left: '20px', right: '20px' } });
    await browser.close();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Report-${visitCode}.pdf`);
    res.end(pdfBuffer);
  } catch (err) { res.status(500).send('Error downloading report'); }
});

// ─── Barcode Print by VisitCode ───────────────────────────────────────────────
app.get('/Barcodeprinting/print/:visitCode', requireAuth, async (req, res) => {
  const visitCode = req.params.visitCode;
  try {
    const pool = await mssql.connect(config);
    const result = await pool.request()
      .input('VisitCode', mssql.VarChar, visitCode)
      .execute('GetBarcodePrinting_ByVisitCode');

    if (!result.recordset.length) return res.status(404).send('No barcode data found.');

    const row = result.recordset[0];
    const { BarCode, PatientName, Age, AgeType, Gender } = row;

    const barcodeBuffer = await bwipjs.toBuffer({
      bcid: 'code128',
      text: BarCode || visitCode,
      scale: 2,
      height: 8,
      includetext: true,
      textxalign: 'left'
    });

    const doc = new PDFDocument({ margin: 20, size: [200, 100] });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Barcode-${visitCode}.pdf"`);
    doc.pipe(res);
    doc.fontSize(8).text(`${PatientName} | ${Age}${AgeType} / ${Gender === 'Male' ? 'M' : Gender === 'Female' ? 'F' : 'O'}`, { align: 'left' });
    doc.moveDown(0.3);
    doc.image(barcodeBuffer, { fit: [160, 60], align: 'left', valign: 'top' });
    doc.end();

  } catch (err) {
    console.error('Barcode print error:', err);

    // Fallback: try using GenerateBarcode with VisitTransID from GetBarcodePrinting
    try {
      const pool = await mssql.connect(config);
      const listResult = await pool.request()
        .execute('GetBarcodePrinting');

      const row = listResult.recordset.find(r => r.VisitCode === visitCode);
      if (!row) return res.status(404).send('Visit code not found.');

      const barcodeBuffer = await bwipjs.toBuffer({
        bcid: 'code128',
        text: row.BarCode || visitCode,
        scale: 2,
        height: 8,
        includetext: true,
        textxalign: 'left'
      });

      const doc = new PDFDocument({ margin: 20, size: [200, 100] });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Barcode-${visitCode}.pdf"`);
      doc.pipe(res);
      doc.fontSize(8).text(`${row.PatientName} | ${row.Age || ''}${row.AgeType || ''} / ${row.Gender === 'Male' ? 'M' : 'F'}`, { align: 'left' });
      doc.moveDown(0.3);
      doc.image(barcodeBuffer, { fit: [160, 60], align: 'left', valign: 'top' });
      doc.end();

    } catch (err2) {
      res.status(500).send('Error generating barcode: ' + err2.message);
    }
  }
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);

    // Today's date
    const today = new Date().toISOString().split('T')[0];

    // Total patients today
    const todayPatients = await pool.request()
      .query(`SELECT COUNT(*) AS count FROM Visit WHERE CAST(VisitDateTime AS DATE) = '${today}'`);

    // Total patients overall
    const totalPatients = await pool.request()
      .query(`SELECT COUNT(*) AS count FROM Visit_patient`);

    // Pending collection
    const pendingCollection = await pool.request()
      .query(`SELECT COUNT(*) AS count FROM Visit_Trans WHERE TestWiseStatus = 1`);

    // Completed today
    const completedToday = await pool.request()
      .query(`SELECT COUNT(*) AS count FROM Visit_Trans WHERE TestWiseStatus >= 3 AND CAST(CreatedDate AS DATE) = '${today}'`);

    res.render('dashboard', {
      user: req.session.user,
      stats: {
        todayPatients:    todayPatients.recordset[0].count    || 0,
        totalPatients:    totalPatients.recordset[0].count    || 0,
        pendingCollection: pendingCollection.recordset[0].count || 0,
        completedToday:   completedToday.recordset[0].count   || 0,
      }
    });
  } catch (err) {
    // If queries fail, still show dashboard with zeros
    res.render('dashboard', {
      user: req.session.user,
      stats: { todayPatients: 0, totalPatients: 0, pendingCollection: 0, completedToday: 0 }
    });
  }
});

// ─── 404 & Error Handlers ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).send(`
    <html><head><title>404 — LIMS</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/main.css">
    </head><body>
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--gray-50);padding:24px;">
      <div style="text-align:center;">
        <div style="font-size:5rem;font-weight:900;color:var(--gray-200);letter-spacing:-0.05em;line-height:1;margin-bottom:16px;">404</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--gray-800);margin-bottom:8px;">Page not found</div>
        <p style="color:var(--gray-500);margin-bottom:24px;">The page you're looking for doesn't exist.</p>
        <a href="/register" style="display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:8px;background:#2563eb;color:white;font-weight:600;font-family:var(--font-sans);text-decoration:none;">
          ← Back to Dashboard
        </a>
      </div>
    </div>
    </body></html>
  `);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { error: err });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`\n🚀 LIMS running at http://localhost:${port}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Database: ${process.env.DB_SERVER}/${process.env.DB_DATABASE}\n`);
});
