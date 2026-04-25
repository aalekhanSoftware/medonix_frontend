import { LocalStorageDataService } from './local-storage-data.service';
import { EncryptionService } from './encryption.service';

declare function describe(description: string, specDefinitions: () => void): void;
declare function beforeEach(action: () => void): void;
declare function afterEach(action: () => void): void;
declare function it(expectation: string, assertion: () => void): void;
declare function expect(actual: any): any;

describe('LocalStorageDataService', () => {
  let service: LocalStorageDataService;
  let encryptionService: EncryptionService;

  beforeEach(() => {
    localStorage.clear();
    encryptionService = {
      encrypt(value: string): string {
        return JSON.stringify(value);
      },
      decrypt(value: string): string {
        return JSON.parse(value);
      }
    } as EncryptionService;

    service = new LocalStorageDataService(encryptionService as EncryptionService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('keeps original order when sort direction is omitted', () => {
    const payload = {
      data: [
        { name: 'Zulu' },
        { name: 'Alpha' }
      ]
    };

    service.setItem('active_products', payload, { encrypted: true });
    const stored = service.getItem<typeof payload>('active_products', { encrypted: true });

    expect(stored?.data.map(item => item.name)).toEqual(['Zulu', 'Alpha']);
  });

  it('sorts mapped arrays ascending when requested', () => {
    const payload = {
      data: [
        { name: 'zulu' },
        { name: 'Alpha' },
        { name: 'beta' }
      ]
    };

    service.setItem('active_customers', payload, { encrypted: true, sortDirection: 'asc' });
    const stored = service.getItem<typeof payload>('active_customers', { encrypted: true, sortDirection: 'asc' });

    expect(stored?.data.map(item => item.name)).toEqual(['Alpha', 'beta', 'zulu']);
  });

  it('sorts mapped arrays descending when requested', () => {
    const payload = {
      data: [
        { name: 'zulu' },
        { name: 'Alpha' },
        { name: 'beta' }
      ]
    };

    service.setItem('active_employees', payload, { encrypted: true, sortDirection: 'desc' });
    const stored = service.getItem<typeof payload>('active_employees', { encrypted: true, sortDirection: 'desc' });

    expect(stored?.data.map(item => item.name)).toEqual(['zulu', 'beta', 'Alpha']);
  });

  it('sorts paginated content arrays using explicit field', () => {
    const payload = {
      data: {
        content: [
          { materialName: 'Sheet' },
          { materialName: 'Angle' }
        ],
        totalElements: 2
      }
    };

    service.setItem('custom_key', payload, { sortDirection: 'asc', sortField: 'materialName' });
    const stored = service.getItem<typeof payload>('custom_key', { sortDirection: 'asc', sortField: 'materialName' });

    expect(stored?.data.content.map(item => item.materialName)).toEqual(['Angle', 'Sheet']);
  });

  it('falls back to first text field when mapped field is missing', () => {
    const payload = {
      data: [
        { label: 'Zed', value: 2 },
        { label: 'Able', value: 1 }
      ]
    };

    service.setItem('active_transports', payload, { sortDirection: 'asc' });
    const stored = service.getItem<typeof payload>('active_transports', { sortDirection: 'asc' });

    expect(stored?.data.map(item => item.label)).toEqual(['Able', 'Zed']);
  });
});
