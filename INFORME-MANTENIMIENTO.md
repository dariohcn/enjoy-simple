# Plan de mantenimiento nativo

La pantalla anterior incrustada se reemplaza por controles, tabla y cálculos propios de enjoy. No contiene iframe, enlaces ni solicitudes de red a Power BI. La consulta funciona desde los archivos publicados en GitHub Pages para los perfiles taller y administrador.

## Datos de referencia
Se recuperó exclusivamente la tabla pública de mantenimiento Mttos del informe proporcionado por el propietario. No se importó la tabla Vines ni información de placas, VIN o clientes. Se eliminaron 12 filas repetidas en los límites de paginación; la consulta completa conserva 375.763 partidas, 24.551 planes y 695 versiones de 17 marcas. La estructura compacta comparte 3.733 partidas, preservando sus ocurrencias por plan.

Última actualización declarada por el origen: 26/11/2025. Es una copia de referencia, no una sincronización automática.
Comprobación del origen antes de redondeo: mano de obra 2.704.684,97; repuestos 3.248.302,2312; subtotal 5.952.987,2012; total 6.845.935,28138. El total reproduce el factor 1,15 del informe y no afirma una tarifa fiscal vigente.

## Interacción
Selección única y encadenada de marca, modelo, código, kilometraje y plan cuando existe más de uno. No se suman modelos o planes distintos. Búsqueda por código o descripción, filtro mano de obra/repuestos, totales de partidas visibles, composición del costo y descarga CSV. El diseño conserva la identidad de enjoy y permite desplazar solo la tabla en pantallas pequeñas.

El catálogo consultado no modifica precios autorizados de proformas ni inserta registros en Supabase. La portada de acceso y los dashboards existentes se conservan.
