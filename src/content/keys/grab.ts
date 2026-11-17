// Lets a mode (link hints) take over the keyboard. While a grabber is installed,
// the dispatcher hands it every keydown instead of running bindings; returning
// true consumes the key (hidden from the page, along with its keypress/keyup).

export type KeyGrabber = (e: KeyboardEvent) => boolean;

let grabber: KeyGrabber | null = null;

export function grabKeys(g: KeyGrabber): () => void {
  grabber = g;
  return () => {
    if (grabber === g) grabber = null;
  };
}

export function currentGrabber(): KeyGrabber | null {
  return grabber;
}
