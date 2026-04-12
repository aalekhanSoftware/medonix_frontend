import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomerPriceListComponent } from './customer-price-list.component';

describe('CustomerPriceListComponent', () => {
  let component: CustomerPriceListComponent;
  let fixture: ComponentFixture<CustomerPriceListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CustomerPriceListComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CustomerPriceListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
