import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/*
  EmailDraft persistence (/admin/email). Callers check isDatabaseConfigured()
  first, as everywhere else. Dates come back as ISO strings.
*/

export type EmailStatus = "proposed" | "ready" | "sent";

export interface EmailDraftRecord {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
  pillarId: string | null;
  postIds: string[];
  status: EmailStatus;
  createdAt: string;
  updatedAt: string;
}

/** List rows: everything but the two bodies. */
export type EmailDraftSummary = Omit<EmailDraftRecord, "html" | "text">;

type Row = {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
  pillarId: string | null;
  postIds: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export function isEmailStatus(v: unknown): v is EmailStatus {
  return v === "proposed" || v === "ready" || v === "sent";
}

function toRecord(r: Row): EmailDraftRecord {
  return {
    id: r.id,
    name: r.name,
    subject: r.subject,
    preheader: r.preheader,
    html: r.html,
    text: r.text,
    pillarId: r.pillarId,
    postIds: r.postIds,
    status: isEmailStatus(r.status) ? r.status : "proposed",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listEmailDrafts(): Promise<EmailDraftSummary[]> {
  const rows = await prisma.emailDraft.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      subject: true,
      preheader: true,
      pillarId: true,
      postIds: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map((r) => {
    const { html: _h, text: _t, ...rest } = toRecord({ ...r, html: "", text: "" });
    void _h;
    void _t;
    return rest;
  });
}

export async function getEmailDraft(id: string): Promise<EmailDraftRecord | null> {
  const row = await prisma.emailDraft.findUnique({ where: { id } });
  return row ? toRecord(row) : null;
}

export interface NewEmailDraft {
  name: string;
  subject: string;
  preheader?: string;
  html: string;
  text: string;
  pillarId?: string | null;
  postIds?: string[];
}

export async function createEmailDraft(input: NewEmailDraft): Promise<EmailDraftRecord> {
  const row = await prisma.emailDraft.create({
    data: {
      name: input.name.trim().slice(0, 200),
      subject: input.subject.trim().slice(0, 300),
      preheader: (input.preheader ?? "").trim().slice(0, 300),
      html: input.html,
      text: input.text,
      pillarId: input.pillarId || null,
      postIds: input.postIds ?? [],
      status: "proposed",
    },
  });
  return toRecord(row);
}

export interface EmailDraftPatch {
  name?: string;
  subject?: string;
  preheader?: string;
  html?: string;
  text?: string;
  status?: EmailStatus;
}

export async function updateEmailDraft(
  id: string,
  patch: EmailDraftPatch,
): Promise<EmailDraftRecord | null> {
  const data: Prisma.EmailDraftUpdateInput = {};
  if (typeof patch.name === "string") data.name = patch.name.trim().slice(0, 200);
  if (typeof patch.subject === "string") data.subject = patch.subject.trim().slice(0, 300);
  if (typeof patch.preheader === "string") data.preheader = patch.preheader.trim().slice(0, 300);
  if (typeof patch.html === "string") data.html = patch.html;
  if (typeof patch.text === "string") data.text = patch.text;
  if (isEmailStatus(patch.status)) data.status = patch.status;
  try {
    const row = await prisma.emailDraft.update({ where: { id }, data });
    return toRecord(row);
  } catch {
    return null;
  }
}

export async function deleteEmailDraft(id: string): Promise<boolean> {
  try {
    await prisma.emailDraft.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}
