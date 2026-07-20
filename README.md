# A3 Docs Verifier

A3 Docs Verifier is an Angular application for reconciling an A3 CSV report with official AEAT PDF filing receipts. It runs in the browser, reads files locally, and does not modify the selected documents.

## Features

- Import one A3 CSV report.
- Import a folder or multiple PDF receipts.
- Extract NIF, model, period, company name, and filing date from AEAT receipts.
- Match records by normalized `NIF + model + period`.
- Flag missing receipts, PDFs not found in A3, duplicate keys, and records that need manual review.
- Warn when matched records have different company names.
- Filter, sort, paginate, and inspect reconciliation results.
- Open the matched PDF receipt directly from a result row.
- Spanish and English UI with light and dark themes.

## Input Requirements

### A3 CSV

The CSV must include these columns:

- `Modelo`
- `Período`
- `Razón social / Apellidos, Nombre`
- `N.I.F.`

The optional `Fecha de presentación` column is displayed in the results when present.

Header accents and common `N.I.F.` spacing/punctuation variants are normalized during parsing.

### PDF Receipts

PDFs should be official AEAT filing receipts with extractable text. When importing a folder, only PDF files in the selected folder's first level are processed.

The extractor looks for:

- NIF
- Model
- Tax period and year
- Company name
- Filing date

PDFs with incomplete or unreadable data are kept in the results as `Manual review`.

## Reconciliation Rules

Records are matched using a normalized key:

```text
NIF | model | period
```

Periods are normalized to formats such as:

- `1T/2026`
- `0A/2026`
- `01/2026`

Result statuses:

- `Matches`: exactly one A3 row and one PDF share the same key.
- `No PDF receipt`: an A3 row has no matching PDF receipt.
- `PDF not found in A3`: a PDF receipt has no matching A3 row.
- `Duplicate`: the same key appears more than once in A3, the PDF set, or both.
- `Manual review`: a record is missing the data needed for automatic matching.

## Getting Started

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm start
```

Open `http://localhost:4200/`.

## Available Scripts

```bash
npm start
```

Runs the Angular dev server on `0.0.0.0`.

```bash
npm run build
```

Builds the application into `dist/`.

```bash
npm test
```

Runs the unit test suite once with Vitest.

```bash
npm run watch
```

Runs a production-configuration build in watch mode.

## Tech Stack

- Angular 22
- Angular Material and CDK
- pdf.js for PDF text extraction
- Papa Parse for CSV parsing
- Vitest for unit tests

## Notes

PDF parsing depends on text embedded in the receipt. Scanned image-only receipts may not provide enough data for automatic matching.

The app performs reconciliation in the browser. Avoid selecting files that exceed the memory limits of the browser or device running the app.
