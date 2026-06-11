import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminStaffUsersComponent } from './admin-staff-users.component';

describe('AdminStaffUsersComponent', () => {
  let component: AdminStaffUsersComponent;
  let fixture: ComponentFixture<AdminStaffUsersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminStaffUsersComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminStaffUsersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
