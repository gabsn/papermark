// Self-hosted edition: request lists are switched off, so no viewer is ever assigned a task.
export type TaskAssignmentLike = {
  email?: string | null;
  viewerId?: string | null;
  groupId?: string | null;
  linkId?: string | null;
};

export function isViewerAssigned(
  _assignments: TaskAssignmentLike[],
  _viewer: {
    viewerId?: string | null;
    email?: string | null;
    linkId?: string | null;
    groupIds?: Set<string>;
  },
): boolean {
  return false;
}
