// Self-hosted (AGPL, written for this fork): Office, Keynote and CAD files need the hosted
// conversion machines (LibreOffice, Python). Upload PDFs instead. The worker also marks
// these task ids unsupported (selfhost/worker.ts), so a run fails with this reason.
import { AbortTaskRunError, task } from "@trigger.dev/sdk";

type ConvertPayload = {
  documentId: string;
  documentVersionId: string;
  teamId: string;
};

const unsupported = (id: string, what: string) =>
  task({
    id,
    run: async (_payload: ConvertPayload) => {
      throw new AbortTaskRunError(
        `${what} conversion is not available in self-hosted mode; upload a PDF instead.`,
      );
    },
  });

export const convertFilesToPdfTask = unsupported("convert-files-to-pdf", "Office document");
export const convertKeynoteToPdfTask = unsupported("convert-keynote-to-pdf", "Keynote");
export const convertCadToPdfTask = unsupported("convert-cad-to-pdf", "CAD");
