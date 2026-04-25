import { Injectable } from '@angular/core';
import { EncryptionService } from './encryption.service';

export type SortDirection = 'asc' | 'desc';

export interface LocalStorageDataOptions {
  encrypted?: boolean;
  sortDirection?: SortDirection;
  sortField?: string;
}

@Injectable({
  providedIn: 'root'
})
export class LocalStorageDataService {
  private readonly sortFieldByKey: Record<string, string> = {
    active_products: 'name',
    active_customers: 'name',
    active_employees: 'name',
    active_transports: 'name'
  };

  constructor(private encryptionService: EncryptionService) {}

  getItem<T>(key: string, options?: LocalStorageDataOptions): T | null {
    const rawValue = localStorage.getItem(key);
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = options?.encrypted
        ? (this.encryptionService.decrypt(rawValue) as T)
        : (JSON.parse(rawValue) as T);

      if (!parsed) {
        return null;
      }

      return this.applySorting(key, parsed, options);
    } catch (error) {
      console.warn(`Failed to read localStorage key "${key}"`, error);
      return null;
    }
  }

  setItem<T>(key: string, value: T, options?: LocalStorageDataOptions): void {
    try {
      const valueToStore = this.applySorting(key, value, options);
      const serialized = options?.encrypted
        ? this.encryptionService.encrypt(valueToStore as any)
        : JSON.stringify(valueToStore);

      localStorage.setItem(key, serialized);
    } catch (error) {
      console.warn(`Failed to write localStorage key "${key}"`, error);
    }
  }

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  clear(): void {
    localStorage.clear();
  }

  sortData<T>(key: string, payload: T, options?: Omit<LocalStorageDataOptions, 'encrypted'>): T {
    return this.applySorting(key, payload, options);
  }

  private applySorting<T>(key: string, payload: T, options?: LocalStorageDataOptions): T {
    if (!options?.sortDirection) {
      return payload;
    }

    const targetField = options.sortField || this.sortFieldByKey[key];
    return this.sortRecursively(payload, targetField, options.sortDirection) as T;
  }

  private sortRecursively(value: unknown, targetField: string | undefined, direction: SortDirection): unknown {
    if (Array.isArray(value)) {
      const normalized = value.map(item => this.sortRecursively(item, targetField, direction));
      return normalized.sort((a, b) => this.compareValues(a, b, targetField, direction));
    }

    if (value && typeof value === 'object') {
      const source = value as Record<string, unknown>;
      const output: Record<string, unknown> = {};

      Object.keys(source).forEach(key => {
        output[key] = this.sortRecursively(source[key], targetField, direction);
      });

      return output;
    }

    return value;
  }

  private compareValues(a: unknown, b: unknown, targetField: string | undefined, direction: SortDirection): number {
    const aValue = this.extractComparableValue(a, targetField);
    const bValue = this.extractComparableValue(b, targetField);

    const result = aValue.localeCompare(bValue, undefined, { sensitivity: 'base' });
    return direction === 'desc' ? -result : result;
  }

  private extractComparableValue(item: unknown, targetField: string | undefined): string {
    if (item == null) {
      return '';
    }

    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      return String(item);
    }

    if (typeof item !== 'object') {
      return '';
    }

    const objectItem = item as Record<string, unknown>;

    if (targetField && objectItem[targetField] != null) {
      return String(objectItem[targetField]);
    }

    const firstTextKey = Object.keys(objectItem).find(
      key => typeof objectItem[key] === 'string' || typeof objectItem[key] === 'number'
    );

    return firstTextKey ? String(objectItem[firstTextKey]) : '';
  }
}
