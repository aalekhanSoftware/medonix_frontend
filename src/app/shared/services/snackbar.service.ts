import { Injectable } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '../components/custom-snackbar/custom-snackbar.component';

@Injectable({
  providedIn: 'root'
})
export class SnackbarService {
  private config: MatSnackBarConfig = {
    duration: 4000,
    horizontalPosition: 'right',
    verticalPosition: 'top',
    panelClass: ['custom-snackbar-container'],
    announcementMessage: '',
  };

  private currentSnackBar?: any;

  constructor(private snackBar: MatSnackBar) {}

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  warning(message: string): void {
    this.show(message, 'warning');
  }

  private show(message: string, type: 'success' | 'error' | 'info' | 'warning'): void {
    // Dismiss any existing snackbar
    if (this.currentSnackBar) {
      this.currentSnackBar.dismiss();
    }

    // Open new snackbar
    this.currentSnackBar = this.snackBar.openFromComponent(CustomSnackbarComponent, {
      ...this.config,
      data: { message, type }
    });
  }
} 