import { inject, Injectable } from '@angular/core';
import type { ParseError, ParseResult } from 'papaparse';
import { A3Record, ParsedCsv } from '../models/reconciliation.models';
import { I18nService } from './i18n.service';
import { normalizeModel, normalizeNif, normalizePeriod } from './normalization';

const MODEL_COLUMN = 'Modelo';
const PERIOD_COLUMN = 'Período';
const COMBINED_NAME_COLUMN = 'Razón social / Apellidos, Nombre';
const NIF_COLUMN = 'N.I.F.';
const FILING_DATE_COLUMN = 'Fecha de presentación';
const REQUIRED_COLUMNS = [MODEL_COLUMN, PERIOD_COLUMN, COMBINED_NAME_COLUMN, NIF_COLUMN] as const;

type CsvRow = Record<string, string | undefined>;
type PapaParseModule = typeof import('papaparse');
type PapaParseImport = PapaParseModule & { readonly default?: PapaParseModule };

let papaParsePromise: Promise<PapaParseModule> | null = null;

function loadPapaParse(): Promise<PapaParseModule> {
  papaParsePromise ??= import('papaparse').then(resolvePapaParseModule);
  return papaParsePromise;
}

export function resolvePapaParseModule(module: PapaParseImport): PapaParseModule {
  if (typeof module.parse === 'function') {
    return module;
  }

  if (module.default && typeof module.default.parse === 'function') {
    return module.default;
  }

  throw new Error('PapaParse module did not expose a parse function.');
}

@Injectable({ providedIn: 'root' })
export class CsvParserService {
  private readonly i18n = inject(I18nService);

  async parse(file: File): Promise<ParsedCsv> {
    const Papa = await loadPapaParse();
    return new Promise((resolve, reject) => {
      Papa.parse<CsvRow>(file, {
        encoding: 'windows-1252',
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (header: string) => this.canonicalHeader(header),
        complete: (result: ParseResult<CsvRow>) => this.handleResult(result, resolve, reject),
        error: (error: Error) =>
          reject(
            new Error(this.i18n.t('reconciliation.error.csvRead', { message: error.message })),
          ),
      });
    });
  }

  private handleResult(
    result: ParseResult<CsvRow>,
    resolve: (value: ParsedCsv) => void,
    reject: (reason: Error) => void,
  ): void {
    const fields = result.meta.fields ?? [];
    const missing = this.missingColumns(fields);
    if (missing.length) {
      reject(
        new Error(
          this.i18n.t('reconciliation.error.missingColumns', { columns: missing.join(', ') }),
        ),
      );
      return;
    }

    const fatalErrors = result.errors.filter((error) => error.type !== 'FieldMismatch');
    if (fatalErrors.length) {
      reject(new Error(this.formatErrors(fatalErrors)));
      return;
    }

    const warnings = result.errors.map((error) => ({
      key: 'reconciliation.csv.rowWarning' as const,
      params: { row: (error.row ?? 0) + 2, message: error.message },
    }));
    const records = result.data.map((row, index) => this.toRecord(row, index + 2));
    resolve({ records, warnings });
  }

  private toRecord(row: CsvRow, rowNumber: number): A3Record {
    const combinedName = String(row[COMBINED_NAME_COLUMN] ?? '').trim();
    return {
      id: `a3-${rowNumber}`,
      nif: normalizeNif(String(row[NIF_COLUMN] ?? '')),
      model: normalizeModel(String(row[MODEL_COLUMN] ?? '')),
      period: normalizePeriod(String(row[PERIOD_COLUMN] ?? '')),
      companyName: combinedName,
      filingDate: String(row[FILING_DATE_COLUMN] ?? '').trim(),
      surname: combinedName,
      name: '',
      rowNumber,
    };
  }

  private canonicalHeader(header: string): string {
    const normalized = header
      .replace(/^\uFEFF/, '')
      .trim()
      .replace(/\s+/g, ' ');
    if (/^modelo$/i.test(normalized)) {
      return MODEL_COLUMN;
    }
    if (/^per(?:i|í|\uFFFD)odo$/i.test(normalized)) {
      return PERIOD_COLUMN;
    }
    if (/^n\.?\s*i\.?\s*f\.?$/i.test(normalized)) {
      return NIF_COLUMN;
    }
    if (/^raz(?:o|ó|\uFFFD)n social\s*\/\s*apellidos\s*,\s*nombre$/i.test(normalized)) {
      return COMBINED_NAME_COLUMN;
    }
    if (/^(?:fecha de presentaci(?:o|ó|\uFFFD)n|presentaci(?:o|ó|\uFFFD)n)$/i.test(normalized)) {
      return FILING_DATE_COLUMN;
    }
    return normalized;
  }

  private missingColumns(fields: readonly string[]): string[] {
    return REQUIRED_COLUMNS.filter((column) => !fields.includes(column));
  }

  private formatErrors(errors: ParseError[]): string {
    return this.i18n.t('reconciliation.error.invalidCsv', {
      message: errors.map((error) => error.message).join('; '),
    });
  }
}
