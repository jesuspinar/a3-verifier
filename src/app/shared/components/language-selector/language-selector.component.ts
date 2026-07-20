import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { I18nService } from '../../services/i18n.service';
import type { SupportedLanguage } from '../../services/i18n.service';

@Component({
  selector: 'app-language-selector',
  imports: [MatButtonModule, MatTooltipModule],
  templateUrl: './language-selector.component.html',
  styleUrl: './language-selector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSelectorComponent {
  readonly i18n = inject(I18nService);

  nextLanguage(): SupportedLanguage {
    return this.i18n.language() === 'es' ? 'en' : 'es';
  }

  toggleLanguage(): void {
    this.i18n.setLanguage(this.nextLanguage());
  }
}
