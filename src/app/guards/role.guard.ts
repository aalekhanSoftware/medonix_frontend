import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SnackbarService } from '../shared/services/snackbar.service';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {
  constructor(
    private authService: AuthService, 
    private router: Router,
    private snackbarService: SnackbarService
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    const requiredRoles = route.data['roles'] as Array<string>;
    
    // If no roles are required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    
    // Check if user has any of the required roles
    const hasRequiredRole = requiredRoles.some(role => 
      this.authService.hasRole(role)
    );

    if (!hasRequiredRole) {
      // Show error message
      this.snackbarService.error('You do not have permission to access this page.');
      
      // Redirect to appropriate page based on user's role
      const defaultRoute = this.authService.getDefaultRoute();
      this.router.navigate([defaultRoute]);
      
      return false;
    }

    return true;
  }
} 