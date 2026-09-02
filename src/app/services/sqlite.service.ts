import { Injectable, inject } from '@angular/core';
import {
    CapacitorSQLite,
    SQLiteDBConnection,
    SQLiteConnection,
    capSQLiteRunOptions
} from '@capacitor-community/sqlite';

import {
    Ingrediente,
    UnidadMedida,
    Cliente,
    Pedido,
    Cotizacion
} from '../models/database.types';

import { Platform } from '@ionic/angular';
import {error} from "@capacitor/assets/dist/util/log";

@Injectable({
    providedIn: 'root'
})
export class SqliteService {

    private _isSQLiteActive: boolean = false;
    private db!: SQLiteDBConnection;
    private sqliteConnection!: SQLiteConnection;
    private dbReadyPromise: Promise<void>;

    public get isSQLiteActive(): boolean {
        return this._isSQLiteActive;
    }

    private platform = inject(Platform);
    private isNative: boolean;

    constructor() {
        this.isNative = this.platform.is('capacitor');
        console.log(`[SQLiteService] Entorno Nativo detectado: ${this.isNative ? 'SÍ' : 'NO'}`);

        if (this.isNative) {
            this.sqliteConnection = new SQLiteConnection(CapacitorSQLite);
            // 2. Asignar la inicialización asíncrona a la promesa
            this.dbReadyPromise = this.initializeDatabase();
        } else {
            // 3. Para web/dev, resolver inmediatamente
            this.dbReadyPromise = Promise.resolve();
            console.log('[SQLiteService] Ejecutando en Web/Dev. SQLite deshabilitado. Usando Supabase.');
        }
    }

    // ===============================================
    // 🔑 MÉTODOS DE INICIALIZACIÓN Y TABLAS
    // ===============================================

    public async initializeDatabase(): Promise<void> {

        try {
            console.log('SQLITE: Intentando conectar a la DB.');

            const dbName = 'sippa_db';
            // Manejar la conexión existente
            const isConnection = await this.sqliteConnection.isConnection('sippa_db', false);

            if (isConnection.result) {
                this.db = await this.sqliteConnection.retrieveConnection('sippa_db', false);
                const isOpen = await this.db.isDBOpen();
                if (isOpen.result) {
                    await this.db.close();
                }
            }
            this.db = await this.sqliteConnection.createConnection(
                'sippa_db',
                false,
                'no-encryption',
                1,
                false);

            await this.db.open();

            // 2. Crear todas las tablas necesarias
            const createStatements = [
                `CREATE TABLE IF NOT EXISTS cliente (
        cli_id TEXT PRIMARY KEY,
        cli_nombre TEXT,
        cli_apellido TEXT,
        cli_telefono TEXT,
        cli_instagram TEXT,
        deleted_at TEXT
    );`,

                `CREATE TABLE IF NOT EXISTS unidad_medida (
        unmed_id TEXT PRIMARY KEY,
        unmed_nombre TEXT
    );`,

                `CREATE TABLE IF NOT EXISTS ingredientes (
        ing_id TEXT PRIMARY KEY,
        ing_nombre TEXT,
        ing_precio REAL,
        is_deleted INTEGER,
        unmed_id TEXT,
        ing_cantidad_base INTEGER
    );`,

                `CREATE TABLE IF NOT EXISTS cotizacion (
        cot_id TEXT PRIMARY KEY,
        cot_fecha TEXT,
        cot_total REAL,
        cot_nombre TEXT
    );`,

                `CREATE TABLE IF NOT EXISTS cotizacion_detalle (
        cot_id TEXT,
        ing_id TEXT,
        cantidad_usada REAL,
        precio_unitario_fijo REAL,
        PRIMARY KEY (cot_id, ing_id)
    );`,

                `CREATE TABLE IF NOT EXISTS estado_pedido (
        est_id TEXT PRIMARY KEY,
        est_nombre TEXT
    );`,

                `CREATE TABLE IF NOT EXISTS pedido (
        ped_id TEXT PRIMARY KEY,
        ped_fecha_entrega TEXT,
        ped_precio INTEGER,
        cli_id TEXT,
        cot_id TEXT,
        est_id TEXT
    );`,

                `CREATE TABLE IF NOT EXISTS local_auth (
        email TEXT PRIMARY KEY
    );`,

                `CREATE TABLE IF NOT EXISTS delta_clientes (
        delta_id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT,
        payload_json TEXT,
        timestamp INTEGER
    );`,

                `CREATE TABLE IF NOT EXISTS delta_cotizaciones (
        delta_id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT,
        payload_json TEXT,
        timestamp INTEGER
    );`,

                `CREATE TABLE IF NOT EXISTS delta_pedidos (
        delta_id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT,
        payload_json TEXT,
        timestamp INTEGER
    );`
            ];
            for (const statement of createStatements) {
                await this.db.run(statement, []);
            }

            this._isSQLiteActive = true;
            console.log('SQLITE: Base de datos inicializada y tablas creadas con éxito.');

        } catch (e) {
            console.error('SQLITE ERROR al inicializar:', e);
            this._isSQLiteActive = false;
        }
    }

    // ===============================================
    // 🔑 MÉTODOS DE AUTENTICACIÓN LOCAL
    // ===============================================

    /** Guarda el email local para permitir el acceso offline. */
    public async setLocalAuth(email: string): Promise<void> {
        await this.dbReadyPromise; // <-- ESPERAR INICIALIZACIÓN
        if (!this._isSQLiteActive) return;
        try {
            // CORRECCIÓN TS2353: Pasar el array de sentencias directamente
            const setStatements = [
                { statement: 'DELETE FROM local_auth;', values: [] },
                { statement: 'INSERT INTO local_auth (email) VALUES (?)', values: [email] }
            ];
            await this.db.executeSet(setStatements as any);
            console.log(`SQLITE: Email de sesión guardado: ${email}`);
        } catch (e) {
            console.error('SQLITE ERROR al guardar Auth:', e);
        }
    }

    /** Revisa si hay una sesión guardada localmente. */
    public async hasLocalAuthEntry(): Promise<boolean> {
        await this.dbReadyPromise; // <-- ESPERAR INICIALIZACIÓN
        if (!this._isSQLiteActive) return false;
        try {
            const res = await this.db.query('SELECT COUNT(*) AS count FROM local_auth;');
            const count = res.values?.[0]?.count ?? 0;
            return count > 0;
        } catch (e) {
            console.error("SQLITE ERROR en hasLocalAuthEntry:", e);
            return false;
        }
    }

    /** Revisa las credenciales locales. */
    public async checkLocalAuth(email: string): Promise<boolean> {
        await this.dbReadyPromise; // <-- ESPERAR INICIALIZACIÓN
        console.log(`SQLITE: Verificando sesión local para ${email} (Retorna false por diseño).`);
        return false;
    }


    // ===============================================
    // 🔑 MÉTODOS DE LECTURA LOCAL (OFFLINE)
    // ===============================================

    public async getIngredientes(searchText: string = ''): Promise<Ingrediente[]> {
        await this.dbReadyPromise; // <-- ESPERAR INICIALIZACIÓN
        if (!this._isSQLiteActive) return [];
        console.log(`SQLITE: Consultando ingredientes locales.`);
        try {
            const query = `
                SELECT i.*, u.unmed_nombre
                FROM ingredientes i
                         JOIN unidad_medida u ON i.unmed_id = u.unmed_id
                WHERE i.ing_nombre LIKE ? AND i.is_deleted = 0;
            `;
            const res = await this.db.query(query, [`%${searchText}%`]);
            return (res.values as Ingrediente[]) || [];
        } catch (e) {
            console.error("SQLITE ERROR en getIngredientes:", e);
            return [];
        }
    }

    public async addIngrediente(ingrediente: Ingrediente): Promise<Ingrediente> {
        await this.dbReadyPromise;

        if(!this._isSQLiteActive){
            throw error("SQLite no esta activo!");
        }
        const ing_id = ingrediente.ing_id ?? crypto.randomUUID();

        const query = ` 
            insert into ingredientes (
                ing_id,
                ing_nombre,
                ing_precio,
                is_deleted,
                unmed_id,
                ing_cantidad_base                                      
            )values (?,?,?,?,?,?);
            `;

        await this.db.run(query, [
            ingrediente.ing_id,
            ingrediente.ing_nombre,
            ingrediente.ing_precio,
            ingrediente.is_deleted,
            ingrediente.unmed_id,
            ingrediente.ing_cantidad_base
        ]);

        return {
            ...ingrediente,
            ing_id
        };
    }

    public async getUnidadesMedida(): Promise<UnidadMedida[]> {
        await this.dbReadyPromise; // <-- ESPERAR INICIALIZACIÓN
        if (!this._isSQLiteActive) return [];
        console.log('SQLITE: Consultando unidades de medida locales.');
        try {
            const res = await this.db.query('SELECT * FROM unidad_medida ORDER BY unmed_nombre ASC;');
            return (res.values as UnidadMedida[]) || [];
        } catch (e) {
            console.error("SQLITE ERROR en getUnidadesMedida:", e);
            return [];
        }
    }

    public async getPedidosLocal(): Promise<Pedido[]> {
        await this.dbReadyPromise; // <-- ESPERAR INICIALIZACIÓN
        if (!this._isSQLiteActive) return [];
        console.log("SQLITE: Consultando pedidos locales.");
        try {
            const res = await this.db.query('SELECT * FROM pedido ORDER BY ped_fecha_entrega DESC;');
            return (res.values as Pedido[]) || [];
        } catch (e) {
            console.error("SQLITE ERROR en getPedidosLocal:", e);
            return [];
        }
    }

    public async getClientesLocal(): Promise<Cliente[]> {
        await this.dbReadyPromise; // <-- ESPERAR INICIALIZACIÓN
        if (!this._isSQLiteActive) return [];
        console.log("SQLITE: Consultando clientes locales.");
        try {
            const res = await this.db.query('SELECT * FROM cliente WHERE deleted_at IS NULL ORDER BY cli_nombre ASC;');
            return (res.values as Cliente[]) || [];
        } catch (e) {
            console.error("SQLITE ERROR en getClientesLocal:", e);
            return [];
        }
    }

    public async getCotizacionesLocal(): Promise<Cotizacion[]> {
        await this.dbReadyPromise; // <-- ESPERAR INICIALIZACIÓN
        if (!this._isSQLiteActive) return [];
        console.log("SQLITE: Consultando cotizaciones locales con detalles.");

        try {
            const cotizacionesRes = await this.db.query('SELECT * FROM cotizacion ORDER BY cot_fecha DESC;');
            const cotizaciones: Cotizacion[] = (cotizacionesRes.values as Cotizacion[]) || [];

            for (const cot of cotizaciones) {
                const detallesRes = await this.db.query(
                    'SELECT * FROM cotizacion_detalle WHERE cot_id = ?',
                    [cot.cot_id]
                );
                // Asumimos que Cotizacion tiene una propiedad 'detalles'
                (cot as any).detalles = detallesRes.values;
            }

            return cotizaciones;
        } catch (e) {
            console.error("SQLITE ERROR en getCotizacionesLocal:", e);
            return [];
        }
    }

    // ===============================================
    // 🔑 MÉTODOS DE SINCRONIZACIÓN (SYNC UP/DOWN)
    // ===============================================

    /** 🚨 Sync Down: Borra y reemplaza todos los datos. */
    public async saveFullSyncDown(
        ingredientes: Ingrediente[],
        unidades: UnidadMedida[],
        clientes: Cliente[],
        cotizaciones: any[],
        pedidos: Pedido[],
        estados: any[]
    ): Promise<void> {

        await this.dbReadyPromise; // <-- ESPERAR INICIALIZACIÓN
        if (!this._isSQLiteActive) return;
        console.log(`SQLITE: Iniciando Full Sync Down para ${clientes.length} Clientes, ${pedidos.length} Pedidos, etc.`);

        try {
            // 🛑 CRÍTICO: Eliminar beginTransaction/commitTransaction para evitar conflicto con executeSet.

            // 1. PREPARAR SENTENCIAS DE BORRADO
            // Si una tabla NO existe (como pasó con 'pedido'), esto fallará y la DB quedará limpia.
            const tablesToClear = ['cliente', 'pedido', 'cotizacion', 'cotizacion_detalle', 'ingredientes', 'unidad_medida', 'estado_pedido'];
            const deleteStatements: capSQLiteRunOptions[] = tablesToClear.map(table => ({ statement: `DELETE FROM ${table};`, values: [] }));

            // 2. PREPARAR SENTENCIAS DE INSERCIÓN EN LOTE
            const insertStatements: capSQLiteRunOptions[] = [];

            // 2.1 Insertar Estados de Pedido
            estados.forEach(e => {
                insertStatements.push({
                    statement: 'INSERT INTO estado_pedido (est_id, est_nombre) VALUES (?, ?)',
                    values: [e.est_id, e.est_nombre]
                });
            });

            // 2.2 Insertar Unidades de Medida
            unidades.forEach(u => {
                insertStatements.push({
                    statement: 'INSERT INTO unidad_medida (unmed_id, unmed_nombre) VALUES (?, ?)',
                    values: [u.unmed_id, u.unmed_nombre]
                });
            });

            // 2.3 Insertar Ingredientes
            ingredientes.forEach(i => {
                insertStatements.push({
                    statement: 'INSERT INTO ingredientes (ing_id, ing_nombre, ing_precio, unmed_id, is_deleted, ing_cantidad_base) VALUES (?, ?, ?, ?, ?, ?)',
                    values: [i.ing_id, i.ing_nombre, i.ing_precio, i.unmed_id, i.is_deleted ? 1 : 0, i.ing_cantidad_base]
                });
            });

            // 2.4 Insertar Clientes
            clientes.forEach(c => {
                insertStatements.push({
                    statement: 'INSERT INTO cliente (cli_id, cli_nombre, cli_apellido, cli_telefono, cli_instagram, deleted_at) VALUES (?, ?, ?, ?, ?, ?)',
                    values: [c.cli_id, c.cli_nombre, c.cli_apellido, c.cli_telefono, c.cli_instagram || null, c.deleted_at || null]
                });
            });

            // 2.5 Insertar Cotizaciones y sus Detalles
            cotizaciones.forEach((cot: any) => {
                insertStatements.push({
                    statement: 'INSERT INTO cotizacion (cot_id, cot_nombre, cot_total, cot_fecha) VALUES (?, ?, ?, ?)',
                    values: [cot.cot_id, cot.cot_nombre, cot.cot_total, cot.cot_fecha]
                });
                if (cot.cotizacion_detalle && Array.isArray(cot.cotizacion_detalle)) {
                    cot.cotizacion_detalle.forEach((det: any) => {
                        insertStatements.push({
                            statement: 'INSERT INTO cotizacion_detalle (cot_id, ing_id, cantidad_usada, precio_unitario_fijo) VALUES (?, ?, ?, ?)',
                            values: [cot.cot_id, det.ing_id, det.cantidad_usada, det.precio_unitario_fijo]
                        });
                    });
                }
            });

            // 2.6 Insertar Pedidos
            pedidos.forEach(ped => {
                insertStatements.push({
                    statement: 'INSERT INTO pedido (ped_id, cli_id, cot_id, ped_precio, ped_fecha_entrega, est_id) VALUES (?, ?, ?, ?, ?, ?)',
                    values: [ped.ped_id, ped.cli_id, ped.cot_id, ped.ped_precio, ped.ped_fecha_entrega, ped.est_id]
                });
            });

            // 3. EJECUTAR TODAS LAS SENTENCIAS EN UN LOTE
            const allStatements = [
                ...deleteStatements,
                ...insertStatements
            ];

            // executeSet lo maneja como un lote atómico (transacción implícita)
            await this.db.executeSet(allStatements as any);

            console.log(`SQLITE: Lote de sentencias de Sync Down ejecutado.`);
            console.log(`SQLITE: Full Sync Down completado y guardado con éxito.`);

        } catch (e) {
            let errorMessage = "Error desconocido.";
            let errorDetails = e;

            // Intentar acceder a propiedades comunes del error
            if (e instanceof Error) {
                errorMessage = e.message;
                errorDetails = {
                    name: e.name,
                    message: e.message,
                    stack: e.stack // Útil para trazar dónde se originó
                };
            } else if (typeof e === 'object' && e !== null && 'message' in e) {
                errorMessage = (e as any).message;
            }

            console.error("--- SQLITE ERROR DETALLADO en saveFullSyncDown ---\nMensaje principal:", errorMessage, "\nDetalles (Objeto e):", errorDetails);

            // El logcat de Android a menudo reporta el error nativo en e.message
            console.error("FALLO EN LA OPERACIÓN DE SINCRONIZACIÓN.");
            throw new Error("Fallo la operación de Full Sync Down.");
        }
    }

    // ... (El resto de los métodos de Delta/Sync Up)

    /** Sync Up: Obtiene deltas pendientes. */
    public async getSyncDeltas(): Promise<any> {
        await this.dbReadyPromise; // <-- ESPERAR INICIALIZACIÓN
        if (!this._isSQLiteActive) return { clientes: [], cotizaciones: [], pedidos: [] };
        console.log('SQLITE: Obteniendo deltas para Sync Up (Implementación real).');

        try {
            const clientesRes = await this.db.query('SELECT delta_id, action, payload_json FROM delta_clientes ORDER BY timestamp ASC;');
            const cotizacionesRes = await this.db.query('SELECT delta_id, action, payload_json FROM delta_cotizaciones ORDER BY timestamp ASC;');
            const pedidosRes = await this.db.query('SELECT delta_id, action, payload_json FROM delta_pedidos ORDER BY timestamp ASC;');

            const parseDeltas = (res: any) => res.values ? res.values.map((d: any) => ({
                ...d,
                payload: JSON.parse(d.payload_json)
            })) : [];

            return {
                clientes: parseDeltas(clientesRes),
                cotizaciones: parseDeltas(cotizacionesRes),
                pedidos: parseDeltas(pedidosRes),
            };

        } catch (e) {
            console.error('SQLITE ERROR en getSyncDeltas:', e);
            return { clientes: [], cotizaciones: [], pedidos: [] };
        }
    }

    // Métodos de Captura Delta
    public async insertClienteDelta(clienteData: any): Promise<void> {
        await this.dbReadyPromise; // <-- ESPERAR INICIALIZACIÓN
        if (!this._isSQLiteActive) return;
        const payload = JSON.stringify(clienteData);
        await this.db.run('INSERT INTO delta_clientes (action, payload_json, timestamp) VALUES (?, ?, ?)', ['INSERT', payload, Date.now()]);
        console.log('SQLITE DELTA: Insertando Cliente en delta_clientes.');
    }

    public async insertCotizacionDelta(cotizacionData: any): Promise<void> {
        await this.dbReadyPromise; // <-- ESPERAR INICIALIZACIÓN
        if (!this._isSQLiteActive) return;
        const payload = JSON.stringify(cotizacionData);
        await this.db.run('INSERT INTO delta_cotizaciones (action, payload_json, timestamp) VALUES (?, ?, ?)', ['INSERT', payload, Date.now()]);
        console.log('SQLITE DELTA: Insertando Cotización en delta_cotizaciones.');
    }

    public async insertPedidoDelta(action: string, pedidoData: any): Promise<void> {
        await this.dbReadyPromise; // <-- ESPERAR INICIALIZACIÓN
        if (!this._isSQLiteActive) return;
        const payload = JSON.stringify(pedidoData);
        await this.db.run('INSERT INTO delta_pedidos (action, payload_json, timestamp) VALUES (?, ?, ?)', [action, payload, Date.now()]);
        console.log(`SQLITE DELTA: Registrando acción '${action}' en delta_pedidos.`);
    }

    public async deleteSyncDelta(deltaId: string | number, tableName: string): Promise<void> {
        await this.dbReadyPromise; // <-- ESPERAR INICIALIZACIÓN
        if (!this._isSQLiteActive) return;

        await this.db.run(`DELETE FROM ${tableName} WHERE delta_id = ?`, [deltaId]);
        console.log(`SQLITE DELTA: Eliminado delta ID ${deltaId} de la tabla ${tableName}.`);
    }
}