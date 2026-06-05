// Next.js carga este archivo automáticamente al arrancar el servidor.
// Solo inicializamos la telemetría en el runtime de Node (no en edge/browser).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}
