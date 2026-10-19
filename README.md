# enjoy · Instalación sencilla

Interfaz estática lista para GitHub Pages. No requiere npm, compilación, instalación de paquetes ni un workflow propio.

1. Suba todos los archivos y la carpeta assets a la raíz del repositorio público.
2. En Settings → Pages, seleccione Deploy from a branch → main → / (root) y guarde.
3. Abra el enlace únicamente después de que GitHub confirme la publicación.

La conexión existente se conserva en config.js, con una clave publicable. No suba contraseñas ni claves privadas. No necesita reinstalar la base de datos actual.

La publicación depende de que GitHub permita Pages y el procesamiento de despliegues en la cuenta. Este proyecto no elimina restricciones impuestas por GitHub.
