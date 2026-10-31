import { escapeHtml } from "./escape-html";
import type { MailTransport } from "./transport";


type AuthEmailOptions = Readonly<{
  preheader: string;
  eyebrow: string;
  title: string;
  greeting: string;
  message: string;
  actionLabel: string;
  url: string;
  footnote: string;
}>;

function renderAuthEmail(options: AuthEmailOptions): string {
  const safe = {
    preheader: escapeHtml(options.preheader),
    eyebrow: escapeHtml(options.eyebrow),
    title: escapeHtml(options.title),
    greeting: escapeHtml(options.greeting),
    message: escapeHtml(options.message),
    actionLabel: escapeHtml(options.actionLabel),
    url: escapeHtml(options.url),
    footnote: escapeHtml(options.footnote)
  };

  const logoUrl = "https://cdor.online/branding/mac-logo-256.png";

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safe.title}</title>
  </head>
  <body style="margin:0;background:#09090b;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safe.preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090b;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#0f0f17;border:1px solid #27272a;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
            <tr>
              <td style="padding:24px 32px;background:#141420;border-bottom:1px solid #27272a;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${logoUrl}" alt="MAC Logo" width="38" height="38" style="display:block;border-radius:8px;object-fit:contain;" />
                    </td>
                    <td style="padding-left:12px;vertical-align:middle;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.06em;">
                      MAC
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px;">
                <p style="margin:0 0 10px;color:#c084fc;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">${safe.eyebrow}</p>
                <h1 style="margin:0 0 16px;color:#ffffff;font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;">${safe.title}</h1>
                <p style="margin:0 0 12px;color:#e4e4e7;font-size:15px;line-height:1.6;">${safe.greeting}</p>
                <p style="margin:0 0 24px;color:#a1a1aa;font-size:15px;line-height:1.6;">${safe.message}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                  <tr>
                    <td style="border-radius:8px;background:#a855f7;">
                      <a href="${safe.url}" style="display:inline-block;padding:14px 28px;background:#a855f7;border-radius:8px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">${safe.actionLabel}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 8px;color:#71717a;font-size:12px;line-height:1.5;">Si el botón no funciona, copia y pega este enlace directo en tu navegador:</p>
                <p style="margin:0 0 24px;word-break:break-all;font-size:12px;line-height:1.5;"><a href="${safe.url}" style="color:#c084fc;text-decoration:underline;">${safe.url}</a></p>
                <div style="border-top:1px solid #27272a;padding-top:20px;">
                  <p style="margin:0;color:#71717a;font-size:12px;line-height:1.5;">${safe.footnote}</p>
                </div>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0;color:#52525b;font-size:12px;text-align:center;">© 2026 MAC · Conversaciones bajo tu control.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function greetingFor(name?: string): string {
  const cleanName = name?.trim();
  return cleanName ? `Hola, ${cleanName}.` : "Hola.";
}

export async function sendVerificationMessage(
  transport: MailTransport,
  to: string,
  url: string,
  name?: string
): Promise<void> {
  const greeting = greetingFor(name);
  await transport.send({
    to,
    subject: "Confirma tu correo para entrar en MAC",
    text: `${greeting}\n\nConfirma tu correo para activar tu cuenta de MAC:\n${url}\n\nEste enlace caduca en una hora. Si no has creado esta cuenta, puedes ignorar este mensaje.`,
    html: renderAuthEmail({
      preheader: "Confirma tu correo para activar tu cuenta de MAC.",
      eyebrow: "Un último paso",
      title: "Confirma tu correo",
      greeting,
      message: "Pulsa el botón para activar tu cuenta y empezar a usar MAC.",
      actionLabel: "Verificar mi correo",
      url,
      footnote:
        "Este enlace caduca en una hora. Si no has creado esta cuenta, puedes ignorar este mensaje."
    })
  });
}

export async function sendPasswordResetMessage(
  transport: MailTransport,
  to: string,
  url: string,
  name?: string
): Promise<void> {
  const greeting = greetingFor(name);
  await transport.send({
    to,
    subject: "Restablece tu contraseña de MAC",
    text: `${greeting}\n\nPuedes crear una nueva contraseña para tu cuenta de MAC desde este enlace:\n${url}\n\nEl enlace caduca en una hora. Si no has solicitado este cambio, puedes ignorar este mensaje.`,
    html: renderAuthEmail({
      preheader: "Restablece tu contraseña de MAC de forma segura.",
      eyebrow: "Seguridad de la cuenta",
      title: "Restablece tu contraseña",
      greeting,
      message: "Pulsa el botón para elegir una contraseña nueva y recuperar el acceso.",
      actionLabel: "Cambiar contraseña",
      url,
      footnote:
        "El enlace caduca en una hora. Si no has solicitado este cambio, puedes ignorar este mensaje."
    })
  });
}
