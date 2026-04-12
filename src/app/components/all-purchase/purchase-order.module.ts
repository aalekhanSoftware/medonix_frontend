import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { PurchaseOrderComponent } from './purchase-order/purchase-order.component';
import { AddPurchaseOrderComponent } from './add-purchase-order/add-purchase-order.component';
import { PurchaseOrderRoutingModule } from './purchase-order-routing.module';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';
import { PurchaseOrderItemPendingComponent } from './purchase-order-item-pending/purchase-order-item-pending.component';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    PurchaseOrderRoutingModule,
    LoaderComponent,
    SearchableSelectComponent,
    PaginationComponent,
    PurchaseOrderComponent,
    AddPurchaseOrderComponent,
    PurchaseOrderItemPendingComponent
  ]
})
export class PurchaseOrderModule { }

