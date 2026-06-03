import express, { type Express, Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { createServer } from "http";
import { serveStatic } from "./static";
import { getSession } from "./replit_integrations/auth/replitAuth";

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(getSession());

console.log("🚀 INICIANDO PROCESO DE ARRANQUE DEL SERVIDOR...");

const httpServer = createServer(app);

(async () => {
  try {
    console.log("📡 Registrando rutas...");
    await registerRoutes(httpServer, app);

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

    const port = process.env.PORT || "5000";
    httpServer.listen(port, () => {
      console.log(`[server] serving on port ${port}`);
    });
  } catch (error) {
    console.log("❌ ERROR CRÍTICO CAPTURADO EN EL ARRANQUE:");
    console.error(error);
    process.exit(1);
  }
})();
