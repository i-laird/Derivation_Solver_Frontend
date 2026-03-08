import { Component, Input, OnChanges } from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { DerivativeResponse } from '../../../../models/derivative-response.model';

@Component({
  selector: 'app-results',
  standalone: false,
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss'],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(12px)' }),
        animate('250ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class ResultsComponent implements OnChanges {
  @Input() result: DerivativeResponse | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;

  hasContent = false;
  copied = false;

  ngOnChanges(): void {
    this.hasContent = !!(this.result || this.error);
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.copied = true;
      setTimeout(() => this.copied = false, 2000);
    });
  }
}
