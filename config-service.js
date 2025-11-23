// config-service.js
// Servicio centralizado para leer configuración global y oficinas

import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const db = getFirestore(app);

// Valores por defecto (Safety net por si Firestore falla o está vacío)
const FACTORES_DEFECTO = [
    0.0566, 0.0566, 0.0566, // Q1
    0.0766, 0.0766, 0.0766, // Q2
    0.0833, 0.0833, 0.0833, // Q3
    0.1166, 0.1166, 0.1166  // Q4
];

const OFICINAS_DEFECTO = [
    "RE/MAX BIG", "RE/MAX FORUM", "RE/MAX FLOR", "RE/MAX ACUERDO", "CROAR PROPIEDADES"
];

// Variable caché para no llamar a DB mil veces
let cacheConfig = null;

export const ConfigService = {
    /**
     * Obtiene factores de estacionalidad y oficinas disponibles.
     * Devuelve: { factores: number[], oficinas: { nombre: string, usaEstacionalidad: boolean }[] }
     */
    async obtenerConfiguracionCompleta() {
        if (cacheConfig) return cacheConfig;

        try {
            // 1. Leer Factores Globales
            const docRef = doc(db, "configuracion", "global");
            const docSnap = await getDoc(docRef);
            let factores = FACTORES_DEFECTO;

            if (docSnap.exists() && docSnap.data().factoresEstacionalidad) {
                factores = docSnap.data().factoresEstacionalidad;
            }

            // 2. Leer Colección de Oficinas
            const colRef = collection(db, "oficinas");
            const colSnap = await getDocs(colRef);
            let oficinas = [];

            colSnap.forEach(d => {
                const data = d.data();
                if (data.nombre) {
                    oficinas.push({
                        nombre: data.nombre,
                        usaEstacionalidad: !!data.usaEstacionalidad
                    });
                }
            });

            if (oficinas.length === 0) {
                // Si no hay oficinas en DB, usar fallback simple
                oficinas = OFICINAS_DEFECTO.map(nombre => ({ nombre, usaEstacionalidad: false }));
            }

            // Guardar en caché
            cacheConfig = { factores, oficinas };
            return cacheConfig;

        } catch (error) {
            console.error("Error cargando configuración centralizada:", error);
            // Retornar defaults en caso de error crítico
            return {
                factores: FACTORES_DEFECTO,
                oficinas: OFICINAS_DEFECTO.map(n => ({ nombre: n, usaEstacionalidad: false }))
            };
        }
    },

    // Helpers directos
    async obtenerFactores() {
        const cfg = await this.obtenerConfiguracionCompleta();
        return cfg.factores;
    },

    async obtenerOficinas() {
        const cfg = await this.obtenerConfiguracionCompleta();
        return cfg.oficinas;
    }
};