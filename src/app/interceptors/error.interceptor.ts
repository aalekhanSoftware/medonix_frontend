import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  private isRefreshing = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        // Skip token refresh for login and refresh-token endpoints
        const isAuthEndpoint = request.url.includes('/login') || 
                               request.url.includes('refresh-token') ||
                               request.url.includes('/auth/');
        
        if (error.status === 401 && !isAuthEndpoint) {
          return this.handle401Error(request, next);
        }
        return throwError(() => error);
      })
    );
  }

  private handle401Error(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;

      return this.authService.refreshToken().pipe(
        switchMap(response => {
          this.isRefreshing = false;
          // Clone the request with new token
          const newRequest = request.clone({
            setHeaders: {
              Authorization: `Bearer ${response.data.token}`
            }
          });
          return next.handle(newRequest);
        }),
        catchError(error => {
          this.isRefreshing = false;
          this.authService.logout();
          // Force hard refresh to bypass all cache like Ctrl+Shift+F5
          window.location.href = window.location.origin + '/login?_t=' + new Date().getTime();
          return throwError(() => error);
        })
      );
    }
    return next.handle(request);
  }
} 