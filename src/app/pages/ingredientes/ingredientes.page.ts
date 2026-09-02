import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IngredientesService } from '../../services/ingredientes.service';
import { SupabaseService } from '../../services/supabase.service';
import { Router, RouterModule } from '@angular/router';
import {IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonList,
  IonItem,
  IonLabel,
  IonText,
  IonChip,
  IonButton,
  IonSearchbar,
  IonIcon} from '@ionic/angular/standalone';

//Importación de prueba
import {SqliteService} from '../../services/sqlite.service';

import { addIcons } from 'ionicons';

import {
  addCircleOutline,
  createOutline,
  trashOutline,
  repeatOutline
} from 'ionicons/icons';

import { Ingrediente, UserRole } from '../../models/database.types';

@Component({
  selector: 'app-ingredientes',
  templateUrl: './ingredientes.page.html',
  styleUrls: ['./ingredientes.page.scss'],
  standalone: true,
  imports: [CommonModule,
    RouterModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonList,
    IonItem,
    IonLabel,
    IonText,
    IonChip,
    IonButton,
    IonIcon,
    IonSearchbar
  ]
})
export class IngredientesPage {

  private supabaseService = inject(SupabaseService);
  private ingredientesService = inject(IngredientesService);
  private router = inject(Router);

  //Injection de SqliteService para test
  private sqliteService = inject(SqliteService);

  ingredientes: Ingrediente[] = [];
  userRole: UserRole = 'user';
  isLoading: boolean = false;

  public searchTerm: string = '';

  //método de busqueda en la página
  handleSearch(event: any) {
    this.searchTerm = event.target.value.toLowerCase();
    this.loadData();
  }

  constructor() {
    addIcons({
      'add-circle-outline': addCircleOutline,
      'create-outline': createOutline,
      'trash-outline': trashOutline,
      'repeat-outline': repeatOutline
    });
  }

  //Método de carga de ingredientes en la página
  async loadData() {
    this.isLoading = true;
    try {
      this.userRole = await this.supabaseService.getUserRole();

      this.ingredientes = await this.ingredientesService.getIngredientes(this.searchTerm);

    } catch (error) {
      console.error('Error al cargar datos:', error);

    } finally {
      this.isLoading = false;
    }
  }

  //Método de editar en la página
  public edit(id: string) {

    this.router.navigate(['/ingredientes', id]);
  }

  //Método de eliminación segura en el proyecto
  async softDelete(id: string, nombre: string, isCurrentlyDeleted: boolean) {

    const newState = !isCurrentlyDeleted;

    const action = newState ? 'ELIMINAR suavemente' : 'RESTAURAR';

    if (confirm(`¿Estás seguro de ${action} el ingrediente "${nombre}"?`)) {
      try {

        await this.supabaseService.softDeleteIngrediente(id, newState);

        await this.loadData();

        alert(`Ingrediente "${nombre}" ${newState ? 'ELIMINADO' : 'RESTAURADO'} con éxito.`);

      } catch (error) {
        console.error(`Error al ejecutar ${action}:`, error);
        alert(`Error al ejecutar ${action}. Verifica los permisos RLS (UPDATE para Administradores).`);
      }
    }
  }

  //Método para prueba de inserción sqlite con botón en ingrediente.page
  async testAddIngrediente(){
    try {
      const ingrediente: Ingrediente = {
        ing_nombre: 'Harina de prueba',
        ing_precio: 1500,
        unmed_id: '9386ac1a-66fd-4d4e-a861-856c100426de',
        is_deleted: false,
        ing_cantidad_base: 1000
      }

      const result = await this.sqliteService.addIngrediente(ingrediente);
      console.log('INGREDIENTE INSERTADO: ', result);

      const ingredientes = await this.sqliteService.getIngredientes();
      console.log('INGREDIENTES EN SQL: ', ingredientes);

    }catch (error){

      console.error('ERROR INSERTANDO INGREDIENTE: ', error);
    }

  }

  //Validación del tipo de usuario
  isAdministrador(): boolean {
    return this.userRole === 'administrador';
  }

  async ionViewWillEnter() {
    await this.loadData();
  }
}