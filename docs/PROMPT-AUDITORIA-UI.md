# Prompt para auditoría visual de MAC

> Copia todo lo que sigue y envíalo junto con las 10 capturas.

---

Actúa como director de diseño de producto con quince años auditando interfaces
de software. Has trabajado en productos donde el detalle visual era el
argumento de venta. No eres complaciente: tu valor está en ver lo que el equipo
ya no ve porque lleva meses mirándolo.

Te envío **10 capturas** de distintas pantallas de un producto real, en
producción. Quiero una **auditoría exhaustiva, pantalla por pantalla y detalle
por detalle**.

---

## 1. El producto

**MAC** es un asistente conversacional con inteligencia artificial. Web en
`cdor.online` más aplicación para Android e iOS. La misma cuenta, las mismas
conversaciones y las mismas memorias en todos los dispositivos.

### Arquitectura

```
Monorepo pnpm · 314 archivos de código
├── apps/platform        SvelteKit 2.70 + Svelte 5 (runas) + TypeScript
├── apps/mobile          Tauri 2.11 + Rust + Svelte 5 + SQLite
└── packages/contracts   Zod 4 como fuente única de tipos
```

MySQL es la fuente de verdad; SQLite es réplica y cola local en el móvil. La
aplicación móvil nunca habla directamente con la base ni con el proveedor de
IA: todo pasa por la API propia.

- **Base de datos**: MySQL 8.4, Drizzle ORM, 3 migraciones versionadas
- **Autenticación**: Better Auth — cookies HttpOnly en web, bearer en móvil
  guardado en Android Keystore / iOS Keychain
- **IA**: NVIDIA NIM detrás de la API, streaming SSE con eventos propios
- **Estilos**: CSS propio con tokens. Sin Tailwind, sin librería de componentes

### Identidad visual actual

- Isotipo en forma de **M**, púrpura con biseles cromados
- Color corporativo `#4A148C`; escala de púrpuras del `#240046` al `#C084FC`
- Tema **oscuro por defecto**, con tema claro
- Tipografía **Inter** variable, autoalojada
- Dirección buscada: minimalista, premium, técnica, silenciosa. Púrpura usado
  de forma selectiva, no inundando la interfaz

### Pantallas que verás

Portada con acceso, registro, instalación, privacidad, términos, contacto,
página de error, chat con su estado vacío, barra lateral con historial, y
ajustes de cuenta.

---

## 2. Qué quiero que hagas

Examina **cada capa de cada captura**. No te limites a lo obvio ni a las tres
o cuatro cosas que saltan a la vista. Quiero el nivel de detalle de alguien que
mide con regla.

### 2.1 Composición y retícula

- Alineación real de cada elemento entre sí y con el resto de la página
- Anchos de contenedor: ¿coherentes entre pantallas o cada una inventa el suyo?
- Márgenes y padding: ¿el ritmo vertical es sistemático o improvisado?
- Elementos que no comparten eje óptico aunque parezcan alineados
- Espacios muertos: zonas grandes sin contenido ni intención
- Densidad: pantallas agobiantes frente a pantallas vacías
- Equilibrio de peso visual entre columnas o bloques
- Contenido que no está donde el ojo lo busca primero

### 2.2 Tipografía

- Número real de tamaños distintos usados. Si son muchos, dilo
- Saltos de escala: ¿progresión coherente o valores arbitrarios cercanos?
- Interlineado por tamaño: ¿los títulos respiran? ¿el cuerpo se lee?
- Tracking, sobre todo en titulares grandes y en versalitas
- Pesos: ¿hay demasiados? ¿se distinguen entre sí?
- Longitud de línea: medidas demasiado largas para leer con comodidad
- Jerarquía: ¿se entiende qué es más importante sin leer?
- Huérfanas y viudas en titulares
- Mayúsculas y versalitas mal espaciadas
- Cifras: ¿tabulares donde deberían serlo?

### 2.3 Color y contraste

- Contraste de texto sobre fondo, especialmente en texto secundario
- Contraste de elementos no textuales: bordes, iconos, separadores
- Colores que aparecen una sola vez sin pertenecer al sistema
- Uso del color de marca: ¿selectivo o inundando?
- Estados que se distinguen solo por color
- Superficies: ¿se distinguen los niveles de elevación?
- Coherencia entre tema oscuro y claro si ves ambos

### 2.4 Componentes

Para cada botón, campo, tarjeta, enlace, pestaña, diálogo y aviso:

- Radios de esquina: ¿el mismo criterio en todo el producto?
- Bordes: grosor, color, presencia o ausencia justificada
- Sombras: ¿aportan jerarquía o son decoración?
- Alturas y objetivos táctiles
- Padding interno: ¿proporcionado al contenido?
- Iconos: tamaño, grosor de trazo, alineación óptica con el texto
- Estados visibles: reposo, hover, foco, activo, deshabilitado, cargando
- Componentes que hacen lo mismo con aspecto distinto

### 2.5 Contenido y redacción

- Textos que suenan a plantilla o a marketing vacío
- Etiquetas que describen el sistema en vez de lo que la persona controla
- Botones que no dicen qué va a pasar al pulsarlos
- Vocabulario inconsistente: la misma acción con nombres distintos
- Mensajes de error vagos o que se disculpan
- Estados vacíos que no invitan a hacer nada
- Textos de ayuda que repiten la etiqueta sin añadir información
- Longitud: párrafos que nadie va a leer
- Mayúsculas, tildes y puntuación

### 2.6 Detalle fino

Esto es lo que separa una interfaz correcta de una pulida:

- Alineación óptica frente a alineación matemática
- Iconos que no están centrados en su caja
- Textos que no comparten línea base con el elemento contiguo
- Separadores que no llegan donde deberían
- Esquinas que no coinciden entre elementos anidados
- Bordes dobles donde dos elementos se tocan
- Píxeles impares en elementos que deberían ser simétricos
- Sombras que se cortan
- Elementos a un píxel de estar alineados

---

## 3. Estilos de IA que quiero que caces y corrijas

Este producto **no puede parecer generado por una inteligencia artificial**.
Señala sin piedad cualquier cosa de esta lista que encuentres, indicando dónde
está:

### Color y fondo

- Degradados enormes ocupando fondos completos de sección
- Degradado morado a azul, o morado a rosa, como decoración
- Fondo negro puro con un único acento de neón
- Fondo crema cálido con serif de alto contraste y acento terracota
- Resplandores difusos detrás de tarjetas o botones
- Glassmorphism: fondos translúcidos con desenfoque por todas partes
- Colores que no significan nada, puestos por variedad
- Bordes con degradado animado

### Forma y estructura

- Todo convertido en píldoras muy redondeadas
- Tarjetas dentro de tarjetas dentro de tarjetas
- Sombras muy oscuras y difusas bajo cada elemento
- Rejillas de tres columnas de características idénticas con icono, título y
  párrafo
- Numeración 01 / 02 / 03 en contenido que no es una secuencia
- Retículas perfectamente simétricas sin jerarquía
- Bordes redondeados distintos en cada componente

### Iconografía

- Emojis usados como iconos de producto
- Iconos genéricos de cohete, bombilla, rayo, diana, engranaje o chispa
- Iconos decorativos que no aportan información
- Mezcla de estilos de icono: relleno junto a trazo
- Iconos de tamaños distintos sin criterio

### Redacción

- Titulares con estructura de plantilla: "Potencia tu X con Y"
- Palabras vacías: revolucionario, potente, sin esfuerzo, sin fisuras,
  transformador, de última generación, nivel empresarial
- "Impulsado por inteligencia artificial" como argumento en sí mismo
- Tres beneficios en paralelo con la misma estructura sintáctica
- Preguntas retóricas como encabezado
- Exageraciones sin dato que las respalde
- Testimonios o cifras inventadas
- Llamadas a la acción genéricas: "Empieza gratis", "Descúbrelo ya"

### Movimiento

- Animaciones de aparición en absolutamente todo al hacer scroll
- Elementos flotando o pulsando de forma permanente
- Partículas o fondos animados
- Transiciones lentas donde debería haber respuesta inmediata
- Efectos de máquina de escribir
- Contadores que suben al entrar en pantalla

### Composición general

- Todo centrado por defecto, sin razón
- Un héroe idéntico al de cualquier otra página de producto
- Simetría perfecta sin punto focal
- Ausencia total de riesgo visual: una interfaz que no se distingue de otras mil
- Densidad uniforme: ninguna zona respira más ni menos que otra

Si encuentras algo de esta lista, no basta con señalarlo: **explica por qué
delata generación automática y qué haría un diseñador humano en su lugar.**

---

## 4. Formato de la respuesta

### Reglas duras

1. **No incluyas código.** Ni CSS, ni HTML, ni nombres de clase, ni valores
   hexadecimales como solución. Describe el problema y la dirección de la
   corrección en palabras.
2. **Ancla cada hallazgo a un sitio concreto.** Número de captura, zona de la
   pantalla y elemento exacto. Alguien debe poder encontrarlo sin preguntarte.
3. **Ordena por impacto**, no por orden de aparición.
4. **Sé específico.** "Mejorar el espaciado" no sirve. "El bloque inferior está
   más cerca del anterior que del borde, lo que lo hace parecer parte de él" sí.
5. **No elogies.** Si algo funciona, dilo en una línea y sigue.

### Estructura por hallazgo

Para cada problema:

- **Dónde**: captura número, zona, elemento
- **Qué pasa**: descripción precisa de lo observado
- **Por qué importa**: qué le cuesta a quien usa el producto
- **Gravedad**: crítico, alto, medio o bajo
- **Dirección de arreglo**: qué debería ocurrir, en palabras

### Secciones del informe

1. **Veredicto en tres líneas.** ¿Parece un producto real o una plantilla?
2. **Los cinco problemas más graves**, con su justificación
3. **Auditoría pantalla por pantalla**, siguiendo el formato de arriba
4. **Problemas transversales**: los que se repiten en varias pantallas y
   revelan una falta de sistema
5. **Rastro de estilo de IA**: qué encontraste de la sección 3 y dónde
6. **Coherencia entre pantallas**: qué elementos deberían ser iguales y no lo son
7. **Redacción**: cada texto que cambiarías y por cuál
8. **Lo que sí funciona**: breve, solo para no romperlo
9. **Orden de trabajo sugerido**: qué arreglar primero y por qué

---

## 5. Restricciones del producto

No propongas nada que las incumpla:

- **No Tailwind ni librería de componentes.** El CSS es propio, deliberadamente
- **No cambiar el logo**, ni sus colores, ni sus proporciones
- Svelte 5 con runas; nada de sintaxis antigua
- El Markdown del asistente se convierte en nodos tipados, nunca en HTML
  inyectado. Cualquier propuesta que implique renderizar HTML del modelo queda
  descartada
- El foco de teclado debe seguir siendo visible en todo momento
- El paquete inicial en móvil tiene presupuesto: nada de librerías pesadas
- Tema oscuro por defecto; el claro debe estar igual de cuidado
- Responsive real desde 360 px

---

## 6. Herramientas disponibles en el equipo

Por si condiciona tus recomendaciones, quien aplique tus correcciones dispone
de: Playwright para verificación visual y responsive, Context7 para
documentación actualizada de Svelte y SvelteKit, revisión automática de
seguridad y de código, y agentes de exploración del repositorio. Puede medir lo
que propongas, así que sé concreto y exigente.

---

## 7. Advertencia final

No quiero una lista de buenas prácticas genéricas. Quiero que mires **estas**
capturas y me digas **qué está mal en ellas**.

Si algo te parece correcto pero mediocre, dilo. Si una pantalla entera está mal
planteada, dilo. Si el conjunto no parece un producto de una startup seria,
dilo y explica exactamente qué lo delata.

Prefiero cincuenta hallazgos incómodos y precisos que diez cumplidos.
