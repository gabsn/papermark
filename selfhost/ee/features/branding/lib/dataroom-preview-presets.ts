// Self-hosted implementation (AGPL). Static sample content for the dataroom
// branding preview (pages/room_ppreview_demo.tsx).
import type { DataroomFolder } from "@prisma/client";

import type { DocumentVersion } from "@/components/view/viewer/dataroom-viewer";

export type DataroomPreviewDocument = {
  id: string;
  name: string;
  dataroomDocumentId: string;
  folderName: string | null;
  downloadOnly: boolean;
  canDownload: boolean;
  hierarchicalIndex: string | null;
  versions: DocumentVersion[];
};

export type DataroomPreviewDataset = {
  folders: DataroomFolder[];
  documents: DataroomPreviewDocument[];
};

const FIXED_DATE = new Date("2026-01-15T10:00:00.000Z");

function folder(
  id: string,
  name: string,
  orderIndex: number,
): DataroomFolder {
  return {
    id,
    name,
    path: `/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    parentId: null,
    icon: null,
    color: null,
    dataroomId: "preview",
    orderIndex,
    hierarchicalIndex: String(orderIndex + 1),
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  } as DataroomFolder;
}

function doc(
  n: number,
  name: string,
  folderName: string | null,
  type = "pdf",
): DataroomPreviewDocument {
  return {
    id: `preview-doc-${n}`,
    name,
    dataroomDocumentId: `preview-dr-doc-${n}`,
    folderName,
    downloadOnly: false,
    canDownload: false,
    hierarchicalIndex: null,
    versions: [
      {
        id: `preview-version-${n}`,
        type,
        versionNumber: 1,
        hasPages: true,
        isVertical: false,
        updatedAt: FIXED_DATE,
        fileSize: 250_000 * n,
      },
    ],
  };
}

export function getDataroomPreviewDataset(): DataroomPreviewDataset {
  return {
    folders: [
      folder("preview-folder-1", "Financials", 0),
      folder("preview-folder-2", "Legal", 1),
      folder("preview-folder-3", "Product", 2),
    ],
    documents: [
      doc(1, "Company overview", null),
      doc(2, "Investor deck", null),
      doc(3, "Profit and loss 2025", "Financials", "sheet"),
      doc(4, "Revenue by month", "Financials", "sheet"),
      doc(5, "Articles of association", "Legal"),
      doc(6, "Customer contracts summary", "Legal"),
      doc(7, "Product roadmap", "Product"),
    ],
  };
}
