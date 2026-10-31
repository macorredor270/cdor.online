# MISIÓN: REFACTORIZACIÓN INTEGRAL DE UI/UX DE MAC

Trabaja directamente sobre el monorepo de MAC y ejecuta una refactorización completa, funcional y verificable de la interfaz web ubicada principalmente en:

apps/platform

No quiero una propuesta conceptual, un mockup aislado ni una lista de recomendaciones. Quiero que inspecciones el repositorio, diseñes la solución, implementes los cambios, pruebes la aplicación real y entregues evidencia.

Toma como fuente de verdad el handoff técnico que te he entregado inmediatamente antes de este mensaje.

---

# 1. OBJETIVO VISUAL

Transforma MAC en un chatbot profesional, extremadamente limpio, preciso y moderno, inspirado en la disciplina visual de productos como Vercel y los mejores asistentes de IA actuales, pero sin copiar literalmente su identidad.

La dirección visual debe ser:

- Minimalista y premium.
- Limpia, técnica y silenciosa.
- Oscura por defecto, con tema claro igualmente cuidado.
- Excelente jerarquía tipográfica.
- Bordes finos y superficies bien separadas.
- Sombras mínimas.
- Espaciado consistente.
- Púrpura MAC usado de forma selectiva, no inundando la interfaz.
- Acabado cromado de la marca utilizado con mucha moderación.
- Animaciones rápidas y funcionales.
- Interfaces densas cuando sea útil, pero nunca agobiantes.
- Responsive real desde 360 px hasta monitores grandes.
- Accesible con teclado y lector de pantalla.

No quiero:

- Glassmorphism excesivo.
- Gradientes gigantes.
- Tarjetas dentro de tarjetas sin necesidad.
- Todo convertido en píldoras.
- Sombras oscuras exageradas.
- Emojis utilizados como iconos de producto.
- Una apariencia genérica de plantilla SaaS.
- Una copia visual de Vercel.
- Cambiar el logo, sus colores o sus proporciones.
- Rediseñar solo la landing y dejar descuidado el producto autenticado.

---

# 2. CONTRATO OBLIGATORIO DE PLUGINS

Debes utilizar de forma explícita los plugins instalados. No basta con mencionarlos en el informe final.

Plugins requeridos:

- frontend-design@claude-plugins-official
- feature-dev@claude-plugins-official
- superpowers@claude-plugins-official
- context7@claude-plugins-official
- playwright@claude-plugins-official
- security-guidance@claude-plugins-official
- code-review@claude-plugins-official
- github@claude-plugins-official
- caveman@caveman

Uso obligatorio:

1. `superpowers`
   - Descomponer el trabajo.
   - Definir fases.
   - Aplicar depuración y verificación sistemática.
   - Evitar cambios improvisados.

2. `feature-dev`
   - Explorar el repositorio.
   - Identificar contratos existentes.
   - Diseñar la implementación end-to-end.
   - Coordinar cambios que afecten UI, rutas y API.

3. `frontend-design`
   - Definir la dirección visual.
   - Revisar jerarquía, tipografía, densidad, composición y responsive.
   - Evitar una interfaz genérica generada por IA.

4. `context7`
   - Consultar documentación actual de Svelte 5, SvelteKit 2 y las APIs utilizadas.
   - Consultar la API adecuada de Shiki antes de implementarlo.
   - No asumir sintaxis de Svelte 4 ni APIs antiguas.

5. `playwright`
   - Capturar la interfaz actual antes de modificarla.
   - Probar visualmente la implementación.
   - Verificar escritorio, tablet y móvil.
   - Probar tema oscuro y claro.
   - Probar interacciones reales.

6. `security-guidance`
   - Revisar Markdown, enlaces, diálogos destructivos, portapapeles y endpoints.
   - Comprobar que no se introduce `{@html}`.
   - Comprobar que no se exponen secretos ni mensajes internos.

7. `code-review`
   - Revisar el diff completo al final.
   - Buscar regresiones, duplicación, errores silenciosos, accesibilidad y problemas de tipos.

8. `github`
   - Inspeccionar estado, historial y diferencias.
   - No hacer push.
   - No abrir pull request.
   - No reescribir historial.
   - No resetear ni descartar cambios.

9. `caveman`
   - Puede mantener las respuestas compactas.
   - No puede omitir el plan, las verificaciones, los errores encontrados, los plugins usados ni el informe final.

En tu primera respuesta debes mostrar una tabla breve:

Plugin | Uso concreto en esta tarea | Momento de ejecución

Si cualquiera de los plugins obligatorios no puede utilizarse, detente antes de modificar archivos y explica exactamente cuál no está disponible.

---

# 3. SEGURIDAD OPERATIVA ANTES DE EDITAR

Antes de tocar código:

1. Ejecuta `git status`.
2. Identifica la rama actual.
3. Inspecciona los 14 commits locales que todavía no están en GitHub.
4. No hagas `reset`, `rebase`, `checkout --force`, `clean`, `stash` ni descartes archivos.
5. No sobrescribas trabajo existente.
6. No hagas push porque la autenticación del remoto no está resuelta.
7. No despliegues a producción.
8. No modifiques la base de datos de producción.
9. No muestres, reutilices ni copies la contraseña SSH vista en capturas anteriores.
10. Considera el despliegue manual y la deriva del servidor como un riesgo externo, no como parte de este refactor.

Si el working tree contiene cambios no relacionados que puedan entrar en conflicto, documenta el riesgo antes de continuar. No los elimines.

Puedes crear una rama de trabajo solo si hacerlo no pone en riesgo cambios existentes. Nombre sugerido:

refactor/ui-professional-clean

No publiques la rama.

---

# 4. RESTRICCIONES TÉCNICAS NO NEGOCIABLES

Debes preservar estrictamente lo siguiente:

## Svelte

- SvelteKit 2.70.
- Svelte 5 con runas.
- `$state`, `$derived`, `$props` y `$effect`.
- No introducir sintaxis nueva de Svelte 4.
- El archivo de registro que aún utiliza `$:` puede migrarse cuidadosamente a runas.

## Seguridad de Markdown

- Está prohibido introducir `{@html}`.
- Está prohibido renderizar HTML producido por el modelo.
- El Markdown debe seguir convirtiéndose en nodos Svelte tipados.
- Solo se permiten enlaces `http` y `https`.
- Los enlaces externos deben mantener `noopener noreferrer`.
- El HTML recibido debe seguir mostrándose como texto.

## Accesibilidad

- No eliminar ni debilitar `:focus-visible`.
- No añadir `outline: none`.
- Mantener `prefers-reduced-motion`.
- Mantener las regiones `aria-live`.
- Mantener `role="alert"` y `role="status"` donde corresponda.
- Mantener etiquetas accesibles para botones con iconos.
- Garantizar navegación completa por teclado.
- Objetivos táctiles de aproximadamente 44 × 44 px en móvil.

## Rendimiento

- Bundle inicial móvil comprimido inferior a 250 KiB.
- Scroll de conversaciones largas a 60 FPS.
- Streaming agrupado entre 20 y 50 ms.
- Conservar `content-visibility: auto`.
- Conservar paginación de mensajes de 50.
- No incorporar Tailwind.
- No incorporar una librería completa de componentes.
- No añadir una librería pesada sin demostrar su impacto.
- Evitar blur costoso y efectos permanentes que provoquen repaints.
- Preferir animaciones de `transform` y `opacity`.

## Logo

- Usar `$lib/components/Logo.svelte`.
- Mantener `srcset`.
- Mantener `object-fit: contain`.
- No recortar.
- No deformar.
- No aplicar filtros CSS que cambien sus colores.
- No sustituir el isotipo por texto plano.

## Backend

- No romper Better Auth.
- No romper cookies HttpOnly.
- No romper autenticación bearer móvil.
- No romper SSE por POST.
- No cambiar contratos compartidos sin revisar `packages/contracts`.
- Validar entradas nuevas con Zod.
- No crear funcionalidades falsas que solo existan visualmente.

---

# 5. FASE 0: AUDITORÍA Y LÍNEA BASE

Antes de implementar:

1. Explora la estructura completa de `apps/platform`.
2. Localiza:
   - layouts públicos;
   - layouts autenticados;
   - renderizador Markdown;
   - componentes del chat;
   - barra lateral;
   - acciones destructivas;
   - errores inline;
   - estados de carga;
   - variables CSS;
   - rutas legales;
   - endpoints de conversaciones.
3. Ejecuta la aplicación localmente.
4. Usa Playwright para capturar el estado actual en:
   - 1440 × 900;
   - 1024 × 768;
   - 390 × 844.
5. Captura como mínimo:
   - `/`;
   - `/register`;
   - `/privacy`;
   - una URL inexistente;
   - `/chat`;
   - una conversación;
   - `/account`.
6. Revisa tema oscuro y claro.
7. Registra problemas de:
   - desbordamiento;
   - layout shift;
   - contraste;
   - navegación por teclado;
   - móvil;
   - densidad;
   - feedback de acciones.

No empieces modificando CSS a ciegas.

---

# 6. SISTEMA DE DISEÑO

Centraliza el sistema visual en `apps/platform/src/app.css`.

## Tipografía

Añade y propaga una escala consistente, por ejemplo:

--text-xs: 0.75rem;
--text-sm: 0.875rem;
--text-base: 1rem;
--text-lg: 1.125rem;
--text-xl: 1.375rem;
--text-2xl: 1.75rem;

Ajusta line-height y tracking según el uso.

Elimina valores dispersos como:

- 0.74rem
- 0.83rem
- 0.85rem
- 0.87rem

No los reemplaces por otra colección arbitraria de tamaños.

## Espaciado

Define una escala pequeña y utilizable, basada en incrementos coherentes:

- 4 px
- 8 px
- 12 px
- 16 px
- 24 px
- 32 px
- 48 px

No hace falta convertir absolutamente cada píxel en un token, pero sí eliminar inconsistencias sistémicas.

## Radios

Mantén como base:

- `--radius-control: 12px`
- `--radius-card: 16px`

Añade solo los radios adicionales realmente necesarios, por ejemplo:

- `--radius-sm`
- `--radius-panel`
- `--radius-pill`

Elimina radios arbitrarios dispersos.

## Bordes y superficies

Establece una jerarquía clara:

- fondo principal;
- superficie primaria;
- superficie secundaria;
- superficie elevada;
- borde sutil;
- borde fuerte;
- estado activo;
- estado hover.

No dependas únicamente de sombras para separar niveles.

## Acabado cromado

Utiliza `--mac-chrome-edge` de manera selectiva:

- contorno sutil del logo;
- detalle del elemento activo;
- borde premium en estados destacados;
- separador puntual.

No lo apliques a todas las tarjetas ni conviertas la aplicación en una interfaz brillante.

## Movimiento

Usa los tokens existentes:

- `--motion-fast`
- `--motion-base`
- `--easing`

Las transiciones deben comunicar estado, no decorar.

---

# 7. UNIFICAR LA SUPERFICIE PÚBLICA

Elimina la fragmentación entre:

- `landing-shell`
- `register-shell`
- `auth-page`
- páginas legales con `main` sin shell

Crea un único shell público reutilizable, con variantes justificadas.

Debe proporcionar:

- cabecera de marca consistente;
- logo real;
- navegación mínima;
- ancho y espaciado coherentes;
- footer común;
- soporte para contenido centrado;
- soporte para contenido dividido;
- soporte para artículos legales;
- tema oscuro y claro;
- responsive.

## Registro

Corrige el registro descentrado.

En escritorio:

- o centra correctamente la tarjeta;
- o crea una composición de dos columnas útil y equilibrada.

Si utilizas dos columnas, la secundaria debe aportar valor real:

- privacidad;
- sincronización entre dispositivos;
- memoria;
- seguridad;
- ejemplos de uso.

No rellenes espacio con frases de marketing genéricas.

En móvil debe quedar una sola columna clara.

---

# 8. PÁGINA DE ERROR

Crea `+error.svelte` siguiendo las prácticas actuales de SvelteKit.

Debe diseñar al menos:

- 404;
- errores 5xx;
- errores genéricos.

Requisitos:

- logo MAC;
- código de error;
- título comprensible;
- mensaje humano;
- acción para volver;
- acción para ir al inicio;
- reintentar solo cuando tenga sentido;
- no mostrar stack traces;
- no mostrar información interna;
- mismo tema que la aplicación;
- responsive;
- accesible.

El 404 ya no puede mostrar la pantalla blanca predeterminada de SvelteKit.

---

# 9. DIÁLOGOS DE CONFIRMACIÓN

Elimina los tres `confirm()` nativos.

Crea un componente reutilizable y accesible, preferiblemente basado en `<dialog>` nativo si resulta adecuado.

Debe incluir:

- título;
- descripción;
- acción principal;
- cancelar;
- variante destructiva;
- foco inicial adecuado;
- cierre con Escape;
- devolución de foco al elemento que lo abrió;
- bloqueo correcto del fondo;
- nombres accesibles;
- soporte para móvil;
- reduced motion;
- prevención de dobles envíos;
- estado loading.

Flujos:

1. Revocar dispositivo.
2. Eliminar conversación.
3. Eliminar cuenta.

Para eliminar cuenta utiliza confirmación reforzada, por ejemplo escribir una palabra concreta, si encaja con el flujo actual.

Nunca utilices color como único indicador de peligro.

---

# 10. SISTEMA DE TOASTS

Implementa un sistema propio, ligero y accesible.

Debe soportar:

- éxito;
- error;
- información;
- advertencia;
- acciones asíncronas;
- deduplicación básica;
- cierre manual;
- autocierre razonable;
- pausa al recibir hover o foco;
- `role="status"` para estados normales;
- `role="alert"` para errores importantes;
- reduced motion;
- posición segura en escritorio y móvil;
- `env(safe-area-inset-bottom)` cuando corresponda.

Úsalo para acciones como:

- copiar código;
- copiar mensaje;
- renombrar conversación;
- eliminar conversación;
- revocar dispositivo;
- guardar preferencias;
- errores de sincronización;
- acciones cuya respuesta podría quedar fuera del viewport.

Los errores inline pueden mantenerse cuando son errores de formulario asociados directamente a un campo.

---

# 11. SKELETONS Y ESTADOS DE CARGA

Añade skeletons ligeros para:

- historial de conversaciones;
- carga inicial de una conversación;
- dispositivos;
- memorias;
- consumo de uso cuando sea apropiado.

Requisitos:

- sin layout shift;
- dimensiones similares al contenido final;
- `aria-hidden="true"` en la parte puramente visual;
- estado accesible separado;
- animación desactivada con reduced motion;
- no usar una dependencia externa.

No sustituyas todas las cargas por skeletons: utiliza spinner o estado textual cuando sea más apropiado.

---

# 12. CHAT PROFESIONAL

## Resaltado de sintaxis

Implementa resaltado con Shiki de forma diferida.

Condiciones obligatorias:

- Shiki no debe formar parte del bundle inicial.
- Cárgalo mediante importación dinámica cuando aparezca el primer bloque de código.
- Cachea la instancia o el highlighter.
- Carga únicamente lenguajes y temas necesarios.
- Proporciona fallback inmediato en texto monoespaciado mientras carga.
- No bloquees el streaming.
- No introduzcas `{@html}`.
- No insertes HTML generado por Shiki.

Utiliza una API de Shiki que devuelva tokens o líneas tokenizadas y renderízalos mediante nodos y `<span>` de Svelte.

Los estilos de token deben proceder del tema estático elegido, no de contenido arbitrario del modelo.

## Componente de bloque de código

Crea un componente dedicado con:

- nombre del lenguaje;
- botón de copiar;
- confirmación mediante toast;
- estado copiado;
- scroll horizontal;
- contraste correcto;
- soporte de tema;
- fallback para lenguaje desconocido;
- teclado;
- etiquetas accesibles;
- no romper líneas salvo que exista una opción explícita;
- aspecto sobrio y técnico.

Mantén también la acción de copiar el mensaje completo.

## Streaming

No rompas:

- eventos `start`, `delta`, `usage`, `done`, `error`;
- lotes de 30 ms o 512 bytes;
- cancelar;
- regenerar;
- aria-live;
- rendimiento de mensajes largos.

No vuelvas a tokenizar toda la conversación en cada delta. El resaltado debe realizarse de forma controlada cuando el bloque esté completo o mediante una estrategia que no degrade el streaming.

## Estado vacío

Rediseña el estado vacío del chat.

Debe incluir:

- identidad MAC discreta;
- encabezado fuerte;
- descripción breve;
- entre cuatro y seis sugerencias reales;
- categorías útiles;
- interacción que inserte o envíe la sugerencia;
- responsive;
- navegación por teclado;
- sin ilustraciones pesadas;
- sin carácter `✦` aislado como único elemento visual.

Ejemplos de categorías:

- Programar.
- Analizar.
- Escribir.
- Planificar.
- Aprender.
- Resumir.

---

# 13. BARRA LATERAL

Rediseña la jerarquía completa.

Orden visual recomendado:

1. Marca.
2. Nueva conversación.
3. Buscador.
4. Historial.
5. Navegación secundaria.
6. Perfil.

## Historial

Agrupa las conversaciones por fecha:

- Hoy.
- Ayer.
- Esta semana.
- Anteriores.

Utiliza fechas reales y `Intl`, no comparaciones frágiles de strings.

## Búsqueda

Añade:

- campo de búsqueda;
- botón para limpiar;
- filtrado inmediato de datos cargados;
- estado sin resultados;
- teclado accesible.

Si buscar todas las conversaciones requiere API, implementa búsqueda real y paginada. No simules que busca en elementos que todavía no se han cargado.

## Menú de conversación

Añade un menú contextual o de overflow con:

- renombrar;
- eliminar.

Renombrar:

- edición inline o diálogo compacto;
- Enter guarda;
- Escape cancela;
- validación;
- loading;
- actualización optimista con rollback;
- toast final.

Eliminar:

- diálogo accesible;
- actualización correcta del listado;
- navegación segura si se elimina la conversación abierta;
- no dejar una URL inválida;
- rollback si falla.

Primero confirma si ya existen endpoints adecuados. Si no existen, implementa el cambio end-to-end de forma mínima, tipada y segura. No crees botones sin funcionalidad persistente.

## Perfil

Reemplaza el círculo genérico con una inicial por un bloque de perfil más profesional.

No inventes una foto de usuario.

Puede incluir:

- icono de usuario neutral;
- nombre;
- correo truncado;
- estado de verificación cuando sea útil;
- acceso claro a cuenta o ajustes.

---

# 14. NAVEGACIÓN MÓVIL

Evalúa y aplica una navegación inferior en la web móvil para alinear la arquitectura de información con la aplicación nativa.

Debe ser:

- visible solo cuando aporte valor;
- compatible con safe areas;
- accesible;
- con estado activo;
- de cuatro destinos principales como máximo;
- sin competir con el compositor del chat;
- sin tapar contenido;
- sin duplicar innecesariamente la hamburguesa.

Posible distribución:

- Chat.
- Memorias.
- Uso.
- Más.

La sección “Más” puede exponer ajustes y cuenta.

No modifiques `apps/mobile` en esta tarea salvo que sea estrictamente necesario. La prioridad es `apps/platform`.

---

# 15. PRIVACIDAD Y TÉRMINOS

Rediseña `/privacy` y `/terms` dentro del shell público.

Requisitos:

- logo real;
- título;
- fecha de actualización si ya existe en el contenido;
- índice de contenidos;
- anclas por sección;
- navegación de vuelta;
- ancho de lectura cómodo;
- separación visual entre secciones;
- enlaces con foco visible;
- encabezados semánticos;
- índice sticky en escritorio;
- índice compacto o desplegable en móvil;
- resaltado de sección activa solo si se puede implementar de forma ligera;
- URLs con fragmentos funcionales;
- no reescribir el contenido jurídico salvo correcciones puramente tipográficas.

No presentes estas páginas como una tarjeta pequeña dentro de una pantalla enorme. Deben funcionar como documentos profesionales.

---

# 16. MEJORAS ADICIONALES DE PRODUCTO

Implementa también, cuando encajen sin romper el alcance:

## Compositor del chat

- mejor jerarquía;
- auto-resize controlado;
- límite visual de altura;
- botón enviar/cancelar claro;
- atajos visibles de forma discreta;
- disabled states;
- foco correcto;
- contraste;
- comportamiento móvil con teclado abierto.

## Acciones de mensajes

- hover/focus sin saltos de layout;
- copiar;
- regenerar;
- valoración preparada visualmente solo si existe persistencia real.

No implementes pulgar arriba/abajo como falsa funcionalidad. Si requiere un modelo de datos nuevo, documenta la propuesta y déjala fuera de este refactor salvo autorización expresa.

## Estados

Diseña de forma consistente:

- hover;
- focus;
- active;
- selected;
- disabled;
- loading;
- success;
- error;
- empty;
- offline o fallo de red cuando ya exista información para detectarlo.

## Iconos

- utiliza SVG ligeros;
- tamaño y stroke coherentes;
- no añadas una librería de iconos pesada;
- no uses emojis como sustitución.

---

# 17. ARQUITECTURA DE COMPONENTES

No construyas un único componente gigantesco.

Extrae componentes reutilizables cuando exista repetición real, por ejemplo:

- `PublicShell.svelte`
- `ConfirmDialog.svelte`
- `ToastViewport.svelte`
- `Skeleton.svelte`
- `CodeBlock.svelte`
- `ConversationItem.svelte`
- `ConversationMenu.svelte`
- `SidebarSearch.svelte`
- `MobileBottomNav.svelte`
- `LegalLayout.svelte`

Los nombres pueden variar según la estructura real del repositorio.

No sobrearquitectes:

- evita wrappers de una sola línea;
- evita abstracciones que solo se utilizan una vez;
- evita stores globales innecesarios;
- evita convertir cada elemento en un componente.

---

# 18. IMPLEMENTACIÓN POR FASES

Trabaja en este orden:

## Fase 1
- Auditoría.
- Tokens.
- Tipografía.
- Radios.
- Espaciado.
- Superficies.
- Shell público.
- `+error.svelte`.

## Fase 2
- ConfirmDialog.
- Toasts.
- Estados de carga.
- Skeletons.

## Fase 3
- Renderizado de código.
- Shiki diferido.
- Copiar por bloque.
- Estado vacío.
- Refinamiento del compositor.

## Fase 4
- Barra lateral.
- Agrupación por fecha.
- Buscador.
- Renombrar.
- Eliminar.
- Perfil.
- Navegación móvil.

## Fase 5
- Privacidad.
- Términos.
- Pulido responsive.
- Accesibilidad.
- Revisión de rendimiento.

Después de cada fase:

1. Ejecuta el chequeo de tipos adecuado.
2. Corrige errores antes de seguir.
3. Inspecciona el diff.
4. Verifica que no se haya introducido `{@html}`.
5. Prueba visualmente la zona modificada.

No dejes todas las pruebas para el final.

---

# 19. PRUEBAS CON PLAYWRIGHT

Crea o amplía pruebas estables sin acoplarlas excesivamente al diseño.

Verifica como mínimo:

## Público

- Landing carga.
- Registro está centrado o equilibrado.
- Recuperación usa el shell común.
- Privacidad tiene logo e índice.
- Términos tiene anclas.
- 404 tiene diseño MAC.
- 500 no filtra información interna.

## Diálogos

- Apertura.
- Cierre con cancelar.
- Cierre con Escape.
- Focus trap o comportamiento equivalente.
- Devolución de foco.
- Confirmación destructiva.
- Loading.
- Prevención de doble envío.

## Toasts

- Aparecen.
- Se anuncian.
- Se pueden cerrar.
- No quedan detrás de elementos móviles.
- Errores importantes son visibles aunque la acción esté fuera del viewport.

## Chat

- Bloque de código obtiene resaltado.
- Fallback funciona antes de cargar Shiki.
- Copiar bloque funciona.
- Copiar mensaje funciona.
- Streaming sigue funcionando.
- Cancelar sigue funcionando.
- Regenerar sigue funcionando.
- Conversación larga mantiene scroll usable.

## Barra lateral

- Agrupación por fecha.
- Búsqueda.
- Sin resultados.
- Renombrar.
- Cancelar renombrado.
- Eliminar.
- Conversación activa.
- Paginación.
- Móvil.

## Responsive

Prueba como mínimo:

- 1440 × 900.
- 1024 × 768.
- 390 × 844.
- 360 × 800.

Comprueba:

- tema oscuro;
- tema claro;
- teclado;
- focus visible;
- reduced motion;
- overflow horizontal;
- safe areas;
- compositor móvil.

Guarda capturas comparativas en una carpeta de artefactos local, pero no las añadas al commit salvo que sea necesario.

---

# 20. VERIFICACIÓN OBLIGATORIA

Antes de declarar la tarea terminada ejecuta desde la raíz:

pnpm check
pnpm test
pnpm build:platform
pnpm test:e2e:web
pnpm scan:client-secrets

Además:

git diff --check
git status
git diff --stat

Busca expresamente:

rg '\{@html\}' apps/platform
rg 'confirm\(' apps/platform
rg 'outline:\s*none' apps/platform
rg '\$:' apps/platform/src
rg 'font-size:\s*0\.(74|83|85|87)rem' apps/platform/src

No afirmes que algo pasó si no ejecutaste el comando.

Si un comando falla:

1. Investiga la causa.
2. Corrígela si pertenece al refactor.
3. Repite el comando.
4. Si no puede resolverse, documenta el error exacto.
5. No ocultes el fallo.

---

# 21. PRESUPUESTO DE BUNDLE Y RENDIMIENTO

Mide el resultado del build.

Debes informar:

- tamaño del bundle inicial;
- tamaño comprimido cuando pueda medirse;
- chunks creados por Shiki;
- si Shiki queda fuera de la carga inicial;
- dependencias nuevas;
- impacto aproximado de cada dependencia;
- comportamiento con una conversación larga;
- comportamiento con 50 conversaciones;
- si existen layout shifts visibles.

No aceptes una regresión del presupuesto móvil por una mejora visual.

Si Shiki completo resulta demasiado pesado:

- limita lenguajes;
- separa chunks;
- carga solo bajo demanda;
- evita importar paquetes agregadores;
- consulta Context7;
- conserva fallback sin resaltado.

---

# 22. REVISIÓN FINAL OBLIGATORIA

Cuando termines la implementación:

1. Ejecuta `security-guidance`.
2. Ejecuta `code-review` sobre todo el diff.
3. Corrige los hallazgos relevantes.
4. Repite las pruebas afectadas.
5. Usa Playwright para una inspección final.
6. Compara visualmente antes y después.

Revisa especialmente:

- XSS;
- enlaces peligrosos;
- HTML inyectado;
- manejo del portapapeles;
- doble submit;
- condiciones de carrera;
- actualización optimista;
- rollback;
- focos perdidos;
- aria-live excesivo;
- menús sin teclado;
- modales sin retorno de foco;
- CSS muerto;
- duplicación de tokens;
- re-renderizados durante streaming;
- peso inicial;
- mobile overflow.

---

# 23. DEFINICIÓN DE TERMINADO

La tarea solo está terminada cuando:

- Existe `+error.svelte` diseñado.
- Las páginas públicas comparten sistema de layout.
- Registro está correctamente compuesto en escritorio.
- Privacidad y términos tienen logo, índice y anclas.
- No quedan `confirm()` nativos en los flujos indicados.
- Existe un sistema de toast accesible.
- Existen estados de carga coherentes.
- Los bloques de código tienen resaltado diferido.
- Cada bloque de código se puede copiar.
- No existe `{@html}`.
- La barra lateral tiene jerarquía.
- Las conversaciones están agrupadas por fecha.
- Existe búsqueda funcional.
- Renombrar y eliminar funcionan de verdad.
- El estado vacío del chat tiene acciones útiles.
- El tema claro está cuidado.
- El móvil es completamente utilizable.
- `:focus-visible` sigue funcionando.
- El streaming no se degrada.
- `content-visibility` y paginación de 50 permanecen.
- El bundle inicial respeta el presupuesto.
- Los comandos obligatorios pasan.
- Playwright valida los flujos críticos.
- Security Guidance y Code Review han revisado el resultado.
- No se ha hecho push.
- No se ha desplegado a producción.

---

# 24. FORMATO DEL INFORME FINAL

Entrega un informe concreto con estas secciones:

## Resultado visual
Qué cambió y cuál es la nueva dirección.

## Plugins utilizados
Plugin, tarea ejecutada y resultado obtenido.

## Archivos modificados
Agrupados por sistema o funcionalidad.

## Funcionalidades añadidas
Solo las que funcionan realmente.

## Seguridad
Cómo se preservó el renderizado tipado y qué riesgos se revisaron.

## Accesibilidad
Teclado, foco, diálogos, toasts, lector de pantalla y reduced motion.

## Rendimiento
Bundle, lazy loading, Shiki, streaming, conversaciones largas y móvil.

## Pruebas
Comando y resultado exacto:

- `pnpm check`
- `pnpm test`
- `pnpm build:platform`
- `pnpm test:e2e:web`
- `pnpm scan:client-secrets`
- Playwright
- revisión de seguridad
- revisión de código

## Capturas verificadas
Rutas, tamaños y temas comprobados.

## Deuda restante
Problemas que no pertenecían al refactor o que requieren una decisión de producto.

## Estado Git
Rama, archivos cambiados, commits creados y confirmación de que no hubo push ni despliegue.

No uses frases vagas como “todo está correcto” o “la UI quedó moderna”. Proporciona evidencia.

---

# 25. COMIENZO

Empieza ahora con:

1. La tabla de uso de plugins.
2. El estado Git.
3. La auditoría estructural.
4. La captura de la línea base con Playwright.
5. El plan por fases basado en los archivos reales.

Después implementa. No te detengas al terminar el plan.