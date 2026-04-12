import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { RoleService, MenuPermissions } from '../../../services/role.service';
import { UserService } from '../../../services/user.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { Subscription, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit, OnDestroy {
  isAuthenticated: boolean = false;
  showMasterMenu: boolean = false;
  showTransactionMenu: boolean = false;
  showQuotationMenu: boolean = false;
  showDispatchQuotationMenu: boolean = false;
  showPendingItemMenu: boolean = false;
  showEmployeeMenu: boolean = false;
  isMobileMenuOpen: boolean = false;
  clientName: string = '';
  clientLogoImage: string | null = null;
  private authSubscription: Subscription;
  private destroy$ = new Subject<void>();
  permissions: MenuPermissions = {
    canViewCategory: false,
    canViewProduct: false,
    canViewCustomer: false,
    canViewLedger: false,
    canViewEmployee: false,
    canViewMachine: false,
    canViewTransport: false,
    canViewCustomerPrice: false,
    canViewBrand: false,
    canViewUser: false,
    canViewEnquiry: false,
    canViewFollowup: false,
    canViewPayment: false,
    canViewPurchase: false,
    canViewPurchaseReturn: false,
    canViewSale: false,
    canViewSaleReturn: false,
    canViewQuotation: false,
    canViewPendingItem: false,
    canViewDispatchQuotation: false,
    canViewEmployeeWithdraw: false,
    canViewAttendance: false,
    canViewAllAttendance: false,
    canViewEmployeeOrder: false,
    canViewBatch: false
  };

  constructor(
    private authService: AuthService,
    private roleService: RoleService,
    private router: Router,
    private userService: UserService,
    private encryptionService: EncryptionService
  ) {
    this.authSubscription = this.authService.authState$.subscribe(
      (isAuthenticated) => {
        this.isAuthenticated = isAuthenticated;
        if (isAuthenticated) {
          this.permissions = this.roleService.getMenuPermissions();
          this.loadCurrentUser();
        }
      }
    );
  }

  ngOnInit(): void {
    this.authService.authState$.subscribe(
      state => {
        this.isAuthenticated = state;
        
        if (state) {
          this.permissions = this.roleService.getMenuPermissions();
          this.loadCurrentUser();
        }
        
        // Check if user is authenticated but roles are missing
        if (this.isAuthenticated && !localStorage.getItem('userRoles')) {
          this.authService.logout();
        }
      }
    );

    // Load client name from localStorage if available
    this.loadClientNameFromStorage();
  }

  loadCurrentUser(): void {
    // Check if we already have encrypted user data in localStorage
    const encryptedUserData = localStorage.getItem('encryptedUserData');
    if (encryptedUserData) {
      this.loadClientNameFromStorage();
      return;
    }

    // Fetch current user data from API
    this.userService.getCurrentUser()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            // Encrypt the entire response and save to localStorage
            // The encrypt method expects a string and will JSON.stringify it
            const responseString = JSON.stringify(response);
            const encrypted = this.encryptionService.encrypt(responseString);
            localStorage.setItem('encryptedUserData', encrypted);
            
            // Extract client logo image and name
            if (response.data.client) {
              // Check if logoImage exists and is not null/empty
              const logoImage = response.data.client.logoImage;
              if (logoImage && logoImage.trim() !== '') {
                this.clientLogoImage = logoImage;
                this.clientName = ''; // Clear client name when logo is available
              } else {
                // If logoImage is null or empty, use client name
                this.clientLogoImage = null;
                if (response.data.client.name) {
                  this.clientName = response.data.client.name;
                }
              }
            }
          }
        },
        error: (error) => {
          console.error('Error loading current user:', error);
        }
      });
  }

  loadClientNameFromStorage(): void {
    const encryptedUserData = localStorage.getItem('encryptedUserData');
    if (encryptedUserData) {
      try {
        // The decrypt method already does JSON.parse, so it returns the parsed object
        const decrypted: any = this.encryptionService.decrypt(encryptedUserData);
        if (decrypted) {
          let userData: any = null;
          
          // Check if decrypted is already an object
          if (typeof decrypted === 'object' && decrypted !== null) {
            userData = decrypted;
          } else if (typeof decrypted === 'string') {
            // If it's still a string, parse it again
            userData = JSON.parse(decrypted);
          }
          
          // Extract client logo image and name
          if (userData && userData.data && userData.data.client) {
            const client = userData.data.client;
            // Check if logoImage exists and is not null/empty
            const logoImage = client.logoImage;
            if (logoImage && logoImage.trim() !== '') {
              this.clientLogoImage = logoImage;
              this.clientName = ''; // Clear client name when logo is available
            } else {
              // If logoImage is null or empty, use client name
              this.clientLogoImage = null;
              if (client.name) {
                this.clientName = client.name;
              }
            }
          }
        }
      } catch (error) {
        console.error('Error decrypting user data:', error);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.dropdown') && !target.closest('.mobile-menu-toggle')) {
      this.showMasterMenu = false;
      this.showTransactionMenu = false;
      this.showQuotationMenu = false;
      this.showDispatchQuotationMenu = false;
      this.showEmployeeMenu = false;
      this.showPendingItemMenu = false;
      if (!target.closest('.nav-links')) {
        this.isMobileMenuOpen = false;
      }
    }
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  toggleMasterMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.showMasterMenu = !this.showMasterMenu;
    this.showTransactionMenu = false;
    this.showQuotationMenu = false;
    this.showDispatchQuotationMenu = false;
    this.showEmployeeMenu = false;
    this.showPendingItemMenu = false;
  }

  toggleTransactionMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.showTransactionMenu = !this.showTransactionMenu;
    this.showMasterMenu = false;
    this.showQuotationMenu = false;
    this.showDispatchQuotationMenu = false;
    this.showEmployeeMenu = false;
    this.showPendingItemMenu = false;
  }

  toggleQuotationMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.showQuotationMenu = !this.showQuotationMenu;
    this.showMasterMenu = false;
    this.showTransactionMenu = false;
    this.showDispatchQuotationMenu = false;
    this.showEmployeeMenu = false;
    this.showPendingItemMenu = false;
  }

  toggleDispatchQuotationMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.showDispatchQuotationMenu = !this.showDispatchQuotationMenu;
    this.showMasterMenu = false;
    this.showTransactionMenu = false;
    this.showQuotationMenu = false;
    this.showEmployeeMenu = false;
    this.showPendingItemMenu = false;
  }

  toggleEmployeeMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.showEmployeeMenu = !this.showEmployeeMenu;
    this.showMasterMenu = false;
    this.showTransactionMenu = false;
    this.showQuotationMenu = false;
    this.showDispatchQuotationMenu = false;
    this.showPendingItemMenu = false;
  }

  isMasterActive(): boolean {
    const currentUrl = this.router.url.split(/[?#]/)[0];
    const matches = (prefix: string) =>
      currentUrl === prefix || currentUrl.startsWith(prefix + '/');
    return (
      matches('/category') ||
      matches('/product') ||
      matches('/customer') ||
      matches('/transport-master') ||
      matches('/customer-price') ||
      matches('/product-batch-stock') ||
      matches('/employee-master') ||
      matches('/expense-master') ||
      matches('/employee-order') ||
      matches('/employee')
    );
  }

  isTransactionActive(): boolean {
    const currentUrl = this.router.url;
    return ['/purchase', '/purchase-challan', '/sale', '/profit', '/daily-profit', '/transaction/reports', '/transaction/chart'].some(path => 
      currentUrl.includes(path)
    );
  }

  isQuotationActive(): boolean {
    const currentUrl = this.router.url;
    return ['/quotation', '/quotation/order'].some(path => 
      currentUrl.includes(path)
    );
  }

  isDispatchQuotationActive(): boolean {
    const currentUrl = this.router.url;
    return ['/quotation/dispatch-list'].some(path => 
      currentUrl.includes(path)
    );
  }

  isEmployeeActive(): boolean {
    const currentUrl = this.router.url;
    return ['/attendance', '/attendance/all', '/employee-withdraw'].some(path => 
      currentUrl.includes(path)
    );
  }

  closeAllMenus(): void {
    this.showMasterMenu = false;
    this.showTransactionMenu = false;
    this.showQuotationMenu = false;
    this.showDispatchQuotationMenu = false;
    this.showEmployeeMenu = false;
    this.showPendingItemMenu = false;
  }

  hasMasterMenuItems(): boolean {
    // Dealers should not see the Master menu
    if (this.authService.hasRole('DEALER')) {
      return false;
    }
    return this.roleService.hasMasterMenuItems();
  }

  hasTransactionMenuItems(): boolean {
    return this.roleService.hasTransactionMenuItems();
  }

  hasDispatchQuotationMenuItems(): boolean {
    return this.roleService.hasDispatchQuotationMenuItems();
  }

  hasEmployeeMenuItems(): boolean {
    return this.roleService.hasEmployeeMenuItems();
  }

  getUserDisplayName(): string {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User';
  }

  getUserRoles(): string {
    const roles = this.authService.getUserRoles();
    return roles.join(', ') || 'No roles';
  }

  logout(): void {
    this.authService.logout();
    // Force hard refresh to bypass all cache like Ctrl+Shift+F5
    window.location.href = window.location.origin + '/login?_t=' + new Date().getTime();
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  isStaffAdmin(): boolean {
    return this.authService.isStaffAdmin();
  }

  isProductManager(): boolean {
    return this.authService.isProductManager();
  }

  canViewMenu(menuType: string): boolean {
    if (this.isAdmin() || this.isStaffAdmin()) return true;
    
    if (this.isProductManager()) {
      switch (menuType) {
        case 'category':
        case 'product':
        case 'quotation':
        case 'attendance':
          return true;
        default:
          return false;
      }
    }
    
    return false;
  }
}