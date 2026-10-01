// Default permissions for documents attached to a data room. Written for the self-hosted
// fork: the module is imported by the core but missing upstream. It carries the logic
// that pages/api/teams/[teamId]/datarooms/[id]/apply-permissions.ts held inline before
// commit 18042fa8, and applies it on every attach too.
//
// A data room has one default strategy for viewer groups and one for links (permission
// groups):
// - INHERIT_FROM_PARENT: a document copies the access rows of the folder it lives in;
//   a root-level document gets the data room's root-item default (view, view+download,
//   or hidden = no row).
// - ASK_EVERY_TIME, HIDDEN_BY_DEFAULT: nothing is written, so the document stays hidden
//   from restricted links and groups until someone grants access (the permissions modal
//   for ASK_EVERY_TIME, manual configuration otherwise).
import {
  DefaultPermissionStrategy,
  ItemType,
  RootItemAccess,
} from "@prisma/client";

import { revalidateLinksForDataroom } from "@/lib/api/links/revalidate";
import prisma from "@/lib/prisma";

import { resolveRootItemAccessFlags } from "./root-item-access";

export type AttachedDataroomDocument = {
  id: string; // DataroomDocument id
  folderId: string | null;
};

type Target = "VIEWER_GROUP" | "PERMISSION_GROUP";

type AccessRow = {
  groupId: string;
  itemId: string;
  itemType: ItemType;
  canView: boolean;
  canDownload: boolean;
  canDownloadOriginal?: boolean;
};

export async function applyDataroomDocumentPermissionDefaults({
  dataroomId,
  dataroomDocuments,
  groupStrategy,
  groupRootItemAccess,
  linkStrategy,
  linkRootItemAccess,
}: {
  dataroomId: string;
  dataroomDocuments: AttachedDataroomDocument[];
  groupStrategy: DefaultPermissionStrategy;
  groupRootItemAccess: RootItemAccess;
  linkStrategy: DefaultPermissionStrategy;
  linkRootItemAccess: RootItemAccess;
}): Promise<void> {
  if (dataroomDocuments.length === 0) return;
  await Promise.all([
    applyStrategy(dataroomId, dataroomDocuments, groupStrategy, groupRootItemAccess, "VIEWER_GROUP"),
    applyStrategy(dataroomId, dataroomDocuments, linkStrategy, linkRootItemAccess, "PERMISSION_GROUP"),
  ]);
}

/**
 * Called right after documents are attached to a data room: applies the data room's
 * stored defaults, then revalidates its restricted links through `schedule` (waitUntil)
 * so the request does not wait for it.
 */
export async function onDataroomDocumentsAttached({
  dataroomId,
  dataroomDocuments,
  schedule,
}: {
  dataroomId: string;
  dataroomDocuments: AttachedDataroomDocument[];
  schedule?: (promise: Promise<unknown>) => void;
}): Promise<void> {
  if (dataroomDocuments.length === 0) return;

  const dataroom = await prisma.dataroom.findUnique({
    where: { id: dataroomId },
    select: {
      defaultPermissionStrategy: true,
      defaultGroupPermissionStrategy: true,
      defaultRootItemAccess: true,
      defaultGroupRootItemAccess: true,
      _count: { select: { viewerGroups: true, permissionGroups: true } },
    },
  });
  if (!dataroom) return;
  // Without groups there is no access row to write and no restricted link to refresh.
  if (dataroom._count.viewerGroups === 0 && dataroom._count.permissionGroups === 0) return;

  await applyDataroomDocumentPermissionDefaults({
    dataroomId,
    dataroomDocuments,
    groupStrategy: dataroom.defaultGroupPermissionStrategy,
    groupRootItemAccess: dataroom.defaultGroupRootItemAccess,
    linkStrategy: dataroom.defaultPermissionStrategy,
    linkRootItemAccess: dataroom.defaultRootItemAccess,
  });

  const revalidation = revalidateLinksForDataroom(dataroomId);
  if (schedule) schedule(revalidation);
  else await revalidation;
}

async function applyStrategy(
  dataroomId: string,
  documents: AttachedDataroomDocument[],
  strategy: DefaultPermissionStrategy,
  rootItemAccess: RootItemAccess,
  target: Target,
) {
  if (strategy !== DefaultPermissionStrategy.INHERIT_FROM_PARENT) return;

  // Group by the folder each document actually lives in (server-side truth).
  const atRoot: AttachedDataroomDocument[] = [];
  const byFolder = new Map<string, AttachedDataroomDocument[]>();
  for (const doc of documents) {
    if (doc.folderId === null) atRoot.push(doc);
    else byFolder.set(doc.folderId, [...(byFolder.get(doc.folderId) ?? []), doc]);
  }

  await Promise.all([
    atRoot.length > 0 ? applyRootDefault(dataroomId, atRoot, rootItemAccess, target) : null,
    ...Array.from(byFolder, ([folderId, docs]) => copyFolderAccess(folderId, docs, target)),
  ]);
}

async function applyRootDefault(
  dataroomId: string,
  documents: AttachedDataroomDocument[],
  rootItemAccess: RootItemAccess,
  target: Target,
) {
  const flags = resolveRootItemAccessFlags(rootItemAccess);
  if (!flags) return; // HIDDEN: no row, so not visible

  const groups =
    target === "VIEWER_GROUP"
      ? await prisma.viewerGroup.findMany({ where: { dataroomId }, select: { id: true } })
      : await prisma.permissionGroup.findMany({ where: { dataroomId }, select: { id: true } });

  await replaceRows(
    target,
    groups.flatMap((group) =>
      documents.map((doc) => ({
        groupId: group.id,
        itemId: doc.id,
        itemType: ItemType.DATAROOM_DOCUMENT,
        canView: flags.canView,
        canDownload: flags.canDownload,
        canDownloadOriginal: false,
      })),
    ),
  );
}

/** Mirror the containing folder: groups without a row on the folder get none either. */
async function copyFolderAccess(
  folderId: string,
  documents: AttachedDataroomDocument[],
  target: Target,
) {
  const where = { itemId: folderId, itemType: ItemType.DATAROOM_FOLDER };
  const folderRows: Omit<AccessRow, "itemId" | "itemType">[] =
    target === "VIEWER_GROUP"
      ? await prisma.viewerGroupAccessControls.findMany({
          where,
          select: { groupId: true, canView: true, canDownload: true },
        })
      : await prisma.permissionGroupAccessControls.findMany({
          where,
          select: { groupId: true, canView: true, canDownload: true, canDownloadOriginal: true },
        });

  await replaceRows(
    target,
    folderRows.flatMap((row) =>
      documents.map((doc) => ({
        ...row,
        itemId: doc.id,
        itemType: ItemType.DATAROOM_DOCUMENT,
      })),
    ),
  );
}

/**
 * Write the rows, replacing any existing row for the same (group, document) pairs so a
 * stale value (e.g. canView=false from an earlier write) is corrected, not kept.
 */
async function replaceRows(target: Target, rows: AccessRow[]) {
  if (rows.length === 0) return;
  const where = {
    groupId: { in: Array.from(new Set(rows.map((r) => r.groupId))) },
    itemId: { in: Array.from(new Set(rows.map((r) => r.itemId))) },
    itemType: ItemType.DATAROOM_DOCUMENT,
  };

  if (target === "VIEWER_GROUP") {
    await prisma.$transaction([
      prisma.viewerGroupAccessControls.deleteMany({ where }),
      prisma.viewerGroupAccessControls.createMany({
        data: rows.map(({ canDownloadOriginal: _ignored, ...row }) => row),
      }),
    ]);
    return;
  }

  await prisma.$transaction([
    prisma.permissionGroupAccessControls.deleteMany({ where }),
    prisma.permissionGroupAccessControls.createMany({
      data: rows.map((row) => ({ ...row, canDownloadOriginal: row.canDownloadOriginal ?? false })),
    }),
  ]);
}
