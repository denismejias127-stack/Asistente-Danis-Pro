import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // Ajustamos la ruta para que busque en 'dist/public' que es donde Render genera los archivos
  let distPath = path.resolve(process.cwd(), "dist", "public");

  // Si por alguna razón no existe en dist/public, intentamos buscar en public tradicional
  if (!fs.existsSync(distPath)) {
    distPath = path.resolve(process.cwd(), "public");
  }

  // Si no está en ninguno de los dos, tira el aviso para saber qué pasó
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}. Asegúrate de compilar el cliente primero.`,
    );
  }

  app.use(express.static(distPath));

  // Redirige correctamente cualquier otra ruta al index.html
  app.get("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
