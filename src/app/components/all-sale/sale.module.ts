import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { ScrollingModule } from '@angular/cdk/scrolling';

import { SaleRoutingModule } from './sale-routing.module';
import { SaleComponent } from './sale/sale.component';
import { AddSaleComponent } from './add-sale/add-sale.component';
import { AddSaleReturnComponent } from './add-sale-return/add-sale-return.component';
import { SaleReturnListComponent } from './sale-return-list/sale-return-list.component';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';
import { RoundPipe } from '../../round.pipe';
import { SaleModalComponent } from '../sale-modal/sale-modal.component';

@NgModule({
  declarations: [
    SaleComponent,
    AddSaleComponent,
    AddSaleReturnComponent,
    SaleReturnListComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    ScrollingModule,
    SaleRoutingModule,
    LoaderComponent,
    SearchableSelectComponent,
    PaginationComponent,
    RoundPipe,
    SaleModalComponent
  ]
})
export class SaleModule { }

