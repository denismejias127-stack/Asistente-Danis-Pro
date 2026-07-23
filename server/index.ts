import express, { type Express, Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { createServer } from "http";
import cors from "cors";
import { serveStatic } from "./static";
import { getSession } from "./replit_integrations/auth/replitAuth";
import { execSync } from "child_process";

const app = express();

app.set("trust proxy", 1);
app.use(cors({ origin: "*" })); // CORS abierto para tu APK
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(getSession());

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

    // Liberar el puerto si está ocupado por un proceso anterior
    try { execSync(`fuser -k ${port}/tcp 2>/dev/null || true`); } catch {}
    await new Promise(r => setTimeout(r, 400));

    // Obligar a escuchar en '0.0.0.0' para acceso externo desde tu APK
    httpServer.listen(port, '0.0.0.0', () => {
      console.log(`[server] Chatdanis activo y sirviendo en el puerto ${port}`);
    });

    // Cierre limpio para liberar el puerto al reiniciar
    const shutdown = () => {
      httpServer.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

  } catch (error) {
    console.log("❌ ERROR CRÍTICO CAPTURADO EN EL ARRANQUE:");
    console.error(error);
    process.exit(1);
  }
})();
