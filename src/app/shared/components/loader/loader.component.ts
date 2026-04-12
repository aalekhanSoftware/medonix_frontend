import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loader',
  template: `
    <div class="loader-overlay" *ngIf="show">
      <div class="loader-content">
        <i class="fas fa-spinner fa-spin"></i>
        <span *ngIf="message">{{ message }}</span>
      </div>
    </div>
  `,
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./loader.component.scss']
})
export class LoaderComponent {
  @Input() show: boolean = false;
  @Input() message?: string;
} 