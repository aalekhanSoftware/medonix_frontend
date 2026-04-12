import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { CustomerResponse, CustomerSearchRequest } from '../models/customer.model';
import { CacheService } from '../shared/services/cache.service';
import { EncryptionService } from '../shared/services/encryption.service';
import { ApiResponse } from '../models/api.model';

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  private readonly CACHE_KEY = 'active_customers';
  private apiUrl = `${environment.apiUrl}/api/customers`;

  constructor(
    private http: HttpClient, 
    private cacheService: CacheService,
    private encryptionService: EncryptionService
  ) {}

  searchCustomers(params: any): Observable<CustomerResponse> {
    return this.http.post<CustomerResponse>(`${this.apiUrl}/search`, params);
  }

  createCustomer(customer: any): Observable<any> {
    return this.http.post(`${this.apiUrl}`, customer);
  }

  updateCustomer(id: number, customer: any): Observable<any> {
    if(customer.nextActionDate == "") {
      customer.nextActionDate = null;
    }
    return this.http.put(`${this.apiUrl}/${id}`, customer);
  }  

  getCustomers(params: any): Observable<any> {
    if (params.status === 'A') {
      const encryptedData = localStorage.getItem(this.CACHE_KEY);
      if (encryptedData) {
        const decryptedData = this.encryptionService.decrypt(encryptedData);
        if (decryptedData) {
          return of(decryptedData);
        }
      }
    }

    return this.http.post<any>(`${this.apiUrl}/getCustomers`, {
      search: params.search
    }).pipe(
      tap(response => {
        if (params.status === 'A' && response.success) {
          const encryptedData = this.encryptionService.encrypt(response);
          localStorage.setItem(this.CACHE_KEY, encryptedData);
        }
      })
    );
  }

  refreshCustomers(): Observable<any> {
    localStorage.removeItem(this.CACHE_KEY);
    return this.getCustomers({ status: 'A' });
  }

  getCustomerCoatingPrice(customerId: number) {
    return this.http.post<ApiResponse<{ id: number; coatingUnitPrice: number }>>(
      `${this.apiUrl}/coating-price`,
      { id: customerId }
    );
  }
} 