import { loadEnvFile } from "node:process";
import path from "node:path";
import { EmailSchema } from "@cdor/contracts";
import { z } from "zod";
import { SmtpMailTransport } from "../../src/lib/server/email/smtp";

const environmentPath = path.resolve(process.cwd(), "../../.env");
try {
  loadEnvFile(environmentPath);
} catch (error) {
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    error.code !== "ENOENT"
  ) {
    throw error;
  }
}

const positionalArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");
const target = EmailSchema.safeParse(positionalArguments[0]);
if (!target.success || positionalArguments.length !== 1) {
  throw new Error("Uso: pnpm smoke:smtp -- correo-de-prueba@dominio");
}

const PortSchema = z.coerce.number().int().min(1).max(65_535);
const TimeoutSchema = z.coerce.number().int().min(1_000).max(60_000);
const SmtpSmokeEnvironmentSchema = z.object({
  SMTP_HOST: z.string().trim().min(1),
  SMTP_PORT: PortSchema,
  SMTP_CONNECTION_TIMEOUT_MS: TimeoutSchema.default(10_000),
  SMTP_USER: z.string().trim().min(1),
  SMTP_PASSWORD: z.string().min(8),
  SMTP_FROM: EmailSchema
});
const environment = SmtpSmokeEnvironmentSchema.safeParse(process.env);
if (!environment.success) {
  const variables = [
    ...new Set(
      environment.error.issues.map((issue) =>
        String(issue.path[0] ?? "SMTP")
      )
    )
  ].sort();
  throw new Error(`Configuración SMTP inválida: ${variables.join(", ")}`);
}

const mail = new SmtpMailTransport({
  host: environment.data.SMTP_HOST,
  port: environment.data.SMTP_PORT,
  user: environment.data.SMTP_USER,
  password: environment.data.SMTP_PASSWORD,
  from: environment.data.SMTP_FROM,
  connectionTimeoutMs: environment.data.SMTP_CONNECTION_TIMEOUT_MS
});

await mail.verify();
await mail.send({
  to: target.data,
  subject: "MAC — prueba de autenticación",
  text: "El transporte SMTP de MAC funciona. Este mensaje no habilita el registro público.",
  html: "<p>El transporte SMTP de MAC funciona.</p><p>Este mensaje no habilita el registro público.</p>"
});

const [localPart, domain] = target.data.split("@");
const maskedRecipient = `${localPart?.slice(0, 1) ?? "*"}***@${domain}`;
process.stdout.write(
  `SMTP verificado y mensaje aceptado para ${maskedRecipient}\n`
);
