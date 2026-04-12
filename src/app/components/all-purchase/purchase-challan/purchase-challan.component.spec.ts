import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PurchaseChallanComponent } from './purchase-challan.component';

describe('PurchaseChallanComponent', () => {
  let component: PurchaseChallanComponent;
  let fixture: ComponentFixture<PurchaseChallanComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PurchaseChallanComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PurchaseChallanComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

