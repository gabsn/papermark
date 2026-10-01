// Self-hosted (AGPL, written for this fork): SAML SSO and directory sync (SCIM) are not
// available. The login page shows no SSO entry and the security settings show a notice.

export function SSOLogin(_props: { autoExpand?: boolean }) {
  return null;
}

function NotAvailable({ what }: { what: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      {what} is not available in self-hosted mode.
    </p>
  );
}

export function SAMLConfigModal(_props: { teamId: string }) {
  return <NotAvailable what="SAML single sign-on" />;
}

export function SSOEnforcementToggle(_props: { teamId: string }) {
  return null;
}

export function DirectorySyncConfigModal(_props: { teamId: string }) {
  return <NotAvailable what="Directory sync (SCIM)" />;
}
