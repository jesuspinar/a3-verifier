import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { I18nService } from './shared/services/i18n.service';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('a3-docs-verifier.language', 'es');

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-toolbar')?.textContent).toContain('Conciliador A3-AEAT');
  });

  it('should switch rendered text to English', async () => {
    const fixture = TestBed.createComponent(App);
    const i18n = TestBed.inject(I18nService);

    i18n.setLanguage('en');
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-toolbar')?.textContent).toContain('A3-AEAT Reconciler');
  });
});
