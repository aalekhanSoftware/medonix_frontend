import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { animate, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-custom-snackbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="custom-snackbar" [ngClass]="data.type" [@slideIn]>
      <div class="snackbar-content">
        <div class="message-container">
          <i class="status-icon"></i>
          <span class="message">{{ data.message }}</span>
        </div>
        <button class="close-button" (click)="close()">×</button>
      </div>
    </div>
  `,
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
      ])
    ])
  ],
  styles: [`
    .custom-snackbar {
      padding: 16px;
      border-radius: 12px;
      min-width: 300px;
      max-width: 500px;
      margin: 0;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.15);
      backdrop-filter: blur(10px);
      position: relative;
      right: 0;
      z-index: 1020;
    }

    .snackbar-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: white;
      font-weight: 500;
    }

    .message-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .status-icon {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: inline-block;
      position: relative;
    }

    .status-icon::before {
      content: '';
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background-color: rgba(255, 255, 255, 0.2);
    }

    .message {
      font-size: 14px;
      line-height: 1.4;
      font-weight: 500;
      letter-spacing: 0.2px;
    }

    .close-button {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      margin-left: 16px;
      opacity: 0.8;
      transition: all 0.2s ease;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
    }

    .close-button:hover {
      opacity: 1;
      background-color: rgba(255, 255, 255, 0.1);
    }

    .success {
      background-color: var(--accent2);
      border-left: 4px solid #458656;
    }

    .error {
      background-color: #dc3545;
      border-left: 4px solid #b02a37;
    }

    .info {
      background-color: var(--primary);
      border-left: 4px solid #e66411;
    }

    .warning {
      background-color: var(--accent1);
      border-left: 4px solid #e6b43e;
    }

    @media (max-width: 576px) {
      .custom-snackbar {
        min-width: calc(100% - 40px);
        margin: 0;
      }

      .message {
        font-size: 13px;
      }
    }

    @media (min-width: 577px) and (max-width: 1024px) {
      .custom-snackbar {
        min-width: 320px;
      }
    }
  `]
})
export class CustomSnackbarComponent implements OnInit {
  constructor(
    @Inject(MAT_SNACK_BAR_DATA) public data: { message: string; type: 'success' | 'error' | 'info' | 'warning' },
    private snackBarRef: MatSnackBarRef<CustomSnackbarComponent>
  ) {}

  ngOnInit(): void {}

  close(): void {
    this.snackBarRef.dismiss();
  }
} 