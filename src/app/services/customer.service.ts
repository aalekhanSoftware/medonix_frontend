import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { CustomerResponse, CustomerSearchRequest } from '../models/customer.model';
import { ApiResponse } from '../models/api.model';
import { LocalStorageDataService } from '../shared/services/local-storage-data.service';

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  private readonly CACHE_KEY = 'active_customers';
  private apiUrl = `${environment.apiUrl}/api/customers`;

  constructor(
    private http: HttpClient,
    private localStorageDataService: LocalStorageDataService
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
      const cachedResponse = this.localStorageDataService.getItem<any>(this.CACHE_KEY, {
        encrypted: true,
        sortDirection: 'asc'
      });
      if (cachedResponse) {
        return of(cachedResponse);
      }
    }

    return this.http.post<any>(`${this.apiUrl}/getCustomers`, {
      search: params.search
    }).pipe(
      map(response => {
        if (params.status === 'A' && response?.success) {
          return this.localStorageDataService.sortData(this.CACHE_KEY, response, {
            sortDirection: 'asc'
          });
        }
        return response;
      }),
      tap(response => {
        if (params.status === 'A' && response.success) {
          this.localStorageDataService.setItem(this.CACHE_KEY, response, {
            encrypted: true,
            sortDirection: 'asc'
          });
        }
      })
    );
  }

  refreshCustomers(): Observable<any> {
    this.localStorageDataService.removeItem(this.CACHE_KEY);
    return this.getCustomers({ status: 'A' });
  }

  getCustomerCoatingPrice(customerId: number) {
    return this.http.post<ApiResponse<{ id: number; coatingUnitPrice: number }>>(
      `${this.apiUrl}/coating-price`,
      { id: customerId }
    );
  }
} 