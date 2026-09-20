# Backlog marcado

## Búsqueda web del modelo

Implementado detrás de la API. Un único botón activa o desactiva la herramienta
web sobre el mismo modelo configurado en NVIDIA; no existe un modelo de búsqueda
separado. Solo requiere `OPENROUTER_API_KEY`, las claves no llegan al cliente y
la herramienta server-side limita resultados y tamaño del contexto recuperado.

## Autenticación con GitHub y Google

Implementado en web y móvil con Better Auth. Se habilita proveedor a proveedor
al configurar sus credenciales, se respeta el cierre global del registro y cada
acceso se refleja en `account`. Falta hacer un smoke real contra GitHub y
Google en producción.

## Decisión: chat temporal

Implementado con la semántica **borrar al salir**. El chat temporal usa el
mismo streaming validado que una conversación normal durante la sesión, pero
no aparece en el historial y se elimina al pulsar «Salir» o al navegar fuera
de él. El cierre abrupto de una pestaña/app solo permite una limpieza de mejor
esfuerzo; si se requiere una garantía criptográfica de no persistencia habrá
que crear un protocolo de generación efímera en backend y en el bridge móvil.
