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

function formatDDMMYYYY(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function addDays(dateVal, days) {
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d;
}

function ddmmyyyyToSortable(str) {
  const parsed = parseDDMMYYYY(str);
  return parsed || '';
}

function formatInvoiceDate(dateVal) {
  if (!dateVal) return '';
  return moment(dateVal).format('DD-MMM-YYYY hh:mm A');
}

function splitNames(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  return String(value).split(',').map(v => v.trim()).filter(Boolean);
}

async function loadResultEntryPatientList(pool, fromDate, toDate) {
  try {
    let accessionResult;
    if (fromDate && toDate) {
      accessionResult = await pool.request()
        .input('FromDate', mssql.Date, fromDate)
        .input('ToDate', mssql.Date, toDate)
        .execute('GetAccession');
    } else {
      accessionResult = await pool.request().execute('GetAccession');
    }

    const accessionRows = (accessionResult.recordset || [])
      .map(row => ({
        ...row,
        StatusName: row.StatusName || row.ActionName || ''
      }))
      .filter(row => {
        const status = String(row.StatusName || '').toLowerCase();
        return status.includes('sample collect') || status.includes('accession done');
      });

    const visitMap = new Map();
    accessionRows.forEach(row => {
      if (!row.VisitCode || visitMap.has(row.VisitCode)) return;
      visitMap.set(row.VisitCode, row);
    });

    if (visitMap.size > 0) {
      return Array.from(visitMap.values());
    }
  } catch (err) {
    console.error('Result patient list accession lookup failed:', {
      fromDate,
      toDate,
      message: err.message
    });
  }

  if (fromDate && toDate) {
    const r = await pool.request()
      .input('FromDate', mssql.Date, fromDate)
      .input('ToDate', mssql.Date, toDate)
      .execute('GetResultPatientList');
    return r.recordset || [];
  }

  const r = await pool.request().execute('GetResultPatientList');
  return r.recordset || [];
}

async function getInvoiceData(req, visitID) {
  const sessionInvoice = req.session.lastRegistration;
  if (sessionInvoice && String(sessionInvoice.visitID) === String(visitID)) {
    return sessionInvoice;
  }

  const pool = await mssql.connect(config);
  const visitResult = await pool.request()
    .input('visitID', mssql.Int, visitID)
    .query(`
      SELECT TOP 1
        VisitID,
        PatientID,
        VisitCode,
        VisitDateTime,
        PaymentMode,
        ISNULL(Gross, 0) AS GrossAmount,
        ISNULL(VisitingCharges, 0) AS VisitingCharges,
        ISNULL(DiscountAmount, 0) AS DiscountAmount,
        ISNULL(Net, 0) AS NetAmount,
        ISNULL(AmountPaid, 0) AS PaidAmount,
        ISNULL(BalanceAmt, 0) AS BalanceAmount
      FROM Visit v
      WHERE VisitID = @visitID
    `);

  const row = visitResult.recordset[0];
  if (!row) return null;

  let patientName = '';
  let gender = '';
  let age = '';
  let ageType = '';
  let mobileNumber = '';
  let paymentModeName = '';
  let selectedItems = [];

  try {
    const paymentModeResult = await pool.request()
      .input('payModeID', mssql.Int, row.PaymentMode || null)
      .query('SELECT TOP 1 PaymentMode FROM Mst_Paymentmode WHERE PayModeID = @payModeID');
    paymentModeName = paymentModeResult.recordset[0]?.PaymentMode || '';
  } catch (err) {
    console.error('Invoice payment mode lookup error:', {
      visitID,
      paymentMode: row.PaymentMode,
      message: err.message
    });
  }

  try {
    const patientResult = await pool.request()
      .input('patientID', mssql.Int, row.PatientID)
      .query(`
        SELECT TOP 1
          PatientName,
          Gender,
          Age,
          AgeType,
          MobileNo
        FROM Visit_patient
        WHERE PatientID = @patientID
      `);
    const patientRow = patientResult.recordset?.[0];
    if (patientRow) {
      patientName = patientRow.PatientName || '';
      gender = patientRow.Gender || '';
      age = patientRow.Age || '';
      ageType = patientRow.AgeType || '';
      mobileNumber = patientRow.MobileNo || '';
    }
  } catch (err) {
    console.error('Invoice patient lookup error:', {
      visitID,
      patientID: row.PatientID,
      message: err.message
    });
  }

  try {
    const itemsResult = await pool.request()
      .input('visitID', mssql.Int, visitID)
      .query(`
        SELECT
          CASE
            WHEN vt.TestID IS NOT NULL THEN 'Test'
            WHEN vt.ProfileTestsID IS NOT NULL THEN 'Profile'
            ELSE 'Item'
          END AS ItemType,
          COALESCE(mt.TestName, mp.ProfileName) AS ItemName
        FROM Visit_Trans vt
        LEFT JOIN Mst_Test mt ON mt.TestID = vt.TestID
        LEFT JOIN Mst_Profiles mp ON mp.ProfileID = vt.ProfileTestsID
        WHERE vt.VisitID = @visitID
      `);

    selectedItems = (itemsResult.recordset || [])
      .filter(item => item.ItemName)
      .map(item => ({
        type: item.ItemType,
        name: item.ItemName
      }));
  } catch (err) {
    console.error('Invoice items lookup error:', {
      visitID,
      message: err.message
    });
  }

  return {
    patientID: row.PatientID,
    visitID: row.VisitID,
    visitCode: row.VisitCode,
    registrationDateTime: row.VisitDateTime,
    patientName,
    gender,
    age,
    ageType,
    mobileNumber,
    paymentModeName,
    centerName: '',
    referName: '',
    doctorName: '',
    selectedItems,
    grossAmount: Number(row.GrossAmount || 0),
    visitingCharges: Number(row.VisitingCharges || 0),
    discountAmount: Number(row.DiscountAmount || 0),
    netAmount: Number(row.NetAmount || 0),
    paidAmount: Number(row.PaidAmount || 0),
    balanceAmount: Number(row.BalanceAmount || 0)
  };
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
    visitID: q.visitID || null,
    invoiceUrl: q.visitID ? `/invoice/${q.visitID}` : null,
    printInvoiceUrl: q.visitID ? `/invoice/${q.visitID}?print=1` : null
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
    const centerId = parseInt(combinedData.centerId, 10);
    const referedId = parseInt(combinedData.referedId, 10);
    const doctorId = parseInt(combinedData.doctorId, 10);

    const numericErrors = [];
    if (Number.isNaN(age) || age < 0 || age > 150) numericErrors.push('Age must be a number between 0 and 150');
    if (Number.isNaN(gross) || gross < 0) numericErrors.push('Gross amount must be a non-negative number');
    if (Number.isNaN(visiting) || visiting < 0) numericErrors.push('Visiting charges must be a non-negative number');
    if (Number.isNaN(discount) || discount < 0) numericErrors.push('Discount amount must be a non-negative number');
    if (Number.isNaN(paid) || paid < 0) numericErrors.push('Paid amount must be a non-negative number');
    if (Number.isNaN(centerId) || centerId <= 0) numericErrors.push('Center / Lab is required');
    if (Number.isNaN(referedId) || referedId <= 0) numericErrors.push('Referred By is required');
    if (Number.isNaN(doctorId) || doctorId <= 0) numericErrors.push('Doctor is required');

    if (numericErrors.length > 0) {
      return res.status(400).render('error', { error: new Error(numericErrors.join('; ')) });
    }

    const totalGross = gross + visiting;
    if (discount > totalGross) return res.status(400).json({ error: 'Discount cannot exceed gross amount.' });
    const net = totalGross - discount;
    if (paid > net) return res.status(400).json({ error: 'Paid cannot exceed net amount.' });
    const balance = net - paid;
    const selectedItems = [
      ...splitNames(combinedData.selectedTestNames).map(name => ({ type: 'Test', name })),
      ...splitNames(combinedData.selectedProfileNames).map(name => ({ type: 'Profile', name }))
    ];

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
      .input('centerId', mssql.Int, centerId)
      .input('referedId', mssql.Int, referedId)
      .input('doctorId', mssql.Int, doctorId)
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
    req.session.lastRegistration = {
      patientID,
      visitID,
      visitCode: combinedData.visitNo,
      registrationDateTime: combinedData.registrationDateTime,
      patientName: combinedData.patientName,
      gender: combinedData.gender,
      age: combinedData.age,
      ageType: combinedData.ageType,
      mobileNumber: mobileNumber,
      paymentModeName: combinedData.paymentModeName || '',
      centerName: combinedData.centerName || '',
      referName: combinedData.referName || '',
      doctorName: combinedData.doctorName || '',
      selectedItems,
      grossAmount: totalGross,
      visitingCharges: visiting,
      discountAmount: discount,
      netAmount: net,
      paidAmount: paid,
      balanceAmount: balance
    };
    delete req.session.registerData;
    res.redirect(`/register?success=true&patientID=${patientID}&visitID=${visitID}`);
  } catch (err) {
    await transaction.rollback().catch(() => {});
    console.error('Submit error:', err);
    res.status(500).render('error', { error: err });
  }
});

app.get('/invoice/:visitID', requireAuth, async (req, res) => {
  try {
    const invoice = await getInvoiceData(req, req.params.visitID);
    if (!invoice) return res.status(404).render('error', { error: new Error('Invoice data not found for this visit.') });
    res.render('invoice', {
      invoice,
      formatInvoiceDate,
      autoPrint: req.query.print === '1',
      user: req.session.user
    });
  } catch (err) {
    console.error('Invoice render error:', {
      visitID: req.params.visitID,
      query: req.query,
      message: err.message,
      stack: err.stack
    });
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
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      result = await pool.request()
        .input('FromDate', mssql.Date, yesterday)
        .input('ToDate', mssql.Date, today)
        .execute('GetCollection');
    }
    const data = result.recordset.map(item => {
      if (item.VisitDateTime) {
        const d = new Date(item.VisitDateTime);
        item.VisitDateTime = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      }
      item.StatusName = item.StatusName || item.ActionName || 'Pending';
      return item;
    });
    const defaultFromDate = FromDate || formatDDMMYYYY(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const defaultToDate = ToDate || formatDDMMYYYY(new Date());
    res.render('collection', { data, user: req.session.user, fromDate: defaultFromDate, toDate: defaultToDate });
  } catch (err) {
    console.error('Collection page error:', {
      query: req.query,
      message: err.message,
      stack: err.stack
    });
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
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      result = await pool.request()
        .input('FromDate', mssql.Date, yesterday)
        .input('ToDate', mssql.Date, today)
        .execute('GetAccession');
    }
    const data = result.recordset.map(item => {
      if (item.VisitDateTime) {
        const d = new Date(item.VisitDateTime);
        item.VisitDateTime = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      }
      item.StatusName = item.StatusName || item.ActionName || 'Pending';
      return item;
    });
    const defaultFromDate = FromDate || formatDDMMYYYY(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const defaultToDate = ToDate || formatDDMMYYYY(new Date());
    res.render('Accession', { data, user: req.session.user, fromDate: defaultFromDate, toDate: defaultToDate });
  } catch (err) {
    console.error('Accession page error:', {
      query: req.query,
      message: err.message,
      stack: err.stack
    });
    res.status(500).render('error', { error: err });
  }
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
    const defaultFromDate = FromDate || formatDDMMYYYY(new Date());
    const defaultToDate = ToDate || formatDDMMYYYY(new Date());
    const parsedFrom = parseDDMMYYYY(defaultFromDate) || defaultFromDate;
    const parsedTo = parseDDMMYYYY(defaultToDate) || defaultToDate;
    const widenedFrom = addDays(parsedFrom, -1) || parsedFrom;
    const result = await pool.request()
      .input('FromDate', mssql.Date, widenedFrom)
      .input('ToDate', mssql.Date, parsedTo)
      .execute('GetBarcodePrinting');

    const data = result.recordset.map(item => {
      if (item.VisitDateTime) {
        const d = new Date(item.VisitDateTime);
        item.VisitDateTime = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      }
      return item;
    });
    const filteredData = data.filter(item => {
      if (!item.VisitDateTime) return false;
      const itemDate = parseDDMMYYYY(item.VisitDateTime);
      return itemDate && itemDate >= parsedFrom && itemDate <= parsedTo;
    });
    res.render('Barcodeprinting', {
      data: filteredData,
      user: req.session.user,
      fromDate: defaultFromDate,
      toDate: defaultToDate
    });
  } catch (err) {
    console.error('Barcode page error:', {
      route: '/Barcodeprinting',
      query: req.query,
      message: err.message,
      stack: err.stack
    });
    res.status(500).render('error', { error: err });
  }
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
    const defaultFromDate = FromDate || formatDDMMYYYY(new Date());
    const defaultToDate = ToDate || formatDDMMYYYY(new Date());
    const parsedFrom = parseDDMMYYYY(defaultFromDate) || defaultFromDate;
    const parsedTo = parseDDMMYYYY(defaultToDate) || defaultToDate;
    const widenedFrom = addDays(parsedFrom, -1) || parsedFrom;
    const widenedTo = parsedTo;
    const result = await pool.request()
      .input('FromDate', mssql.Date, widenedFrom)
      .input('ToDate', mssql.Date, widenedTo)
      .execute('GetSearch');
    const data = result.recordset.map(item => {
      if (item.VisitDateTime) {
        const d = new Date(item.VisitDateTime);
        item.VisitDateTime = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      }
      return item;
    }).filter(item => {
      if (!item.VisitDateTime) return false;
      const rowDate = ddmmyyyyToSortable(item.VisitDateTime);
      const fromDate = ddmmyyyyToSortable(defaultFromDate);
      const toDate = ddmmyyyyToSortable(defaultToDate);
      return !!rowDate && !!fromDate && !!toDate && rowDate >= fromDate && rowDate <= toDate;
    });

    const visitCodes = Array.from(new Set(
      data.map(item => item.VisitCode).filter(Boolean)
    ));

    if (visitCodes.length) {
      const billingReq = pool.request();
      const placeholders = visitCodes.map((code, index) => {
        const key = `visitCode${index}`;
        billingReq.input(key, mssql.VarChar, code);
        return `@${key}`;
      });

      const billingResult = await billingReq.query(`
        SELECT
          VisitID,
          VisitCode,
          ISNULL(Net, 0) AS NetAmount,
          ISNULL(AmountPaid, 0) AS PaidAmount,
          ISNULL(BalanceAmt, 0) AS BalanceAmount
        FROM Visit
        WHERE VisitCode IN (${placeholders.join(', ')})
      `);

      const billingMap = new Map(
        billingResult.recordset.map(row => [row.VisitCode, row])
      );

      data.forEach(item => {
        const billing = billingMap.get(item.VisitCode);
        item.VisitID = billing?.VisitID || null;
        item.NetAmount = Number(billing?.NetAmount || 0);
        item.PaidAmount = Number(billing?.PaidAmount || 0);
        item.BalanceAmount = Number(billing?.BalanceAmount || 0);
        item.PaymentStatus = item.BalanceAmount > 0 ? 'Pending' : 'Paid';
      });
    }

    res.render('Search', { data, user: req.session.user, fromDate: defaultFromDate, toDate: defaultToDate });
  } catch (err) {
    console.error('Search page error:', {
      query: req.query,
      message: err.message,
      stack: err.stack
    });
    res.status(500).render('error', { error: err });
  }
});

// ─── Result Entry ─────────────────────────────────────────────────────────────
app.get('/result', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    let { FromDate, ToDate } = req.query;
    const defaultFrom = FromDate || formatDDMMYYYY(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const defaultTo = ToDate || formatDDMMYYYY(new Date());
    const filterFrom = parseDDMMYYYY(defaultFrom) || defaultFrom;
    const filterTo = parseDDMMYYYY(defaultTo) || defaultTo;
    const patientList = await loadResultEntryPatientList(pool, filterFrom, filterTo);
    let resultDetails = null, resultTests = [], distinctTests = [];
    if (patientList.length > 0) {
      const r = await pool.request().input('VisitCode', mssql.VarChar, patientList[0].VisitCode).execute('GetPatientAndResultDetails');
      resultDetails = r.recordsets[0][0];
      resultTests = r.recordsets[1] || [];
      distinctTests = Array.from(new Map(resultTests.map(t => [t.TestID, t.TestName])).entries()).map(([TestID, TestName]) => ({ TestID, TestName }));
    }
    res.render('result', { labName: 'HLL Lab', fromDate: defaultFrom, toDate: defaultTo, patientList, resultDetails, resultTests, distinctTests, user: req.session.user });
  } catch (err) {
    console.error('Result page error:', {
      query: req.query,
      message: err.message,
      stack: err.stack
    });
    res.render('result', { labName: '', fromDate: '', toDate: '', patientList: [], resultDetails: null, resultTests: [], distinctTests: [], user: req.session.user });
  }
});

app.get('/result/details/:visitCode', requireAuth, async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const r = await pool.request().input('VisitCode', mssql.VarChar, req.params.visitCode).execute('GetPatientAndResultDetails');
    let resultDetails = r.recordsets[0][0];
    const resultTests = r.recordsets[1] || [];
    if (!resultDetails && resultTests.length > 0) {
      const fallback = await pool.request()
        .input('VisitCode', mssql.VarChar, req.params.visitCode)
        .query(`
          SELECT TOP 1
            V.VisitCode,
            P.PatientName,
            P.Gender,
            P.Age,
            CASE
              WHEN P.AgeType = 'Y' THEN 'Year'
              WHEN P.AgeType = 'M' THEN 'Month'
              WHEN P.AgeType = 'D' THEN 'Day'
              ELSE P.AgeType
            END AS AgeType,
            D.DoctorName,
            V.Net AS [Total Amount],
            V.AmountPaid AS [Paid Amount],
            V.BalanceAmt AS [Balance Amount]
          FROM Visit V
          INNER JOIN Visit_Patient P ON P.PatientID = V.PatientID
          LEFT JOIN Mst_Doctor D ON D.DoctorID = V.DoctorID
          WHERE V.VisitCode = @VisitCode
        `);
      resultDetails = fallback.recordset[0] || null;
    }
    if (!resultDetails && resultTests.length === 0) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    if (!resultDetails && resultTests.length > 0) {
      const first = resultTests[0];
      resultDetails = {
        VisitCode: first.VisitCode,
        PatientName: '',
        Gender: '',
        Age: first.Age || '',
        AgeType: first.AgeType || '',
        DoctorName: ''
      };
    }
    res.json({ success: true, resultDetails, resultTests });
  } catch (err) {
    console.error('Result details error:', {
      visitCode: req.params.visitCode,
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ success: false, error: err.message });
  }
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
    const defaultFrom = fromDate || formatDDMMYYYY(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const defaultTo = toDate || formatDDMMYYYY(new Date());
    const sqlFrom = parseDDMMYYYY(defaultFrom) || defaultFrom;
    const sqlTo = parseDDMMYYYY(defaultTo) || defaultTo;
    const result = await pool.request()
      .input('FromDate', mssql.Date, sqlFrom)
      .input('ToDate', mssql.Date, sqlTo)
      .execute('Getreportforprint');
    const patients = (result.recordset || []).map(row => ({
      ...row,
      StatusName: row.StatusName || row.ActionName || 'Pending'
    }));
    res.render('report-list', { patients, user: req.session.user, fromDate: defaultFrom, toDate: defaultTo });
  } catch (err) {
    console.error('Reports page error:', {
      query: req.query,
      message: err.message,
      stack: err.stack
    });
    res.render('report-list', { patients: [], user: req.session.user, fromDate: '', toDate: '' });
  }
});

app.get('/reports/data', requireAuth, async (req, res) => {
  const { fromDate, toDate } = req.query;
  try {
    const pool = await mssql.connect(config);
    const sqlFrom = parseDDMMYYYY(fromDate) || fromDate || null;
    const sqlTo = parseDDMMYYYY(toDate) || toDate || null;
    const result = await pool.request()
      .input('FromDate', mssql.Date, sqlFrom)
      .input('ToDate', mssql.Date, sqlTo)
      .execute('Getreportforprint');
    res.json((result.recordset || []).map(row => ({
      ...row,
      StatusName: row.StatusName || row.ActionName || 'Pending'
    })));
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
