import { Injectable } from '@angular/core';
import { Router, CanActivate } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(): boolean {
    if (!this.authService.isAuthenticated()) {
      this.authService.logout();
      // Force hard refresh to bypass all cache like Ctrl+Shift+F5
      window.location.href = window.location.origin + '/login?_t=' + new Date().getTime();
      return false;
    }
    return true;
  }
}