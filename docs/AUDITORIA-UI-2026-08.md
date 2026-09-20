# Auditoría de UI — agosto de 2026

Revisión externa sobre 13 capturas de la superficie pública, tomadas **antes**
del refactor de los commits `1913584`…`91fc72b`. Se guarda íntegra porque la
primera vez se perdió al compactar la conversación.

No se auditaron: tema claro, privacidad, pantalla de error, chat, historial
lateral ni ajustes. Esas zonas siguen sin revisión visual externa.

## Estado de cada hallazgo

Marcado contra el código actual, no contra las capturas.

| # | Hallazgo | Estado |
|---|---|---|
| Grave 1 | No hay retícula compartida entre páginas | Parcial: `PublicShell` unifica cabecera, pie y anchos; falta revisar la portada |
| Grave 2 | Tipografía útil demasiado pequeña | Hecho: escala de seis pasos, suelo 0.75rem |
| Grave 3 | Instalación Android contradictoria | Hecho (`2bcea48`) |
| Grave 4 | Los flujos de autenticación parecen productos distintos | Hecho: `AuthCard` en las cinco pantallas |
| Grave 5 | Documentación con composiciones automáticas | Hecho: reescrita como referencia |
| 1.1 | Portada usa casi todo el ancho | Hecho: mismo eje que el resto vía `PublicShell` |
| 1.2 | Las dos columnas no comparten línea óptica | Hecho: `align-items: start` |
| 1.3 | Conversación de ejemplo parece relleno | Hecho: ejemplo con memoria y continuidad reales |
| 1.4 | Franja muerta antes del pie | Hecho: `align-content: start` |
| 1.5 | Campos y botón demasiado bajos | Hecho: 44px |
| 1.6 | Logo duplicado dentro de la tarjeta | Hecho: `AuthCard` no lo repite |
| 2.x | Rejillas rotas, CTA de plantilla, texto pequeño | Hecho con la reescritura de `/docs` |
| 3.1 | Tabla de sincronización con demasiadas columnas | Hecho: cuatro columnas a tres |
| 3.2 | Tipografía de tabla pequeña | Hecho |
| 3.3 | "Borrado definitivo" como tarjeta huérfana | Hecho: lista de definiciones |
| 3.4 | Aviso naranja aislado | Hecho: `--info` y `--warning` con filo lateral |
| 4.x | Sistemas de componentes mezclados en docs | Hecho |
| 5.x | Héroe genérico, rejilla de seis, "Ver guía", buscador falso | Hecho |
| 6.x | Instalación Android | Hecho |
| 7.x | Expo Go, cuenta de desarrollador, TestFlight | Hecho: retirados |
| 8.1 | Índice lateral demasiado estrecho | Pendiente |
| 8.2 | Cuerpo legal pequeño | Hecho |
| 8.3 | Estado activo del índice sutil | Pendiente |
| 8.4 | Fecha mezclada con mensaje de producto | Pendiente |
| 9.x | Contacto flotando en el vacío | Hecho, salvo la expectativa de respuesta |
| 10.1 | Título del registro demasiado grande | Hecho |
| 10.2 | Sin relación visible con términos y privacidad | Pendiente |
| 10.3 | Sin control para mostrar la contraseña | Hecho |
| 10.4 | Requisitos de contraseña diminutos | Hecho |
| 10.5 | Botón distinto al de acceso | Hecho: `.button` único |
| 11.x | Recuperación sin cabecera compartida | Hecho |
| 12.1 | Pie con microtipografía | Hecho |
| 12.2 | Copyright pegado al borde | Pendiente |
| 12.3 | Ancho del pie distinto | Hecho |
| 13.1 | Navegación pequeña | Hecho |
| 13.2 | Sin estado de página activa | Pendiente |
| 13.3 | Área pulsable limitada al texto | Hecho: 44px |
| 13.4 | Cabecera comprimida | Pendiente |

## Texto íntegro recibido

### 1. Veredicto en tres líneas

MAC parece un producto real en fase privada, pero su interfaz pública todavía
se percibe como una primera composición competente sin un sistema visual
completamente cerrado.

La identidad existe, pero cada familia de páginas interpreta por su cuenta el
ancho, la densidad, los botones, las tarjetas y la colocación vertical.

Lo que más lo acerca a una plantilla de IA no es el color: son las retículas
demasiado previsibles, los bloques repetidos, las preguntas genéricas y las
grandes zonas vacías sin intención.

### 2. Los cinco problemas más graves

1. **No existe una retícula compartida entre las páginas** (capturas 1, 5, 6,
   7, 8, 9, 12, 13). La portada ocupa casi todo el ancho, documentación usa un
   contenedor central estrecho, instalación queda anclada a la izquierda,
   términos adopta dos columnas y contacto vuelve a una tarjeta flotante.
   Gravedad alta.
2. **La tipografía útil es demasiado pequeña**: navegación, pies,
   documentación, tabla de sincronización, requisitos de contraseña, términos y
   textos auxiliares. Gravedad alta.
3. **Instalación para Android contiene una contradicción funcional**: dice que
   no hay versión publicada y debajo ordena descargar e instalar. Gravedad
   crítica.
4. **Los flujos de autenticación parecen productos distintos**: cambian ancho
   de tarjeta, cabecera, fondo, tamaño de título, estilo de botón y posición
   vertical. Gravedad alta.
5. **La documentación cae repetidamente en composiciones automáticas**:
   tarjetas idénticas, cuadrícula simétrica, grupos de tres con un elemento
   huérfano. Gravedad alta.

### 3. Auditoría pantalla por pantalla

**Captura 1 — Portada y acceso.** (1) El contenido usa casi todo el ancho de la
ventana; alta. (2) Las dos columnas no comienzan en una relación óptica clara;
medio. (3) La conversación de ejemplo se percibe como relleno: contenedor ancho
con dos frases brevísimas; medio. (4) Franja de espacio muerto antes del pie;
medio. (5) Campos y botón demasiado bajos; alta. (6) El logo grande dentro de
la tarjeta duplica información; bajo.

**Captura 2 — Documentación, atajos, seguridad y ayuda.** (1) Los grupos de
tres quedan como cuadrículas rotas, dos arriba y una huérfana; alta. (2) La
llamada de ayuda es un bloque de plantilla con pregunta retórica; medio. (3) El
tamaño del texto de las tarjetas es insuficiente; alta. (4) Todas las
superficies tienen casi el mismo peso; medio.

**Captura 3 — Memorias y sincronización.** (1) La tabla tiene demasiada
información para su ancho: cuatro columnas parten encabezados; alta. (2) La
tipografía de la tabla es especialmente pequeña; alta. (3) "Borrado definitivo"
queda como tarjeta huérfana siendo el paso más irreversible; medio. (4) El
aviso naranja introduce un lenguaje visual aislado; medio.

**Captura 4 — Espacio de trabajo y memorias.** (1) La sección cambia
repentinamente de sistema de componentes: filas con barra lateral frente a
tarjetas cerradas; alta. (2) El aviso azul no pertenece al lenguaje de marca
visible; medio. (3) Los avisos interrumpen el ritmo editorial; medio. (4) Los
encabezados tienen presencia adecuada pero el cuerpo cae demasiado; alta.

**Captura 5 — Portada de documentación.** (1) El titular se rompe en una línea
poco natural, "Usuario" queda aislado; medio. (2) Es un héroe de documentación
demasiado genérico: etiqueta en mayúsculas, titular centrado, párrafo y campo
en píldora; alta. (3) La cuadrícula de seis tarjetas no tiene jerarquía; alta.
(4) "Ver guía" se repite seis veces sin aportar información; medio. (5) El
buscador parece más decorativo que funcional; medio.

**Captura 6 — Instalación en Android.** (1) Se explican pasos que no pueden
ejecutarse; crítica. (2) La única opción utilizable está enterrada al final;
alta. (3) La mitad derecha de la página queda sin función; medio. (4) El botón
deshabilitado tiene escasa legibilidad; medio. (5) La advertencia sobre fuentes
externas domina la narrativa; medio.

**Captura 7 — Instalación en iPhone y iPad.** (1) El texto sobre la cuenta de
desarrollador está escrito desde la perspectiva del equipo; alta. (2) App
Store, TestFlight y Expo Go exponen demasiado el proceso interno; alta. (3) Se
repite dos veces la misma idea; medio. (4) El contenido está excesivamente
concentrado a la izquierda; medio. (5) La tarjeta recomendada contiene
demasiadas capas editoriales; medio.

**Captura 8 — Términos de uso.** (1) El índice lateral es demasiado estrecho y
las entradas saltan a dos o tres líneas; alta. (2) El cuerpo legal resulta
demasiado pequeño; alta. (3) El estado activo del índice es demasiado sutil;
medio. (4) La fecha está mezclada con un mensaje de producto ("Fase privada ·
31 de julio de 2026"); medio.

**Captura 9 — Contacto.** (1) La tarjeta flota dentro de una cantidad excesiva
de vacío; alta. (2) El botón principal es demasiado pequeño; alta. (3) Los
campos se distinguen poco del fondo de la tarjeta; medio. (4) Falta información
que genere confianza: tiempo de respuesta, tratamiento del correo; medio.

**Captura 10 — Registro.** (1) El título ocupa demasiado espacio dentro de una
tarjeta estrecha; alto. (2) Falta la relación visible con términos y
privacidad; alta. (3) No hay control para mostrar u ocultar contraseñas; medio.
(4) Los requisitos de contraseña son excesivamente pequeños; alta. (5) El botón
no coincide con el acceso: degradado frente a superficie lisa; medio.

**Captura 11 — Recuperación de contraseña.** (1) Falta completamente la
estructura de navegación compartida; alta. (2) La pantalla está dominada por
espacio muerto; alta. (3) "Volver a MAC" es ambiguo; medio. (4) La explicación
de privacidad suena mecánica; bajo.

**Captura 12 — Detalle del pie.** (1) Prácticamente todo el texto es demasiado
pequeño; alta. (2) La fila de copyright queda pegada al borde inferior; medio.
(3) El ancho no coincide claramente con otras capturas; medio.

**Captura 13 — Detalle de la cabecera.** (1) La navegación es demasiado
pequeña; alta. (2) No existe estado de página activa visible; medio. (3) El
área clicable parece limitarse al texto; alta. (4) La cabecera se siente
demasiado comprimida verticalmente; bajo.

### 4. Problemas transversales

**Retícula.** Al menos cuatro interpretaciones distintas del ancho de página.

**Escala tipográfica.** Demasiados tamaños pequeños próximos entre sí. La
escala falla por exceso de microvariaciones en la zona baja.

**Contraste.** Texto secundario, marcadores de posición, navegación, tabla y
pie excesivamente apagados. Exige medición sistemática.

**Componentes.** Varios lenguajes simultáneos: tarjetas con borde, filas con
barra lateral, avisos púrpuras/azules/naranjas, botones lisos y degradados,
campos de alturas diferentes, formularios con y sin cabecera.

**Ritmo vertical.** El espacio no jerarquiza; compensa composiciones.

**Navegación.** Sin estado activo; enlaces pequeños; el pie repite destinos con
legibilidad aún menor.

**Autenticación.** Acceso, registro y recuperación solo comparten el color.

**Contenido orientado al sistema.** Instalación expone certificados,
proveedores de distribución, Expo Go y tecnología móvil.

**Estados no demostrados.** Foco de teclado, errores de validación, envío en
curso, éxito, búsqueda sin resultados, botón cargando, tema claro, 360 píxeles.

### 5. Rastro de estilo de IA

**Encontrado:** cuadrículas perfectamente simétricas; tarjetas huérfanas en
composiciones de tres; pregunta retórica como CTA; héroe centrado con etiqueta,
titular y píldora; versalitas púrpuras usadas como etiqueta universal;
degradados de acción aislados.

**No encontrado, y no debe introducirse:** glassmorphism sistemático, fondos
con resplandores, partículas, emojis como iconos, iconografía de cohetes o
bombillas, degradados decorativos grandes, sombras difusas bajo todo.

### 6. Coherencia entre pantallas

Cabecera, pie, botón principal, formularios, tarjetas, avisos, títulos, enlaces
de regreso, nomenclatura y separadores: diez ejes donde las pantallas no
coinciden.

### 7. Redacción

| Actual | Propuesta |
|---|---|
| "TU ESPACIO PERSONAL" | "RETOMA TU TRABAJO" o eliminar la etiqueta |
| "Conversaciones, ideas y contexto en un solo lugar. Lo que quieras recordar se queda; lo demás, no." | "Tus conversaciones y memorias, sincronizadas para continuar donde las dejaste." |
| "Continúa con MAC" | "Inicia sesión" |
| "El acceso está reservado a las cuentas invitadas." | "Acceso por invitación." |
| "Manual Técnico y Guía del Usuario" | "Documentación de MAC" |
| "Ver guía" | Acciones concretas o bloque clicable |
| "¿Necesitas asistencia o tienes alguna pregunta específica?" | "¿Necesitas ayuda?" |
| "Ir al Formulario de Contacto" | "Contactar con soporte" |
| "Lleva MAC a tu teléfono" | "Instala MAC en tu teléfono" |
| "Descarga no disponible" | "Android aún no está disponible" |
| "Sin instalar nada" | "Usar MAC en el navegador" |
| "No necesitas App Store, ni cuenta de desarrollador, ni pagar nada." | "Puedes usar MAC como aplicación web desde Safari." |
| "Otras vías, y por qué no las ofrecemos aún" | "Disponibilidad en App Store" |
| Párrafo sobre Expo Go | Eliminarlo completamente |
| "FASE PRIVADA · 31 DE JULIO DE 2026" | "Vigentes desde el 31 de julio de 2026", con fase privada en aviso separado |
| "Contacto y Soporte" | "Contacta con soporte" |
| "¿Tienes alguna duda, consulta o necesitas ayuda con tu cuenta?" | "Cuéntanos qué necesitas y te responderemos por correo." |
| "PRIMERA VEZ AQUÍ" | Eliminar |
| "Un correo, una contraseña y ya está." | "Usa un correo al que tengas acceso. Tendrás que verificarlo antes de entrar." |
| "Nombre" | "Nombre completo", si realmente se necesita completo |
| "Volver a MAC" | "Volver a iniciar sesión" |
| "La respuesta es la misma exista o no, para proteger tu privacidad." | "Mostraremos el mismo mensaje tanto si el correo está registrado como si no." |

### 8. Lo que sí funciona

El isotipo se usa con moderación y no debe modificarse. El púrpura no invade el
fondo. La ausencia de iconos decorativos, glassmorphism y efectos llamativos
favorece la dirección silenciosa buscada. El titular principal de la portada
tiene más personalidad que el resto de la redacción. El índice lateral de
términos es válido: necesita más espacio y legibilidad, no ser reemplazado.

### 9. Orden de trabajo sugerido

1. Sistema base: retícula, anchos, escala, contraste, altura de controles,
   radios, bordes, botones y avisos.
2. Autenticación: unificar y añadir visibilidad de contraseña, relación con
   términos, estados de error, carga y confirmación.
3. Instalación: eliminar la contradicción de Android, reescribir iOS.
4. Documentación: romper las cuadrículas, aumentar el cuerpo, corregir la tabla.
5. Navegación y páginas secundarias: unificar cabecera y pie, marcar la ruta
   activa, ampliar objetivos táctiles, reconstruir contacto.
6. Validación: escritorio, anchuras intermedias, 360 píxeles, tema claro,
   teclado, foco, errores, carga, deshabilitado y contraste.
