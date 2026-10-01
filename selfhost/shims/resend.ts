// Self-hosted replacement for "resend": emails go out through Amazon SES (v2 API) and
// come back in Resend's shape ({ data: { id }, error: null }).
//
// Transport (EMAIL_TRANSPORT):
//   "ses"     send with SES. Region SES_REGION (default eu-west-3); credentials
//             SES_ACCESS_KEY_ID / SES_SECRET_ACCESS_KEY when set, else the default AWS chain.
//   "outbox"  do not send: print the email (with its plain text, so the login link is
//             visible) and write it to $PAPERMARK_DATA/outbox/.
//   unset     "ses" when SES_ACCESS_KEY_ID and SES_SECRET_ACCESS_KEY are set, else "outbox".
// From: EMAIL_FROM when set (always, so every message leaves from a verified SES
// identity), else the `from` passed by the caller. Reply-To is kept as passed.
//
// Not sent in self-hosted mode: emails with `scheduledAt` (Papermark's own onboarding and
// upsell sequence; SES has no scheduling), which go to the outbox only. Contacts,
// audiences and segments (marketing lists) are no-ops.
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { SESv2Client, SendEmailCommand, type Attachment as SesAttachment } from "@aws-sdk/client-sesv2";
import type { ReactElement } from "react";
import { render, toPlainText } from "react-email";

import { dataPath } from "../lib/paths";

type Attachment = {
  content?: string | Buffer;
  filename?: string | false;
  path?: string;
  contentType?: string;
  contentId?: string;
};

export type CreateEmailOptions = {
  from: string;
  to: string | string[];
  subject: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  /** @deprecated Resend v1 spelling */
  reply_to?: string | string[];
  html?: string;
  text?: string;
  react?: ReactElement | null;
  headers?: Record<string, string>;
  attachments?: Attachment[];
  scheduledAt?: string;
  tags?: { name: string; value: string }[];
  [option: string]: unknown;
};

type ErrorResponse = { name: string; message: string; statusCode?: number };
type Response<T> = { data: T; error: null; headers?: Record<string, string> } | { data: null; error: ErrorResponse; headers?: Record<string, string> };

const asList = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

function transport(): "ses" | "outbox" {
  const explicit = process.env.EMAIL_TRANSPORT?.trim().toLowerCase();
  if (explicit === "ses" || explicit === "outbox") return explicit;
  return process.env.SES_ACCESS_KEY_ID && process.env.SES_SECRET_ACCESS_KEY ? "ses" : "outbox";
}

let sesClient: SESv2Client | undefined;
function ses(): SESv2Client {
  if (!sesClient) {
    const { SES_ACCESS_KEY_ID, SES_SECRET_ACCESS_KEY } = process.env;
    sesClient = new SESv2Client({
      region: process.env.SES_REGION || "eu-west-3",
      ...(SES_ACCESS_KEY_ID && SES_SECRET_ACCESS_KEY
        ? { credentials: { accessKeyId: SES_ACCESS_KEY_ID, secretAccessKey: SES_SECRET_ACCESS_KEY } }
        : {}),
    });
  }
  return sesClient;
}

async function attachmentsFor(list: Attachment[] | undefined): Promise<SesAttachment[] | undefined> {
  if (!list?.length) return undefined;
  return Promise.all(
    list.map(async (a, i) => {
      let raw: Uint8Array;
      if (a.content !== undefined) {
        // Resend takes a Buffer or a base64 string.
        raw = typeof a.content === "string" ? Buffer.from(a.content, "base64") : a.content;
      } else if (a.path) {
        const res = await fetch(a.path);
        if (!res.ok) throw new Error(`Attachment ${a.path}: HTTP ${res.status}`);
        raw = new Uint8Array(await res.arrayBuffer());
      } else {
        throw new Error("Attachment needs content or path");
      }
      return {
        RawContent: raw,
        FileName: (a.filename || a.path?.split("/").pop() || `attachment-${i + 1}`) as string,
        ...(a.contentType ? { ContentType: a.contentType } : {}),
        ...(a.contentId ? { ContentId: a.contentId, ContentDisposition: "INLINE" as const } : {}),
      };
    }),
  );
}

type Prepared = {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string[];
  subject: string;
  html?: string;
  text?: string;
  headers: Record<string, string>;
};

async function prepare(email: CreateEmailOptions): Promise<Prepared> {
  const html = email.html ?? (email.react ? await render(email.react) : undefined);
  const text = email.text ?? (html ? toPlainText(html) : undefined);
  return {
    id: randomUUID(),
    from: process.env.EMAIL_FROM || email.from,
    to: asList(email.to),
    cc: asList(email.cc),
    bcc: asList(email.bcc),
    replyTo: asList(email.replyTo ?? email.reply_to),
    subject: email.subject,
    html,
    text,
    headers: email.headers ?? {},
  };
}

function writeToOutbox(mail: Prepared, note: string) {
  console.log(
    [
      `[selfhost/email] ${note}`,
      `  From: ${mail.from}`,
      `  To: ${mail.to.join(", ")}`,
      `  Subject: ${mail.subject}`,
      ...(mail.text ? ["", mail.text.trim(), ""] : []),
    ].join("\n"),
  );
  try {
    const dir = dataPath("outbox");
    mkdirSync(dir, { recursive: true });
    const base = `${new Date().toISOString().replace(/[:.]/g, "-")}-${mail.id}`;
    writeFileSync(`${dir}/${base}.json`, JSON.stringify({ ...mail, html: undefined, note }, null, 2));
    if (mail.html) writeFileSync(`${dir}/${base}.html`, mail.html);
  } catch (error) {
    console.error("[selfhost/email] could not write the outbox:", error);
  }
}

async function sendOne(email: CreateEmailOptions): Promise<Response<{ id: string }>> {
  let mail: Prepared;
  try {
    mail = await prepare(email);
  } catch (error) {
    return { data: null, error: { name: "validation_error", message: String(error) } };
  }

  if (email.scheduledAt) {
    writeToOutbox(mail, `scheduled email (${email.scheduledAt}) not sent: scheduling is disabled in self-hosted mode`);
    return { data: { id: mail.id }, error: null };
  }
  if (transport() === "outbox") {
    writeToOutbox(mail, "SES is not configured (EMAIL_TRANSPORT=outbox): email not sent");
    return { data: { id: mail.id }, error: null };
  }

  try {
    const result = await ses().send(
      new SendEmailCommand({
        FromEmailAddress: mail.from,
        Destination: { ToAddresses: mail.to, CcAddresses: mail.cc, BccAddresses: mail.bcc },
        ReplyToAddresses: mail.replyTo.length ? mail.replyTo : undefined,
        Content: {
          Simple: {
            Subject: { Data: mail.subject, Charset: "UTF-8" },
            Body: {
              ...(mail.html ? { Html: { Data: mail.html, Charset: "UTF-8" } } : {}),
              ...(mail.text ? { Text: { Data: mail.text, Charset: "UTF-8" } } : {}),
            },
            Headers: Object.entries(mail.headers).map(([Name, Value]) => ({ Name, Value })),
            Attachments: await attachmentsFor(email.attachments),
          },
        },
      }),
    );
    return { data: { id: result.MessageId ?? mail.id }, error: null };
  } catch (error: any) {
    return {
      data: null,
      error: {
        name: error?.name ?? "application_error",
        message: error?.message ?? String(error),
        statusCode: error?.$metadata?.httpStatusCode,
      },
    };
  }
}

const noop = async () => ({ data: null, error: null });

export class Resend {
  // The API key is not needed: SES credentials come from the environment.
  constructor(_key?: string) {}

  readonly emails = {
    send: (email: CreateEmailOptions, _options?: { idempotencyKey?: string }) => sendOne(email),
    create: (email: CreateEmailOptions, _options?: { idempotencyKey?: string }) => sendOne(email),
    get: async (_id: string) => ({ data: null, error: { name: "not_found", message: "Email lookup is not available in self-hosted mode" } }),
    cancel: noop,
    update: noop,
  };

  readonly batch = {
    send: async (emails: CreateEmailOptions[], _options?: { idempotencyKey?: string }) => {
      const data: { id: string }[] = [];
      for (const email of emails) {
        const res = await sendOne(email);
        if (res.error) return { data: null, error: res.error };
        data.push(res.data);
      }
      return { data: { data }, error: null };
    },
  };
  readonly batches = this.batch;

  // Marketing contacts: no-ops in self-hosted mode.
  readonly contacts = {
    create: async (_contact: unknown) => ({ data: { object: "contact", id: "selfhost" }, error: null }),
    get: async (_query: unknown) => ({ data: null, error: { name: "not_found", message: "Contacts are disabled in self-hosted mode" } }),
    list: async (_query?: unknown) => ({ data: { object: "list", data: [] }, error: null }),
    update: noop,
    remove: noop,
    segments: { add: noop, remove: noop, list: async () => ({ data: { object: "list", data: [] }, error: null }) },
    topics: { get: noop, update: noop },
  };

  readonly audiences = { create: noop, get: noop, list: noop, remove: noop };
  readonly segments = { create: noop, get: noop, list: noop, remove: noop };
  readonly broadcasts = { create: noop, get: noop, list: noop, remove: noop, send: noop, update: noop };
}

export default Resend;
