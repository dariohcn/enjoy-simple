# Activar WhatsApp por taller en enjoy

La integración ya está preparada. Los envíos se habilitan por taller después de autorizar su número y aprobar la plantilla. Utiliza WhatsApp Business y la conexión oficial de cuentas existentes de Meta.

## Lo que realiza el administrador de enjoy una vez

1. Entre a https://developers.facebook.com/apps/ con la cuenta administradora del negocio de enjoy.
2. Cree o seleccione la aplicación de enjoy. Añada WhatsApp y Facebook Login for Business.
3. Complete la habilitación de enjoy como proveedor tecnológico, la verificación empresarial y los permisos avanzados que solicite Meta para conectar negocios externos. Los permisos de mensajería son `whatsapp_business_management` y `whatsapp_business_messaging`. Meta también solicita información del negocio, política de privacidad e instrucciones de eliminación de datos.
4. En Facebook Login for Business cree una configuración de registro integrado v4 con Cloud API y conexión de usuarios de WhatsApp Business. Copie su identificador.
5. En los ajustes del inicio de sesión habilite HTTPS, inicio de sesión web, inicio de sesión mediante JavaScript y registro integrado. Autorice el dominio `dariohcn.github.io` y la URL de enjoy `https://dariohcn.github.io/enjoy-simple/`.
6. Anote el identificador de la aplicación, el identificador de configuración y la versión de Graph API que muestra su aplicación.
7. Abra enjoy como administrador. En Administración, vaya a WhatsApp de los talleres, ingrese esos tres datos y pulse Guardar configuración.
8. En la configuración segura del servidor, guarde `META_APP_SECRET` con la clave privada de la aplicación y `WHATSAPP_WEBHOOK_VERIFY_TOKEN` con una cadena aleatoria de al menos 32 caracteres elegida para verificar el callback. Estos valores se ingresan en Edge Functions → Secrets del proyecto enjoy. Nunca se colocan en el repositorio ni en el código de la página.
9. En la configuración de WhatsApp de Meta registre este callback HTTPS

   `https://bxidvrwnigthrhshenfq.supabase.co/functions/v1/workshop-whatsapp`

   Use la misma cadena de verificación del paso 8 y suscriba los eventos `messages`, `message_template_status_update`, `account_update`, `history`, `smb_app_state_sync` y `smb_message_echoes`.
10. Publique la aplicación cuando Meta complete las revisiones. Durante desarrollo solo podrán autorizar las personas y negocios habilitados para las pruebas de la aplicación.

La clave privada se configura una vez para enjoy. Cada taller autoriza su propia cuenta mediante Meta. El servidor cifra la autorización de cada taller y mantiene su número separado del resto.

## Lo que realiza cada propietario de taller

1. Ingrese a enjoy y abra Configuración de usuario → WhatsApp del taller.
2. Pulse Conectar WhatsApp Business.
3. En el asistente de Meta autorice su cuenta, seleccione su negocio y confirme el número que utiliza en WhatsApp Business.
4. Complete la confirmación desde el teléfono según las instrucciones del asistente. Mantenga la aplicación de WhatsApp Business abierta mientras se completa la conexión.
5. Pulse Comprobar conexión cuando sea necesario. La pantalla solo indica Conectado cuando la sincronización y la aprobación del recordatorio están completas.

El asistente puede solicitar elegir o crear un portafolio de negocio y añadir un método de pago. Cada negocio debe completar las autorizaciones que Meta solicite.

La conexión guarda sus credenciales de manera cifrada. Al vencer o retirar la autorización, el propietario debe volver a conectar. Desconectar en enjoy detiene los recordatorios y elimina la credencial guardada. La cuenta también puede desvincularse desde WhatsApp Business → Configuración → Cuenta → Plataforma empresarial.

## Recordatorios

La plantilla de utilidad se crea en la cuenta del taller con el nombre `enjoy_recordatorio_cita_v1`, en español. Meta debe aprobarla. Su contenido es

> {{1}} le recuerda su cita. Cliente: {{2}}. Vehículo: {{3}}. Fecha: {{4}}. Hora: {{5}}. Servicio: {{6}}.

Los parámetros corresponden al nombre del taller, nombre del cliente, placa, fecha, hora y trabajo solicitado. Los mensajes salen desde el número del taller correspondiente una hora antes de la cita.

El cliente debe tener un teléfono válido con código de país y haber autorizado los recordatorios. La autorización se registra en su ficha. La cita debe tener una fecha y hora futuras.

El recordatorio al propietario utiliza el teléfono de contacto del taller y su autorización. Si coincide con el número emisor, se muestra el bloqueo correspondiente. Para recibirlo en WhatsApp, el propietario debe registrar un número receptor distinto. La alerta interna de enjoy está disponible con la plataforma abierta.

Al reagendar se cancelan los recordatorios pendientes del horario anterior y se prepara el nuevo horario. Se distinguen los estados Aceptado por WhatsApp, Entregado al celular y Leído. Los envíos cuyo resultado es incierto requieren revisión para evitar duplicados.

## Costos y medición

Meta puede cobrar por los mensajes de plantilla. Las tarifas dependen del país y del tipo de mensaje. Esta integración no incorpora inteligencia artificial ni consumo de tokens de IA para enviar recordatorios.

Se conservan durante 14 días los identificadores técnicos de las confirmaciones de entrega para procesar correctamente los callbacks. El contenido de conversaciones y contactos recibido durante la sincronización se acusa como recibido y no se incorpora a las fichas de clientes.

## Validación realizada

Se verificaron las autorizaciones de propietario y administrador, el cifrado, la separación de conexiones, el procesamiento de callbacks firmados y la selección de credenciales por taller. Las pruebas transaccionales se revirtieron y las pruebas de Meta utilizaron respuestas simuladas. La primera autorización y un mensaje real requieren completar la activación externa descrita en esta guía.

## Documentación oficial

- Registro integrado https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation
- Configuración v4 https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4
- Cuentas existentes de WhatsApp Business https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- Tarifas https://business.whatsapp.com/products/platform-pricing
