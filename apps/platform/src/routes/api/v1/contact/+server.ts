import { z } from "zod";
import { parseJsonRequest } from "#lib/server/http/payload.js";
import { apiHandler, apiSuccess } from "#lib/server/http/response.js";
import { AppError } from "#lib/server/errors/app-error.js";
import { escapeHtml } from "#lib/server/email/escape-html.js";
import type { RequestHandler } from "./$types";

const ContactRequestSchema = z.object({
  name: z.string().trim().min(1, "Escribe tu nombre").max(200),
  email: z.string().trim().email("Dirección de correo inválida"),
  subject: z.string().trim().min(1, "Escribe un asunto").max(300),
  message: z.string().trim().min(1, "Escribe tu mensaje").max(5000)
});

export const POST: RequestHandler = ({ locals, request }) =>
  apiHandler(locals.requestId, async () => {
    let input;
    try {
      input = await parseJsonRequest(request, ContactRequestSchema);
    } catch (err) {
      if (err instanceof Error && err.message.includes("cumple el contrato")) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Por favor completa todos los campos con una dirección de correo válida."
        );
      }
      throw err;
    }

    const recipient = "iam1ke@proton.me";
    // Nunca una credencial incrustada como respaldo: acaba en el repositorio y
    // sobrevive a cualquier rotación posterior. Sin variable, no se envía.
    const resendApiKey =
      process.env.RESEND_API_KEY ?? process.env.SMTP_PASSWORD;

    // Resend exige onboarding@resend.dev salvo que cdor.online esté verificado en DNS
    // El cuerpo del correo es HTML y lo lee un cliente de correo: sin escapar,
    // cualquiera puede inyectar marcado en la bandeja de destino.
    const safeName = escapeHtml(input.name);
    const safeEmail = escapeHtml(input.email);
    const safeSubject = escapeHtml(input.subject);
    const safeMessage = escapeHtml(input.message);

    const fromAddress = "MAC Soporte <onboarding@resend.dev>";
    const subject = `[Contacto MAC] ${input.subject}`;
    const textContent = `De: ${input.name} <${input.email}>\nAsunto: ${input.subject}\n\nMensaje:\n${input.message}`;
    const htmlContent = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f0f17; color: #f4f4f5; border: 1px solid #27272a; border-radius: 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px;">
          <tr>
            <td style="vertical-align: middle;">
              <img src="https://cdor.online/branding/mac-logo-256.png" alt="MAC Logo" width="36" height="36" style="display: block; border-radius: 8px;" />
            </td>
            <td style="padding-left: 12px; vertical-align: middle; color: #ffffff; font-size: 18px; font-weight: 700; letter-spacing: 0.06em;">
              MAC Soporte
            </td>
          </tr>
        </table>
        <h2 style="color: #c084fc; margin-top: 0; font-size: 18px;">Nuevo mensaje de contacto en cdor.online</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #a1a1aa; width: 90px;"><strong>Nombre:</strong></td>
            <td style="padding: 6px 0; color: #ffffff;">${safeName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #a1a1aa;"><strong>Correo:</strong></td>
            <td style="padding: 6px 0;"><a href="mailto:${safeEmail}" style="color: #c084fc; text-decoration: none;">${safeEmail}</a></td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #a1a1aa;"><strong>Asunto:</strong></td>
            <td style="padding: 6px 0; color: #ffffff;">${safeSubject}</td>
          </tr>
        </table>
        <hr style="border: none; border-top: 1px solid #27272a; margin: 16px 0;" />
        <h4 style="margin: 0 0 10px; color: #a1a1aa; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Contenido del mensaje:</h4>
        <div style="background: #181824; padding: 16px; border-radius: 8px; white-space: pre-wrap; color: #e4e4e7; font-size: 14px; line-height: 1.6; border: 1px solid #27272a;">${safeMessage}</div>
        <p style="font-size: 11px; color: #71717a; margin-top: 24px; text-align: center;">Enviado desde el formulario oficial de soporte en cdor.online</p>
      </div>
    `;

    // 1. Envío mediante la API de Resend, solo si hay credencial.
    if (resendApiKey)
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [recipient],
            reply_to: input.email,
            subject,
            text: textContent,
            html: htmlContent
          })
        });

        const responseData = await res.json().catch(() => null);
        if (res.ok && responseData?.id) {
          console.log(
            `[RESEND EMAIL ENVIADO CON ÉXITO ID: ${responseData.id}] A: ${recipient}`
          );
          return apiSuccess(
            { sent: true, id: responseData.id },
            locals.requestId,
            { status: 201 }
          );
        }
        console.error("Resend API error response:", responseData);
      } catch (err) {
        console.error("Fallo al conectar con la API de Resend:", err);
      }

    // 2. Respaldo mediante SMTP
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 465),
          secure: Number(process.env.SMTP_PORT || 465) === 465,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
          }
        });

        await transporter.sendMail({
          from: fromAddress,
          to: recipient,
          replyTo: input.email,
          subject,
          text: textContent,
          html: htmlContent
        });

        return apiSuccess({ sent: true, provider: "smtp" }, locals.requestId, {
          status: 201
        });
      } catch (err) {
        console.error("SMTP transport error:", err);
      }
    }

    throw new AppError(
      "INTERNAL_ERROR",
      "No se pudo enviar el correo de contacto en este momento."
    );
  });
