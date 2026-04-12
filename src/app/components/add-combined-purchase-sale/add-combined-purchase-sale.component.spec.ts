import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddCombinedPurchaseSaleComponent } from './add-combined-purchase-sale.component';

describe('AddCombinedPurchaseSaleComponent', () => {
  let component: AddCombinedPurchaseSaleComponent;
  let fixture: ComponentFixture<AddCombinedPurchaseSaleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AddCombinedPurchaseSaleComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AddCombinedPurchaseSaleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
