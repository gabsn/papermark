// Self-hosted implementation (AGPL). Email inviting a visitor to a data room.
import React from "react";

import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "react-email";

export default function DataroomViewerInvitation({
  dataroomName,
  senderName,
  customMessage,
  url,
}: {
  dataroomName: string;
  senderName: string;
  customMessage?: string | null;
  url: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>{`You are invited to view ${dataroomName}`}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 w-[465px] p-5">
            <Text className="mx-0 mb-8 mt-4 p-0 text-center text-xl">
              {`You are invited to view ${dataroomName}`}
            </Text>
            <Text className="text-sm leading-6 text-black">
              <span className="font-semibold">{senderName}</span> has shared a
              data room with you.
            </Text>
            {customMessage ? (
              <Text className="whitespace-pre-line border-l-2 border-solid border-neutral-300 pl-3 text-sm leading-6 text-neutral-700">
                {customMessage}
              </Text>
            ) : null}
            <Section className="my-8 text-center">
              <Button
                className="rounded bg-black text-center text-xs font-semibold text-white no-underline"
                href={url}
                style={{ padding: "12px 20px" }}
              >
                Open the data room
              </Button>
            </Section>
            <Text className="text-sm leading-6 text-black">
              or copy and paste this URL into your browser:
            </Text>
            <Text className="max-w-sm flex-wrap break-words font-medium text-neutral-700 no-underline">
              {url}
            </Text>
            <Text className="text-xs leading-5 text-neutral-500">
              You may be asked to confirm this email address before viewing.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
