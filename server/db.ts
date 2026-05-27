import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Creamos la variable para la base de datos
export let pool: any;
export let db: any;

if (!process.env.DATABASE_URL) {
  // En lugar de apagar el servidor con un Error, mostramos un aviso en los logs
  console.log("⚠️ AVISO: DATABASE_URL no encontrada. El servidor iniciará en modo de prueba local.");
  
  // Inicializamos objetos vacíos temporales para que el código no se caiga al arrancar
  pool = new Pool(); 
  db = {}; 
} else {
  // Si en el futuro le pones una base de datos en Render, se conectará aquí automáticamente
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
}
