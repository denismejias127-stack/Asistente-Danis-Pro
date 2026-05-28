import express, { type Express, Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { createServer } from "http";
import { serveStatic } from "./static";
import cors from "cors"; 

const app = express();

// 1. CORS abierto y listo para tu APK
app.use(cors({ origin: "*" })); 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware para ver en la consola si el APK está intentando tocar el servidor
app.use((req, _res, next) => {
  console.log(`[Petición] ${req.method} desde ${req.ip} a ${req.url}`);
  next();
});

console.log("🚀 INICIANDO PROCESO DE ARRANQUE DEL SERVIDOR...");

const httpServer = createServer(app);

(async () => {
  try {
    console.log("📡 Registrando rutas...");
    await registerRoutes(httpServer, app);

    // Middleware para manejo de errores globales
    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("Internal Server Error:", err);
      if (res.headersSent) return next(err);
      return res.status(status).json({ message });
    });

    if (process.env.NODE_ENV === "production") {
      console.log("📦 Servidor en producción: Cargando archivos estáticos...");
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    const port = parseInt(process.env.PORT || "5000", 10);
    
    // 2. CORRECCIÓN CLAVE: Obligar a escuchar en '0.0.0.0' para que Replit deje pasar al APK
    httpServer.listen(port, '0.0.0.0', () => {
      console.log(`[server] Chatdanis activo y sirviendo en el puerto ${port}`);
    });
  } catch (error) {
    console.log("❌ ERROR CRÍTICO CAPTURADO EN EL ARRANQUE:");
    console.error(error);
    process.exit(1);
  }
})();
