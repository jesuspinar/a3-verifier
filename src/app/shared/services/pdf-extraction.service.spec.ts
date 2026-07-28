import { PdfExtractionService } from './pdf-extraction.service';

const pdfJsMocks = vi.hoisted(() => ({
  documentCleanup: vi.fn(() => Promise.resolve()),
  documentDestroy: vi.fn(() => Promise.resolve()),
  getDocument: vi.fn(),
  getPage: vi.fn(),
  getTextContent: vi.fn(),
  loadingDestroy: vi.fn(() => Promise.resolve()),
  pageCleanup: vi.fn(),
}));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: pdfJsMocks.getDocument,
}));

const COMPANY_WORDS = [
  'ALFA',
  'BRAVO',
  'DELTA',
  'GESTION',
  'IBERICA',
  'INNOVA',
  'NORTE',
  'SERVICIOS',
  'TECNICA',
  'VECTOR',
];
const NIF_PREFIXES = ['A', 'B', 'C', 'F', 'G'];
const DNI_SUFFIXES = ['R', 'S', 'T', 'V', 'W', 'X'];

interface RandomDeclarationData {
  nif: string;
  presenterNif: string;
  model: string;
  unrelatedModel: string;
  year: string;
  quarter: string;
  companyName: string;
  presenterName: string;
  filingDate: string;
  filingTime: string;
}

function randomDeclarationData(): RandomDeclarationData {
  const model = randomDigits(3);
  let unrelatedModel = randomDigits(3);
  while (unrelatedModel === model) {
    unrelatedModel = randomDigits(3);
  }

  return {
    nif: `${randomItem(NIF_PREFIXES)}${randomDigits(8)}`,
    presenterNif: `${randomDigits(8)}${randomItem(DNI_SUFFIXES)}`,
    model,
    unrelatedModel,
    year: String(randomInt(2020, 2029)),
    quarter: `${randomInt(1, 4)}T`,
    companyName: `${randomCompanyWords(3)} S L`,
    presenterName: `${randomCompanyWords(2)} REPRESENTANTE`,
    filingDate: `${pad2(randomInt(1, 28))}-${pad2(randomInt(1, 12))}-${randomInt(2020, 2029)}`,
    filingTime: `${pad2(randomInt(0, 23))}:${pad2(randomInt(0, 59))}:${pad2(randomInt(0, 59))}`,
  };
}

function randomCompanyWords(count: number): string {
  const words = new Set<string>();
  while (words.size < count) {
    words.add(randomItem(COMPANY_WORDS));
  }
  return [...words].join(' ');
}

function randomDigits(length: number): string {
  return Array.from({ length }, () => randomInt(0, 9)).join('');
}

function randomItem<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function expectedFilingDate(value: string): string {
  return value.replace(/-/g, '/');
}

describe('PdfExtractionService', () => {
  let service: PdfExtractionService;

  beforeEach(() => {
    service = new PdfExtractionService();
    vi.clearAllMocks();
  });

  it('extracts declaration fields from AEAT PDFs when labels and values are separated', () => {
    const data = randomDeclarationData();
    const text = `
      INFORMACIÓN DE LA PRESENTACIÓN DE LA DECLARACIÓN
      Modelo ${data.model}
      Registro
      Presentación realizada el:   ${data.filingDate} a las ${data.filingTime}
      Presentador
      NIF Presentador:   ${data.presenterNif}
      Apellidos y Nombre / Razón social:   ${data.presenterName}

      Ejercicio   Período
      Modelo
      ${data.model}
      NIF   Apellidos y nombre o Razón social
      Número justificante: ${data.model}${randomDigits(10)}
      ${data.nif}   ${data.companyName}
      ${data.year}   ${data.quarter}
    `;

    expect(service.extractFields(text)).toEqual({
      nif: data.nif,
      model: data.model,
      year: data.year,
      period: `${data.quarter}/${data.year}`,
      companyName: data.companyName,
      filingDate: expectedFilingDate(data.filingDate),
    });
  });

  it('formats filing dates as dd/MM/yyyy', () => {
    const data = randomDeclarationData();
    const fields = service.extractFields(`
      Fecha de registro: 1.2.2024 3:04
      ${data.nif} ${data.companyName}
      ${data.year} ${data.quarter}
    `);

    expect(fields.filingDate).toBe('01/02/2024');
  });

  it('does not treat presenter metadata as declaration data', () => {
    const data = randomDeclarationData();
    const fields = service.extractFields(`
      Presentación realizada el: ${data.filingDate} a las ${data.filingTime}
      NIF Presentador: ${data.presenterNif}
      Apellidos y Nombre / Razón social: ${data.presenterName}
      ${data.nif} ${data.companyName}
      ${data.year} ${data.quarter}
    `);

    expect(fields.nif).toBe(data.nif);
    expect(fields.companyName).toBe(data.companyName);
  });

  it('does not match model inside unrelated plural text', () => {
    const data = randomDeclarationData();
    const fields = service.extractFields(`
      Casilla 36 de todos los modelos ${data.unrelatedModel} correspondientes.
      Modelo ${data.model}
      ${data.nif} ${data.companyName}
      ${data.year} ${data.quarter}
    `);

    expect(fields.model).toBe(data.model);
  });

  it('releases pdf.js page and document resources after extracting a PDF', async () => {
    const data = randomDeclarationData();
    pdfJsMocks.getTextContent.mockResolvedValue({
      items: [
        { str: `Modelo ${data.model}`, hasEOL: true },
        { str: `${data.nif} ${data.companyName}`, hasEOL: true },
        { str: `${data.year} ${data.quarter}`, hasEOL: true },
      ],
    });
    pdfJsMocks.getPage.mockResolvedValue({
      cleanup: pdfJsMocks.pageCleanup,
      getTextContent: pdfJsMocks.getTextContent,
    });
    pdfJsMocks.getDocument.mockReturnValue({
      destroy: pdfJsMocks.loadingDestroy,
      promise: Promise.resolve({
        cleanup: pdfJsMocks.documentCleanup,
        destroy: pdfJsMocks.documentDestroy,
        getPage: pdfJsMocks.getPage,
        numPages: 1,
      }),
    });

    const receipt = await service.extract(new File(['pdf'], 'receipt.pdf'), 7);

    expect(receipt).toEqual({
      id: 'pdf-7-receipt.pdf',
      nif: data.nif,
      model: data.model,
      period: `${data.quarter}/${data.year}`,
      companyName: data.companyName,
      filingDate: '',
      fileName: 'receipt.pdf',
      extractionWarning: undefined,
    });
    expect(pdfJsMocks.pageCleanup).toHaveBeenCalledOnce();
    expect(pdfJsMocks.documentCleanup).toHaveBeenCalledOnce();
    expect(pdfJsMocks.documentDestroy).toHaveBeenCalledOnce();
    expect(pdfJsMocks.loadingDestroy).not.toHaveBeenCalled();
  });

  it('releases pdf.js resources when text extraction fails', async () => {
    pdfJsMocks.getTextContent.mockRejectedValue(new Error('Cannot read page text'));
    pdfJsMocks.getPage.mockResolvedValue({
      cleanup: pdfJsMocks.pageCleanup,
      getTextContent: pdfJsMocks.getTextContent,
    });
    pdfJsMocks.getDocument.mockReturnValue({
      destroy: pdfJsMocks.loadingDestroy,
      promise: Promise.resolve({
        cleanup: pdfJsMocks.documentCleanup,
        destroy: pdfJsMocks.documentDestroy,
        getPage: pdfJsMocks.getPage,
        numPages: 1,
      }),
    });

    const receipt = await service.extract(new File(['pdf'], 'receipt.pdf'), 3);

    expect(receipt.extractionWarning).toBe('Cannot read page text');
    expect(pdfJsMocks.pageCleanup).toHaveBeenCalledOnce();
    expect(pdfJsMocks.documentCleanup).toHaveBeenCalledOnce();
    expect(pdfJsMocks.documentDestroy).toHaveBeenCalledOnce();
  });
});
