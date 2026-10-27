# Integración autenticada de enjoy

La portada de acceso se conserva en index.html y acceso.html. Las vistas se determinan por la sesión devuelta por el servidor, sin selector de roles.

## Taller
Inicio con Dashboard, Proforma, Registro, Citas y recordatorios, Órdenes, Comunidad y Configuración. Servicios y productos se seleccionan en Proforma y Citas, no son recuadros de Inicio. La proforma se guarda en los registros de solicitudes con kind=proforma y puede reabrirse. Los productos se vinculan a las citas sin reservar existencias ni facturar.

## Administrador
Inicio de administración con panel de red, talleres, usuarios, servicios centrales, productos, importación CSV, órdenes de la red, comunidad y configuración. Las decisiones y permisos existentes de talleres se conservan. La carga CSV se realiza en una sola transacción, con validación y actualización por código.

## Seguridad y persistencia
Se conserva Supabase Auth, el control de talleres aprobados y el aislamiento por workshop. La tabla central_services es privada, con RLS y sin grants a anon/authenticated. La función privada de catálogo valida el rol admin y se invoca desde el RPC existente. Las partidas de proforma se validan contra el catálogo y el servidor calcula el subtotal.

Las fotografías son temporales y se incluyen al imprimir/guardar PDF; no se almacenan en Supabase. El envío por WhatsApp se hace adjuntando manualmente el PDF. Los recordatorios conservan las autorizaciones y configuración de la integración existente; no se afirma entrega de mensajes.

## Verificación
Pruebas de lógica de roles, visibilidad de Inicio, cantidades/importes y CSV. Pruebas SQL con rollback: catálogo admin, consulta owner, rechazo de escrituras owner, proforma persistida y subtotal, rechazo de precio alterado y aislamiento entre talleres. No se crean cuentas de prueba ni datos permanentes para estas comprobaciones.

La propuesta de demostración en propuesta-recepcion/ se conserva separada; no se usa como sesión de la plataforma real.

Verificación adicional: navegador aislado con API simulada para owner y admin, proforma de 118 USD, selección de servicio al agendar y ausencia de desbordamiento horizontal a 390, 768 y 1440 píxeles. Consultas reales al RPC bajo rol authenticated y pruebas transaccionales de permisos completadas. No se ha simulado entrega de WhatsApp.
