import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaleReturnListComponent } from './sale-return-list.component';

describe('SaleReturnListComponent', () => {
  let component: SaleReturnListComponent;
  let fixture: ComponentFixture<SaleReturnListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SaleReturnListComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(SaleReturnListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
