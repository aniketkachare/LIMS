# SQL Reference

Reference document for the SQL stored procedures and inline queries currently used in [app.js](/c:/Users/mrani/Downloads/loginPage/files/app.js).

## Purpose

This file is a quick lookup for:

- stored procedures used by the application
- inline SQL queries written directly in `app.js`
- the route or feature that uses each query
- the main tables involved

## Stored Procedures

| Procedure | Used In | Purpose |
| --- | --- | --- |
| `GetAccession` | `/Accession`, result-entry patient sourcing | Loads accession-ready records, optionally by date range |
| `GetResultPatientList` | `/result`, `/validation` | Loads patients available for result and validation workflows |
| `SearchPatients` | `/search-patients` | Registration patient lookup/autocomplete |
| `InsertVisitPatient` | `/submit` | Inserts patient master/visit patient row |
| `InsertVisit` | `/submit` | Inserts visit and billing header details |
| `InsertVisitTrans` | `/submit` | Inserts individual selected tests for a visit |
| `InsertVisitTrans_Profile` | `/submit` | Inserts selected profiles for a visit |
| `InsertVisitAddress` | `/submit` | Saves address and demographic details |
| `InsertPatientTRF` | `/submit` | Saves uploaded TRF file paths |
| `InsertPatientHistory` | `/submit` | Saves uploaded patient history file paths |
| `GetCollection` | `/collection` | Loads sample collection list |
| `UpdateTestWiseAction` | collection, accession, result authorization | Updates `Visit_Trans.TestWiseStatus` / action flow |
| `GetBarcodePrinting` | `/Barcodeprinting`, barcode popup fallback | Loads barcode printing list |
| `GenerateBarcode` | `/generate-barcode` | Returns barcode data for one test row |
| `GetSearch` | `/Search` | Loads patient search results |
| `GetPatientAndResultDetails` | `/result`, `/result/details/:visitCode` | Loads result entry header and parameter rows |
| `SaveResultPatient` | `/api/save-result-patient` | Saves manual result value for one parameter |
| `Getreportforprint` | `/report-list`, `/api/report-search` | Loads report-ready patient list |
| `GetPatientReport_ByVisitCode` | `/report/:visitCode`, `/preview/:visitCode` | Loads printable report data |
| `GetBarcodePrinting_ByVisitCode` | `/barcode/:visitCode` | Loads barcode data by visit code |

## Inline Queries

## Invoice And Billing

### Visit header for invoice

Used in invoice data loading.

Tables:

- `Visit`

Main fields:

- `VisitID`
- `PatientID`
- `VisitCode`
- `VisitDateTime`
- `PaymentMode`
- `Gross`
- `VisitingCharges`
- `DiscountAmount`
- `Net`
- `AmountPaid`
- `BalanceAmt`

Query shape:

```sql
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
FROM Visit
WHERE VisitID = @visitID
```

### Payment mode lookup

Used in invoice rendering.

Tables:

- `Mst_Paymentmode`

```sql
SELECT TOP 1 PaymentMode
FROM Mst_Paymentmode
WHERE PayModeID = @payModeID
```

### Patient details for invoice

Used in invoice rendering.

Tables:

- `Visit_patient`

```sql
SELECT TOP 1
  PatientName,
  Gender,
  Age,
  AgeType,
  MobileNo
FROM Visit_patient
WHERE PatientID = @patientID
```

### Invoice item list with amounts

Used in invoice rendering so each test/profile shows its amount.

Tables:

- `Visit_Trans`
- `Mst_Test`
- `Mst_Profiles`

```sql
SELECT
  CASE
    WHEN vt.TestID IS NOT NULL THEN 'Test'
    WHEN vt.ProfileTestsID IS NOT NULL THEN 'Profile'
    ELSE 'Item'
  END AS ItemType,
  COALESCE(mt.TestName, mp.ProfileName) AS ItemName,
  ISNULL(vt.TestPrice, 0) AS ItemAmount,
  ISNULL(vt.DiscountAmount, 0) AS ItemDiscountAmount
FROM Visit_Trans vt
LEFT JOIN Mst_Test mt ON mt.TestID = vt.TestID
LEFT JOIN Mst_Profiles mp ON mp.ProfileID = vt.ProfileTestsID
WHERE vt.VisitID = @visitID
```

### Search billing enrichment

Used after `GetSearch` to attach billing values and invoice links on the search page.

Tables:

- `Visit`

```sql
SELECT
  VisitID,
  VisitCode,
  ISNULL(Net, 0) AS NetAmount,
  ISNULL(AmountPaid, 0) AS PaidAmount,
  ISNULL(BalanceAmt, 0) AS BalanceAmount
FROM Visit
WHERE VisitCode IN (...)
```

## Authentication And Registration

### User login

Tables:

- `Mst_Users`

```sql
SELECT *
FROM Mst_Users
WHERE LOWER(userName) = LOWER(@username)
```

### Salutation list

Tables:

- `Mst_Salutation`

```sql
SELECT *
FROM Mst_Salutation
```

### Visit code generation

Tables:

- `Mst_Centers`
- `Visit`

Queries:

```sql
SELECT TOP 1 Prefix, visitCodeLength
FROM Mst_Centers
```

```sql
SELECT MAX(CAST(SUBSTRING(VisitCode, LEN('<Prefix>') + 1, LEN(VisitCode)) AS INT)) AS LastCode
FROM Visit
```

### Payment mode list for billing page

Tables:

- `Mst_Paymentmode`

```sql
SELECT PayModeID, PaymentMode
FROM Mst_Paymentmode
```

## Registration Master Autocomplete And Validation

### Center search

Tables:

- `Mst_Centers`

```sql
SELECT CenterID, CenterName
FROM Mst_Centers
WHERE CenterName LIKE @query
  AND ActiveFlag = 1
```

### Referral search

Tables:

- `Mst_Refer`

```sql
SELECT ReferID, ReferName
FROM Mst_Refer
WHERE LOWER(LTRIM(RTRIM(ReferName))) LIKE @query
```

### Doctor search

Tables:

- `Mst_Doctor`

```sql
SELECT DoctorID, DoctorName
FROM Mst_Doctor
WHERE LOWER(LTRIM(RTRIM(DoctorName))) LIKE @query
```

### Test and profile search

Tables:

- `Mst_Test`
- `Mst_Profiles`

```sql
SELECT TestID, TestName, ShortCode
FROM Mst_Test
WHERE LOWER(TestName) LIKE @query
   OR LOWER(ShortCode) LIKE @query
```

```sql
SELECT ProfileID, ProfileName, ProfileCode
FROM Mst_Profiles
WHERE LOWER(ProfileName) LIKE @query
   OR LOWER(ProfileCode) LIKE @query
```

### Selected master validation

Tables:

- `Mst_Centers`
- `Mst_Refer`
- `Mst_Doctor`

```sql
SELECT CenterID FROM Mst_Centers WHERE CenterID = @centerId
SELECT ReferID FROM Mst_Refer WHERE ReferID = @referedId
SELECT DoctorID FROM Mst_Doctor WHERE DoctorID = @doctorId
```

## Inline Insert Queries For Add-New Master Popups

## Center / Lab

Used by the registration popup `+` button.

Tables:

- `Mst_Centers`

Flow:

1. check duplicate by `CenterName`
2. insert if not found
3. return created row

Main fields inserted:

- `CenterName`
- `Address`
- `MobileNo`
- `EmailID`
- `CreatedBy`
- `CreatedDate`
- `ActiveFlag`

## Referred By

Used by the registration popup `+` button.

Tables:

- `Mst_Refer`

Flow:

1. check duplicate by `ReferName`
2. insert if not found
3. return created row

Main fields inserted:

- `ReferName`
- `CreatedDate`
- `MobileNo`
- `EmailID`
- `ReferAddress`
- `CreatedBy`
- `ActiveFlag`

## Doctor

Used by the registration popup `+` button.

Tables:

- `Mst_Doctor`

Flow:

1. check duplicate by `DoctorName`
2. insert if not found
3. return created row

Main fields inserted:

- `DoctorName`
- `MobileNo`
- `EmailID`
- `CenterID`
- `CreatedBy`
- `CreatedDate`
- `ActiveFlag`

## Result Entry

### Result details fallback query

Used when `GetPatientAndResultDetails` returns parameter rows but not the header row.

Tables:

- `Visit`
- `Visit_Patient`
- `Mst_Doctor`

```sql
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
```

### Visit lookup before saving result

Tables:

- `Visit`

```sql
SELECT VisitID
FROM Visit
WHERE VisitCode = @VisitCode
```

## Dashboard Queries

### Dashboard counters

Tables:

- `Visit`
- `Visit_patient`
- `Visit_Trans`

Queries used:

```sql
SELECT COUNT(*) AS count
FROM Visit
WHERE CAST(VisitDateTime AS DATE) = '<today>'
```

```sql
SELECT COUNT(*) AS count
FROM Visit_patient
```

```sql
SELECT COUNT(*) AS count
FROM Visit_Trans
WHERE TestWiseStatus = 1
```

```sql
SELECT COUNT(*) AS count
FROM Visit_Trans
WHERE TestWiseStatus >= 3
  AND CAST(CreatedDate AS DATE) = '<today>'
```

### Dashboard patient trend

Tables:

- `Visit`

```sql
SELECT
  CAST(VisitDateTime AS DATE) AS VisitDate,
  COUNT(*) AS PatientCount
FROM Visit
WHERE CAST(VisitDateTime AS DATE) BETWEEN @FromDate AND @ToDate
GROUP BY CAST(VisitDateTime AS DATE)
ORDER BY CAST(VisitDateTime AS DATE)
```

## Financial Analysis Queries

### Summary

Tables:

- `Visit`

```sql
SELECT
  COUNT(*) AS VisitCount,
  ISNULL(SUM(Gross), 0) AS GrossAmount,
  ISNULL(SUM(DiscountAmount), 0) AS DiscountAmount,
  ISNULL(SUM(Net), 0) AS NetAmount,
  ISNULL(SUM(AmountPaid), 0) AS PaidAmount,
  ISNULL(SUM(BalanceAmt), 0) AS BalanceAmount,
  ISNULL(SUM(VisitingCharges), 0) AS VisitingCharges
FROM Visit
WHERE CAST(VisitDateTime AS DATE) BETWEEN @FromDate AND @ToDate
```

### Daily collection snapshot

Tables:

- `Visit`

```sql
SELECT
  CAST(VisitDateTime AS DATE) AS VisitDate,
  COUNT(*) AS VisitCount,
  ISNULL(SUM(Net), 0) AS NetAmount,
  ISNULL(SUM(AmountPaid), 0) AS PaidAmount,
  ISNULL(SUM(BalanceAmt), 0) AS BalanceAmount
FROM Visit
WHERE CAST(VisitDateTime AS DATE) BETWEEN @FromDate AND @ToDate
GROUP BY CAST(VisitDateTime AS DATE)
ORDER BY CAST(VisitDateTime AS DATE)
```

### Payment mode split

Tables:

- `Visit`
- `Mst_Paymentmode`

```sql
SELECT
  ISNULL(pm.PaymentMode, 'Unknown') AS PaymentMode,
  COUNT(*) AS VisitCount,
  ISNULL(SUM(v.AmountPaid), 0) AS PaidAmount,
  ISNULL(SUM(v.Net), 0) AS NetAmount
FROM Visit v
LEFT JOIN Mst_Paymentmode pm ON pm.PayModeID = v.PaymentMode
WHERE CAST(v.VisitDateTime AS DATE) BETWEEN @FromDate AND @ToDate
GROUP BY pm.PaymentMode
ORDER BY PaidAmount DESC, VisitCount DESC
```

### Highest due visits

Tables:

- `Visit`
- `Visit_patient`

```sql
SELECT TOP 8
  v.VisitCode,
  v.VisitDateTime,
  vp.PatientName,
  ISNULL(v.Net, 0) AS NetAmount,
  ISNULL(v.AmountPaid, 0) AS PaidAmount,
  ISNULL(v.BalanceAmt, 0) AS BalanceAmount
FROM Visit v
LEFT JOIN Visit_patient vp ON vp.PatientID = v.PatientID
WHERE CAST(v.VisitDateTime AS DATE) BETWEEN @FromDate AND @ToDate
  AND ISNULL(v.BalanceAmt, 0) > 0
ORDER BY ISNULL(v.BalanceAmt, 0) DESC, v.VisitDateTime DESC
```

## Main Tables Referenced In App

- `Visit`
- `Visit_Trans`
- `Visit_patient`
- `Mst_Users`
- `Mst_Salutation`
- `Mst_Centers`
- `Mst_Refer`
- `Mst_Doctor`
- `Mst_Test`
- `Mst_Profiles`
- `Mst_Paymentmode`

## Notes

- This reference is based on direct SQL usage found in `app.js`.
- Stored procedure internals are not expanded here because their SQL bodies live in the database, not the Node.js project.
- If needed, the next step can be a second document listing:
  - procedure input parameters
  - expected outputs
  - related UI page
  - status/action IDs used in workflow
