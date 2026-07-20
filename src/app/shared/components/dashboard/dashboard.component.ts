import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatDividerModule } from '@angular/material/divider';
import { I18nService } from '../../services/i18n.service';
import { ReconciliationService } from '../../services/reconciliation.service';
import { ResultsComponent } from '../results/results.component';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';

type ThemeMode = 'auto' | 'light' | 'dark';

@Component({
  selector: 'app-dashboard',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatProgressBarModule,
    MatToolbarModule,
    MatDividerModule,
    LanguageSelectorComponent,
    ResultsComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly i18n = inject(I18nService);
  readonly reconciliation = inject(ReconciliationService);
  readonly themeMode = signal<ThemeMode>('auto');
  readonly systemPrefersDark = signal(false);
  readonly darkTheme = computed(
    () => this.themeMode() === 'dark' || (this.themeMode() === 'auto' && this.systemPrefersDark()),
  );
  readonly csvFile = signal<File | null>(null);
  readonly pdfFiles = signal<readonly File[]>([]);

  private readonly destroyRef = inject(DestroyRef);
  private readonly snackBar = inject(MatSnackBar);
  private readonly document = inject(DOCUMENT);

  constructor() {
    effect(() => {
      const mode = this.themeMode();
      this.document.documentElement.classList.toggle('light-theme', mode === 'light');
      this.document.documentElement.classList.toggle('dark-theme', mode === 'dark');
    });

    const colorSchemeQuery = this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)');
    if (colorSchemeQuery) {
      this.systemPrefersDark.set(colorSchemeQuery.matches);
      const syncSystemColorScheme = (event: MediaQueryListEvent) =>
        this.systemPrefersDark.set(event.matches);
      colorSchemeQuery.addEventListener('change', syncSystemColorScheme);
      this.destroyRef.onDestroy(() =>
        colorSchemeQuery.removeEventListener('change', syncSystemColorScheme),
      );
    }
  }

  selectCsv(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file && !file.name.toLowerCase().endsWith('.csv')) {
      this.csvFile.set(null);
      this.showError(this.i18n.t('dashboard.error.csvType'));
      return;
    }
    this.csvFile.set(file);
  }

  selectFolder(event: Event): void {
    const input = event.target as HTMLInputElement;
    const allFiles = Array.from(input.files ?? []);
    const directPdfFiles = allFiles.filter((file) => {
      const relativeParts = file.webkitRelativePath
        ? file.webkitRelativePath.split('/')
        : [file.name];
      return relativeParts.length <= 2 && file.name.toLowerCase().endsWith('.pdf');
    });
    this.pdfFiles.set(directPdfFiles);
    if (!directPdfFiles.length) {
      this.showError(this.i18n.t('dashboard.error.noTopLevelPdf'));
    }
  }

  async process(): Promise<void> {
    const csv = this.csvFile();
    if (!csv) {
      this.showError(this.i18n.t('dashboard.error.noCsv'));
      return;
    }
    if (!this.pdfFiles().length) {
      this.showError(this.i18n.t('dashboard.error.noPdf'));
      return;
    }
    try {
      await this.reconciliation.process(csv, this.pdfFiles());
      if (this.reconciliation.csvWarnings().length) {
        this.snackBar.open(
          this.i18n.t('dashboard.csvWarnings', {
            count: this.reconciliation.csvWarnings().length,
          }),
          this.i18n.t('common.dismiss'),
          {
            duration: 6000,
          },
        );
      }
    } catch {
      this.showError(this.reconciliation.error() ?? this.i18n.t('dashboard.error.fallback'));
    }
  }

  toggleTheme(): void {
    this.themeMode.set(this.darkTheme() ? 'light' : 'dark');
  }

  private showError(message: string): void {
    console.log('Error:', message);
    this.snackBar.open(message, this.i18n.t('common.dismiss'), {
      duration: 6000,
      politeness: 'assertive',
    });
  }
}
