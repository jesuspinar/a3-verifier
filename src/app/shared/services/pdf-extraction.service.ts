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
const PERIOD_TOKEN_PATTERN = '[1-4]\\s*[TQ]|[1-3]\\s*P|0A|(?:0?[1-9]|1[0-2])\\s*(?:M|MES)?';
const ANO_LABEL = 'A(?:ñ|n|\\uFFFD)o';
const PERIODO_LABEL = 'Per(?:i|í|\\uFFFD)odo';
const PRESENTACION_LABEL = 'Presentaci(?:o|ó|\\uFFFD)n';
const RAZON_LABEL = 'Raz(?:o|ó|\\uFFFD)n';

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
        if (document.numPages < 2) {
          throw new Error('PDF does not contain page 2');
        }

        const page = await document.getPage(2);
        let text = '';
        try {
          const content = await page.getTextContent();
          text = `${content.items
            .filter((item) => 'str' in item)
            .map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`)
            .join('')}\n`;
        } finally {
          page.cleanup();
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
    const model = normalizeModel(this.extractModel(lines, normalized));
    const declaration =
      this.extractDeclarationByModel(model, lines) || this.extractDeclarationRow(lines);
    const year =
      declaration?.year || this.valueAfterLabel(normalized, ['Ejercicio', ANO_LABEL], '(20\\d{2})');

    return {
      nif: normalizeNif(
        declaration?.nif ||
          this.valueAfterLabel(
            normalized,
            ['NIF del declarante', 'N\\.?I\\.?F\\.?'],
            `(${SPANISH_NIF_PATTERN})`,
          ),
      ),
      model,
      year,
      period: normalizePeriod(
        declaration?.period ||
          this.valueAfterLabel(
            normalized,
            [PERIODO_LABEL],
            `(${PERIOD_TOKEN_PATTERN})(?:\\s*[/.-]\\s*(20\\d{2}))?`,
          ) ||
          this.defaultPeriodForModel(model),
        year,
      ),
      companyName:
        declaration?.companyName ||
        this.cleanFieldValue(
          this.valueAfterLabel(
            normalized,
            [`Apellidos y nombre o ${RAZON_LABEL} social`, `${RAZON_LABEL} social`, 'Declarante'],
            '([^\\n]{2,120})',
          ),
        ),
      filingDate: this.formatFilingDate(
        this.extractFilingDate(normalized) ||
          this.valueAfterLabel(
            normalized,
            [`Fecha (?:y hora )?de ${PRESENTACION_LABEL}`, 'Fecha de registro', 'Fecha'],
            '(\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4}(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?)?)',
          ),
      ),
    };
  }

  private extractDeclarationByModel(
    model: string,
    lines: readonly string[],
  ): DeclarationRow | null {
    switch (model) {
      case '115':
      case '202':
      case '303':
        return this.extractNifCompanyYearAndPeriod(lines);
      case '130':
        return this.extractPersonDeclaration(lines);
      case '180':
      case '347':
        return this.extractAnnualDeclaration(lines);
      case '390':
        return this.extractAnnualDeclarationAfterJustificante(lines);
      case '200':
        return this.extractNifCompanyYearAndPeriod(lines, '0A');
      default:
        return null;
    }
  }

  private extractNifCompanyYearAndPeriod(
    lines: readonly string[],
    fallbackPeriod = '',
  ): DeclarationRow | null {
    const footerLines = this.extractFooterLines(lines);
    for (let index = 0; index < footerLines.length; index += 1) {
      const declaration = this.parseNifAndCompanyLine(footerLines[index]);
      if (!declaration) {
        continue;
      }

      const yearAndPeriod = this.extractYearAndPeriod(footerLines, index + 1, fallbackPeriod);
      if (yearAndPeriod) {
        return {
          nif: declaration.nif,
          companyName: declaration.companyName,
          year: yearAndPeriod.year,
          period: yearAndPeriod.period,
        };
      }
    }

    return null;
  }

  private extractPersonDeclaration(lines: readonly string[]): DeclarationRow | null {
    const footerLines = this.extractFooterLines(lines);
    for (let index = 0; index < footerLines.length; index += 1) {
      if (!new RegExp(`^${SPANISH_NIF_PATTERN}$`, 'i').test(footerLines[index])) {
        continue;
      }

      const yearPeriodIndex = this.findYearPeriodLineIndex(footerLines, index + 1, index + 5);
      if (yearPeriodIndex === -1) {
        continue;
      }

      const companyName = footerLines.slice(index + 1, yearPeriodIndex).join(' ');
      if (!this.isPlausibleCompanyName(companyName)) {
        continue;
      }

      const yearAndPeriod = this.parseYearPeriodLine(footerLines[yearPeriodIndex]);
      if (yearAndPeriod) {
        return {
          nif: footerLines[index],
          companyName: this.cleanCompanyName(companyName),
          year: yearAndPeriod.year,
          period: yearAndPeriod.period,
        };
      }
    }

    return null;
  }

  private extractAnnualDeclaration(lines: readonly string[]): DeclarationRow | null {
    const footerLines = this.extractFooterLines(lines);
    for (let index = 0; index < footerLines.length - 2; index += 1) {
      const year = /^(20\d{2})$/.exec(footerLines[index])?.[1];
      if (!year || !new RegExp(`^${SPANISH_NIF_PATTERN}$`, 'i').test(footerLines[index + 1])) {
        continue;
      }

      const companyName = footerLines[index + 2];
      if (this.isPlausibleCompanyName(companyName)) {
        return {
          nif: footerLines[index + 1],
          companyName: this.cleanCompanyName(companyName),
          year,
          period: '0A',
        };
      }
    }

    return null;
  }

  private extractAnnualDeclarationAfterJustificante(
    lines: readonly string[],
  ): DeclarationRow | null {
    const footerLines = this.extractFooterLines(lines);
    const nifExpression = new RegExp(`\\b(${SPANISH_NIF_PATTERN})\\b`, 'i');

    for (let index = 0; index < footerLines.length - 2; index += 1) {
      if (!/(?:justificante|identificativo)/i.test(footerLines[index])) {
        continue;
      }

      const nif = nifExpression.exec(footerLines[index])?.[1];
      const year = /^(20\d{2})$/.exec(footerLines[index + 2])?.[1];
      if (nif && year && this.isPlausibleCompanyName(footerLines[index + 1])) {
        return {
          nif,
          companyName: this.cleanCompanyName(footerLines[index + 1]),
          year,
          period: '0A',
        };
      }
    }

    return null;
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
      const inlineMatch = /^Mod\s*elo\s+([A-Z0-9-]{1,8})(?:\s|$)/i.exec(lines[index]);
      if (inlineMatch?.[1]) {
        return inlineMatch[1];
      }

      if (/^Mod\s*elo$/i.test(lines[index])) {
        const nextLineModel = this.extractLeadingModelToken(lines[index + 1] ?? '');
        if (nextLineModel) {
          return nextLineModel;
        }
      }
    }

    return this.valueAfterLabel(normalized, ['Modelo'], '([A-Z0-9-]{1,8})');
  }

  private extractLeadingModelToken(line: string): string {
    const numericModel = /^(\d(?:\s*\d){2,3})\b/.exec(line);
    if (numericModel?.[1]) {
      return numericModel[1].replace(/\s+/g, '');
    }

    return /^([A-Z0-9-]{1,8})(?:\s|$)/i.exec(line)?.[1] ?? '';
  }

  private extractFilingDate(text: string): string {
    const match = new RegExp(
      `${PRESENTACION_LABEL} realizada el\\s*:\\s*(\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4})(?:\\s+a las\\s+(\\d{1,2}:\\d{2}(?::\\d{2})?))?`,
      'i',
    ).exec(text);
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

  private extractFooterLines(lines: readonly string[]): string[] {
    let ministryIndex = -1;
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (/^MINISTERIO$/i.test(lines[index])) {
        ministryIndex = index;
        break;
      }
    }

    if (ministryIndex === -1) {
      return [...lines];
    }

    const startIndex = /^DE HACIENDA$/i.test(lines[ministryIndex + 1] ?? '')
      ? ministryIndex + 2
      : ministryIndex + 1;
    return lines.slice(startIndex);
  }

  private parseNifAndCompanyLine(line: string): Pick<DeclarationRow, 'nif' | 'companyName'> | null {
    const match = new RegExp(`^(${SPANISH_NIF_PATTERN})\\s+(.+)$`, 'i').exec(line);
    if (!match?.[1] || !this.isPlausibleCompanyName(match[2])) {
      return null;
    }

    return {
      nif: match[1],
      companyName: this.cleanCompanyName(match[2]),
    };
  }

  private extractYearAndPeriod(
    lines: readonly string[],
    startIndex: number,
    fallbackPeriod: string,
  ): Pick<DeclarationRow, 'year' | 'period'> | null {
    const sameLine = this.parseYearPeriodLine(lines[startIndex] ?? '');
    if (sameLine) {
      return sameLine;
    }

    const year = /^(20\d{2})$/.exec(lines[startIndex] ?? '')?.[1];
    if (!year) {
      return null;
    }

    if (fallbackPeriod) {
      return { year, period: fallbackPeriod };
    }

    const period = new RegExp(`^(${PERIOD_TOKEN_PATTERN})$`, 'i').exec(
      lines[startIndex + 1] ?? '',
    )?.[1];
    return period ? { year, period } : null;
  }

  private findYearPeriodLineIndex(
    lines: readonly string[],
    startIndex: number,
    endIndex: number,
  ): number {
    for (let index = startIndex; index <= endIndex && index < lines.length; index += 1) {
      if (this.parseYearPeriodLine(lines[index])) {
        return index;
      }
    }
    return -1;
  }

  private parseYearPeriodLine(line: string): Pick<DeclarationRow, 'year' | 'period'> | null {
    const match = new RegExp(`^(20\\d{2})\\s+(${PERIOD_TOKEN_PATTERN})$`, 'i').exec(line);
    return match ? { year: match[1], period: match[2] } : null;
  }

  private defaultPeriodForModel(model: string): string {
    return ['180', '200', '347', '390'].includes(model) ? '0A' : '';
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
