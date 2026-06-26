import { TestBed } from '@angular/core/testing';
import { TransactionLabelService } from './transaction-label.service';
import { AuthService } from '../../services/auth.service';

describe('TransactionLabelService', () => {
  let service: TransactionLabelService;
  let authService: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['hasRole']);
    TestBed.configureTestingModule({
      providers: [
        TransactionLabelService,
        { provide: AuthService, useValue: authService }
      ]
    });
    service = TestBed.inject(TransactionLabelService);
  });

  it('returns text unchanged for non-dealer users', () => {
    authService.hasRole.and.returnValue(false);
    expect(service.swap('Purchase deleted successfully')).toBe('Purchase deleted successfully');
  });

  it('swaps Purchase to Sale for dealer users', () => {
    authService.hasRole.and.returnValue(true);
    expect(service.swap('Purchase')).toBe('Sale');
    expect(service.swap('Add New Purchase')).toBe('Add New Sale');
    expect(service.swap('Purchases')).toBe('Sales');
  });

  it('swaps Sale to Purchase for dealer users', () => {
    authService.hasRole.and.returnValue(true);
    expect(service.swap('Sale')).toBe('Purchase');
    expect(service.swap('Unpaid Sales')).toBe('Unpaid Purchases');
    expect(service.swap('Sales Report')).toBe('Purchases Report');
  });

  it('swaps return phrases without double-swapping', () => {
    authService.hasRole.and.returnValue(true);
    expect(service.swap('Purchase Return')).toBe('Sale Return');
    expect(service.swap('Sale Return')).toBe('Purchase Return');
    expect(service.swap('Purchase Returns')).toBe('Sale Returns');
    expect(service.swap('Sale Returns')).toBe('Purchase Returns');
  });

  it('swaps ledger abbreviations for dealer users', () => {
    authService.hasRole.and.returnValue(true);
    expect(service.swap('Pur. returns')).toBe('Sal. returns');
    expect(service.swap('Pur. Return')).toBe('Sal. Return');
  });

  it('swaps compound labels for dealer users', () => {
    authService.hasRole.and.returnValue(true);
    expect(service.swap('Purchase Challan')).toBe('Sale Challan');
    expect(service.swap('Purchase Order')).toBe('Sale Order');
    expect(service.swap('Convert to Purchase')).toBe('Convert to Sale');
  });
});
