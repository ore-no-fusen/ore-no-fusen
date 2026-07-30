export type ReceivedIphoneNote = {
  id: string;
  title: string;
  body: string;
  context: string;
  tags?: string[];
};

export type CreatedIphoneNote = {
  note: { meta: { path: string } };
  created: boolean;
};

type ReceiveIphoneNoteActions = {
  hasSavedNote: (noteId: string) => Promise<boolean>;
  downloadImages: (body: string) => Promise<string>;
  createNote: (input: { context: string; body: string; noteId: string }) => Promise<CreatedIphoneNote>;
  addTag: (path: string, tag: string) => Promise<void>;
  waitBeforeTagRetry: (attempt: number) => Promise<void>;
  openCreatedNote: (path: string) => Promise<void>;
  acknowledge: (noteId: string) => Promise<void>;
  onTagFailure: (tag: string, error: unknown) => void;
};

/**
 * Handles one iPhone receive event. Acknowledgement is deliberately last for
 * newly-created notes: Drive assets must be stored and the PC note opened
 * before the source queue is allowed to be removed.
 */
export async function receiveIphoneNote(
  note: ReceivedIphoneNote,
  actions: ReceiveIphoneNoteActions,
): Promise<void> {
  if (await actions.hasSavedNote(note.id)) {
    await actions.acknowledge(note.id);
    return;
  }

  const resolvedBody = await actions.downloadImages(note.body || '');
  const received = await actions.createNote({
    context: note.context,
    body: resolvedBody,
    noteId: note.id,
  });

  if (!received.created) {
    await actions.acknowledge(note.id);
    return;
  }

  for (const tag of note.tags || []) {
    let tagAdded = false;
    for (let attempt = 1; attempt <= 3 && !tagAdded; attempt++) {
      try {
        await actions.addTag(received.note.meta.path, tag);
        tagAdded = true;
      } catch (error) {
        if (attempt < 3) {
          await actions.waitBeforeTagRetry(attempt);
        } else {
          actions.onTagFailure(tag, error);
        }
      }
    }
  }

  await actions.openCreatedNote(received.note.meta.path);
  await actions.acknowledge(note.id);
}
