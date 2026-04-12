import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface RegisterDealerRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  customerName: string;
  gst: string;
  dlNumber?: string;
  address: string;
  pincode: string;
  mobile: string;
  remarks?: string;
}

export interface RegisterDealerResponse {
  success: boolean;
  message: string;
  data?: {
    userId: number;
    customerId: number;
    email: string;
    status: 'P' | 'A' | 'R';
  };
}

@Injectable({ providedIn: 'root' })
export class DealersService {
  private readonly baseUrl = `${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  registerDealer(body: RegisterDealerRequest): Observable<RegisterDealerResponse> {
    return this.http.post<RegisterDealerResponse>(`${this.baseUrl}/api/customers/register`, body);
  }
}


