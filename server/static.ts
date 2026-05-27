import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // Buscamos en dist/public que es donde Render compila el frontend
  let distPath = path.resolve(process.cwd(), "dist", "public");

  if (!fs.existsSync(distPath)) {
    distPath = path.resolve(process.cwd(), "public");
  }

  app.use(express.static(distPath));

  // Usamos '*' de forma limpia para capturar cualquier ruta sin romper Express
  app.get("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
