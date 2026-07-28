import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';

export type SupportedLanguage = 'es' | 'en';

export interface TranslationMessage {
  readonly key: TranslationKey;
  readonly params?: Readonly<Record<string, string | number>>;
}

const LANGUAGE_STORAGE_KEY = 'a3-docs-verifier.language';

const TRANSLATIONS = {
  es: {
    'app.title': 'Conciliador A3-AEAT',
    'language.label': 'Idioma',
    'language.es': 'Español',
    'language.en': 'English',
    'language.switchTo': 'Cambiar a Ingles',
    'theme.useLight': 'Usar tema claro',
    'theme.useDark': 'Usar tema oscuro',
    'dashboard.eyebrow': 'CONCILIACION OFFLINE',
    'dashboard.title': 'Comprueba presentaciones de A3',
    'dashboard.subtitle':
      'Compara el reporte de A3 con los justificantes oficiales de la AEAT. Tus documentos se leen localmente y no se modifican.',
    'dashboard.csvTitle': 'Reporte de A3',
    'dashboard.noCsv': 'Ningun archivo CSV seleccionado',
    'dashboard.browseCsv': 'Examinar CSV',
    'dashboard.pdfTitle': 'Carpeta o archivos PDF',
    'dashboard.noPdf': 'Ningun PDF seleccionado',
    'dashboard.pdfCount': '{count} PDF seleccionado(s)',
    'dashboard.folder': 'Carpeta',
    'dashboard.multiplePdf': 'Varios PDF',
    'dashboard.process': 'Comprobar presentaciones',
    'dashboard.reconcilingLabel': 'Conciliando documentos',
    'dashboard.reconciling': 'Conciliacion en curso',
    'dashboard.readyTitle': 'Listo para conciliar',
    'dashboard.readyText':
      'Selecciona un CSV de A3 y una carpeta de justificantes oficiales de la AEAT para empezar.',
    'dashboard.footer': 'Procesamiento local - Sin telemetria - Los documentos no se modifican',
    'dashboard.error.csvType': 'Selecciona un archivo CSV.',
    'dashboard.error.noTopLevelPdf': 'La carpeta seleccionada no contiene PDF en su primer nivel.',
    'dashboard.error.noCsv': 'Selecciona primero el archivo CSV de A3.',
    'dashboard.error.noPdf': 'Selecciona primero una carpeta con justificantes PDF.',
    'dashboard.error.fallback': 'No se pudo completar la conciliacion.',
    'dashboard.csvWarnings': 'Se detectaron {count} aviso(s) en filas del CSV.',
    'common.dismiss': 'Cerrar',
    'common.notFound': 'No encontrado',
    'common.notAvailable': 'No disponible',
    'results.total': 'Registros A3',
    'results.matches': 'Coincidencias',
    'results.noPdfReceipts': 'Sin coincidencias',
    'results.title': 'Resultados',
    'results.subtitle': 'Abre una fila para ver la explicacion completa.',
    'results.filterLabel': 'Filtrar resultados',
    'results.filterAria': 'Filtrar resultados de conciliacion',
    'results.statusLabel': 'Estado',
    'results.statusAria': 'Filtrar resultados por estado',
    'results.allStatuses': 'Todos los estados',
    'results.tableAria': 'Resultados de conciliacion',
    'results.nif': 'NIF',
    'results.model': 'Modelo',
    'results.period': 'Periodo',
    'results.companyName': 'Razon social',
    'results.filingDate': 'Fecha de presentacion',
    'results.pdf': 'PDF',
    'results.status': 'Estado',
    'results.explanation': 'Explicacion de la incidencia',
    'results.actions': 'Acciones',
    'results.details': 'Detalles',
    'results.openPdfAria': 'Abrir {fileName}',
    'results.noMatches': 'Ningun resultado coincide con los filtros actuales.',
    'results.pages': 'Paginas de resultados',
    'status.Matches': 'Coincide',
    'status.No PDF receipt': 'Sin justificante PDF',
    'status.Manual review': 'Revision manual',
    'details.title': 'Detalles de conciliacion',
    'details.explanation': 'Explicacion',
    'details.warning': 'Aviso:',
    'details.suggestion': 'Sugerencia:',
    'details.openPdf': 'Abrir justificante PDF',
    'details.close': 'Cerrar',
    'reconciliation.explanation.noPdf':
      'El registro de A3 no tiene un justificante PDF con la misma clave exacta.',
    'reconciliation.explanation.matches':
      'El registro de A3 tiene al menos un justificante PDF con la misma clave exacta.',
    'reconciliation.explanation.incompleteA3':
      'Al registro de A3 le falta NIF, modelo o un periodo con año, por lo que no se puede conciliar automaticamente.',
    'reconciliation.explanation.incompletePdf':
      'Al PDF le falta NIF, modelo o un periodo con año, por lo que no se puede conciliar automaticamente.',
    'reconciliation.explanation.incompletePdfWithExtraction':
      'Al PDF le falta NIF, modelo o un periodo con año, por lo que no se puede conciliar automaticamente. La extraccion de texto fallo: {message}',
    'reconciliation.warning.companyNameDiffers':
      'La razon social no coincide: A3 "{a3CompanyName}"; PDF "{pdfCompanyName}".',
    'reconciliation.warning.duplicatedPdfs':
      'Hay {count} justificantes PDF con la misma clave: {fileNames}.',
    'reconciliation.suggestion.nameOnly':
      'Posible coincidencia en {origin} solo por nombre: {descriptor}.',
    'reconciliation.csv.rowWarning': 'Fila {row}: {message}',
    'reconciliation.error.csvRead': 'No se pudo leer el CSV: {message}',
    'reconciliation.error.missingColumns': 'Faltan columnas obligatorias del CSV: {columns}.',
    'reconciliation.error.invalidCsv': 'CSV no valido: {message}',
    'reconciliation.error.pdfUnknown': 'Error desconocido al leer el PDF',
  },
  en: {
    'app.title': 'A3-AEAT Reconciler',
    'language.label': 'Language',
    'language.es': 'Español',
    'language.en': 'English',
    'language.switchTo': 'Switch to Spanish',
    'theme.useLight': 'Use light theme',
    'theme.useDark': 'Use dark theme',
    'dashboard.eyebrow': 'OFFLINE RECONCILIATION',
    'dashboard.title': 'Verify A3 filings',
    'dashboard.subtitle':
      'Compare the A3 report with official AEAT receipts. Your documents are read locally and are not modified.',
    'dashboard.csvTitle': 'A3 report',
    'dashboard.noCsv': 'No CSV file selected',
    'dashboard.browseCsv': 'Browse CSV',
    'dashboard.pdfTitle': 'Folder or PDF files',
    'dashboard.noPdf': 'No PDFs selected',
    'dashboard.pdfCount': '{count} PDF(s) selected',
    'dashboard.folder': 'Folder',
    'dashboard.multiplePdf': 'Multiple PDFs',
    'dashboard.process': 'Verify filings',
    'dashboard.reconcilingLabel': 'Reconciling documents',
    'dashboard.reconciling': 'Reconciliation in progress',
    'dashboard.readyTitle': 'Ready to reconcile',
    'dashboard.readyText': 'Select one A3 CSV and a folder of official AEAT PDF receipts to begin.',
    'dashboard.footer': 'Local processing - No telemetry - Documents are not modified',
    'dashboard.error.csvType': 'Select a CSV file.',
    'dashboard.error.noTopLevelPdf': 'The selected folder contains no PDF files at its top level.',
    'dashboard.error.noCsv': 'Select the A3 CSV file first.',
    'dashboard.error.noPdf': 'Select a folder containing PDF receipts first.',
    'dashboard.error.fallback': 'The reconciliation could not be completed.',
    'dashboard.csvWarnings': '{count} CSV row warning(s) detected.',
    'common.dismiss': 'Dismiss',
    'common.notFound': 'Not found',
    'common.notAvailable': 'Not available',
    'results.total': 'A3 records',
    'results.matches': 'Matches',
    'results.noPdfReceipts': 'No Matching',
    'results.title': 'Results',
    'results.subtitle': 'Open a row for its complete explanation.',
    'results.filterLabel': 'Filter results',
    'results.filterAria': 'Filter reconciliation results',
    'results.statusLabel': 'Status',
    'results.statusAria': 'Filter results by status',
    'results.allStatuses': 'All statuses',
    'results.tableAria': 'Reconciliation results',
    'results.nif': 'NIF',
    'results.model': 'Model',
    'results.period': 'Period',
    'results.companyName': 'Company name',
    'results.filingDate': 'Filing date',
    'results.pdf': 'PDF',
    'results.status': 'Status',
    'results.explanation': 'Incident explanation',
    'results.actions': 'Actions',
    'results.details': 'Details',
    'results.openPdfAria': 'Open {fileName}',
    'results.noMatches': 'No results match the current filters.',
    'results.pages': 'Results pages',
    'status.Matches': 'Matches',
    'status.No PDF receipt': 'No PDF receipt',
    'status.Manual review': 'Manual review',
    'details.title': 'Reconciliation details',
    'details.explanation': 'Explanation',
    'details.warning': 'Warning:',
    'details.suggestion': 'Suggestion:',
    'details.openPdf': 'Open PDF receipt',
    'details.close': 'Close',
    'reconciliation.explanation.noPdf': 'The A3 record has no PDF receipt with the same exact key.',
    'reconciliation.explanation.matches':
      'The A3 record has at least one PDF receipt with the same exact key.',
    'reconciliation.explanation.incompleteA3':
      'The A3 record is missing NIF, model, or a period with year, so it cannot be matched automatically.',
    'reconciliation.explanation.incompletePdf':
      'The PDF is missing NIF, model, or a period with year, so it cannot be matched automatically.',
    'reconciliation.explanation.incompletePdfWithExtraction':
      'The PDF is missing NIF, model, or a period with year, so it cannot be matched automatically. Text extraction failed: {message}',
    'reconciliation.warning.companyNameDiffers':
      'Company name differs: A3 "{a3CompanyName}"; PDF "{pdfCompanyName}".',
    'reconciliation.warning.duplicatedPdfs':
      '{count} PDF receipts share the same key: {fileNames}.',
    'reconciliation.suggestion.nameOnly': 'Possible {origin} match by name only: {descriptor}.',
    'reconciliation.csv.rowWarning': 'Row {row}: {message}',
    'reconciliation.error.csvRead': 'The CSV could not be read: {message}',
    'reconciliation.error.missingColumns': 'Missing required CSV columns: {columns}.',
    'reconciliation.error.invalidCsv': 'Invalid CSV: {message}',
    'reconciliation.error.pdfUnknown': 'Unknown PDF parsing error',
  },
} as const;

export type TranslationKey = keyof (typeof TRANSLATIONS)['en'];

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly languages = [
    { code: 'es' as const, labelKey: 'language.es' as const },
    { code: 'en' as const, labelKey: 'language.en' as const },
  ];

  private readonly document = inject(DOCUMENT);
  private readonly selectedLanguage = signal<SupportedLanguage>(this.resolveInitialLanguage());

  readonly language = computed(() => this.selectedLanguage());

  constructor() {
    effect(() => {
      const language = this.selectedLanguage();
      this.document.documentElement.lang = language;
      this.storage?.setItem(LANGUAGE_STORAGE_KEY, language);
    });
  }

  setLanguage(language: SupportedLanguage): void {
    this.selectedLanguage.set(language);
  }

  t(key: TranslationKey, params: Readonly<Record<string, string | number>> = {}): string {
    const template = TRANSLATIONS[this.selectedLanguage()][key] ?? TRANSLATIONS.en[key];
    return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
  }

  message(message: TranslationMessage | null | undefined): string {
    return message ? this.t(message.key, message.params) : '';
  }

  private resolveInitialLanguage(): SupportedLanguage {
    const storedLanguage = this.storage?.getItem(LANGUAGE_STORAGE_KEY);
    if (this.isSupportedLanguage(storedLanguage)) {
      return storedLanguage;
    }

    const browserLanguage = this.document.defaultView?.navigator.language.toLowerCase();
    return browserLanguage?.startsWith('en') ? 'en' : 'es';
  }

  private isSupportedLanguage(language: string | null | undefined): language is SupportedLanguage {
    return language === 'es' || language === 'en';
  }

  private get storage(): Storage | null {
    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }
}
