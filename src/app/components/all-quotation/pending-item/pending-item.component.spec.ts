import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PendingItemComponent } from './pending-item.component';

describe('PendingItemComponent', () => {
  let component: PendingItemComponent;
  let fixture: ComponentFixture<PendingItemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PendingItemComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(PendingItemComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
