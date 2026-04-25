import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { LocalStorageDataService } from '../shared/services/local-storage-data.service';

export interface TransportMasterSearchRequest {
  search?: string;
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface TransportMaster {
  id?: number;
  name: string;
  mobile?: string;
  gst?: string;
  remarks?: string;
  status?: string;
}

@Injectable({ providedIn: 'root' })
export class TransportMasterService {
  private apiUrl = `${environment.apiUrl}/api/transports`;
  private readonly CACHE_KEY = 'active_transports';

  constructor(
    private http: HttpClient,
    private localStorageDataService: LocalStorageDataService
  ) {}

  create(transport: TransportMaster): Observable<any> {
    return this.http.post(this.apiUrl, transport);
  }

  update(transport: TransportMaster): Observable<any> {
    return this.http.put(this.apiUrl, transport);
  }

  delete(id: number): Observable<any> {
    return this.http.request('DELETE', this.apiUrl, { body: { id } });
  }

  getTransports(params: any): Observable<any> {
    if (params?.status === 'A') {
      const cachedResponse = this.localStorageDataService.getItem<any>(this.CACHE_KEY, {
        encrypted: true,
        sortDirection: 'asc'
      });
      if (cachedResponse) {
        return of(cachedResponse);
      }
    }

    return this.http.post<any>(`${this.apiUrl}/getTransports`, {
      search: params?.search
    }).pipe(
      map(response => {
        if (params?.status === 'A' && response?.success) {
          return this.localStorageDataService.sortData(this.CACHE_KEY, response, {
            sortDirection: 'asc'
          });
        }
        return response;
      }),
      tap(response => {
        if (params?.status === 'A' && response?.success) {
          this.localStorageDataService.setItem(this.CACHE_KEY, response, {
            encrypted: true,
            sortDirection: 'asc'
          });
        }
      })
    );
  }

  refreshTransports(): Observable<any> {
    this.localStorageDataService.removeItem(this.CACHE_KEY);
    return this.getTransports({ status: 'A' });
  }

  search(payload: TransportMasterSearchRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/search`, payload);
  }

  details(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/details`, { id });
  }
}