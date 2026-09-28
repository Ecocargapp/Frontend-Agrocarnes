# Frontend-Agrocarnes

Interfaz web de Agrocarnes / Restaurante / D'Monsa Alimentos. HTML, CSS y
JavaScript puro, sin framework, servido como archivos estáticos por nginx —
mismo criterio que la app de AgroSoft.

La API está en [Backend-Agrocarnes](https://github.com/Ecocargapp/Backend-Agrocarnes);
`js/app.js` apunta a `https://api-agrocarnes.agrofranpabel.com` en producción
y a `http://localhost:4001` cuando se abre desde `localhost`.

## Despliegue

En el servidor este repo se clona directo en la carpeta que sirve nginx:

```bash
sudo git clone https://github.com/Ecocargapp/Frontend-Agrocarnes.git /var/www/app-agrocarnes
# despliegues siguientes:
cd /var/www/app-agrocarnes && git pull
```

Se publica en `https://agrocarnes.agrofranpabel.com`.

## Documentación

La documentación completa del sistema (frontend incluido) y la bitácora de
cambios viven en el repositorio del backend:
[Backend-Agrocarnes/docs](https://github.com/Ecocargapp/Backend-Agrocarnes/tree/main/docs) ·
[CHANGELOG](https://github.com/Ecocargapp/Backend-Agrocarnes/blob/main/CHANGELOG.md).
