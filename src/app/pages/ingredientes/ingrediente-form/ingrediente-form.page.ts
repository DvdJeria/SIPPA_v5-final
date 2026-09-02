import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastController, NavController } from '@ionic/angular';

import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonIcon,
  IonButtons, IonBackButton, IonInput, IonItem, IonLabel,
  IonSelect, IonSelectOption, IonSpinner, IonText, IonList
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { saveOutline } from 'ionicons/icons';

import { SupabaseService } from '../../../services/supabase.service';
import { Ingrediente, UnidadMedida } from 'src/app/models/database.types';


@Component({
  selector: 'app-ingrediente-form',
  templateUrl: './ingrediente-form.page.html',
  styleUrls: ['./ingrediente-form.page.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, IonHeader, IonToolbar, IonTitle,
    IonContent, IonButton, IonIcon, IonButtons, IonBackButton, IonInput,
    IonItem, IonLabel, IonSelect, IonSelectOption, IonSpinner, IonText, IonList
  ],
})

export class IngredienteFormPage implements OnInit {

  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastController = inject(ToastController);
  private supabaseService = inject(SupabaseService);
  private navCtrl = inject(NavController);

  ingredienteForm!: FormGroup;
  ingredienteId: string | null = null;
  unidades: UnidadMedida[] = [];
  isLoading: boolean = false;
  isEditing: boolean = false;

  constructor() {
    addIcons({ saveOutline });
  }

  ngOnInit() {

    this.checkMode();
    this.ingredienteId = this.route.snapshot.paramMap.get('id');
    this.isEditing = !!this.ingredienteId;
    this.initForm();
    this.ingredienteForm.get('unmed_id')?.valueChanges.subscribe(
        (unmedId) => {
          this.onUnidadChange(unmedId);
        }
    );
    this.loadSelectData();
    if (this.isEditing && this.ingredienteId) {
      this.loadIngredienteData(this.ingredienteId);
    }
  }

  checkMode() {
    const id = this.route.snapshot.paramMap.get('id');

    if (id) {
      this.isEditing = true;
      this.ingredienteId = id;
      this.loadIngredienteData(id);
    } else {
      this.isEditing = false;
    }
  }

  initForm() {
    this.ingredienteForm = this.fb.group({
      ing_nombre: ['', [Validators.required, Validators.maxLength(100)]],
      ing_precio: [0, [Validators.required, Validators.min(0)]],
      unmed_id: ['', Validators.required],
      ing_cantidad_base: [0, [Validators.required, Validators.min(0)]]
    });
  }

  async loadSelectData() {
    this.isLoading = true;
    try {
      this.unidades = await this.supabaseService.getUnidadesMedida();
    } catch (error) {
      console.error('Error al cargar unidades de medida:', error);
      alert('No se pudieron cargar las unidades de medida. Verifique la conexión o las políticas RLS.');
    } finally {
      this.isLoading = false;
    }
  }

  async loadIngredienteData(id: string) {
    this.isLoading = true;
    try {
      const ingrediente = await this.supabaseService.getIngredienteById(id);

      this.ingredienteForm.patchValue(ingrediente);

      this.onUnidadChange(
          ingrediente.unmed_id
      );

    } catch (error) {
      console.error('Error al cargar datos del ingrediente:', error);
      alert('Error al cargar los datos del ingrediente. Puede que no exista o falten permisos.');
      this.router.navigate(['/ingredientes']);
    } finally {
      this.isLoading = false;
    }
  }

  //Este es el coso que quiero cambiar para que las notificaciones sean a través del sistema nativo de android y no como una apntalla en la aplicación
  async presentToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      position: 'bottom',
      color: color,
    });
    await toast.present();
  }

  //Onsubmit, envía los datos del formulario para crear la materia prima
  async onSubmit() {
    if (this.ingredienteForm.invalid) {
      alert('Por favor, completa todos los campos requeridos correctamente.');
      this.ingredienteForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;

    const formValue = this.ingredienteForm.value as Partial<Ingrediente>;

    try {
      if (this.isEditing && this.ingredienteId) {

        await this.supabaseService.updateIngrediente(
            this.ingredienteId,
            formValue
        );

        await this.presentToast(
            'Ingrediente actualizado con éxito.'
        );

      } else {

        await this.supabaseService.addIngrediente(
            formValue
        );

        await this.presentToast(
            'Ingrediente agregado con éxito.'
        );
      }

      await this.router.navigate(['/pages/ingredientes']);

    } catch (error) {
      console.error('Error al guardar datos:', error);
      alert('Ocurrió un error al intentar guardar/actualizar el ingrediente. Verifique RLS.');
    } finally {
      this.isLoading = false;
    }
  }


  private onUnidadChange(unmedId: string): void {

    const unidadSeleccionada = this.unidades.find(
        unidad => unidad.unmed_id === unmedId
    );

    if (!unidadSeleccionada) {
      return;
    }

    const esUnidad =
        unidadSeleccionada.unmed_nombre.trim().toLowerCase() === 'unidad';

    const cantidadControl =
        this.ingredienteForm.get('ing_cantidad_base');

    if (!cantidadControl) {
      return;
    }

    if (esUnidad) {

      cantidadControl.setValue(1);

      cantidadControl.disable();

    } else {

      cantidadControl.enable();
    }
  }
}
