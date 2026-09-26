# ChatDanis — paquete completo

Este paquete contiene el frontend y el backend compilado. No abras `index.html`
con doble clic: debes iniciar el servidor para que funcionen las APIs y las
rutas de conversaciones.

## Requisitos

- Node.js 20 o superior
- Una clave de Google Gemini para `GOOGLE_API_KEY`

## Instalación

1. Extrae este ZIP.
2. Abre una terminal dentro de la carpeta extraída.
3. Instala las dependencias:

   ```bash
   npm install --omit=dev
   ```

4. Copia `.env.example` como `.env`.
5. Edita `.env` y agrega tu `GOOGLE_API_KEY`.
6. Inicia ChatDanis:

   ```bash
   npm start
   ```

7. Abre `http://localhost:5000` en el navegador.

## Windows

Puedes ejecutar los mismos comandos desde PowerShell. Si el puerto 5000 está
ocupado, cambia `PORT=5000` en `.env` por otro puerto, por ejemplo `PORT=5050`,
y abre `http://localhost:5050`.

## Datos y seguridad

- La clave de Google solo se usa en el backend y no se incluye en este paquete.
- Las conversaciones del modo local se guardan en el navegador y dispositivo
  donde uses ChatDanis.
- No necesitas configurar `DATABASE_URL` para el chat local.