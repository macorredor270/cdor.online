<script lang="ts">
  import LegalLayout from "$lib/components/LegalLayout.svelte";
</script>

<svelte:head>
  <title>Privacidad — MAC</title>
  <meta
    name="description"
    content="Política de privacidad de MAC: datos tratados, base jurídica, conservación, destinatarios y ejercicio de derechos."
  />
  <link rel="canonical" href="https://cdor.online/privacy" />
</svelte:head>

<LegalLayout title="Privacidad" effectiveFrom="31 de julio de 2026">
  <p class="intro">
    Esta política explica qué datos trata MAC, con qué base jurídica, durante
    cuánto tiempo, con quién se comparten y cómo puedes ejercer tus derechos.
    Describe el funcionamiento real del servicio, no una plantilla genérica.
  </p>

  <h2>1. Responsable del tratamiento</h2>
  <p>
    El responsable es la persona titular de MAC y del dominio
    <strong>cdor.online</strong>. Puedes contactar para cualquier cuestión de
    privacidad desde la página de <a href="/contact">Contacto</a>.
  </p>

  <h2>2. Datos que se tratan</h2>
  <ul>
    <li>
      <strong>Cuenta:</strong> dirección de correo, nombre visible y estado de
      verificación. La contraseña se guarda cifrada mediante función de
      derivación; MAC nunca almacena ni registra la contraseña en claro.
    </li>
    <li>
      <strong>Sesiones y dispositivos:</strong> identificador de sesión,
      dispositivo vinculado, plataforma, versión de la aplicación y última
      conexión, para permitir la revocación por dispositivo.
    </li>
    <li>
      <strong>Contenido:</strong> conversaciones, mensajes y las memorias que
      decidas conservar, junto con sus marcas de creación y actualización.
    </li>
    <li>
      <strong>Preferencias:</strong> ajustes sincronizables entre tus
      dispositivos.
    </li>
    <li>
      <strong>Uso técnico:</strong> modelo empleado, tokens de entrada y
      salida, latencias y estado de cada generación.
    </li>
    <li>
      <strong>Registros de acceso:</strong> identificador de petición, método,
      ruta, código de estado y duración. Los registros no incluyen cookies,
      tokens, parámetros de consulta ni contenido de las conversaciones.
    </li>
  </ul>

  <h2>3. Base jurídica</h2>
  <ul>
    <li>
      <strong>Ejecución del contrato</strong> (art. 6.1.b RGPD): crear y
      mantener la cuenta, guardar y sincronizar conversaciones, generar
      respuestas y prestar el servicio solicitado.
    </li>
    <li>
      <strong>Interés legítimo</strong> (art. 6.1.f RGPD): seguridad de la
      plataforma, prevención de abuso, límites de uso y diagnóstico de fallos,
      con registros mínimos y sin contenido privado.
    </li>
    <li>
      <strong>Consentimiento</strong> (art. 6.1.a RGPD): las memorias son
      opcionales; se crean solo cuando decides conservarlas y puedes
      desactivarlas o eliminarlas en cualquier momento.
    </li>
    <li>
      <strong>Obligación legal</strong> (art. 6.1.c RGPD): cuando una norma
      aplicable exija conservar o comunicar determinada información.
    </li>
  </ul>

  <h2>4. Plazos de conservación</h2>
  <ul>
    <li>
      <strong>Cuenta y contenido:</strong> mientras la cuenta permanezca
      activa. Al eliminar la cuenta se suprimen conversaciones, mensajes,
      memorias, preferencias, dispositivos y sesiones asociados.
    </li>
    <li>
      <strong>Conversaciones y memorias borradas:</strong> se marcan como
      eliminadas para propagar el borrado a todos tus dispositivos y se
      purgan en el mantenimiento posterior.
    </li>
    <li>
      <strong>Registro de sincronización:</strong> 90 días, plazo técnico
      necesario para que un dispositivo desconectado pueda ponerse al día.
    </li>
    <li>
      <strong>Claves de idempotencia:</strong> 24 horas, para evitar que una
      petición repetida duplique un mensaje.
    </li>
    <li>
      <strong>Registros de acceso:</strong> se conservan únicamente el tiempo
      que el proveedor de alojamiento mantiene la salida del proceso y no
      contienen contenido de chat.
    </li>
  </ul>

  <h2>5. Destinatarios y encargados</h2>
  <p>
    MAC no vende datos ni los cede a terceros con fines publicitarios. Para
    prestar el servicio intervienen los siguientes proveedores, cada uno
    limitado a su función:
  </p>
  <ul>
    <li>
      <strong>Hostinger & Infraestructura:</strong> Alojamiento de la aplicación, base de datos MySQL y servidores de procesamiento seguro que constituyen la fuente de verdad del servicio.
    </li>
    <li>
      <strong>Resend:</strong> Envío de correo transaccional de verificación, soporte y recuperación de contraseña.
    </li>
  </ul>

  <h2>6. Transferencias internacionales</h2>
  <p>
    Los proveedores de infraestructura y de correo pueden tratar datos fuera del
    Espacio Económico Europeo. Dichas transferencias se amparan en las
    garantías que ofrece cada proveedor, como las cláusulas contractuales tipo
    de la Comisión Europea o el Data Privacy Framework. La verificación
    documental de estas garantías forma parte de la revisión previa a la
    apertura del registro público.
  </p>

  <h2>7. Tus derechos</h2>
  <p>
    Puedes ejercer los derechos de acceso, rectificación, supresión,
    limitación del tratamiento, portabilidad y oposición, así como retirar el
    consentimiento en cualquier momento sin que ello afecte a la licitud del
    tratamiento anterior.
  </p>
  <p>
    Para ejercerlos puedes enviar tu solicitud directamente desde nuestra página de <a href="/contact">Contacto</a>. La solicitud se
    responde en el plazo máximo de un mes, ampliable según la complejidad.
    Buena parte de estos derechos son inmediatos desde la propia aplicación:
    puedes consultar y editar tus memorias, eliminar conversaciones, revocar
    dispositivos y eliminar tu cuenta.
  </p>
  <p>
    Si consideras que el tratamiento no se ajusta a la normativa, puedes
    presentar una reclamación ante la Agencia Española de Protección de Datos
    (<a href="https://www.aepd.es" rel="noopener noreferrer">www.aepd.es</a>).
  </p>

  <h2>8. Uso del contenido</h2>
  <p>
    El contenido privado de tus conversaciones y memorias no se cede a terceros ni se reutiliza sin tu consentimiento explícito e informado.
  </p>

  <h2>9. Decisiones automatizadas</h2>
  <p>
    MAC no adopta decisiones automatizadas con efectos jurídicos sobre ti ni realiza elaboración de perfiles con esa finalidad.
  </p>

  <h2>10. Cookies</h2>
  <p>
    La web utiliza únicamente cookies técnicas necesarias para mantener la
    sesión iniciada. No se emplean cookies de analítica, publicidad ni
    seguimiento de terceros.
  </p>

  <h2>11. Menores</h2>
  <p>
    El servicio no está dirigido a menores de 14 años. Si detectamos una
    cuenta de un menor de esa edad sin el consentimiento exigible, se
    eliminará.
  </p>

  <h2>12. Seguridad</h2>
  <p>
    Las sesiones web utilizan cookies <code>HttpOnly</code> con
    <code>SameSite</code> y marca <code>Secure</code> en producción. En móvil,
    la sesión se protege mediante Android Keystore o iOS Keychain y no se
    almacena en JavaScript ni en la base de datos local. El tráfico viaja
    cifrado por HTTPS con HSTS y la aplicación aplica una política de
    seguridad de contenido estricta. Las credenciales de base de datos y del
    proveedor de IA residen solo en el servidor.
  </p>

  <h2>13. Cambios en esta política</h2>
  <p>
    Cualquier cambio relevante se publicará en esta página actualizando la
    fecha inicial. Si el cambio afecta de forma sustancial al tratamiento, se
    comunicará además por correo antes de aplicarse.
  </p>

  <p class="note">
    MAC se encuentra en fase privada con el registro público cerrado. Este
    texto describe el tratamiento real y está pendiente de revisión por un
    profesional jurídico, requisito previo a la apertura del registro.
  </p>
</LegalLayout>
