import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddPurchaseChallanComponent } from './add-purchase-challan.component';

describe('AddPurchaseChallanComponent', () => {
  let component: AddPurchaseChallanComponent;
  let fixture: ComponentFixture<AddPurchaseChallanComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPurchaseChallanComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddPurchaseChallanComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

