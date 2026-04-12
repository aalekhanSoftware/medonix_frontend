import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddCustomerPriceComponent } from './add-customer-price.component';

describe('AddCustomerPriceComponent', () => {
  let component: AddCustomerPriceComponent;
  let fixture: ComponentFixture<AddCustomerPriceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AddCustomerPriceComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AddCustomerPriceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
