import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddSaleReturnComponent } from './add-sale-return.component';

describe('AddSaleReturnComponent', () => {
  let component: AddSaleReturnComponent;
  let fixture: ComponentFixture<AddSaleReturnComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AddSaleReturnComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AddSaleReturnComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
