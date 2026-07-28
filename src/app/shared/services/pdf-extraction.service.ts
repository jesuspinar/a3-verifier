import { Injectable } from '@angular/core';
import { PdfReceipt } from '../models/reconciliation.models';
import { normalizeModel, normalizeNif, normalizePeriod } from './normalization';

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfJsPromise: Promise<PdfJsModule> | null = null;

function loadPdfJs(): Promise<PdfJsModule> {
  pdfJsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfJs) => {
    pdfJs.GlobalWorkerOptions.workerSrc = new URL(
      'assets/pdfjs/pdf.worker.min.mjs',
      document.baseURI,
    ).toString();
    return pdfJs;
  });
  return pdfJsPromise;
}

interface ExtractedFields {
  nif: string;
  model: string;
  year: string;
  period: string;
  companyName: string;
  filingDate: string;
}

interface DeclarationRow {
  nif: string;
  companyName: string;
  year: string;
  period: string;
}

const SPANISH_NIF_PATTERN = '[A-Z]\\d{8}|\\d{8}[A-Z]|[XYZ]\\d{7}[A-Z]';
const PERIOD_TOKEN_PATTERN = '[1-4]\\s*[TQ]|0A|(?:0?[1-9]|1[0-2])\\s*(?:M|MES)?';

@Injectable({ providedIn: 'root' })
export class PdfExtractionService {
  async extract(file: File, index: number): Promise<PdfReceipt> {
    try {
      const { getDocument } = await loadPdfJs();
      const data = await file.arrayBuffer();
      const loadingTask = getDocument({ data });
      let document: Awaited<typeof loadingTask.promise> | null = null;
      try {
        document = await loadingTask.promise;
        let text = '';
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber);
          try {
            const content = await page.getTextContent();
            text += `${content.items
              .filter((item) => 'str' in item)
              .map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`)
              .join('')}\n`;
          } finally {
            page.cleanup();
          }
        }

        const fields = this.extractFields(text);
        return this.createReceipt(file, index, fields);
      } finally {
        if (document) {
          try {
            await document.cleanup();
          } finally {
            await document.destroy();
          }
        } else {
          await loadingTask.destroy();
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown PDF parsing error';
      return this.createReceipt(file, index, this.emptyFields(), message);
    }
  }

  extractFields(text: string): ExtractedFields {
    const normalized = this.normalizeExtractedText(text);
    const lines = this.toLines(text);
    const declaration = this.extractDeclarationRow(lines);
    const year =
      declaration?.year || this.valueAfterLabel(normalized, ['Ejercicio', 'Año'], '(20\\d{2})');

    return {
      nif: normalizeNif(
        declaration?.nif ||
          this.valueAfterLabel(
            normalized,
            ['NIF del declarante', 'N\\.?I\\.?F\\.?'],
            `(${SPANISH_NIF_PATTERN})`,
          ),
      ),
      model: normalizeModel(this.extractModel(lines, normalized)),
      year,
      period: normalizePeriod(
        declaration?.period ||
          this.valueAfterLabel(
            normalized,
            ['Per[ií]odo'],
            `(${PERIOD_TOKEN_PATTERN})(?:\\s*[/.-]\\s*(20\\d{2}))?`,
          ),
        year,
      ),
      companyName:
        declaration?.companyName ||
        this.cleanFieldValue(
          this.valueAfterLabel(
            normalized,
            ['Apellidos y nombre o raz[oó]n social', 'Raz[oó]n social', 'Declarante'],
            '([^\\n]{2,120})',
          ),
        ),
      filingDate: this.formatFilingDate(
        this.extractFilingDate(normalized) ||
          this.valueAfterLabel(
            normalized,
            ['Fecha (?:y hora )?de presentaci[oó]n', 'Fecha de registro', 'Fecha'],
            '(\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4}(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?)?)',
          ),
      ),
    };
  }

  private extractDeclarationRow(lines: readonly string[]): DeclarationRow | null {
    const nifExpression = `(${SPANISH_NIF_PATTERN})`;
    const periodExpression = `(${PERIOD_TOKEN_PATTERN})`;
    const sameLine = new RegExp(
      `^${nifExpression}\\s+(.+?)\\s+(20\\d{2})\\s+${periodExpression}$`,
      'i',
    );
    const splitLine = new RegExp(`^${nifExpression}\\s+(.+)$`, 'i');
    const periodLine = new RegExp(`^(20\\d{2})\\s+${periodExpression}$`, 'i');

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const sameLineMatch = sameLine.exec(line);
      if (sameLineMatch && this.isPlausibleCompanyName(sameLineMatch[2])) {
        return {
          nif: sameLineMatch[1],
          companyName: this.cleanCompanyName(sameLineMatch[2]),
          year: sameLineMatch[3],
          period: sameLineMatch[4],
        };
      }

      const splitLineMatch = splitLine.exec(line);
      const periodLineMatch = periodLine.exec(lines[index + 1] ?? '');
      if (splitLineMatch && periodLineMatch && this.isPlausibleCompanyName(splitLineMatch[2])) {
        return {
          nif: splitLineMatch[1],
          companyName: this.cleanCompanyName(splitLineMatch[2]),
          year: periodLineMatch[1],
          period: periodLineMatch[2],
        };
      }
    }

    return null;
  }

  private extractModel(lines: readonly string[], normalized: string): string {
    for (let index = 0; index < lines.length; index += 1) {
      const inlineMatch = /^Modelo\s+([A-Z0-9-]{1,8})$/i.exec(lines[index]);
      if (inlineMatch?.[1]) {
        return inlineMatch[1];
      }

      if (/^Modelo$/i.test(lines[index]) && /^[A-Z0-9-]{1,8}$/i.test(lines[index + 1] ?? '')) {
        return lines[index + 1];
      }
    }

    return this.valueAfterLabel(normalized, ['Modelo'], '([A-Z0-9-]{1,8})');
  }

  private extractFilingDate(text: string): string {
    const match =
      /Presentaci[oó]n realizada el\s*:\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})(?:\s+a las\s+(\d{1,2}:\d{2}(?::\d{2})?))?/i.exec(
        text,
      );
    if (!match?.[1]) {
      return '';
    }
    return match[2] ? `${match[1]} ${match[2]}` : match[1];
  }

  private formatFilingDate(value: string): string {
    const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(.*)$/.exec(value.trim());
    if (!match) {
      return value;
    }

    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    return `${day}/${month}/${match[3]}`;
  }

  private valueAfterLabel(text: string, labels: string[], valuePattern: string): string {
    for (const label of labels) {
      const expression = new RegExp(
        `(?:^|\\n|\\b)${label}(?![\\p{L}\\p{N}])\\s*(?:[:\\-])?\\s*${valuePattern}`,
        'imu',
      );
      const match = expression.exec(text);
      if (match?.[1]) {
        return this.cleanFieldValue(match[1]);
      }
    }
    return '';
  }

  private normalizeExtractedText(text: string): string {
    return text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
  }

  private toLines(text: string): string[] {
    return text
      .replace(/\u00a0/g, ' ')
      .split(/\r?\n/)
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean);
  }

  private cleanFieldValue(value: string): string {
    return value
      .trim()
      .replace(/^[\s:.-]+/, '')
      .replace(/\s{2,}/g, ' ');
  }

  private cleanCompanyName(value: string): string {
    return this.cleanFieldValue(value).replace(/\s+$/, '');
  }

  private isPlausibleCompanyName(value: string): boolean {
    const normalized = this.cleanCompanyName(value);
    return /[A-ZÁÉÍÓÚÜÑ]/i.test(normalized) && normalized.length >= 2;
  }

  private createReceipt(
    file: File,
    index: number,
    fields: ExtractedFields,
    extractionWarning?: string,
  ): PdfReceipt {
    return {
      id: `pdf-${index}-${file.name}`,
      nif: fields.nif,
      model: fields.model,
      period: fields.period,
      companyName: fields.companyName,
      filingDate: fields.filingDate,
      fileName: file.name,
      extractionWarning,
    };
  }

  private emptyFields(): ExtractedFields {
    return { nif: '', model: '', year: '', period: '', companyName: '', filingDate: '' };
  }
}
